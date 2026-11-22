// Package receiver implements the private WebSocket protocol spoken by the
// installed WeChat poller. Each accepted batch commits its cursor and receipts together.
package receiver

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/delivery"
	"github.com/moutsea/wechatai/backend/internal/platform/cryptobox"
	"github.com/moutsea/wechatai/backend/internal/wechat"
)

type frame struct {
	Type         string
	ID           string
	ConnectionID *string
	Generation   *string
	FromCursor   *string
	Cursor       *string
	Msgs         *[]json.RawMessage
}
type Ack struct {
	RetryAfterMS int     `json:"retryAfterMs,omitempty"`
	Type         string  `json:"type"`
	ID           string  `json:"id"`
	Stale        bool    `json:"stale,omitempty"`
	Cursor       *string `json:"cursor,omitempty"`
}

var ErrFrame = errors.New("invalid receiver frame")

func parseFrame(raw []byte) (frame, error) {
	var f frame
	if json.Unmarshal(raw, &f) != nil || f.ConnectionID == nil || f.Generation == nil || len(*f.ConnectionID) > 100 || len(*f.Generation) > 100 {
		return f, ErrFrame
	}
	if f.Type == "expired" {
		return f, nil
	}
	u, err := uuid.Parse(f.ID)
	if f.Type != "batch" || err != nil || !strings.EqualFold(u.String(), f.ID) || *f.ConnectionID == "" || *f.Generation == "" || f.FromCursor == nil || f.Cursor == nil || len(*f.FromCursor) > 65536 || len(*f.Cursor) > 65536 || f.Msgs == nil || len(*f.Msgs) > 1000 {
		return f, ErrFrame
	}
	return f, nil
}

type binding struct {
	Status, Generation, Cursor, EncryptedCredentials, ContextToken, BlockedContextId string
}

func settingKey(id string) string {
	if id == "default" {
		return "connection"
	}
	return "wechat:" + id + ":connection"
}

type ordered struct {
	message delivery.WechatMessage
	seq     string
	created float64
}

func order(raw []json.RawMessage, sender string) ([]ordered, error) {
	out := make([]ordered, 0, len(raw))
	bySequence, byTime := true, true
	for _, msg := range raw {
		var m delivery.WechatMessage
		if len(msg) == 0 || msg[0] != '{' || json.Unmarshal(msg, &m) != nil {
			return nil, ErrFrame
		}
		if m.Type != 1 || m.Sender != sender || !m.HasReceipt() {
			continue
		}
		m.Raw = msg
		v := ordered{message: m}
		if seq := m.SequenceNumber(); seq != nil {
			v.seq = seq.String()
		} else {
			bySequence = false
		}
		if json.Unmarshal(m.Created, &v.created) != nil || v.created <= 0 || v.created > 9007199254740991 || math.Trunc(v.created) != v.created {
			byTime = false
		}
		out = append(out, v)
	}
	if bySequence {
		sort.SliceStable(out, func(i, j int) bool {
			l, r := out[i].seq, out[j].seq
			if len(l) != len(r) {
				return len(l) < len(r)
			}
			return l < r
		})
	} else if byTime {
		sort.SliceStable(out, func(i, j int) bool { return out[i].created < out[j].created })
	}
	return out, nil
}

