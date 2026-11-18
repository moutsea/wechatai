package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/receiver"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (a *App) reconcileReceiver(ctx context.Context, id accounts.ID, db *sql.DB) (*time.Time, error) {
	if a.receivers.Connected(id) {
		a.polls.Reconcile(id, nil, nil)
		return nil, nil
	}
	state, err := accounts.State(ctx, db)
	if err != nil {
		return nil, err
	}
	keys, err := receiver.PollKeys(ctx, db, id, state.RouteEpoch)
	if err != nil {
		return nil, err
	}
	a.polls.Reconcile(id, keys, a.pollLink)
	return nil, nil
}

func (a *App) pollLink(ctx context.Context, key receiver.PollKey) (bool, error) {
	if a.receivers.Connected(key.Account) {
		return false, nil
	}
	command := rpc.Command{AccountID: key.Account, RouteEpoch: key.Epoch}
	var link *receiver.LinkConfig
	err := a.read(ctx, command, func(tx *sql.Tx) error {
		var err error
		link, err = receiver.PollBinding(ctx, tx, a.Box, key)
		return err
	})
	if err != nil {
		var e *rpc.Error
		if errors.As(err, &e) && (e.Code == "account_changed" || e.Code == "account_unavailable") {
			return false, nil
		}
		return true, err
	}
	if link == nil {
		return false, nil
	}
	result, err := a.wechatSender.Poll(ctx, link.Credentials, link.Cursor)
	if ctx.Err() != nil || a.receivers.Connected(key.Account) {
		return false, nil
	}
	var frame []byte
	var expired bool
	if err != nil {
		var e *rpc.Error
		if !errors.As(err, &e) || e.Code != "wechat_expired" {
			return true, err
		}
		expired = true
		frame, err = json.Marshal(map[string]string{"type": "expired", "connectionId": key.Link, "generation": key.Generation})
	} else {
		frame, err = receiver.ProviderBatch(*link, result)
	}
	if err != nil {
		return true, err
	}
	var ack *receiver.Ack
	err = a.write(ctx, command, func(tx *sql.Tx) error {
		if a.receivers.Connected(key.Account) {
			return nil
		}
		var err error
		ack, err = receiver.Apply(ctx, tx, a.Box, key.Account, frame, a.Now().UnixMilli())
		return err
	})
	if err != nil {
		return true, err
	}
	a.schedule.Wake(string(key.Account))
	return !expired && ack != nil && !ack.Stale, nil
}
