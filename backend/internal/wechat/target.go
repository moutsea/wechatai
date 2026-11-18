package wechat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type Target struct{ Status, Generation, ContextToken, EncryptedCredentials string }

func LinkTarget(ctx context.Context, tx *sql.Tx, id string, until, now int64) (Target, error) {
	var result Target
	// Preserve the first link from accounts predating wechat_links.
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO wechat_links SELECT 'default','我的微信',0 WHERE `+legacyDefault); err != nil {
		return result, err
	}
	var position int
	err := tx.QueryRowContext(ctx, `SELECT position FROM (SELECT id,row_number() OVER (ORDER BY createdAt,rowid) AS position FROM wechat_links) WHERE id=?`, id).Scan(&position)
	if errors.Is(err, sql.ErrNoRows) {
		return result, &rpc.Error{Code: "connection_missing", Message: "找不到这个微信链接", Status: 404}
	}
	if err != nil {
		return result, err
	}
	limit := 1
	if until > now {
		limit = 10
	}
	if position > limit {
		prefix := ""
		if until > 0 && until <= now {
			prefix = "你的 Plus 会员到期了，"
		}
		return result, &rpc.Error{Code: "connection_paused", Message: prefix + "这个微信连接暂时不能聊天。\n\n免费版只能用 1 个微信连接，第一个连接还能正常聊天。想继续用这个，可以续费 Plus，或在网页删除其他连接，只保留这个。\n\n聊天记录和绑定都还在。", Status: 403}
	}
	key := "connection"
	if id != "default" {
		key = "wechat:" + id + ":connection"
	}
	return accounts.Setting(ctx, tx, key, result)
}

// ReminderTarget chooses the earliest usable connection, or only the original
// connection and binding generation once an occurrence has been claimed.
func ReminderTarget(ctx context.Context, tx *sql.Tx, requested, generation string, until, now int64) (string, *Target, bool, error) {
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO wechat_links SELECT 'default','我的微信',0 WHERE `+legacyDefault); err != nil {
		return "", nil, false, err
	}
	limit := 1
	if until > now {
		limit = 10
	}
	rows, err := tx.QueryContext(ctx, `SELECT l.id,s.value FROM (SELECT id,row_number() OVER (ORDER BY createdAt,rowid) AS n FROM wechat_links) l LEFT JOIN settings s ON s.key=CASE l.id WHEN 'default' THEN 'connection' ELSE 'wechat:'||l.id||':connection' END WHERE (?='' OR l.id=?) AND l.n<=? ORDER BY l.n`, requested, requested, limit)
	if err != nil {
		return "", nil, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var raw *string
		if err := rows.Scan(&id, &raw); err != nil {
			return "", nil, false, err
		}
		if raw == nil {
			continue
		}
		var target Target
		if err := json.Unmarshal([]byte(*raw), &target); err != nil {
			return "", nil, false, err
		}
		if target.Status == "connected" && target.EncryptedCredentials != "" && target.ContextToken != "" && (requested == "" || target.Generation == generation) {
			return id, &target, false, nil
		}
	}
	if err := rows.Err(); err != nil {
		return "", nil, false, err
	}
	if requested == "" {
		return "", nil, false, nil
	}
	var unchanged bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM wechat_links l JOIN settings s ON s.key=CASE l.id WHEN 'default' THEN 'connection' ELSE 'wechat:'||l.id||':connection' END WHERE l.id=? AND json_extract(s.value,'$.generation')=?)`, requested, generation).Scan(&unchanged)
	return "", nil, !unchanged, err
}
