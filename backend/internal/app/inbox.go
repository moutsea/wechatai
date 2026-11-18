package app

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/delivery"
)

// RecordWechatInbound shares the receiver's account transaction, including
// cursor updates. Replayed messages cannot wake an already retried reminder.
func RecordWechatInbound(ctx context.Context, tx *sql.Tx, id, connection string, payload json.RawMessage, now int64) (bool, error) {
	inserted, err := delivery.InsertIncoming(ctx, tx, id, connection, payload, now)
	if err != nil || !inserted {
		return false, err
	}
	if err := automation.WakeMembership(ctx, tx, now); err != nil {
		return false, err
	}
	return true, nil
}
