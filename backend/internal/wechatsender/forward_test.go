package wechatsender

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSession(t *testing.T) {
	const msg = `{"msg":{"client_id":"part:0","to_user_id":"user"}}`
	const api = "https://ilinkai.weixin.qq.com/ilink/bot/"
	binary := []byte{0, 1, 2, 255}
	client := &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		b, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
		}
		body := `{"ret":0,"message_id":18446744073709551615,"errmsg":"redacted"}`
		h := http.Header{}
		switch r.URL.Path {
		case "/ilink/bot/sendmessage":
			if r.Header.Get("Authorization") != "Bearer test" || string(b) != msg {
				t.Error("changed request")
			}
		case "/ilink/bot/getuploadurl":
			body = `{"upload_param":"sample","unknown":"omitted"}`
		case "/c2c/upload", "/signed/path":
			if r.Header.Get("Authorization") != "" || string(b) != string(binary) {
				t.Error("incorrect CDN request")
			}
			h.Set("X-Encrypted-Param", "download")
		default:
			t.Error("unexpected request")
		}
		return &http.Response{StatusCode: 200, Header: h, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		serve(r.Context(), conn, client)
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	for _, tc := range []struct {
		op, url, body, want, param string
		status                     int
	}{
		{"probe", "", "", "", "", 204},
		{"sendmessage", api + "sendmessage", msg, `{"message_id":18446744073709551615,"ret":0}`, "", 200},
		{"getuploadurl", api + "getuploadurl", "{}", `{"upload_param":"sample"}`, "", 200},
		{"upload", "https://novac2c.cdn.weixin.qq.com/c2c/upload?example=x", base64.StdEncoding.EncodeToString(binary), "", "download", 200},
		{"upload", "https://novac2c.cdn.weixin.qq.com/signed/path?ticket=sample", base64.StdEncoding.EncodeToString(binary), "", "download", 200},
		{"sendmessage", "https://example.org/ilink/bot/sendmessage", msg, "", "", 0},
		{"sendmessage", api + "getupdates", msg, "", "", 0},
	} {
		j := job{ID: "00000000-0000-4000-8000-000000000001", Operation: tc.op, URL: tc.url, Body: tc.body, Deadline: time.Now().Add(time.Second).UnixMilli(), Headers: map[string]string{"Authorization": "Bearer test", "AuthorizationType": "ilink_bot_token", "X-WECHAT-UIN": "x", "iLink-App-Id": "bot", "iLink-App-ClientVersion": "1"}}
		if err := wsjson.Write(ctx, conn, j); err != nil {
			t.Fatal(err)
		}
		var got result
		if err := wsjson.Read(ctx, conn, &got); err != nil {
			t.Fatal(err)
		}
		if got.ID != j.ID || got.Status != tc.status || got.Body != tc.want || got.DownloadParam != tc.param {
			t.Errorf("%s: %+v", tc.op, got)
		}
	}
}
