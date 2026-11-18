package app

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/credits"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (a *App) refreshAllowance(ctx context.Context, tx *sql.Tx, until, now int64) error {
	wallet := credits.Wallet{Now: a.Now}
	if err := wallet.Reap(ctx, tx); err != nil {
		return err
	}
	units := a.Config.FreeDailyUnits
	if until > now {
		units = a.Config.PlusDailyUnits
	}
	return wallet.Daily(ctx, tx, units)
}

func (a *App) applyPayment(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	args, err := arguments(command, 1)
	if err != nil {
		return nil, err
	}
	var event membership.Payment
	if err := json.Unmarshal(args[0], &event); err != nil {
		return nil, &rpc.Error{Code: "invalid_payment", Message: "支付参数无效", Status: 400}
	}
	err = a.write(ctx, command, func(tx *sql.Tx) error {
		now := a.Now().UnixMilli()
		effect, err := membership.ApplyPayment(ctx, tx, event, now)
		if err != nil {
			return err
		}
		if effect.Grant != nil {
			g := effect.Grant
			wallet := credits.Wallet{Now: a.Now}
			if err := wallet.Grant(ctx, tx, g.ID, g.Kind, g.Units, g.Expires, g.Note); err != nil {
				return err
			}
		} else if !effect.Duplicate {
			if err := a.refreshAllowance(ctx, tx, effect.PlanUntil, now); err != nil {
				return err
			}
		}
		return automation.SyncMembership(ctx, tx, effect.PlanUntil, now, false)
	})
	if err == nil {
		a.schedule.Wake(string(command.AccountID))
	}
	return json.RawMessage(`null`), err
}

func (a *App) adminMembership(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	if _, err := arguments(command, 0); err != nil {
		return nil, err
	}
	var until int64
	var gifts []membership.Gift
	err := a.read(ctx, command, func(tx *sql.Tx) error {
		var err error
		until, err = membership.PlanUntil(ctx, tx)
		if err != nil {
			return err
		}
		gifts, err = membership.Gifts(ctx, tx)
		return err
	})
	if err != nil {
		return nil, err
	}
	return json.Marshal(struct {
		PlanUntil int64             `json:"planUntil"`
		Gifts     []membership.Gift `json:"gifts"`
	}{until, gifts})
}

func (a *App) adminGiftPlus(ctx context.Context, command rpc.Command) (json.RawMessage, error) {
	args, err := arguments(command, 2)
	if err != nil {
		return nil, err
	}
	var actor string
	var input struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}
	if json.Unmarshal(args[0], &actor) != nil || json.Unmarshal(args[1], &input) != nil || actor != command.Principal.UserID {
		return nil, &rpc.Error{Code: "forbidden", Message: "赠送操作身份无效", Status: 403}
	}
	var gift membership.Gift
	var until int64
	err = a.write(ctx, command, func(tx *sql.Tx) error {
		var err error
		var created bool
		now := a.Now().UnixMilli()
		gift, created, err = membership.Give(ctx, tx, input.ID, actor, input.Reason, now)
		if err != nil {
			return err
		}
		until, err = membership.PlanUntil(ctx, tx)
		if err != nil {
			return err
		}
		if created {
			if err := a.refreshAllowance(ctx, tx, until, now); err != nil {
				return err
			}
		}
		return automation.SyncMembership(ctx, tx, until, now, false)
	})
	if err != nil {
		return nil, err
	}
	a.schedule.Wake(string(command.AccountID))
	return json.Marshal(struct {
		OK        bool            `json:"ok"`
		Gift      membership.Gift `json:"gift"`
		PlanUntil int64           `json:"planUntil"`
	}{true, gift, until})
}
