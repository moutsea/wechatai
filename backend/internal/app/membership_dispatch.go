package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
	"github.com/moutsea/wechatai/backend/internal/wechat"
)

type membershipDelivery struct {
	term   int64
	item   automation.MembershipItem
	target wechat.Target
}

func (a *App) membershipMessage(days int, term int64) (string, error) {
	base := a.Config.PublicSiteURL
	if base == "" {
		base = a.Config.AppURL
	}
	u, err := url.Parse(base)
	if err != nil || u.Scheme != "https" && u.Scheme != "http" || u.Host == "" || u.User != nil {
		return "", errors.New("missing public billing origin")
	}
	date := time.UnixMilli(term).In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006年1月2日 15:04") + "（北京时间）"
	intro := "你的 Plus 会员就快到期了，到期时间是 " + date + "。"
	detail := "到期后，免费版可以用 1 个微信连接和 1 个插件，其余会暂停。聊天记录和绑定都还在。\n\n想继续用的话，可以提前续费，剩余时间会一起顺延。"
	if days == 7 {
		intro = "提前提醒一下，你的 Plus 会员将于 " + date + "到期。"
		detail = "如果想继续用所有微信连接和插件，可以提前续费，剩余时间会一起顺延。"
	}
	return intro + "\n\n" + detail + "\n\n[续费 Plus](" + u.ResolveReference(&url.URL{Path: "/app/billing"}).String() + ")", nil
}

func (a *App) claimMembership(ctx context.Context, tx *sql.Tx, now int64) (*membershipDelivery, error) {
	term, err := membership.PlanUntil(ctx, tx)
	if err != nil {
		return nil, err
	}
	if err = automation.SyncMembership(ctx, tx, term, now, false); err != nil {
		return nil, err
	}
	state, err := automation.Membership(ctx, tx)
	if err != nil {
		return nil, err
	}
	for _, item := range state.Items {
		if item.State != "pending" && item.State != "retry" && item.State != "sending" || item.RetryAt > now || item.CutoffAt <= now {
			continue
		}
		var requested, generation string
		if item.Target != nil {
			requested, generation = item.Target.ConnectionID, item.Target.Generation
		}
		connection, target, changed, err := wechat.ReminderTarget(ctx, tx, requested, generation, term, now)
		if err != nil {
			return nil, err
		}
		if target == nil {
			status := "waiting"
			if changed {
				status = "cancelled"
			}
			return nil, automation.DeferMembership(ctx, tx, term, state.Revision, item.Days, item.Attempts, status, now)
		}
		text := item.Text
		if text == "" {
			text, err = a.membershipMessage(item.Days, term)
			if err != nil {
				return nil, err
			}
		}
		claimed, err := automation.ClaimMembership(ctx, tx, term, state.Revision, item.Days, item.Attempts, automation.ReminderTarget{ConnectionID: connection, Generation: target.Generation}, text, now)
		if err != nil || claimed == nil {
			return nil, err
		}
		return &membershipDelivery{term, *claimed, *target}, nil
	}
	return nil, nil
}

// Confirm the current term, attempt and destination after the claim committed.
func (a *App) sendMembership(ctx context.Context, id accounts.ID, db *sql.DB, d *membershipDelivery) error {
	now := a.Now().UnixMilli()
	var current *wechat.Target
	err := sqlite.Within(ctx, db, func(tx *sql.Tx) error {
		term, err := membership.PlanUntil(ctx, tx)
		if err != nil || term != d.term {
			return err
		}
		state, err := automation.Membership(ctx, tx)
		if err != nil {
			return err
		}
		for _, item := range state.Items {
			if state.PlanUntil != term || item.Days != d.item.Days || item.Attempts != d.item.Attempts || item.State != "sending" || now >= item.CutoffAt || item.Target == nil {
				continue
			}
			_, target, _, err := wechat.ReminderTarget(ctx, tx, item.Target.ConnectionID, item.Target.Generation, term, now)
			if err != nil {
				return err
			}
			if target == nil || target.EncryptedCredentials != d.target.EncryptedCredentials {
				return automation.SettleMembership(ctx, tx, term, item.Days, item.Attempts, "waiting", now)
			}
			current = target
			break
		}
		return nil
	})
	if err != nil || current == nil {
		return err
	}
	clientID := fmt.Sprintf("membership:%s:%d:%d", id, d.term, d.item.Days)
	err = a.wechatSender.Text(ctx, a.Box, id, *current, clientID, d.item.Text)
	if ctx.Err() != nil {
		return ctx.Err()
	}
	status := "sent"
	if err != nil {
		status = "retry"
		var failure *rpc.Error
		if errors.As(err, &failure) && failure.Code == "wechat_expired" {
			status = "waiting"
		}
	}
	return sqlite.Within(ctx, db, func(tx *sql.Tx) error {
		return automation.SettleMembership(ctx, tx, d.term, d.item.Days, d.item.Attempts, status, a.Now().UnixMilli())
	})
}

func (a *App) deliverMembershipReminder(ctx context.Context, id accounts.ID, db *sql.DB) (*time.Time, error) {
	state, err := automation.Membership(ctx, db)
	if err != nil {
		return nil, err
	}
	term, err := membership.PlanUntil(ctx, db)
	if err != nil {
		return nil, err
	}
	if term != state.PlanUntil {
		err = sqlite.Within(ctx, db, func(tx *sql.Tx) error {
			current, err := membership.PlanUntil(ctx, tx)
			if err != nil {
				return err
			}
			return automation.SyncMembership(ctx, tx, current, a.Now().UnixMilli(), false)
		})
		if err != nil {
			return nil, err
		}
		state, err = automation.Membership(ctx, db)
		if err != nil {
			return nil, err
		}
	}
	next := automation.MembershipSchedule(state).NextAt
	if next != nil && *next <= a.Now().UnixMilli() {
		var d *membershipDelivery
		err = sqlite.Within(ctx, db, func(tx *sql.Tx) error {
			var err error
			d, err = a.claimMembership(ctx, tx, a.Now().UnixMilli())
			return err
		})
		if err != nil {
			return nil, err
		}
		if d != nil {
			if err = a.sendMembership(ctx, id, db, d); err != nil {
				return nil, err
			}
		}
		state, err = automation.Membership(ctx, db)
		if err != nil {
			return nil, err
		}
		next = automation.MembershipSchedule(state).NextAt
	}
	if next == nil {
		return nil, nil
	}
	at := time.UnixMilli(*next)
	return &at, nil
}
