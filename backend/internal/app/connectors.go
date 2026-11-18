package app

import (
	"context"
	"database/sql"
	"errors"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/openclaw"
	"github.com/moutsea/wechatai/backend/internal/plugins"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (a *App) registerConnectorActions(actions accountActions) {
	for name, kind := range map[string]string{"claw": "openclaw", "hermes": "hermes", "muse": "muse"} {
		for _, op := range []string{"Status", "Token", "Pair", "Revoke"} {
			actions["plugin."+name+op] = accountAction{run: func(ctx context.Context, tx *sql.Tx, p actionInput) (any, error) {
				return a.manageConnector(ctx, tx, p.stringValue("id"), kind, op)
			}}
		}
	}
}

type accessIssue struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
type connectorStatus struct {
	openclaw.Status
	Access     *accessIssue        `json:"access"`
	AgentID    *string             `json:"agentId,omitempty"`
	Deliveries []openclaw.Delivery `json:"deliveries"`
}

func (a *App) manageConnector(ctx context.Context, tx *sql.Tx, id, kind, op string) (any, error) {
	p, err := plugins.Get(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if p.Kind != "wechatai/"+kind {
		return nil, &rpc.Error{Code: "plugin_type", Message: "插件类型不匹配", Status: 403}
	}
	if op == "Revoke" {
		return map[string]bool{"ok": true}, openclaw.Revoke(ctx, tx, id)
	}
	until, err := membership.PlanUntil(ctx, tx)
	if err != nil {
		return nil, err
	}
	now := a.Now().UnixMilli()
	slot := plugins.RequireSlot(ctx, tx, id, until, now)
	if op == "Status" {
		var problem *accessIssue
		var domain *rpc.Error
		if slot != nil {
			if !errors.As(slot, &domain) {
				return nil, slot
			}
			problem = &accessIssue{Code: domain.Code, Message: domain.Message}
			if until > 0 && until <= now {
				problem.Code = "membership_expired"
			}
		} else if !p.Enabled {
			problem = &accessIssue{Code: "plugin_disabled", Message: "此插件已停用，请在插件配置中重新启用。配置与绑定仍保留。"}
		}
		state, err := openclaw.ReadStatus(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		deliveries, err := openclaw.Deliveries(ctx, tx, id)
		return connectorStatus{Status: state, Access: problem, AgentID: p.AgentID, Deliveries: deliveries}, err
	}
	if slot != nil {
		return nil, slot
	}
	if !p.Enabled {
		return nil, &rpc.Error{Code: "plugin_disabled", Message: "插件已停用，请在网页启用，或用 /exit 返回普通模型", Status: 403}
	}
	account, err := accounts.State(ctx, tx)
	if err != nil {
		return nil, err
	}
	if op == "Pair" {
		return openclaw.CreatePairing(ctx, tx, a.Config.EncryptionKey, kind, string(account.AccountID), id, now)
	}
	token, err := openclaw.Rotate(ctx, tx, a.Config.EncryptionKey, kind, string(account.AccountID), id)
	if err != nil {
		return nil, err
	}
	return map[string]string{"token": token, "endpoint": a.Config.AppURL}, nil
}
