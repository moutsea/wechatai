// Package jobs owns durable work, not its external effects. Every transition
// requires a short account transaction. A lease never authorizes another attempt
// after an unknown, potentially billable external operation.
package jobs

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/moutsea/wechatai/backend/contract"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/cryptobox"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

type Safety string

const (
	ReadOnly Safety = "read_only"
	NoReplay Safety = "no_replay"
)

var ErrConflict = errors.New("job ID reused with different content")
var ErrStaleLease = errors.New("job lease is stale")
var ErrInvalid = errors.New("invalid job")
var ErrReplayUnsafe = errors.New("job requires reconciliation before another attempt")

type Job struct {
	ID          string          `json:"id"`
	Kind        string          `json:"kind"`
	Payload     json.RawMessage `json:"payload"`
	Safety      Safety          `json:"safety"`
	State       string          `json:"state"`
	AvailableAt int64           `json:"availableAt"`
	Deadline    int64           `json:"deadline"`
	Attempts    int             `json:"attempts"`
	Lease       string          `json:"lease"`
	LeaseUntil  int64           `json:"leaseUntil"`
	Result      json.RawMessage `json:"result,omitempty"`
	InputError  string          `json:"inputError,omitempty"`
}

const ExecutionKind = "execution"

type Queue struct {
	Now       func() time.Time
	Box       *cryptobox.Box
	AccountID accounts.ID
}

