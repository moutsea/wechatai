package app

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/internal/cloudagent"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (a *App) agtCallback(ctx context.Context, c rpc.Command) (json.RawMessage, error) {
	args, err := arguments(c, 3)
	if err != nil {
		return nil, err
	}
	var task string
	var raw []byte // JSON base64 preserves raw bytes inside the signed RPC.
	var headers cloudagent.CallbackHeaders
	if json.Unmarshal(args[0], &task) != nil || json.Unmarshal(args[1], &raw) != nil || json.Unmarshal(args[2], &headers) != nil {
		return nil, &rpc.Error{Code: "invalid_request", Message: "云任务回调参数无效", Status: 400}
	}
	keys := cloudagent.CallbackKeys{Current: a.Config.CallbackKeyVersion, Versions: a.Config.CallbackKeys, Legacy: a.Config.EncryptionKey}
	var receipt cloudagent.CallbackResult
	err = a.write(ctx, c, func(tx *sql.Tx) error {
		var err error
		receipt, err = cloudagent.ReceiveCallback(ctx, tx, keys, string(c.AccountID), task, raw, headers, a.Now().UnixMilli())
		return err
	})
	if err != nil {
		return nil, err
	}
	if receipt.OK {
		a.schedule.Wake(string(c.AccountID))
	}
	return json.Marshal(receipt)
}
