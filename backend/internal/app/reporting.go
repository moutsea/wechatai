package app

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/internal/reporting"
	"github.com/moutsea/wechatai/backend/internal/rpc"
	"github.com/moutsea/wechatai/backend/internal/wechat"
)

func (a *App) adminStats(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	if _, err := arguments(command, 0); err != nil {
		return nil, err
	}
	var stats reporting.Stats
	err := a.read(ctx, command, func(tx *sql.Tx) error {
		var err error
		stats, err = reporting.Read(ctx, tx, a.Now())
		return err
	})
	if err != nil {
		return nil, err
	}
	return json.Marshal(stats)
}

func (a *App) referralWechatIdentity(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	if _, err := arguments(command, 0); err != nil {
		return nil, err
	}
	var identity *string
	err := a.write(ctx, command, func(tx *sql.Tx) error {
		var err error
		identity, err = wechat.ReferralIdentity(ctx, tx, a.Box, command.AccountID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return json.Marshal(identity)
}
