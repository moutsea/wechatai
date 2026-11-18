package cloudagent

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"strings"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type File struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Bytes int64  `json:"bytes"`
}

type Task struct {
	ID             string   `json:"id"`
	PluginID       string   `json:"pluginInstanceId"`
	PluginName     *string  `json:"pluginName,omitempty"`
	SessionID      *string  `json:"sessionId"`
	SessionTitle   string   `json:"sessionTitle"`
	Prompt         *string  `json:"prompt,omitempty"`
	Files          []File   `json:"files,omitempty"`
	Status         string   `json:"status"`
	Upstream       string   `json:"upstreamStatus,omitempty"`
	CreatedAt      int64    `json:"createdAt"`
	UpdatedAt      int64    `json:"updatedAt"`
	Result         string   `json:"result,omitempty"`
	Error          string   `json:"error,omitempty"`
	Credits        *float64 `json:"credits,omitempty"`
	Stale          bool     `json:"stale,omitempty"`
	Delivered      bool     `json:"delivered,omitempty"`
	Delivery       *string  `json:"delivery,omitempty"`
	CanCancelFiles bool     `json:"canCancelFiles,omitempty"`
	Stopping       bool     `json:"stopping,omitempty"`
	Unconfirmed    bool     `json:"unconfirmed,omitempty"`
}

type detail struct {
	PluginName                                       *string
	Prompt, DisplayPrompt                            *string
	OutputFiles                                      []File
	DeliveryStatus                                   *string
	UpstreamStatus, Result, Error, Frozen, FileError string
	Units                                            float64
	Unconfirmed                                      int
	FileCancelled                                    bool
	Outcome                                          *struct {
		Status      string
		Attachments []json.RawMessage
	}
}

// scanTask projects the persisted task onto the user-visible response.
const projection = `SELECT t.id,t.pluginId,s.id,json_extract(s.data,'$.title'),t.state,t.createdAt,t.updatedAt,t.stale,t.stopRequested,t.settled,t.data
FROM cloud_tasks t LEFT JOIN sessions s ON s.id=t.sessionId WHERE COALESCE(json_extract(t.data,'$.hidden'),0)=0`

type scanner interface{ Scan(...any) error }

func scanTask(row scanner) (Task, error) {
	var t Task
	var state, raw string
	var title *string
	var stop, settled bool
	if err := row.Scan(&t.ID, &t.PluginID, &t.SessionID, &title, &state, &t.CreatedAt, &t.UpdatedAt, &t.Stale, &stop, &settled, &raw); err != nil {
		return t, err
	}
	var d detail
	if err := json.Unmarshal([]byte(raw), &d); err != nil {
		return t, err
	}
	t.SessionTitle = "已删除会话"
	if title != nil {
		t.SessionTitle = *title
	}
	if t.Stale {
		t.SessionID = nil
	}
	t.PluginName, t.Prompt = d.PluginName, d.DisplayPrompt
	if t.Prompt == nil {
		t.Prompt = d.Prompt
	}
	t.Status = state
	switch state {
	case "rejected":
		t.Status = "failed"
		if stop {
			t.Status = "cancelled"
		}
	case "accepted", "submitting":
		if d.Outcome != nil {
			t.Status = "finalizing"
		} else if state == "accepted" {
			t.Status = "running"
			if d.UpstreamStatus == "queued" || d.UpstreamStatus == "awaiting_approval" {
				t.Status = d.UpstreamStatus
			}
		}
		t.CanCancelFiles = d.filesPending(settled)
		t.Stopping = d.FileCancelled || (stop && d.Outcome == nil)
	case "completed":
		t.Files = d.OutputFiles
	}
	if settled {
		cost := d.Units / 1000
		t.Credits = &cost
	}
	t.Upstream, t.Result, t.Error = d.UpstreamStatus, d.Result, d.Error
	t.Delivery = d.DeliveryStatus
	t.Delivered = t.Delivery != nil && *t.Delivery == "sent"
	t.Unconfirmed = d.Unconfirmed != 0
	return t, nil
}

func Get(ctx context.Context, tx *sql.Tx, id string) (Task, error) {
	t, err := scanTask(tx.QueryRowContext(ctx, projection+" AND t.id=?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return t, &rpc.Error{Code: "task_missing", Message: "找不到这个云端任务", Status: 404}
	}
	return t, err
}

type Page struct {
	Tasks      []Task  `json:"tasks"`
	NextCursor *string `json:"nextCursor"`
}

var uuid = regexp.MustCompile(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$`)

func cursor(value string) (int64, string, error) {
	invalid := &rpc.Error{Code: "invalid_task_cursor", Message: "任务分页信息无效，请返回最新任务后重试。", Status: 400}
	if len(value) == 0 || len(value) > 256 {
		return 0, "", invalid
	}
	data, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(strings.NewReplacer("+", "-", "/", "_").Replace(value), "="))
	var pair []json.RawMessage
	if err != nil || json.Unmarshal(data, &pair) != nil || len(pair) != 2 {
		return 0, "", invalid
	}
	var at *float64
	var id string
	if json.Unmarshal(pair[0], &at) != nil || at == nil || *at < 0 || *at > 9007199254740991 || math.Trunc(*at) != *at || json.Unmarshal(pair[1], &id) != nil || !uuid.MatchString(id) {
		return 0, "", invalid
	}
	return int64(*at), id, nil
}

func List(ctx context.Context, tx *sql.Tx, pluginID string, after *string) (Page, error) {
	p := Page{Tasks: []Task{}}
	query := projection
	var args []any
	if pluginID != "" {
		query += " AND t.pluginId=?"
		args = append(args, pluginID)
	}
	if after != nil {
		at, id, err := cursor(*after)
		if err != nil {
			return p, err
		}
		query += " AND (t.createdAt,t.id)<(?,?)"
		args = append(args, at, id)
	}
	rows, err := tx.QueryContext(ctx, query+" ORDER BY t.createdAt DESC,t.id DESC LIMIT 31", args...)
	if err != nil {
		return p, err
	}
	defer rows.Close()
	for rows.Next() {
		if len(p.Tasks) == 30 {
			last := p.Tasks[29]
			raw, err := json.Marshal([]any{last.CreatedAt, last.ID})
			if err != nil {
				return p, err
			}
			next := base64.RawURLEncoding.EncodeToString(raw)
			p.NextCursor = &next
			break
		}
		t, err := scanTask(rows)
		if err != nil {
			return p, err
		}
		p.Tasks = append(p.Tasks, t)
	}
	return p, rows.Err()
}
