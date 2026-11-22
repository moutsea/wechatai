package wechatsender

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/moutsea/wechatai/backend/internal/accounts"
)

func Run(ctx context.Context) error {
	u, err := url.Parse(os.Getenv("WECHAT_SENDER_ORIGIN"))
	id, idErr := accounts.ParseID(os.Getenv("WECHAT_SENDER_ACCOUNT"))
	token := os.Getenv("WECHAT_SENDER_SECRET")
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || idErr != nil || len(token) < 32 {
		return errors.New("invalid WeChat sender configuration")
	}
	u.Scheme = "wss"
	u.Path = "/api/internal/wechat-sender/connect"
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+token)
	headers.Set("X-Wechatai-Account", string(id))
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for ctx.Err() == nil {
		dial, cancel := context.WithTimeout(ctx, 15*time.Second)
		conn, _, err := websocket.Dial(dial, u.String(), &websocket.DialOptions{HTTPClient: client, HTTPHeader: headers})
		cancel()
		if err == nil {
			slog.Info("WeChat sender connected")
			serve(ctx, conn, client)
		}
		if ctx.Err() != nil {
			break
		}
		slog.Warn("WeChat sender disconnected")
		select {
		case <-ctx.Done():
		case <-time.After(5 * time.Second):
		}
	}
	return nil
}

func serve(ctx context.Context, conn *websocket.Conn, client *http.Client) {
	ctx, cancel := context.WithCancel(ctx)
	var wg sync.WaitGroup
	defer func() { cancel(); conn.CloseNow(); wg.Wait() }()
	conn.SetReadLimit(8 * 1024 * 1024)
	wg.Go(func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				ping, stop := context.WithTimeout(ctx, 10*time.Second)
				err := conn.Ping(ping)
				stop()
				if err != nil {
					cancel()
					return
				}
			}
		}
	})
	slots := make(chan struct{}, 16)
	for {
		var j job
		if wsjson.Read(ctx, conn, &j) != nil || len(j.ID) != 36 {
			return
		}
		select {
		case slots <- struct{}{}:
		case <-ctx.Done():
			return
		}
		wg.Go(func() {
			defer func() { <-slots }()
			outcome, err := forward(ctx, client, j)
			if err != nil {
				slog.Warn("WeChat sender request failed")
			}
			if err == nil && j.Operation != "probe" {
				slog.Info("WeChat sender response", "operation", j.Operation, "http_status", outcome.Status)
			}
			write, stop := context.WithTimeout(ctx, 5*time.Second)
			defer stop()
			if wsjson.Write(write, conn, outcome) != nil {
				cancel()
			}
		})
	}
}
