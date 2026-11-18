package app

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/notifications"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/plugins"
	"github.com/moutsea/wechatai/backend/internal/rpc"
	"github.com/moutsea/wechatai/backend/internal/wechat"
)

type noticeDelivery struct {
	job    notifications.Job
	target wechat.Target
	name   string
}

func (a *App) claimNotice(ctx context.Context, tx *sql.Tx, now int64) (*noticeDelivery, error) {
	j, err := notifications.Due(ctx, tx, now)
	if err != nil || j == nil {
		return nil, err
	}
	end := func(state, message string, delay int64) (*noticeDelivery, error) {
		return nil, notifications.Finish(ctx, tx, *j, now, state, message, delay)
	}
	if now-j.CreatedAt >= 86400000 {
		return end("failed", "超过 24 小时未送达", 0)
	}
	p, err := plugins.Get(ctx, tx, j.Plugin)
	var domain *rpc.Error
	if err != nil && !errors.As(err, &domain) {
		return nil, err
	}
	if err != nil || p.Kind != "wechatai/notification" || !p.Enabled || p.ConnectionID != j.Connection {
		return end("failed", "插件已停用、删除或接收微信已更改", 0)
	}
	until, err := membership.PlanUntil(ctx, tx)
	if err != nil {
		return nil, err
	}
	target, err := wechat.LinkTarget(ctx, tx, j.Connection, until, now)
	if errors.As(err, &domain) && domain.Code == "connection_missing" {
		return end("failed", "微信绑定已更改，请通过新的请求重新发送", 0)
	}
	if err == nil && target.Generation != j.Generation {
		return end("failed", "微信绑定已更改，请通过新的请求重新发送", 0)
	}
	if err == nil {
		err = plugins.RequireSlot(ctx, tx, j.Plugin, until, now)
	}
	if errors.As(err, &domain) && (domain.Code == "connection_paused" || domain.Code == "plugin_limit") {
		return end("pending", "插件或微信链接超出当前套餐上限，恢复后继续投递", 60000)
	}
	if err != nil {
		return nil, err
	}
	if target.Status != "connected" || target.ContextToken == "" || target.EncryptedCredentials == "" {
		return end("pending", "请连接微信并在对话中发送一条消息", 60000)
	}
	ok, err := notifications.Claim(ctx, tx, j.ID, now)
	if !ok || err != nil {
		return nil, err
	}
	j.Attempts++
	return &noticeDelivery{job: *j, target: target, name: p.Name}, nil
}

// Check mutable permissions again after the durable claim and before sending.
func (a *App) currentNotice(ctx context.Context, tx *sql.Tx, d *noticeDelivery) (bool, error) {
	j := d.job
	var current bool
	err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM notification_jobs WHERE id=? AND state='sending' AND attempts=?)", j.ID, j.Attempts).Scan(&current)
	if err != nil || !current {
		return false, err
	}
	p, err := plugins.Get(ctx, tx, j.Plugin)
	var e *rpc.Error
	if errors.As(err, &e) && e.Code == "plugin_missing" {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !p.Enabled || p.Kind != "wechatai/notification" || p.ConnectionID != j.Connection {
		return false, nil
	}
	until, err := membership.PlanUntil(ctx, tx)
	if err != nil {
		return false, err
	}
	now := a.Now().UnixMilli()
	if err = plugins.RequireSlot(ctx, tx, j.Plugin, until, now); errors.As(err, &e) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	target, err := wechat.LinkTarget(ctx, tx, j.Connection, until, now)
	if errors.As(err, &e) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if target.Generation != j.Generation || target.Status != "connected" || target.ContextToken == "" || target.EncryptedCredentials != d.target.EncryptedCredentials {
		return false, nil
	}
	d.name, d.target = p.Name, target
	return true, nil
}

func (a *App) deliverNotice(ctx context.Context, id accounts.ID, db *sql.DB) (*time.Time, error) {
	next, err := notifications.Next(ctx, db)
	if err != nil || next == nil {
		return nil, err
	}
	if *next <= a.Now().UnixMilli() {
		var send *noticeDelivery
		err = sqlite.Within(ctx, db, func(tx *sql.Tx) error {
			var err error
			send, err = a.claimNotice(ctx, tx, a.Now().UnixMilli())
			return err
		})
		if err != nil {
			return nil, err
		}
		if send != nil {
			var current bool
			err = sqlite.Within(ctx, db, func(tx *sql.Tx) error { var err error; current, err = a.currentNotice(ctx, tx, send); return err })
			if err != nil {
				return nil, err
			}
			if !current {
				send = nil
			}
		}
		if send != nil {
			j := send.job
			text := "消息来自 " + strings.Join(strings.Fields(send.name), " ") + "（消息提醒插件）。\n\n──────────\n\n"
			if j.Title != "" {
				text += j.Title + "\n\n"
			}
			err = a.wechatSender.Text(ctx, a.Box, id, send.target, "notify:"+j.ID, text+j.Text)
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			state, message, delay := "sent", "", int64(0)
			if err != nil {
				state, message = "pending", "微信发送暂未成功，正在重试"
				delay = int64(min(300000, 5000<<min(j.Attempts-1, 6)))
				var failure *rpc.Error
				if errors.As(err, &failure) {
					message = failure.Message
				}
			}
			err = sqlite.Within(ctx, db, func(tx *sql.Tx) error {
				return notifications.Finish(ctx, tx, j, a.Now().UnixMilli(), state, message, delay)
			})
			if err != nil {
				return nil, err
			}
		}
		next, err = notifications.Next(ctx, db)
		if err != nil || next == nil {
			return nil, err
		}
	}
	at := time.UnixMilli(*next)
	return &at, nil
}
