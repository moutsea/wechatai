package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/platform/config"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func TestMembershipDispatchRetainsDestinationAndRenewalFence(t *testing.T) {
	ctx := t.Context()
	cfg := config.Config{DataDir: filepath.Join(t.TempDir(), "accounts"), MaxOpenAccounts: 1, RPCSecret: strings.Repeat("s", 32), EncryptionKey: strings.Repeat("e", 32), AppURL: "https://edge.example", PublicSiteURL: "https://site.example"}
	a, err := New(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	now := time.Date(2026, 11, 1, 2, 30, 0, 0, time.UTC)
	a.Now = func() time.Time { return now }
	id := accounts.ID(strings.Repeat("b", 64))
	h, err := a.Accounts.Acquire(ctx, id, true)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	term := now.AddDate(0, 0, 7).UnixMilli()
	target, err := a.Box.Encrypt(`{"baseUrl":"https://ilinkai.weixin.qq.com","token":"test","userId":"only-this-recipient"}`, string(id)+":wechat")
	if err != nil {
		t.Fatal(err)
	}
	change := func(fn func(*sql.Tx) error) {
		t.Helper()
		if err := sqlite.Within(ctx, h.DB, fn); err != nil {
			t.Fatal(err)
		}
	}
	change(func(tx *sql.Tx) error {
		if err := accounts.Bind(ctx, tx, id, "owner", 1, "active"); err != nil {
			return err
		}
		if err := accounts.SetSetting(ctx, tx, "planUntil", term); err != nil {
			return err
		}
		if err := accounts.SetSetting(ctx, tx, "connection", map[string]string{"status": "connected", "generation": "v1", "contextToken": "first", "encryptedCredentials": target}); err != nil {
			return err
		}
		return automation.SyncMembership(ctx, tx, term, now.UnixMilli(), false)
	})
	var messages []string
	a.wechatSender.Transport = notificationTransport(func(r *http.Request) (*http.Response, error) {
		b, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, err
		}
		var body struct {
			Msg struct {
				ID    string `json:"client_id"`
				Items []struct {
					Text struct{ Text string } `json:"text_item"`
				} `json:"item_list"`
			}
		}
		if err := json.Unmarshal(b, &body); err != nil {
			return nil, err
		}
		if !strings.HasSuffix(body.Msg.ID, ":7") || !strings.HasPrefix(body.Msg.ID, "membership:"+string(id)+":") {
			t.Fatal("incorrect reminder identity")
		}
		messages = append(messages, body.Msg.Items[0].Text.Text)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"ret":0}`))}, nil
	})
	next, err := (backgroundRunner{a}).Run(ctx, string(id))
	if err != nil || next == nil || next.UnixMilli() != term-3*86400000 || len(messages) != 1 {
		t.Fatal(next, err, len(messages))
	}
	if messages[0] != "提前提醒一下，你的 Plus 会员将于 2026年11月8日 10:30（北京时间）到期。\n\n如果想继续用所有微信连接和插件，可以提前续费，剩余时间会一起顺延。\n\n[续费 Plus](https://site.example/app/billing)" {
		t.Fatal("unexpected reminder text", messages)
	}
	now = now.AddDate(0, 0, 4)
	var delivery *membershipDelivery
	change(func(tx *sql.Tx) error {
		var err error
		delivery, err = a.claimMembership(ctx, tx, now.UnixMilli())
		return err
	})
	if delivery == nil {
		t.Fatal("missing 3-day reminder")
	}
	change(func(tx *sql.Tx) error {
		if err := accounts.SetSetting(ctx, tx, "planUntil", term+28*86400000); err != nil {
			return err
		}
		return automation.SyncMembership(ctx, tx, term+28*86400000, now.UnixMilli(), false)
	})
	if err := a.sendMembership(context.Background(), id, h.DB, delivery); err != nil || len(messages) != 1 {
		t.Fatal("renewed account received stale reminder", err)
	}
}