// Apply runs after authenticating the poller and checking the current route epoch.
func Apply(ctx context.Context, tx *sql.Tx, box *cryptobox.Box, id accounts.ID, raw []byte, now int64) (*Ack, error) {
	f, err := parseFrame(raw)
	if err != nil {
		return nil, err
	}
	connection := *f.ConnectionID
	key := settingKey(connection)
	var b binding
	exists, err := wechat.LinkExists(ctx, tx, connection)
	if err != nil {
		return nil, err
	}
	b, err = accounts.Setting(ctx, tx, key, b)
	if err != nil {
		return nil, err
	}
	ok := exists && b.Status == "connected" && b.Generation == *f.Generation && b.EncryptedCredentials != ""
	if f.Type == "expired" {
		if ok {
			_, err = tx.ExecContext(ctx, `UPDATE settings SET value=json_set(value,'$.status','expired','$.error','微信连接已过期，请重新扫码') WHERE key=?`, key)
		}
		return nil, err
	}
	ack := &Ack{Type: "ack", ID: f.ID, Stale: !ok}
	if !ok {
		return ack, nil
	}
	c, err := wechat.OpenCredentials(box, id, b.EncryptedCredentials)
	if err != nil {
		return nil, err
	}
	if c.BotID == "" {
		return nil, errors.New("empty WeChat bot identity")
	}
	messages, err := order(*f.Msgs, c.UserID)
	if err != nil {
		return nil, err
	}
	prefix := c.BotID + ":" + c.UserID + ":"
	if connection != "default" {
		prefix = connection + ":" + prefix
	}
	replay := b.Cursor != "" && b.Cursor != *f.FromCursor && b.Cursor == *f.Cursor
	received := false
	var token string
	var budget delivery.InboxBudget
	if len(messages) > 0 {
		budget, err = delivery.ReadInboxBudget(ctx, tx, connection)
		if err != nil {
			return nil, err
		}
	}
	blockedID := b.BlockedContextId
	for _, m := range messages {
		added, err := delivery.Receive(ctx, tx, prefix, connection, m.message, replay, now, &budget)
		if errors.Is(err, delivery.ErrInboxFull) {
			ack.RetryAfterMS = 5000
			if b.Cursor == *f.FromCursor {
				for i := len(messages) - 1; i >= 0; i-- {
					fresh := messages[i].message
					if fresh.Token == "" {
						continue
					}
					freshID := fresh.ReceiptID()
					if freshID != blockedID {
						rows, err := tx.ExecContext(ctx, "UPDATE inbox SET state='reply',attempts=0 WHERE connectionId=? AND state='waiting_context'", connection)
						if err != nil {
							return nil, err
						}
						count, err := rows.RowsAffected()
						if err != nil {
							return nil, err
						}
						if count > 0 {
							blockedID = freshID
							token = fresh.Token
						}
					}
					break
				}
			}
			break
		}
		if err != nil {
			return nil, err
		}
		if added {
			received = true
			if m.message.Token != "" {
				token = m.message.Token
			}
		}
	}
	if received {
		if err = automation.WakeMembership(ctx, tx, now); err != nil {
			return nil, err
		}
	}
	if ack.RetryAfterMS != 0 && !received && blockedID == b.BlockedContextId {
		return ack, nil
	}
	if ack.RetryAfterMS == 0 {
		blockedID = ""
	}
	cursor := b.Cursor
	if ack.RetryAfterMS == 0 && cursor == *f.FromCursor {
		cursor = *f.Cursor
	}
	// Preserve fields unknown to this receiver, including old credentials and
	// QR state. A replay never changes lastSeen or the last response context.
	if _, err = tx.ExecContext(ctx, `UPDATE settings SET value=json_set(value,'$.cursor',?,'$.lastPoll',?,'$.blockedContextId',?) WHERE key=?`, cursor, now, blockedID, key); err != nil {
		return nil, err
	}
	if received {
		if _, err = tx.ExecContext(ctx, `UPDATE settings SET value=json_set(value,'$.lastSeen',?) WHERE key=?`, now, key); err != nil {
			return nil, err
		}
	}
	if token != "" {
		if _, err = tx.ExecContext(ctx, `UPDATE settings SET value=json_set(value,'$.contextToken',?) WHERE key=?`, token, key); err != nil {
			return nil, err
		}
	}
	if _, err = tx.ExecContext(ctx, `UPDATE settings SET value=CASE WHEN EXISTS(SELECT 1 FROM inbox WHERE connectionId=? AND state='waiting_context' AND id GLOB 'cloud:*') THEN json_set(value,'$.error','云端结果暂未送达，已保留。请在微信发送 /wx help 后继续接收，无需重新提交任务。该命令不消耗 credits。') ELSE json_remove(value,'$.error') END WHERE key=?`, connection, key); err != nil {
		return nil, err
	}
	if ack.RetryAfterMS == 0 {
		ack.Cursor = &cursor
	}
	return ack, nil
}
