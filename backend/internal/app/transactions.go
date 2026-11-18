package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func arguments(command rpc.Command, count int) ([]json.RawMessage, error) {
	var args []json.RawMessage
	if err := json.Unmarshal(command.Params, &args); err != nil || len(args) != count {
		return nil, &rpc.Error{Code: "invalid_request", Message: "内部命令参数无效", Status: 400}
	}
	return args, nil
}

func (a *App) read(ctx context.Context, command rpc.Command, fn func(*sql.Tx) error) error {
	h, err := a.Accounts.Acquire(ctx, command.AccountID, false)
	if err != nil {
		return accountError(err)
	}
	defer h.Close()
	tx, err := h.DB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Only signed operator inspections may read a frozen account. Public tokens,
	// downloads and receiver sockets need the current active copy.
	requireActive := command.Principal.Scope != rpc.Admin
	if err = accounts.Check(ctx, tx, command.AccountID, command.OwnerID, command.RouteEpoch, requireActive); err != nil {
		return accountError(err)
	}
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func (a *App) write(ctx context.Context, command rpc.Command, fn func(*sql.Tx) error) error {
	h, err := a.Accounts.Acquire(ctx, command.AccountID, false)
	if err != nil {
		return accountError(err)
	}
	defer h.Close()
	finish, err := h.Gate.Enter()
	if err != nil {
		return accountError(err)
	}
	defer finish()
	err = sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
		if err := accounts.Check(ctx, tx, command.AccountID, command.OwnerID, command.RouteEpoch, true); err != nil {
			return err
		}
		return fn(tx)
	})
	return accountError(err)
}

func accountError(err error) error {
	switch {
	case errors.Is(err, sqlite.ErrUpgradeRequired):
		return &rpc.Error{Code: "account_upgrade_required", Message: "账户数据等待升级，请稍后重试", Status: 503}
	case errors.Is(err, accounts.ErrNotFound), errors.Is(err, accounts.ErrInactive):
		return &rpc.Error{Code: "account_unavailable", Message: "账户尚未激活或正在迁移", Status: 503}
	case errors.Is(err, accounts.ErrIdentity):
		return &rpc.Error{Code: "account_changed", Message: "账户路由或身份已变更，请重试", Status: 409}
	case errors.Is(err, accounts.ErrBusy):
		return &rpc.Error{Code: "server_busy", Message: "服务器暂时繁忙，请稍后重试", Status: 503}
	case errors.Is(err, membership.ErrInvalid):
		return &rpc.Error{Code: "invalid_payment", Message: "会员或支付参数无效", Status: 400}
	case errors.Is(err, membership.ErrGiftConflict):
		return &rpc.Error{Code: "gift_conflict", Message: "操作编号已被使用，请刷新页面核对赠送记录", Status: 409}
	default:
		return err
	}
}
