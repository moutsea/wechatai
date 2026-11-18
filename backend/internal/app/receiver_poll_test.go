package app

import (
	"context"
	"database/sql"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/config"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func TestNativeReceiverRecoversAndYieldsToSocket(t *testing.T) {
	ctx := t.Context()
	a, err := New(ctx, config.Config{DataDir: filepath.Join(t.TempDir(), "accounts"), MaxOpenAccounts: 3, RPCSecret: strings.Repeat("s", 32), EncryptionKey: strings.Repeat("e", 32)})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	id := accounts.ID(strings.Repeat("c", 64))
	h, err := a.Accounts.Acquire(ctx, id, true)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	encrypted, err := a.Box.Encrypt(`{"token":"fixture","botId":"bot","userId":"user","baseUrl":"https://ilinkai.weixin.qq.com"}`, string(id)+":wechat")
	if err != nil {
		t.Fatal(err)
	}
	if err = sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
		if err := accounts.Bind(ctx, tx, id, "user", 1, "active"); err != nil {
			return err
		}
		return accounts.SetSetting(ctx, tx, "connection", map[string]string{"status": "connected", "generation": "generation", "cursor": "start", "encryptedCredentials": encrypted})
	}); err != nil {
		t.Fatal(err)
	}
	entered, aborted := make(chan struct{}), make(chan struct{})
	var calls atomic.Int64
	a.wechatSender.Transport = notificationTransport(func(req *http.Request) (*http.Response, error) {
		n := calls.Add(1)
		if req.URL.String() != "https://ilinkai.weixin.qq.com/ilink/bot/getupdates" {
			t.Error("unexpected provider endpoint")
		}
		payload, _ := io.ReadAll(req.Body)
		if n == 1 {
			if !strings.Contains(string(payload), `"get_updates_buf":"start"`) {
				t.Error("did not resume committed cursor")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"ret":0,"get_updates_buf":"end","msgs":[{"message_type":1,"from_user_id":"user","message_id":9223372036854775809,"seq":2},{"message_type":1,"from_user_id":"user","message_id":9223372036854775808,"seq":1}]}`))}, nil
		}
		if n == 2 {
			if !strings.Contains(string(payload), `"get_updates_buf":"end"`) {
				t.Error("lost new cursor")
			}
			close(entered)
			<-req.Context().Done()
			close(aborted)
			return nil, req.Context().Err()
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"errcode":-14}`))}, nil
	})
	run, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- a.RunBackground(run) }()
	defer func() {
		cancel()
		if err := <-done; err != nil {
			t.Error(err)
		}
	}()
	select {
	case <-entered:
	case <-time.After(8 * time.Second):
		t.Fatal("native receiver did not poll after restart")
	}
	_, disconnect := a.receivers.Open(ctx, id)
	a.schedule.Wake(string(id))
	select {
	case <-aborted:
	case <-time.After(5 * time.Second):
		disconnect()
		t.Fatal("delegation did not interrupt native poll")
	}
	var keys string
	if err = h.DB.QueryRow("SELECT group_concat(id,'|') FROM (SELECT id FROM inbox ORDER BY rowid)").Scan(&keys); err != nil || keys != "bot:user:wx64:9223372036854775808|bot:user:wx64:9223372036854775809" {
		disconnect()
		t.Fatal(keys, err)
	}
	disconnect()
	a.schedule.Wake(string(id))
	deadline := time.Now().Add(6 * time.Second)
	for {
		var status string
		if err = h.DB.QueryRow("SELECT json_extract(value,'$.status') FROM settings WHERE key='connection'").Scan(&status); err != nil {
			t.Fatal(err)
		}
		if status == "expired" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("fallback did not resume after disconnect")
		}
		time.Sleep(30 * time.Millisecond)
	}
}