func (q Queue) now() int64 {
	if q.Now != nil {
		return q.Now().UnixMilli()
	}
	return time.Now().UnixMilli()
}

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "jobs", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS backend_jobs (
 id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload BLOB NOT NULL,fingerprint TEXT NOT NULL,
 safety TEXT NOT NULL CHECK(safety IN ('read_only','no_replay')),
 state TEXT NOT NULL CHECK(state IN ('ready','leased','complete','uncertain','cancelled','expired')),
 availableAt INTEGER NOT NULL,deadline INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,
 lease TEXT NOT NULL DEFAULT '',leaseUntil INTEGER NOT NULL DEFAULT 0,result BLOB,
 resultHash TEXT NOT NULL DEFAULT '',createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS backend_jobs_due ON backend_jobs(availableAt,id) WHERE state='ready';
CREATE INDEX IF NOT EXISTS backend_jobs_leases ON backend_jobs(leaseUntil) WHERE state='leased';
`}, {Version: 2, SQL: `
UPDATE backend_jobs SET payload=x'' WHERE state IN ('complete','cancelled','expired');
`}, {Version: 3, SQL: `
ALTER TABLE backend_jobs ADD COLUMN inputError TEXT NOT NULL DEFAULT '';
`}}}
}

func Migrate(ctx context.Context, db *sql.DB) error { return Schema().Apply(ctx, db) }

func digest(value []byte) string {
	hash := sha256.Sum256(value)
	return hex.EncodeToString(hash[:])
}

// Enqueue returns false for an identical replay. availableAt is mutable scheduler
// state and therefore excluded from the request fingerprint, as are attempts.
func (q Queue) Enqueue(ctx context.Context, tx *sql.Tx, job Job) (bool, error) {
	if job.ID == "" || len(job.ID) > 300 || job.Kind == "" || len(job.Kind) > 100 ||
		(job.Safety != ReadOnly && job.Safety != NoReplay) || !json.Valid(job.Payload) ||
		len(job.Payload) > contract.PayloadLimits.ExecutionBytes || job.AvailableAt < 0 || job.Deadline < 0 {
		return false, ErrInvalid
	}
	encoded, err := json.Marshal(struct {
		Kind     string          `json:"kind"`
		Payload  json.RawMessage `json:"payload"`
		Safety   Safety          `json:"safety"`
		Deadline int64           `json:"deadline"`
	}{job.Kind, job.Payload, job.Safety, job.Deadline})
	if err != nil {
		return false, err
	}
	fingerprint := digest(encoded)
	var previous string
	err = tx.QueryRowContext(ctx, `SELECT fingerprint FROM backend_jobs WHERE id=?`, job.ID).Scan(&previous)
	if err == nil {
		if previous != fingerprint {
			return false, ErrConflict
		}
		return false, nil
	}
	if !sqlite.IsMissing(err) {
		return false, err
	}
	payload := []byte(job.Payload)
	if job.Kind == ExecutionKind {
		if _, err := accounts.ParseID(job.ID); err != nil || q.Box == nil || q.AccountID == "" || job.Safety != NoReplay {
			return false, ErrInvalid
		}
		encrypted, err := q.Box.Encrypt(string(payload), string(q.AccountID)+":execution:"+job.ID)
		if err != nil {
			return false, err
		}
		payload, err = json.Marshal(encrypted)
		if err != nil {
			return false, err
		}
	}
	now := q.now()
	_, err = tx.ExecContext(ctx, `INSERT INTO backend_jobs(id,kind,payload,fingerprint,safety,state,availableAt,deadline,createdAt,updatedAt) VALUES(?,?,?,?,?,'ready',?,?,?,?)`,
		job.ID, job.Kind, payload, fingerprint, job.Safety, job.AvailableAt, job.Deadline, now, now)
	return err == nil, err
}

const columns = `id,kind,payload,safety,state,availableAt,deadline,attempts,lease,leaseUntil,result,inputError`

func read(row *sql.Row) (*Job, error) {
	var job Job
	var payload, result []byte
	err := row.Scan(&job.ID, &job.Kind, &payload, &job.Safety, &job.State, &job.AvailableAt, &job.Deadline, &job.Attempts, &job.Lease, &job.LeaseUntil, &result, &job.InputError)
	if sqlite.IsMissing(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(payload) > 0 {
		job.Payload = payload
	}
	job.Result = result
	return &job, nil
}

func (q Queue) Get(ctx context.Context, db sqlite.Querier, id string) (*Job, error) {
	return read(db.QueryRowContext(ctx, `SELECT `+columns+` FROM backend_jobs WHERE id=?`, id))
}

func (q Queue) Claim(ctx context.Context, tx *sql.Tx, kind string, leaseFor time.Duration) (*Job, error) {
	if kind == "" || leaseFor < time.Millisecond || leaseFor > 15*time.Minute {
		return nil, ErrInvalid
	}
	now := q.now()
	if err := q.Recover(ctx, tx); err != nil {
		return nil, err
	}
	job, err := read(tx.QueryRowContext(ctx, `UPDATE backend_jobs SET state='leased',lease=?,leaseUntil=MIN(?,CASE WHEN deadline=0 THEN ? ELSE deadline END),attempts=attempts+1,updatedAt=?
 WHERE id=(SELECT id FROM backend_jobs WHERE state='ready' AND kind=? AND availableAt<=? AND (deadline=0 OR deadline>?) ORDER BY availableAt,id LIMIT 1)
 AND state='ready' RETURNING `+columns,
		uuid.NewString(), now+leaseFor.Milliseconds(), now+leaseFor.Milliseconds(), now, kind, now, now))
	if err != nil || job == nil || job.Kind != ExecutionKind {
		return job, err
	}
	// Earlier queue rows stored raw JSON objects. New executor inputs are sealed
	// before insertion and their plaintext is only exposed to the lease holder.
	if err := q.openInput(job); err != nil {
		// No lease was published. Leave the input intact and let other ready
		// jobs pass. A repaired key can recover this job on its next attempt.
		retryAt := now + time.Minute.Milliseconds()
		_, err := tx.ExecContext(ctx, `UPDATE backend_jobs SET state='ready',lease='',leaseUntil=0,
 attempts=attempts-1,availableAt=CASE WHEN deadline>0 THEN MIN(?,deadline) ELSE ? END,inputError='unreadable' WHERE id=?`, retryAt, retryAt, job.ID)
		return nil, err
	}
	if job.InputError != "" {
		_, err = tx.ExecContext(ctx, "UPDATE backend_jobs SET inputError='' WHERE id=?", job.ID)
		job.InputError = ""
	}
	return job, err
}

func (q Queue) openInput(job *Job) error {
	payload := bytes.TrimSpace(job.Payload)
	if len(payload) > 0 && payload[0] == '"' {
		var ciphertext string
		if q.Box == nil || json.Unmarshal(job.Payload, &ciphertext) != nil {
			return ErrInvalid
		}
		input, err := q.Box.Decrypt(ciphertext, string(q.AccountID)+":execution:"+job.ID)
		if err != nil {
			return err
		}
		job.Payload = json.RawMessage(input)
		payload = bytes.TrimSpace(job.Payload)
	}
	if !json.Valid(payload) || payload[0] != '{' {
		return ErrInvalid
	}
	return nil
}

// Complete can share a transaction with credits and a delivery outbox. Identical
// acknowledgements are accepted; different or expired lease results are fenced.
func (q Queue) Complete(ctx context.Context, tx *sql.Tx, id, lease string, result json.RawMessage) error {
	return q.complete(ctx, tx, id, lease, result, "", true)
}

func (q Queue) CompleteExecution(ctx context.Context, tx *sql.Tx, id, lease string, result json.RawMessage) error {
	return q.complete(ctx, tx, id, lease, result, ExecutionKind, true)
}

// ConfirmRecordedExecution can acknowledge a lost response after freeze without changing the snapshot.
func (q Queue) ConfirmRecordedExecution(ctx context.Context, tx *sql.Tx, id, lease string, result json.RawMessage) error {
	return q.complete(ctx, tx, id, lease, result, ExecutionKind, false)
}

func (q Queue) complete(ctx context.Context, tx *sql.Tx, id, lease string, result json.RawMessage, requiredKind string, writable bool) error {
	if lease == "" || !json.Valid(result) || len(result) > contract.PayloadLimits.ExecutionBytes {
		return ErrInvalid
	}
	var state, currentLease, resultHash, kind string
	var safety Safety
	var leaseUntil int64
	err := tx.QueryRowContext(ctx, "SELECT state,lease,leaseUntil,resultHash,kind,safety FROM backend_jobs WHERE id=?", id).Scan(&state, &currentLease, &leaseUntil, &resultHash, &kind, &safety)
	if sqlite.IsMissing(err) {
		return ErrStaleLease
	}
	if err != nil {
		return err
	}
	if currentLease != lease || (requiredKind != "" && kind != requiredKind) {
		return ErrStaleLease
	}
	hash := digest(result)
	if state == "complete" || (state == "uncertain" && resultHash != "") {
		if resultHash != hash {
			return ErrConflict
		}
		return nil
	}
	if !writable {
		return ErrStaleLease
	}
	if requiredKind == ExecutionKind && safety == NoReplay && (state == "uncertain" || (state == "leased" && leaseUntil <= q.now())) {
		// A late receipt is evidence for reconciliation. The normal result
		// consumer must never bill or deliver it after the lease has expired.
		_, err = tx.ExecContext(ctx, `UPDATE backend_jobs SET state='uncertain',leaseUntil=0,result=?,resultHash=?,updatedAt=? WHERE id=?`, []byte(result), hash, q.now(), id)
		return err
	}
	if state != "leased" || leaseUntil <= q.now() {
		return ErrStaleLease
	}
	_, err = tx.ExecContext(ctx, "UPDATE backend_jobs SET state='complete',payload=x'',result=?,resultHash=?,updatedAt=? WHERE id=?", []byte(result), hash, q.now(), id)
	return err
}

// ConsumeResult releases the body in the consumer's transaction with its
// business effects. A rollback restores the result; replays return no body.
func (q Queue) ConsumeResult(ctx context.Context, tx *sql.Tx, id string) (json.RawMessage, error) {
	var result []byte
	err := tx.QueryRowContext(ctx, "SELECT result FROM backend_jobs WHERE id=? AND state='complete' AND result IS NOT NULL", id).Scan(&result)
	if sqlite.IsMissing(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, "UPDATE backend_jobs SET result=NULL WHERE id=?", id)
	return result, err
}

// Retry is only available for replay-safe work. For NoReplay work the caller
// must record/reconcile the original outcome instead of re-running the effect.
func (q Queue) Retry(ctx context.Context, tx *sql.Tx, id, lease string, at int64) error {
	job, err := q.Get(ctx, tx, id)
	if err != nil {
		return err
	}
	if job == nil || job.State != "leased" || job.Lease != lease || job.LeaseUntil <= q.now() {
		return ErrStaleLease
	}
	if job.Safety != ReadOnly {
		return ErrReplayUnsafe
	}
	if at <= q.now() || (job.Deadline > 0 && at >= job.Deadline) {
		return ErrInvalid
	}
	_, err = tx.ExecContext(ctx, `UPDATE backend_jobs SET state='ready',availableAt=?,lease='',leaseUntil=0,updatedAt=? WHERE id=?`, at, q.now(), id)
	return err
}

func (q Queue) Cancel(ctx context.Context, tx *sql.Tx, id string) error {
	_, err := tx.ExecContext(ctx, `UPDATE backend_jobs SET state='cancelled',payload=x'',lease='',leaseUntil=0,updatedAt=? WHERE id=? AND state IN ('ready','leased','uncertain')`, q.now(), id)
	return err
}

func (q Queue) Recover(ctx context.Context, tx *sql.Tx) error {
	now := q.now()
	if _, err := tx.ExecContext(ctx, `UPDATE backend_jobs SET state=CASE WHEN safety='read_only' THEN 'ready' ELSE 'uncertain' END,
 availableAt=?,lease=CASE WHEN kind='execution' AND safety='no_replay' THEN lease ELSE '' END,leaseUntil=0,updatedAt=? WHERE state='leased' AND leaseUntil<=?`, now, now, now); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE backend_jobs SET state='expired',payload=CASE WHEN inputError='' THEN x'' ELSE payload END,updatedAt=? WHERE state='ready' AND deadline>0 AND deadline<=?`, now, now)
	return err
}

// Outstanding recovers expired work before deciding whether a freeze must wait.
func (q Queue) Outstanding(ctx context.Context, tx *sql.Tx) (bool, error) {
	if err := q.Recover(ctx, tx); err != nil {
		return false, err
	}
	var live bool
	err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM backend_jobs WHERE state='leased')").Scan(&live)
	return live, err
}

func (q Queue) NextAt(ctx context.Context, db sqlite.Querier) (*int64, error) {
	var at sql.NullInt64
	err := db.QueryRowContext(ctx, `SELECT MIN(time) FROM (
 SELECT MIN(availableAt) time FROM backend_jobs WHERE state='ready'
 UNION ALL SELECT MIN(leaseUntil) FROM backend_jobs WHERE state='leased')`).Scan(&at)
	if err != nil || !at.Valid {
		return nil, err
	}
	return &at.Int64, nil
}
