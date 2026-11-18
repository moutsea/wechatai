package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"

	"github.com/moutsea/wechatai/backend/contract"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/cloudagent"
	"github.com/moutsea/wechatai/backend/internal/conversation"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type actionInput map[string]json.RawMessage
type actionHandler func(context.Context, *sql.Tx, actionInput) (any, error)
type accountAction struct {
	plus bool
	run  actionHandler
}
type accountActions map[string]accountAction

func (actions accountActions) Capabilities() []string {
	names := make([]string, 0, len(actions))
	for name := range actions {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}
func (p actionInput) text(key string) *string {
	var value *string
	if err := json.Unmarshal(p[key], &value); err != nil {
		return nil
	}
	return value
}
func (p actionInput) stringValue(key string) string {
	if v := p.text(key); v != nil {
		return *v
	}
	return ""
}

func (a *App) accountActions() accountActions {
	actions := accountActions{
		"personal.scopes":     {run: a.personalRecords("scopes")},
		"personal.list":       {run: a.personalRecords("list")},
		"notification.status": {run: a.manageNotification("status")},
		"notification.token":  {run: a.manageNotification("token")},
		"notification.revoke": {run: a.manageNotification("revoke")},
		"cloud.task": {run: func(ctx context.Context, tx *sql.Tx, p actionInput) (any, error) {
			return cloudagent.Get(ctx, tx, p.stringValue("id"))
		}},
		"cloud.storage": {run: func(ctx context.Context, tx *sql.Tx, _ actionInput) (any, error) {
			return cloudagent.ReadWorkspace(ctx, tx)
		}},
		"cloud.cancel": {run: func(ctx context.Context, tx *sql.Tx, p actionInput) (any, error) {
			return cloudagent.Cancel(ctx, tx, p.stringValue("id"), a.Now().UnixMilli())
		}},
		"cloud.tasks": {run: func(ctx context.Context, tx *sql.Tx, p actionInput) (any, error) {
			return cloudagent.List(ctx, tx, p.stringValue("pluginInstanceId"), p.text("cursor"))
		}},
		"onboarding.dismiss": {run: a.dismissOnboarding},
		"session.list": {plus: true, run: func(ctx context.Context, tx *sql.Tx, _ actionInput) (any, error) {
			return conversation.Sessions(ctx, tx)
		}},
		"session.messages": {plus: true, run: func(ctx context.Context, tx *sql.Tx, p actionInput) (any, error) {
			before := float64(9007199254740991)
			var n *float64
			if json.Unmarshal(p["before"], &n) == nil && n != nil {
				before = *n
			}
			return conversation.Messages(ctx, tx, p.stringValue("id"), before)
		}},
		"session.summary": {plus: true, run: func(ctx context.Context, tx *sql.Tx, p actionInput) (any, error) {
			return conversation.Summary(ctx, tx, p.stringValue("id"))
		}},
	}
	a.registerConnectorActions(actions)
	return actions
}

func (a *App) dismissOnboarding(ctx context.Context, tx *sql.Tx, _ actionInput) (any, error) {
	at, err := accounts.Setting[int64](ctx, tx, "dashboardOnboardingDismissedAt", 0)
	if err != nil {
		return nil, err
	}
	if at == 0 {
		at = a.Now().UnixMilli()
		if err = accounts.SetSetting(ctx, tx, "dashboardOnboardingDismissedAt", at); err != nil {
			return nil, err
		}
	}
	return map[string]int64{"dismissedAt": at}, nil
}

// PersonalAccount.api returns a JSON-encoded string inside the RPC envelope.
// Authentication and route failures still use the outer transport status.
func (a *App) api(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	var args []json.RawMessage
	var name string
	if json.Unmarshal(command.Params, &args) != nil || len(args) < 1 || len(args) > 2 || json.Unmarshal(args[0], &name) != nil {
		return nil, &rpc.Error{Code: "invalid_request", Message: "账户操作参数无效", Status: 400}
	}
	var payload actionInput
	if len(args) == 2 {
		_ = json.Unmarshal(args[1], &payload)
	}
	action, ok := a.actions[name]
	if !ok && slices.Contains(contract.Load().Actions, name) {
		return nil, &rpc.Error{Code: "backend_not_ready", Message: "此账户操作尚未就绪", Status: 503}
	}
	var result any
	var domainErr *rpc.Error
	err := a.write(ctx, command, func(tx *sql.Tx) error {
		until, err := membership.PlanUntil(ctx, tx)
		if err != nil {
			return err
		}
		now := a.Now().UnixMilli()
		if err = a.refreshAllowance(ctx, tx, until, now); err != nil {
			return err
		}
		if !ok {
			domainErr = &rpc.Error{Code: "not_found", Message: "没有这个操作", Status: 404}
			return nil
		}
		if action.plus && until <= now {
			domainErr = &rpc.Error{Code: "plus_required", Message: "网页会话记录与管理是 Plus 会员功能", Status: 403}
			return nil
		}
		// Wallet maintenance precedes the action in the original account API.
		// Roll back a rejected action without undoing the daily grant or reap.
		if _, err = tx.ExecContext(ctx, "SAVEPOINT account_action"); err != nil {
			return err
		}
		result, err = action.run(ctx, tx, payload)
		if err != nil {
			if !errors.As(err, &domainErr) {
				return err
			}
			if _, err = tx.ExecContext(ctx, "ROLLBACK TO account_action"); err != nil {
				return err
			}
		}
		_, err = tx.ExecContext(ctx, "RELEASE account_action")
		return err
	})
	if err != nil {
		return nil, err
	}
	if workspace, ok := result.(cloudagent.Workspace); ok && domainErr == nil {
		return a.cloudStorage(ctx, command, workspace)
	}
	if name == "cloud.cancel" && domainErr == nil {
		a.schedule.Wake(string(command.AccountID))
	}
	return encodedAction(result, domainErr)
}

func encodedAction(result any, domainErr *rpc.Error) (json.RawMessage, error) {
	envelope := map[string]any{"ok": true, "data": result}
	if domainErr != nil {
		envelope = map[string]any{"ok": false, "error": domainErr.Code, "message": domainErr.Message, "status": domainErr.Status}
	}
	body, err := json.Marshal(envelope)
	if err != nil {
		return nil, err
	}
	return json.Marshal(string(body))
}
