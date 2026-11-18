package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/coder/websocket"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/notifications"
	"github.com/moutsea/wechatai/backend/internal/receiver"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type receiverSocket struct{ app *App }

func (receiverSocket) Capabilities() []string { return []string{"wechatReceiver"} }
func (r receiverSocket) Check(ctx context.Context, id accounts.ID, epoch int64) error {
	return r.app.read(ctx, rpc.Command{AccountID: id, RouteEpoch: epoch}, func(tx *sql.Tx) error { return accountError(accounts.Check(ctx, tx, id, "", epoch, true)) })
}
func (r receiverSocket) Serve(ctx context.Context, id accounts.ID, epoch int64, conn *websocket.Conn) {
	a := r.app
	session, done := a.receivers.Open(ctx, id)
	defer func() { done(); a.schedule.Wake(string(id)) }()
	a.polls.Reconcile(id, nil, nil)
	ctx, cancel := context.WithCancel(session.Context)
	defer cancel()
	conn.SetReadLimit(1 << 20)
	type input struct {
		kind websocket.MessageType
		body []byte
		err  error
	}
	inputs := make(chan input)
	go func() {
		for {
			active, finish := context.WithTimeout(ctx, 60*time.Second)
			kind, body, err := conn.Read(active)
			finish()
			select {
			case inputs <- input{kind, body, err}:
			case <-ctx.Done():
				return
			}
			if err != nil {
				return
			}
		}
	}()
	send := func(data []byte) error {
		timed, finish := context.WithTimeout(ctx, 5*time.Second)
		defer finish()
		return conn.Write(timed, websocket.MessageText, data)
	}
	command := rpc.Command{AccountID: id, RouteEpoch: epoch}
	var previous string
	configure := func() error {
		var cfg *receiver.Config
		err := a.read(ctx, command, func(tx *sql.Tx) error {
			var err error
			cfg, previous, err = receiver.Snapshot(ctx, tx, a.Box, id, previous, a.Now().UnixMilli())
			return err
		})
		if err != nil || cfg == nil {
			return err
		}
		data, err := json.Marshal(cfg)
		if err != nil {
			return err
		}
		return send(data)
	}
	if configure() != nil {
		return
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-session.Changes():
			if configure() != nil {
				return
			}
		case frame := <-inputs:
			if frame.err != nil {
				return
			}
			session.Received()
			if frame.kind != websocket.MessageText {
				conn.Close(websocket.StatusUnsupportedData, "text required")
				return
			}
			if string(frame.body) == "wechatai-receiver-ping-v1" {
				if send([]byte("wechatai-receiver-pong-v1")) != nil || configure() != nil {
					return
				}
				continue
			}
			var ack *receiver.Ack
			err := a.write(ctx, command, func(tx *sql.Tx) error {
				var err error
				ack, err = receiver.Apply(ctx, tx, a.Box, id, frame.body, a.Now().UnixMilli())
				return err
			})
			if err != nil {
				if errors.Is(err, receiver.ErrFrame) {
					conn.Close(websocket.StatusPolicyViolation, "invalid batch")
				}
				return
			}
			// SQLite owns the work before this wake and before acknowledging
			// the external poller. Restart discovery picks up a missed wake.
			a.schedule.Wake(string(id))
			if ack != nil {
				raw, err := json.Marshal(ack)
				if err != nil || send(raw) != nil {
					return
				}
			}
			if configure() != nil {
				return
			}
		}
	}
}

func (a *App) receiverStatus(ctx context.Context, c rpc.Command) (json.RawMessage, error) {
	if _, err := arguments(c, 0); err != nil {
		return nil, err
	}
	var registered *bool
	var connected int
	lease := a.receivers.Lease(c.AccountID)
	watchdog := "account"
	if lease != nil {
		watchdog = "vps"
	}
	next := lease
	earlier := func(at *int64) {
		if at != nil && (next == nil || *at < *next) {
			next = at
		}
	}
	earlier(a.polls.Next(c.AccountID))
	err := a.read(ctx, c, func(tx *sql.Tx) error {
		var err error
		registered, err = accounts.Setting[*bool](ctx, tx, "receiverRegistered", nil)
		if err != nil {
			return err
		}
		connected, err = receiver.ConnectedLinks(ctx, tx, a.Now().UnixMilli())
		if err != nil {
			return err
		}
		due, err := notifications.Next(ctx, tx)
		if err != nil {
			return err
		}
		earlier(due)
		state, err := automation.Membership(ctx, tx)
		if err == nil {
			earlier(automation.MembershipSchedule(state).NextAt)
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"enabled": true, "registered": registered, "delegated": lease != nil, "watchdog": watchdog, "connectedLinks": connected, "nextAlarm": next})
}
