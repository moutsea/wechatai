package notifications

import (
	"context"
	"database/sql"
	"errors"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

type Job struct {
	ID, Plugin, Connection, Generation, Title, Text string
	CreatedAt                                       int64
	Attempts                                        int
}

func Due(ctx context.Context, tx *sql.Tx, now int64) (*Job, error) {
	var j Job
	err := tx.QueryRowContext(ctx, `SELECT id,pluginId,connectionId,generation,title,text,createdAt,attempts FROM notification_jobs WHERE state IN ('pending','sending') AND nextAt<=? ORDER BY nextAt,rowid LIMIT 1`, now).Scan(&j.ID, &j.Plugin, &j.Connection, &j.Generation, &j.Title, &j.Text, &j.CreatedAt, &j.Attempts)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &j, err
}
func Next(ctx context.Context, q sqlite.Querier) (*int64, error) {
	var next *int64
	err := q.QueryRowContext(ctx, "SELECT MIN(nextAt) FROM notification_jobs WHERE state IN ('pending','sending')").Scan(&next)
	return next, err
}
func Claim(ctx context.Context, tx *sql.Tx, id string, now int64) (bool, error) {
	r, err := tx.ExecContext(ctx, `UPDATE notification_jobs SET state='sending',attempts=attempts+1,nextAt=? WHERE id=? AND state IN ('pending','sending') AND nextAt<=?`, now+30000, id, now)
	if err != nil {
		return false, err
	}
	n, err := r.RowsAffected()
	return n == 1, err
}

// The attempt fence also rejects a delayed result after revocation or a new lease.
func Finish(ctx context.Context, tx *sql.Tx, j Job, now int64, state, message string, delay int64) error {
	var err error
	if state == "pending" {
		_, err = tx.ExecContext(ctx, `UPDATE notification_jobs SET state='pending',nextAt=?,error=? WHERE id=? AND state IN ('pending','sending') AND attempts=?`, now+delay, message, j.ID, j.Attempts)
	} else {
		var sent any
		if state == "sent" {
			sent = now
		}
		_, err = tx.ExecContext(ctx, `UPDATE notification_jobs SET state=?,sentAt=?,error=?,text='' WHERE id=? AND state IN ('pending','sending') AND attempts=?`, state, sent, message, j.ID, j.Attempts)
	}
	return err
}
