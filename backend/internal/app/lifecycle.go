package app

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/contract"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/jobs"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (a *App) migration(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	if _, err := arguments(command, 0); err != nil {
		return nil, err
	}
	if command.OwnerID == "" {
		return nil, &rpc.Error{Code: "invalid_identity", Message: "迁移命令必须指定原账户所有者", Status: 400}
	}
	if command.Method == "migration.status" {
		state, err := inspectFile(ctx, a.Config.DataDir, command.AccountID)
		if err != nil {
			return nil, accountError(err)
		}
		if state.UserID != command.OwnerID || (state.RouteEpoch != 0 && state.RouteEpoch != command.RouteEpoch) {
			return nil, accountError(accounts.ErrIdentity)
		}
		return json.Marshal(state)
	}
	handle, err := a.Accounts.Acquire(ctx, command.AccountID, false)
	if err != nil {
		return nil, accountError(err)
	}
	defer handle.Close()
	if command.Method == "migration.freeze" {
		// Reject stale/wrong identity before closing admission for this account.
		if err := accounts.Check(ctx, handle.DB, command.AccountID, command.OwnerID, command.RouteEpoch, false); err != nil {
			return nil, accountError(err)
		}
		finish, drainErr := handle.Gate.Quiesce(ctx)
		if drainErr != nil {
			return nil, drainErr
		}
		defer finish(false)
		var outstanding bool
		err = sqlite.Within(ctx, handle.DB, func(tx *sql.Tx) error {
			if err := accounts.Check(ctx, tx, command.AccountID, command.OwnerID, command.RouteEpoch, false); err != nil {
				return err
			}
			state, err := accounts.State(ctx, tx)
			if err != nil || state.Phase == "frozen" {
				return err
			}
			outstanding, err = (jobs.Queue{Now: a.Now}).Outstanding(ctx, tx)
			if err != nil {
				return err
			}
			return accounts.SetDrainPhase(ctx, tx, outstanding)
		})
		if err == nil {
			finish(!outstanding)
			if outstanding {
				return nil, &rpc.Error{Code: "account_draining", Message: "账户正在等待已领取的任务回报，请稍后重试冻结", Status: 409}
			}
		}
	} else if command.Method == "migration.activate" {
		if len(contract.Missing(a.features.Capabilities())) > 0 {
			return nil, &rpc.Error{Code: "backend_not_ready", Message: "后端功能尚未完整实现，不能激活账户", Status: 503}
		}
		err = sqlite.Within(ctx, handle.DB, func(tx *sql.Tx) error {
			return accounts.Activate(ctx, tx, command.AccountID, command.OwnerID, command.RouteEpoch)
		})
	}
	if err != nil {
		return nil, accountError(err)
	}
	state, err := accounts.State(ctx, handle.DB)
	if err != nil {
		return nil, err
	}
	return json.Marshal(state)
}
