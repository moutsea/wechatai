package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (a *App) identify(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	args, err := arguments(command, 1)
	if err != nil {
		return nil, err
	}
	var user string
	if err := json.Unmarshal(args[0], &user); err != nil || user != command.OwnerID {
		return nil, &rpc.Error{Code: "forbidden", Message: "账户身份不匹配", Status: 403}
	}
	err = a.write(ctx, command, func(tx *sql.Tx) error {
		owner, err := accounts.Setting[string](ctx, tx, "ownerId", "")
		if err != nil {
			return err
		}
		if owner != "" && owner != user {
			return accounts.ErrIdentity
		}
		return accounts.SetSetting(ctx, tx, "ownerId", user)
	})
	return json.RawMessage(`null`), err
}
