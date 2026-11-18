package notifications

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
)

const jobsSchema = `CREATE TABLE IF NOT EXISTS notification_jobs (
id TEXT PRIMARY KEY,pluginId TEXT NOT NULL,dedupe TEXT NOT NULL,fingerprint TEXT NOT NULL,
connectionId TEXT NOT NULL,generation TEXT NOT NULL,title TEXT NOT NULL,text TEXT NOT NULL,
state TEXT NOT NULL,createdAt INTEGER NOT NULL,sentAt INTEGER,attempts INTEGER NOT NULL DEFAULT 0,
nextAt INTEGER NOT NULL,error TEXT NOT NULL DEFAULT '',UNIQUE(pluginId,dedupe));
CREATE INDEX IF NOT EXISTS notification_due ON notification_jobs(state,nextAt);
CREATE INDEX IF NOT EXISTS notification_created ON notification_jobs(createdAt);
CREATE TABLE IF NOT EXISTS notification_schedule(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,acknowledged INTEGER NOT NULL);
INSERT OR IGNORE INTO notification_schedule VALUES(1,0,0);`

type Receipt struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	State     string `json:"state"`
	CreatedAt int64  `json:"createdAt"`
	SentAt    *int64 `json:"sentAt"`
	Attempts  int    `json:"attempts"`
	Error     string `json:"error"`
}

type Status struct {
	Endpoint   string    `json:"endpoint"`
	HasToken   bool      `json:"hasToken"`
	Deliveries []Receipt `json:"deliveries"`
}

func ReadStatus(ctx context.Context, tx *sql.Tx, id, endpoint string, now int64) (Status, error) {
	s := Status{Endpoint: endpoint, Deliveries: []Receipt{}}
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM notification_tokens WHERE pluginId=?)", id).Scan(&s.HasToken); err != nil {
		return s, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,title,state,createdAt,sentAt,attempts,error FROM notification_jobs WHERE pluginId=? AND createdAt>=? ORDER BY createdAt DESC LIMIT 20`, id, now-7*86400000)
	if err != nil {
		return s, err
	}
	defer rows.Close()
	for rows.Next() {
		var r Receipt
		if err := rows.Scan(&r.ID, &r.Title, &r.State, &r.CreatedAt, &r.SentAt, &r.Attempts, &r.Error); err != nil {
			return s, err
		}
		s.Deliveries = append(s.Deliveries, r)
	}
	return s, rows.Err()
}

func Rotate(ctx context.Context, tx *sql.Tx, key, account, id string) (string, error) {
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return "", err
	}
	credential := base64.RawURLEncoding.EncodeToString(secret[:])
	h := sha256.Sum256([]byte(credential))
	if _, err := tx.ExecContext(ctx, "INSERT INTO notification_tokens(pluginId,hash) VALUES(?,?) ON CONFLICT(pluginId) DO UPDATE SET hash=excluded.hash", id, hex.EncodeToString(h[:])); err != nil {
		return "", err
	}
	unsigned := "notify1." + account + "." + id + "." + credential
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func Revoke(ctx context.Context, tx *sql.Tx, id string) error {
	if _, err := tx.ExecContext(ctx, "DELETE FROM notification_tokens WHERE pluginId=?", id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE notification_jobs SET state='cancelled',text='',error='配置已停用、接收微信已更改或 Token 已撤销' WHERE pluginId=? AND state IN ('pending','sending')`, id); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, "UPDATE notification_schedule SET revision=revision+1 WHERE id=1")
	return err
}
