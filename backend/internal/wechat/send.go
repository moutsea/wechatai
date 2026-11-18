package wechat

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/cryptobox"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type Sender struct{ Transport http.RoundTripper }

type Credentials struct {
	Token   string `json:"token"`
	BaseURL string `json:"baseUrl"`
	UserID  string `json:"userId"`
	BotID   string `json:"botId"`
}

func OpenCredentials(box *cryptobox.Box, account accounts.ID, encrypted string) (Credentials, error) {
	var c Credentials
	plain, err := box.Decrypt(encrypted, string(account)+":wechat")
	if err != nil {
		return c, err
	}
	if json.Unmarshal([]byte(plain), &c) != nil || c.Token == "" || c.UserID == "" || c.BaseURL == "" {
		return c, errors.New("invalid WeChat credentials")
	}
	return c, nil
}

func (s Sender) Text(ctx context.Context, box *cryptobox.Box, account accounts.ID, target Target, clientID, text string) error {
	auth, err := OpenCredentials(box, account, target.EncryptedCredentials)
	if err != nil {
		return err
	}
	body := map[string]any{"msg": map[string]any{"from_user_id": "", "to_user_id": auth.UserID, "client_id": clientID, "message_type": 2, "message_state": 2, "context_token": target.ContextToken, "item_list": []any{map[string]any{"type": 1, "text_item": map[string]string{"text": text}}}}}
	_, err = s.request(ctx, auth, "sendmessage", body, 5*time.Second)
	return err
}

func (s Sender) Poll(ctx context.Context, auth Credentials, cursor string) (json.RawMessage, error) {
	return s.request(ctx, auth, "getupdates", map[string]any{"get_updates_buf": cursor}, 35*time.Second)
}
func (s Sender) request(ctx context.Context, auth Credentials, path string, body map[string]any, timeout time.Duration) (json.RawMessage, error) {
	u, err := url.Parse(auth.BaseURL)
	if err != nil || u.Scheme != "https" || u.User != nil || (u.Port() != "" && u.Port() != "443") {
		return nil, errors.New("invalid WeChat origin")
	}
	host := strings.ToLower(u.Hostname())
	if host != "ilinkai.weixin.qq.com" && !strings.HasSuffix(host, ".ilinkai.weixin.qq.com") {
		return nil, errors.New("invalid WeChat origin")
	}
	body["base_info"] = map[string]string{"channel_version": "2.1.6"}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://"+host+"/ilink/bot/"+path, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	var n [4]byte
	if _, err = rand.Read(n[:]); err != nil {
		return nil, err
	}
	req.Header.Set("X-WECHAT-UIN", base64.StdEncoding.EncodeToString([]byte(strconv.FormatUint(uint64(binary.LittleEndian.Uint32(n[:])), 10))))
	req.Header.Set("Authorization", "Bearer "+auth.Token)
	req.Header.Set("AuthorizationType", "ilink_bot_token")
	req.Header.Set("iLink-App-Id", "bot")
	req.Header.Set("iLink-App-ClientVersion", "131334")
	req.Header.Set("content-type", "application/json")
	client := http.Client{Transport: s.Transport, Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, &rpc.Error{Code: "wechat_unavailable", Message: fmt.Sprintf("微信连接暂时不可用（HTTP %d）", res.StatusCode), Status: 502}
	}
	const max = 2_000_000
	data, err := io.ReadAll(io.LimitReader(res.Body, max+1))
	if err != nil || len(data) > max {
		return nil, errors.New("invalid WeChat response")
	}
	var reply *struct{ Ret, ErrCode *int }
	if err = json.Unmarshal(data, &reply); err != nil || reply == nil {
		return nil, errors.New("invalid WeChat response")
	}
	for _, code := range []*int{reply.Ret, reply.ErrCode} {
		if code != nil && *code == -14 {
			return nil, &rpc.Error{Code: "wechat_expired", Message: "微信连接已过期，请重新扫码", Status: 409}
		}
	}
	if (reply.Ret != nil && *reply.Ret != 0) || (reply.ErrCode != nil && *reply.ErrCode != 0) {
		return nil, &rpc.Error{Code: "wechat_error", Message: "微信暂时无法完成此操作", Status: 502}
	}
	return data, nil
}
