// Package grokwake keeps dispatch receipts separate from account databases.
package grokwake

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

type receipts struct{ db *sql.DB }

func openReceipts(ctx context.Context, path string) (*receipts, error) {
	db, err := sqlite.Open(ctx, path)
	if err != nil {
		return nil, err
	}
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS wakes (
		task TEXT PRIMARY KEY, status INTEGER NOT NULL, created INTEGER NOT NULL);
		CREATE INDEX IF NOT EXISTS wakes_created ON wakes(created)`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &receipts{db}, nil
}

// A committed 202 means a send may already have happened, including across a
// crash between the provider accepting a POST and us recording its response.
func (s *receipts) reserve(ctx context.Context, task string) (prior int, err error) {
	err = sqlite.Within(ctx, s.db, func(tx *sql.Tx) error {
		now := time.Now()
		// The account stops using this ID after 45 minutes.
		if _, err := tx.ExecContext(ctx, "DELETE FROM wakes WHERE created < ?", now.Add(-24*time.Hour).Unix()); err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, "INSERT INTO wakes VALUES(?,?,?) ON CONFLICT(task) DO NOTHING", task, http.StatusAccepted, now.Unix())
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil || n == 1 {
			return err
		}
		return tx.QueryRowContext(ctx, "SELECT status FROM wakes WHERE task=?", task).Scan(&prior)
	})
	return prior, err
}

func (s *receipts) finish(ctx context.Context, task string, status int) error {
	switch status {
	case http.StatusAccepted:
		return nil // The reservation already covers an uncertain outcome.
	case http.StatusTooManyRequests, http.StatusServiceUnavailable:
		// The Routine declined the attempt or the POST never left the transport.
		_, err := s.db.ExecContext(ctx, "DELETE FROM wakes WHERE task=?", task)
		return err
	}
	_, err := s.db.ExecContext(ctx, "UPDATE wakes SET status=? WHERE task=?", status, task)
	return err
}
