// Package wechatsender serves the single-account WeChat egress canary.
package wechatsender

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type job struct {
	ID        string            `json:"id"`
	Operation string            `json:"operation"`
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	Body      string            `json:"body"`
	Deadline  int64             `json:"deadline"`
}
type result struct {
	ID            string `json:"id"`
	Status        int    `json:"status,omitempty"`
	Body          string `json:"body,omitempty"`
	DownloadParam string `json:"downloadParam,omitempty"`
}

var errInvalid = errors.New("invalid sender request")

const maxEncrypted = 5*1024*1024 + 16

func upstreamRequest(ctx context.Context, j job) (*http.Request, error) {
	u, err := url.Parse(j.URL)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || u.Fragment != "" {
		return nil, errInvalid
	}
	var body []byte
	switch j.Operation {
	case "upload":
		if u.Host != "novac2c.cdn.weixin.qq.com" || len(j.Body) > base64.StdEncoding.EncodedLen(maxEncrypted) {
			return nil, errInvalid
		}
		body, err = base64.StdEncoding.DecodeString(j.Body)
		if err != nil || len(body) == 0 || len(body) > maxEncrypted {
			return nil, errInvalid
		}
	case "getuploadurl", "sendmessage":
		if (u.Host != "ilinkai.weixin.qq.com" && !strings.HasSuffix(u.Host, ".ilinkai.weixin.qq.com")) || u.RawPath != "" || u.Path != "/ilink/bot/"+j.Operation || u.RawQuery != "" || len(j.Body) > 256*1024 || !json.Valid([]byte(j.Body)) {
			return nil, errInvalid
		}
		body = []byte(j.Body)
	default:
		return nil, errInvalid
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(body))
	if err != nil {
		return nil, errInvalid
	}
	if j.Operation == "upload" {
		req.Header.Set("Content-Type", "application/octet-stream")
	} else {
		for _, k := range []string{"Authorization", "AuthorizationType", "X-WECHAT-UIN", "iLink-App-Id", "iLink-App-ClientVersion"} {
			if j.Headers[k] == "" {
				return nil, errInvalid
			}
			req.Header.Set(k, j.Headers[k])
		}
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

func forward(ctx context.Context, client *http.Client, j job) (result, error) {
	r := result{ID: j.ID}
	remaining := time.Until(time.UnixMilli(j.Deadline))
	if remaining <= 0 {
		return r, errInvalid
	}
	ctx, cancel := context.WithTimeout(ctx, min(remaining, time.Minute))
	defer cancel()
	if j.Operation == "probe" {
		r.Status = http.StatusNoContent
		return r, nil
	}
	req, err := upstreamRequest(ctx, j)
	if err != nil {
		return r, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return r, errors.New("WeChat request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		r.Status = resp.StatusCode
		return r, nil
	}
	if j.Operation == "upload" {
		p := resp.Header.Get("X-Encrypted-Param")
		if len(p) > 16000 {
			return r, errors.New("invalid upload response")
		}
		r.DownloadParam = p
	} else {
		const max = 64 * 1024
		raw, err := io.ReadAll(io.LimitReader(resp.Body, max+1))
		var data map[string]json.RawMessage
		if err != nil || len(raw) > max || json.Unmarshal(raw, &data) != nil || data == nil {
			return r, errors.New("invalid WeChat response")
		}
		fields := []string{"ret", "errcode", "message_id"}
		if j.Operation == "getuploadurl" {
			fields = []string{"ret", "errcode", "upload_param", "upload_full_url"}
		}
		safe := map[string]json.RawMessage{}
		for _, k := range fields {
			if v, ok := data[k]; ok {
				safe[k] = v
			}
		}
		filtered, err := json.Marshal(safe)
		if err != nil {
			return r, errors.New("invalid WeChat response")
		}
		r.Body = string(filtered)
	}
	r.Status = resp.StatusCode
	return r, nil
}
