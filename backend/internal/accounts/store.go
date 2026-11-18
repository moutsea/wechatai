package accounts

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"golang.org/x/sys/unix"
)

var ErrBusy = errors.New("account database capacity reached")
var ErrClosed = errors.New("account store is closed")
var ErrNotFound = errors.New("account database not found")
var ErrIdentity = errors.New("account identity or route epoch mismatch")
var ErrInactive = errors.New("account is not active on this backend")

type Initializer func(context.Context, *sql.DB) error

type entry struct {
	opening chan struct{}
	db      *sql.DB
	gate    Gate
	refs    int
	used    time.Time
}

// Store bounds open account handles. Busy accounts cannot be evicted, and a
// slow request for one account never holds another account's SQL transaction.
type Store struct {
	mu       sync.Mutex
	root     string
	maxOpen  int
	validate Initializer
	init     []Initializer
	entries  map[ID]*entry
	closed   bool
}

type Handle struct {
	DB      *sql.DB
	Gate    *Gate
	release func()
	once    sync.Once
}

func (h *Handle) Close() { h.once.Do(h.release) }

func NewStore(root string, maxOpen int, validate Initializer, initializers ...Initializer) (*Store, error) {
	if root == "" || maxOpen < 1 || maxOpen > 1024 {
		return nil, errors.New("invalid account store configuration")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(absolute, 0700); err != nil {
		return nil, err
	}
	if err := CheckDirectory(absolute); err != nil {
		return nil, err
	}
	return &Store{root: absolute, maxOpen: maxOpen, validate: validate, init: initializers, entries: map[ID]*entry{}}, nil
}

// CheckDirectory applies the serving process's directory policy without
// creating a path or modifying its contents during release preflight.
func CheckDirectory(root string) error {
	info, err := os.Stat(root)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode().Perm() != 0700 {
		return errors.New("account data directory must be a private directory (0700)")
	}
	return unix.Access(root, unix.R_OK|unix.W_OK|unix.X_OK)
}

func (s *Store) Acquire(ctx context.Context, id ID, create bool) (*Handle, error) {
	if _, err := ParseID(string(id)); err != nil {
		return nil, err
	}
	path := filepath.Join(s.root, string(id)+".sqlite")
	checked := create
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		s.mu.Lock()
		if s.closed {
			s.mu.Unlock()
			return nil, ErrClosed
		}
		if current := s.entries[id]; current != nil {
			if ready := current.opening; ready != nil {
				s.mu.Unlock()
				select {
				case <-ready:
					continue
				case <-ctx.Done():
					return nil, ctx.Err()
				}
			}
			h := s.handleLocked(current)
			s.mu.Unlock()
			return h, nil
		}
		if !checked {
			s.mu.Unlock()
			if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
				return nil, ErrNotFound
			} else if err != nil {
				return nil, err
			}
			checked = true
			continue
		}
		evicted, err := s.makeRoomLocked()
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		current := &entry{opening: make(chan struct{})}
		s.entries[id] = current
		s.mu.Unlock()

		var db *sql.DB
		if evicted != nil {
			err = evicted.db.Close()
		}
		if err == nil {
			db, err = s.open(ctx, id, path, create)
		}
		s.mu.Lock()
		close(current.opening)
		current.opening = nil
		if err != nil {
			delete(s.entries, id)
			s.mu.Unlock()
			return nil, err
		}
		current.db = db
		h := s.handleLocked(current)
		s.mu.Unlock()
		return h, nil
	}
}

// makeRoomLocked removes only idle entries; the caller closes the old database
// outside the map lock before opening its replacement.
func (s *Store) makeRoomLocked() (*entry, error) {
	if len(s.entries) < s.maxOpen {
		return nil, nil
	}
	var victim ID
	var oldest *entry
	for id, e := range s.entries {
		if e.opening == nil && e.refs == 0 && (oldest == nil || e.used.Before(oldest.used)) {
			victim, oldest = id, e
		}
	}
	if oldest == nil {
		return nil, ErrBusy
	}
	delete(s.entries, victim)
	return oldest, nil
}

