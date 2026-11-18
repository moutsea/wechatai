// Package receiverwatchdog checks the VPS receiver's sessions independently
// of the account backend. It only calls a DO when a watched session is missing.
package receiverwatchdog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/google/uuid"
)

const route = "/api/internal/wechat-receiver/watchdog"

type Supervisor struct {
	ReceiverURL, EdgeURL, Secret string
	Client                       *http.Client
}

type sessions struct {
	Sessions []string `json:"sessions"`
	Next     string   `json:"next"`
}

func (s Supervisor) request(ctx context.Context, method, target string, edge bool, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, target, nil)
	if err != nil {
		return err
	}
	if edge {
		req.Header.Set("Authorization", "Bearer "+s.Secret)
	}
	res, err := s.Client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("watchdog endpoint returned HTTP %d", res.StatusCode)
	}
	const limit = 2 << 20
	b, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil {
		return err
	}
	if len(b) > limit {
		return errors.New("watchdog response too large")
	}
	return json.Unmarshal(b, out)
}

func (s Supervisor) snapshot(ctx context.Context, target string, edge bool) (sessions, error) {
	var page sessions
	err := s.request(ctx, http.MethodGet, target, edge, &page)
	if err != nil {
		return page, err
	}
	if page.Sessions == nil {
		return page, errors.New("missing receiver session list")
	}
	for _, id := range page.Sessions {
		u, err := uuid.Parse(id)
		if err != nil || u.String() != id {
			return page, errors.New("invalid receiver session ID")
		}
	}
	return page, nil
}

func (s Supervisor) report(ctx context.Context, path string) error {
	var result struct {
		OK bool `json:"ok"`
	}
	if err := s.request(ctx, http.MethodPost, s.EdgeURL+route+path, true, &result); err != nil {
		return err
	}
	if !result.OK {
		return errors.New("watchdog report was not acknowledged")
	}
	return nil
}

func (s Supervisor) Check(ctx context.Context) error {
	local, err := s.snapshot(ctx, s.ReceiverURL, false)
	if err != nil {
		return fmt.Errorf("local receiver: %w", err)
	}
	healthy := make(map[string]bool, len(local.Sessions))
	for _, id := range local.Sessions {
		healthy[id] = true
	}
	var recoveryErr error
	after := ""
	for {
		page, err := s.snapshot(ctx, s.EdgeURL+route+"/sessions?after="+url.QueryEscape(after), true)
		if err != nil {
			return err
		}
		for _, id := range page.Sessions {
			if id <= after {
				return errors.New("invalid session pagination")
			}
			after = id
			if !healthy[id] {
				if err := s.report(ctx, "/recover/"+id); err != nil && recoveryErr == nil {
					recoveryErr = err
				}
			}
		}
		if page.Next == "" {
			break
		}
		if len(page.Sessions) == 0 || page.Next != after {
			return errors.New("invalid next session cursor")
		}
	}
	// A failed/incomplete scan must not keep the independent fallback asleep.
	if recoveryErr != nil {
		return recoveryErr
	}
	return s.report(ctx, "/heartbeat")
}
