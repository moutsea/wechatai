package app

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/internal/media"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (a *App) imageAsset(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	args, err := arguments(command, 1)
	if err != nil {
		return nil, err
	}
	var id string
	if json.Unmarshal(args[0], &id) != nil {
		return nil, &rpc.Error{Code: "invalid_request", Message: "附件参数无效", Status: 400}
	}
	var desc *media.Descriptor
	err = a.read(ctx, command, func(tx *sql.Tx) error {
		var err error
		desc, err = media.Lookup(ctx, tx, id, a.Now().UnixMilli())
		return err
	})
	if err != nil {
		return nil, err
	}
	return json.Marshal(desc)
}