func (s *Store) open(ctx context.Context, id ID, path string, provision bool) (*sql.DB, error) {
	if provision {
		if _, err := os.Lstat(path); os.IsNotExist(err) {
			if err := s.provision(ctx, path); err != nil {
				return nil, err
			}
		} else if err != nil {
			return nil, err
		}
	}
	source, err := OpenSnapshot(ctx, s.root, id)
	if err != nil {
		return nil, err
	}
	managed, err := hasRuntimeSchema(ctx, source)
	if err == nil && managed {
		// A previous release could have created Go tables in an unbound
		// export when inspecting it. Keep it outside the serving path.
		var unboundOwner bool
		err = source.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM settings WHERE key='ownerId')
 AND NOT EXISTS(SELECT 1 FROM backend_account WHERE id=1)`).Scan(&unboundOwner)
		if err == nil && unboundOwner {
			err = ErrInactive
		}
	}
	if err == nil && managed && s.validate != nil {
		err = s.validate(ctx, source)
	}
	closeErr := source.Close()
	if err != nil {
		return nil, err
	}
	if closeErr != nil {
		return nil, closeErr
	}
	if !managed {
		return nil, ErrInactive
	}
	return sqlite.OpenExisting(ctx, path)
}

// Publish only after all initializers succeed. Concurrent provisioners cannot
// replace a winner's file, and a failed attempt can be retried.
func (s *Store) provision(ctx context.Context, path string) error {
	dir, err := os.MkdirTemp(s.root, ".new-account-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	staged := filepath.Join(dir, "account.sqlite")
	db, err := sqlite.Open(ctx, staged)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := Migrate(ctx, db); err != nil {
		return err
	}
	for _, initialize := range s.init {
		if err := initialize(ctx, db); err != nil {
			return err
		}
	}
	if err := db.Close(); err != nil {
		return err
	}
	if err := os.Link(staged, path); err != nil {
		if errors.Is(err, os.ErrExist) {
			return nil
		} // the caller validates the winner
		return err
	}
	root, err := os.Open(s.root)
	if err != nil {
		return err
	}
	defer root.Close()
	return root.Sync()
}

func (s *Store) handleLocked(current *entry) *Handle {
	current.refs++
	return &Handle{DB: current.db, Gate: &current.gate, release: func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		current.refs--
		current.used = time.Now()
	}}
}

func (s *Store) IDs() ([]ID, error) {
	files, err := os.ReadDir(s.root)
	if err != nil {
		return nil, err
	}
	ids := []ID{}
	for _, file := range files {
		if file.IsDir() || filepath.Ext(file.Name()) != ".sqlite" {
			continue
		}
		id, err := ParseID(file.Name()[:len(file.Name())-len(".sqlite")])
		if err == nil {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.entries {
		if e.refs > 0 || e.opening != nil {
			return ErrBusy
		}
	}
	s.closed = true
	var failures []error
	for id, e := range s.entries {
		if err := e.db.Close(); err != nil {
			failures = append(failures, fmt.Errorf("close account database: %w", err))
		}
		delete(s.entries, id)
	}
	return errors.Join(failures...)
}

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "accounts", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS backend_account (
 id INTEGER PRIMARY KEY CHECK(id=1),accountId TEXT NOT NULL,userId TEXT NOT NULL,
 routeEpoch INTEGER NOT NULL CHECK(routeEpoch>0),
 phase TEXT NOT NULL CHECK(phase IN ('prepared','active','frozen')));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`}, {Version: 2, SQL: `
CREATE TABLE backend_account_v2 (
 id INTEGER PRIMARY KEY CHECK(id=1),accountId TEXT NOT NULL,userId TEXT NOT NULL,
 routeEpoch INTEGER NOT NULL CHECK(routeEpoch>0),
 phase TEXT NOT NULL CHECK(phase IN ('prepared','active','draining','frozen')));
INSERT INTO backend_account_v2 SELECT id,accountId,userId,routeEpoch,phase FROM backend_account;
DROP TABLE backend_account;
ALTER TABLE backend_account_v2 RENAME TO backend_account;
`}}}
}

func Migrate(ctx context.Context, db *sql.DB) error { return Schema().Apply(ctx, db) }

// Bind is called only by trusted provisioning or migration code, never by a
// browser-selected account ID. An existing identity cannot be rebound on retry.
func Bind(ctx context.Context, tx *sql.Tx, id ID, userID string, epoch int64, phase string) error {
	if _, err := ParseID(string(id)); err != nil {
		return err
	}
	if userID == "" || len(userID) > 128 || epoch < 1 || (phase != "prepared" && phase != "active") {
		return ErrIdentity
	}
	var previousID, previousUser string
	var previousEpoch int64
	err := tx.QueryRowContext(ctx, `SELECT accountId,userId,routeEpoch FROM backend_account WHERE id=1`).Scan(&previousID, &previousUser, &previousEpoch)
	if err == nil {
		if previousID != string(id) || previousUser != userID || previousEpoch != epoch {
			return ErrIdentity
		}
		return nil
	}
	if !sqlite.IsMissing(err) {
		return err
	}
	// A legacy settings row is authoritative too. Do not bind an imported wallet
	// to a different user merely because it has no Go runtime metadata yet.
	var legacyOwner string
	err = tx.QueryRowContext(ctx, `SELECT json_extract(value,'$') FROM settings WHERE key='ownerId'`).Scan(&legacyOwner)
	if err != nil && !sqlite.IsMissing(err) {
		return err
	}
	if err == nil && legacyOwner != "" && legacyOwner != userID {
		return ErrIdentity
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO backend_account VALUES(1,?,?,?,?)`, id, userID, epoch, phase)
	return err
}

func Check(ctx context.Context, db sqlite.Querier, id ID, userID string, epoch int64, writable bool) error {
	state, err := State(ctx, db)
	if err != nil {
		return err
	}
	if err := state.Match(id, userID, epoch); err != nil {
		return err
	}
	if state.Phase == "prepared" || (writable && state.Phase != "active") {
		return ErrInactive
	}
	return nil
}
