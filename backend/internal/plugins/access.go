// Package plugins owns plugin identity, type checks and account slot rules.
package plugins

import (
	"context"
	"database/sql"
	"errors"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type Instance struct {
	Kind         string
	Name         string
	Enabled      bool
	ConnectionID string
	RecordScope  string
	AgentID      *string
}

func Get(ctx context.Context, tx *sql.Tx, id string) (Instance, error) {
	var p Instance
	err := tx.QueryRowContext(ctx, `SELECT json_extract(data,'$.pluginId'),COALESCE(json_extract(data,'$.name'),''),COALESCE(json_extract(data,'$.enabled'),0),COALESCE(json_extract(data,'$.connectionId'),''),json_extract(data,'$.agentId'),COALESCE(json_extract(data,'$.recordScope'),'shared') FROM plugins WHERE id=?`, id).Scan(&p.Kind, &p.Name, &p.Enabled, &p.ConnectionID, &p.AgentID, &p.RecordScope)
	if errors.Is(err, sql.ErrNoRows) {
		return p, &rpc.Error{Code: "plugin_missing", Message: "插件已删除，请用 /exit 返回普通模型", Status: 404}
	}
	return p, err
}

func RequireSlot(ctx context.Context, tx *sql.Tx, id string, planUntil, now int64) error {
	if planUntil > now {
		return nil
	}
	var first bool
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM (SELECT id FROM plugins ORDER BY rowid LIMIT 1) WHERE id=?)", id).Scan(&first); err != nil {
		return err
	}
	if first {
		return nil
	}
	message := "Free 用户最多配置 1 个插件，此配置超出名额，已暂停。配置与绑定仍保留；可续费 Plus，或删除不用的配置释放名额。仅停用不会释放名额。请到「会员与 credits」查看。"
	if planUntil > 0 {
		message = "Plus 会员已到期，当前恢复为 Free。" + message
	}
	return &rpc.Error{Code: "plugin_limit", Message: message, Status: 403}
}
