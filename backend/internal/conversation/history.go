// Package conversation owns session history and its user-visible representation.
package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"slices"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "conversation", Migrations: []sqlite.Migration{
		{Version: 1, SQL: `CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sessionId TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,createdAt INTEGER NOT NULL,inputTokens INTEGER NOT NULL DEFAULT 0,outputTokens INTEGER NOT NULL DEFAULT 0,cost REAL NOT NULL DEFAULT 0,estimated INTEGER NOT NULL DEFAULT 0,model TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS messages_session ON messages(sessionId,id);
CREATE TABLE IF NOT EXISTS context_summaries(sessionId TEXT PRIMARY KEY,text TEXT NOT NULL,throughId INTEGER NOT NULL,updatedAt INTEGER NOT NULL);`},
		{Version: 2, When: "SELECT NOT EXISTS (SELECT 1 FROM pragma_table_info('messages') WHERE name='displayContent')", SQL: "ALTER TABLE messages ADD COLUMN displayContent TEXT"},
	}}
}

func Sessions(ctx context.Context, tx *sql.Tx) ([]json.RawMessage, error) {
	rows, err := tx.QueryContext(ctx, `SELECT CASE WHEN json_type(data,'$.connectionId') IS NULL THEN json_set(data,'$.connectionId','default') ELSE data END FROM sessions ORDER BY json_extract(data,'$.updatedAt') DESC,rowid`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, json.RawMessage(s))
	}
	return out, rows.Err()
}

func session(ctx context.Context, tx *sql.Tx, id string) (map[string]json.RawMessage, error) {
	var data string
	err := tx.QueryRowContext(ctx, "SELECT data FROM sessions WHERE id=?", id).Scan(&data)
	if sqlite.IsMissing(err) {
		return nil, &rpc.Error{Code: "session_missing", Message: "找不到这个会话", Status: 404}
	}
	if err != nil {
		return nil, err
	}
	var s map[string]json.RawMessage
	err = json.Unmarshal([]byte(data), &s)
	return s, err
}

type Message struct {
	ID           int64   `json:"id"`
	SessionID    string  `json:"sessionId"`
	Role         string  `json:"role"`
	Content      string  `json:"content"`
	CreatedAt    int64   `json:"createdAt"`
	InputTokens  int64   `json:"inputTokens"`
	OutputTokens int64   `json:"outputTokens"`
	Cost         float64 `json:"cost"`
	Estimated    bool    `json:"estimated"`
	Model        string  `json:"model"`
}

func Messages(ctx context.Context, tx *sql.Tx, id string, before float64) ([]Message, error) {
	if _, err := session(ctx, tx, id); err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,sessionId,role,COALESCE(displayContent,content),createdAt,inputTokens,outputTokens,cost,estimated,model FROM messages WHERE sessionId=? AND id<? ORDER BY id DESC LIMIT 100`, id, before)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &m.CreatedAt, &m.InputTokens, &m.OutputTokens, &m.Cost, &m.Estimated, &m.Model); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	slices.Reverse(out)
	return out, rows.Err()
}

func Summary(ctx context.Context, tx *sql.Tx, id string) (map[string]any, error) {
	s, err := session(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	var role bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM plugins WHERE id=json_extract(?,'$') AND json_extract(data,'$.pluginId')='wechatai/roleplay')`, stringOrNull(s["pluginInstanceId"])).Scan(&role)
	if err != nil {
		return nil, err
	}
	if !role {
		return nil, &rpc.Error{Code: "role_session_required", Message: "只有角色会话支持编辑剧情摘要", Status: 400}
	}
	out := map[string]any{"text": "", "updatedAt": int64(0)}
	if raw := s["contextStart"]; raw != nil {
		out["contextStart"] = raw
		out["throughId"] = raw
	}
	if raw := s["resetAt"]; raw != nil {
		out["resetAt"] = raw
	}
	var text string
	var through, updated int64
	err = tx.QueryRowContext(ctx, "SELECT text,throughId,updatedAt FROM context_summaries WHERE sessionId=?", id).Scan(&text, &through, &updated)
	if sqlite.IsMissing(err) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	out["text"], out["throughId"], out["updatedAt"] = text, through, updated
	return out, nil
}

func stringOrNull(raw json.RawMessage) any {
	if raw == nil {
		return nil
	}
	return string(raw)
}
