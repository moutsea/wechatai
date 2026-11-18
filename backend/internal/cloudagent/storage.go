package cloudagent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"time"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

const includedBytes = 500 * 1024 * 1024

type Usage struct {
	Used      int64 `json:"usedBytes"`
	Reserved  int64 `json:"reservedBytes"`
	Maximum   int64 `json:"maxTotalBytes"`
	Available int64 `json:"availableBytes"`
}
type Connection struct{ Origin, AppID, TenantID, AppKey string }

var serviceID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

func (c Connection) valid() bool {
	u, err := url.Parse(c.Origin)
	if err != nil || u.Host == "" || u.User != nil || u.Scheme+"://"+u.Host != c.Origin {
		return false
	}
	loopback := slices.Contains([]string{"localhost", "127.0.0.1", "::1"}, u.Hostname())
	return (u.Scheme == "https" || (loopback && u.Scheme == "http")) && serviceID.MatchString(c.AppID) && serviceID.MatchString(c.TenantID) && c.AppKey != ""
}

type Workspace struct{ WorkspaceID, ExternalID, Scope string }

func ReadWorkspace(ctx context.Context, tx *sql.Tx) (Workspace, error) {
	var raw string
	err := tx.QueryRowContext(ctx, "SELECT data FROM cloud_provision WHERE id=1").Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return Workspace{}, nil
	}
	if err != nil {
		return Workspace{}, err
	}
	var w Workspace
	err = json.Unmarshal([]byte(raw), &w)
	return w, err
}
func (w Workspace) Usage(ctx context.Context, c Connection, account string) (Usage, error) {
	if w.WorkspaceID == "" {
		return Usage{Maximum: includedBytes, Available: includedBytes}, nil
	}
	if !c.valid() {
		return Usage{}, &rpc.Error{Code: "cloud_agent_unavailable", Message: "云端空间用量暂时无法读取", Status: 503}
	}
	if !scopeMatches(w.Scope, c.Origin, c.AppID, c.TenantID) || w.ExternalID != "wechatai:"+account {
		return Usage{}, &rpc.Error{Code: "cloud_scope_changed", Message: "账号云端空间与当前服务不一致", Status: 503}
	}
	if w.WorkspaceID == "." || w.WorkspaceID == ".." {
		return Usage{}, &rpc.Error{Code: "cloud_agent_response", Message: "云端空间标识无效", Status: 502}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.Origin+"/api/workspaces/"+url.PathEscape(w.WorkspaceID)+"/storage/usage", nil)
	if err != nil {
		return Usage{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.AppKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-App-User", w.ExternalID)
	client := http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := client.Do(req)
	if err != nil {
		status := 502
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			status = 504
		}
		return Usage{}, &rpc.Error{Code: "cloud_agent_unreachable", Message: "小薇暂时无法连接。", Status: status}
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		code := "cloud_agent_failed"
		if res.StatusCode == 409 {
			code = "cloud_agent_conflict"
		}
		status := 502
		if res.StatusCode == 429 {
			status = 429
		}
		return Usage{}, &rpc.Error{Code: code, Message: fmt.Sprintf("小薇请求失败（%d）。", res.StatusCode), Status: status}
	}
	const limit = 2000000
	raw, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil {
		return Usage{}, &rpc.Error{Code: "cloud_agent_unreachable", Message: "小薇暂时无法连接。", Status: 502}
	}
	if len(raw) > limit {
		return Usage{}, &rpc.Error{Code: "upstream_too_large", Message: "服务响应过大", Status: 502}
	}
	return decodeUsage(raw)
}
func decodeUsage(raw []byte) (Usage, error) {
	if !json.Valid(raw) {
		return Usage{}, &rpc.Error{Code: "upstream_format", Message: "服务未返回有效 JSON", Status: 502}
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return Usage{}, &rpc.Error{Code: "cloud_agent_response", Message: "小薇返回格式无效", Status: 502}
	}
	invalid := &rpc.Error{Code: "cloud_agent_response", Message: "云端空间用量返回格式无效", Status: 502}
	var usage Usage
	for name, target := range map[string]*int64{"physicalBytes": &usage.Used, "reservedBytes": &usage.Reserved, "maxTotalBytes": &usage.Maximum, "availableBytes": &usage.Available} {
		var v *float64
		if json.Unmarshal(fields[name], &v) != nil || v == nil || *v < 0 || *v > 9007199254740991 || math.Trunc(*v) != *v {
			return Usage{}, invalid
		}
		*target = int64(*v)
	}
	if usage.Maximum <= 0 {
		return Usage{}, invalid
	}
	return usage, nil
}

func scopeMatches(raw, origin, app, tenant string) bool {
	var scope []string
	return json.Unmarshal([]byte(raw), &scope) == nil && slices.Equal(scope, []string{origin, app, tenant})
}
