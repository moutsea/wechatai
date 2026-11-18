package app

import (
	"context"
	"database/sql"
	"slices"

	"github.com/moutsea/wechatai/backend/internal/personal"
	"github.com/moutsea/wechatai/backend/internal/plugins"
	"github.com/moutsea/wechatai/backend/internal/rpc"
	"github.com/moutsea/wechatai/backend/internal/wechat"
)

func (a *App) personalRecords(action string) actionHandler {
	return func(ctx context.Context, tx *sql.Tx, p actionInput) (any, error) {
		id := p.stringValue("pluginId")
		instance, err := plugins.Get(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if instance.Kind != "wechatai/personal-assistant" {
			return nil, &rpc.Error{Code: "plugin_type", Message: "不是个人助理配置", Status: 400}
		}
		scopes, err := personal.Scopes(ctx, tx, id)
		if err != nil || action == "scopes" {
			return scopes, err
		}
		connection := ""
		if specified := p.text("connectionId"); specified != nil {
			connection = *specified
		} else if instance.RecordScope == "connection" {
			connection, err = wechat.SelectedLink(ctx, tx)
			if err != nil {
				return nil, err
			}
		}
		if connection != "" && !slices.Contains(scopes, connection) {
			exists, err := wechat.LinkExists(ctx, tx, connection)
			if err != nil {
				return nil, err
			}
			if !exists {
				return nil, &rpc.Error{Code: "connection_missing", Message: "找不到这个微信链接", Status: 404}
			}
		}
		q, err := personal.ParseQuery(p["query"])
		if err != nil {
			return nil, err
		}
		return personal.List(ctx, tx, id, connection, q)
	}
}
