package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/notifications"
	"github.com/moutsea/wechatai/backend/internal/platform/config"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type notificationTransport func(*http.Request) (*http.Response, error)

func (f notificationTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestNotificationDeliveryRecoversWithOneClientID(t *testing.T) {
	ctx := t.Context()
	cfg := config.Config{DataDir: filepath.Join(t.TempDir(), "accounts"), MaxOpenAccounts: 2, RPCSecret: strings.Repeat("s", 32), EncryptionKey: strings.Repeat("e", 32), AppURL: "https://comparison.example"}
	const plugin = "a1000000-0000-4000-8000-000000000000"
	id := accounts.ID(strings.Repeat("a", 64))
	a, err := New(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = a.Close() })
	h, err := a.Accounts.Acquire(ctx, id, true)
	if err != nil {
		t.Fatal(err)
	}
	encrypted, err := a.Box.Encrypt(`{"baseUrl":"https://ilinkai.weixin.qq.com","token":"fixture-token","userId":"recipient"}`, string(id)+":wechat")
	if err != nil {
		t.Fatal(err)
	}
	var token string
	err = sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
		if err := accounts.Bind(ctx, tx, id, "owner", 1, "active"); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO plugins VALUES(?,?)", plugin, `{"pluginId":"wechatai/notification","name":"我的  通知","enabled":true,"connectionId":"default"}`); err != nil {
			return err
		}
		if err := accounts.SetSetting(ctx, tx, "connection", map[string]string{"status": "connected", "generation": "stable", "contextToken": "context", "encryptedCredentials": encrypted}); err != nil {
			return err
		}
		var err error
		token, err = notifications.Rotate(ctx, tx, cfg.EncryptionKey, string(id), plugin)
		return err
	})
	h.Close()
	if err != nil {
		t.Fatal(err)
	}
	credential := strings.Split(token, ".")[3]
	call := func(app *App, action string, payload any, key string) map[string]any {
		t.Helper()
		args, _ := json.Marshal([]any{plugin, credential, action, payload, key})
		raw, err := app.Registry.Dispatch(ctx, rpc.Command{Version: rpc.Version, AccountID: id, RouteEpoch: 1, Principal: rpc.Principal{Scope: rpc.Notification}, Method: "notificationRequest", Params: args})
		if err != nil {
			t.Fatal(err)
		}
		var inner string
		var res map[string]any
		if json.Unmarshal(raw, &inner) != nil || json.Unmarshal([]byte(inner), &res) != nil {
			t.Fatal("invalid RPC response")
		}
		return res
	}
	first := call(a, "send", map[string]string{"text": "附件 <>&\u2028测试", "title": "  主题 "}, "dedupe")
	if first["ok"] != true {
		t.Fatal(first)
	}
	accepted := first["data"].(map[string]any)
	job := accepted["id"].(string)
	duplicate := call(a, "send", map[string]string{"text": "附件 <>&\u2028测试", "title": "主题"}, "dedupe")
	if d := duplicate["data"].(map[string]any); d["id"] != job || d["duplicate"] != true {
		t.Fatal(duplicate)
	}
	if r := call(a, "send", map[string]string{"text": "其他"}, "dedupe"); r["error"] != "idempotency_conflict" {
		t.Fatal(r)
	}
	var mu sync.Mutex
	var ids []string
	transport := notificationTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://ilinkai.weixin.qq.com/ilink/bot/sendmessage" || r.Header.Get("Authorization") != "Bearer fixture-token" {
			return nil, errors.New("unexpected destination")
		}
		var p struct {
			Msg struct {
				ID      string `json:"client_id"`
				Context string `json:"context_token"`
				Items   []struct {
					Text struct{ Text string } `json:"text_item"`
				} `json:"item_list"`
			}
		}
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			return nil, err
		}
		if p.Msg.Context != "context" || len(p.Msg.Items) != 1 || p.Msg.Items[0].Text.Text != "消息来自 我的 通知（消息提醒插件）。\n\n──────────\n\n主题\n\n附件 <>&\u2028测试" {
			return nil, errors.New("unexpected message format")
		}
		mu.Lock()
		defer mu.Unlock()
		ids = append(ids, p.Msg.ID)
		if len(ids) == 1 {
			return nil, errors.New("reply lost after upstream acceptance")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"ret":0}`))}, nil
	})
	a.wechatSender.Transport = transport
	// First process loses the response after handing the text to WeChat.
	next, err := (backgroundRunner{a}).Run(ctx, string(id))
	if err != nil || next == nil || !next.After(time.Now()) {
		t.Fatalf("did not persist retry: %v %v", next, err)
	}
	if err = a.Close(); err != nil {
		t.Fatal(err)
	}
	b, err := New(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	b.wechatSender.Transport = transport
	run, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- b.RunBackground(run) }()
	defer func() {
		cancel()
		if err := <-done; err != nil {
			t.Error(err)
		}
	}()
	deadline := time.Now().Add(12 * time.Second)
	for {
		resp := call(b, "status", job, "")
		row := resp["data"].(map[string]any)
		if row["state"] == "sent" {
			if row["attempts"] != float64(2) || row["sentAt"] == nil {
				t.Fatal(row)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("restarted scheduler did not deliver", row)
		}
		time.Sleep(50 * time.Millisecond)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(ids) != 2 || ids[0] != "notify:"+job || ids[1] != ids[0] {
		t.Fatalf("unexpected delivery identity: %v", ids)
	}
}
