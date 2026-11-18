package app

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/openclaw"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (a *App) connectorUpdateNotice(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	if _, err := arguments(command, 0); err != nil {
		return nil, err
	}
	var notice *openclaw.Notice
	err := a.write(ctx, command, func(tx *sql.Tx) error {
		until, err := membership.PlanUntil(ctx, tx)
		if err != nil {
			return err
		}
		now := a.Now().UnixMilli()
		notice, err = openclaw.UpdateNotice(ctx, tx, until > now, now, command.ConnectorRelease)
		return err
	})
	if err != nil {
		return nil, err
	}
	return json.Marshal(notice)
}

func (a *App) readConnectorUpdateNotice(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	args, err := arguments(command, 1)
	if err != nil {
		return nil, err
	}
	var version string
	if err := json.Unmarshal(args[0], &version); err != nil {
		return nil, &rpc.Error{Status: 400, Code: "invalid_request", Message: "连接器版本无效"}
	}
	var read bool
	err = a.write(ctx, command, func(tx *sql.Tx) error {
		var err error
		read, err = openclaw.MarkRead(ctx, tx, version, command.ConnectorRelease)
		return err
	})
	if err != nil {
		return nil, err
	}
	return json.Marshal(read)
}
