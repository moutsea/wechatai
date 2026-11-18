package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/plugins"
	"github.com/moutsea/wechatai/backend/internal/wechat"
	"net/url"

	"github.com/moutsea/wechatai/backend/internal/notifications"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (a *App) notificationCredentialValid(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	args, err := arguments(command, 2)
	if err != nil {
		return nil, err
	}
	var plugin, credential string
	if json.Unmarshal(args[0], &plugin) != nil || json.Unmarshal(args[1], &credential) != nil {
		return nil, &rpc.Error{Code: "invalid_request", Message: "通知凭据参数无效", Status: 400}
	}
	var valid bool
	err = a.read(ctx, command, func(tx *sql.Tx) error {
		var err error
		valid, err = notifications.Valid(ctx, tx, plugin, credential)
		return err
	})
	if err != nil {
		return nil, err
	}
	return json.Marshal(valid)
}

func (a *App) manageNotification(action string) actionHandler {
	return func(ctx context.Context, tx *sql.Tx, p actionInput) (any, error) {
		id := p.stringValue("id")
		plugin, err := plugins.Get(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if plugin.Kind != "wechatai/notification" {
			return nil, &rpc.Error{Code: "plugin_type", Message: "不是消息提醒插件", Status: 400}
		}
		if action == "revoke" {
			return map[string]bool{"ok": true}, notifications.Revoke(ctx, tx, id)
		}
		base, err := url.Parse(a.Config.AppURL)
		if err != nil || base.Host == "" || (base.Scheme != "https" && base.Scheme != "http") || base.User != nil {
			return nil, &rpc.Error{Code: "backend_unavailable", Message: "消息提醒入口尚未配置", Status: 503}
		}
		endpoint := base.ResolveReference(&url.URL{Path: "/api/notify"}).String()
		now := a.Now().UnixMilli()
		if action == "status" {
			return notifications.ReadStatus(ctx, tx, id, endpoint, now)
		}
		until, err := membership.PlanUntil(ctx, tx)
		if err != nil {
			return nil, err
		}
		if err = plugins.RequireSlot(ctx, tx, id, until, now); err != nil {
			return nil, err
		}
		account, err := accounts.State(ctx, tx)
		if err != nil {
			return nil, err
		}
		token, err := notifications.Rotate(ctx, tx, a.Config.EncryptionKey, string(account.AccountID), id)
		if err != nil {
			return nil, err
		}
		return map[string]string{"token": token, "endpoint": endpoint}, nil
	}
}

func (a *App) notificationRequest(ctx context.Context, c rpc.Command) (json.RawMessage, error) {
	var args []json.RawMessage
	var plugin, credential, action, key string
	if json.Unmarshal(c.Params, &args) != nil || (len(args) != 4 && len(args) != 5) || json.Unmarshal(args[0], &plugin) != nil || json.Unmarshal(args[1], &credential) != nil || json.Unmarshal(args[2], &action) != nil || (len(args) == 5 && json.Unmarshal(args[4], &key) != nil) || (action != "status" && action != "send") {
		return nil, &rpc.Error{Code: "invalid_request", Message: "通知参数无效", Status: 400}
	}
	var data any
	var domain *rpc.Error
	err := a.write(ctx, c, func(tx *sql.Tx) error {
		result, err := a.authorizedNotification(ctx, tx, plugin, credential, action, args[3], key)
		data = result
		if err != nil {
			errors.As(err, &domain)
		}
		return err
	})
	if err != nil && domain == nil {
		return nil, err
	}
	if err == nil && action == "send" {
		a.schedule.Wake(string(c.AccountID))
	}
	return encodedAction(data, domain)
}

func (a *App) authorizedNotification(ctx context.Context, tx *sql.Tx, id, credential, action string, raw json.RawMessage, key string) (any, error) {
	valid, err := notifications.Valid(ctx, tx, id, credential)
	if err != nil {
		return nil, err
	}
	if !valid {
		return nil, &rpc.Error{Code: "invalid_token", Message: "Token 无效或已撤销", Status: 401}
	}
	p, err := plugins.Get(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	until, err := membership.PlanUntil(ctx, tx)
	if err != nil {
		return nil, err
	}
	now := a.Now().UnixMilli()
	if err = plugins.RequireSlot(ctx, tx, id, until, now); err != nil {
		return nil, err
	}
	if !p.Enabled {
		return nil, &rpc.Error{Code: "plugin_disabled", Message: "插件已停用，请在网页启用，或用 /exit 返回普通模型", Status: 403}
	}
	if p.Kind != "wechatai/notification" {
		return nil, &rpc.Error{Code: "plugin_type", Message: "不是消息提醒插件", Status: 400}
	}
	if action == "status" {
		var receipt string
		_ = json.Unmarshal(raw, &receipt)
		return notifications.GetReceipt(ctx, tx, id, receipt, now)
	}
	m, err := notifications.ParseMessage(raw)
	if err != nil {
		return nil, err
	}
	prior, err := notifications.Existing(ctx, tx, id, key, m, now)
	if err != nil || prior != nil {
		return prior, err
	}
	target, err := wechat.LinkTarget(ctx, tx, p.ConnectionID, until, now)
	if err != nil {
		return nil, err
	}
	if target.Status != "connected" || target.EncryptedCredentials == "" {
		return nil, &rpc.Error{Code: "wechat_not_connected", Message: "接收微信尚未连接，请先扫码连接", Status: 409}
	}
	if target.ContextToken == "" {
		return nil, &rpc.Error{Code: "wechat_context_required", Message: "请先在接收微信的对话中发送一条消息，再调用推送接口", Status: 409}
	}
	return notifications.Enqueue(ctx, tx, id, key, m, p.ConnectionID, target.Generation, now)
}
