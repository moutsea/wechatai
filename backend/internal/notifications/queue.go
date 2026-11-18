package notifications

import (
	"context"
	"database/sql"
	"errors"
	"regexp"

	"github.com/google/uuid"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

var receiptID = regexp.MustCompile("^[a-f0-9-]{36}$")
var idempotencyKey = regexp.MustCompile("^[a-zA-Z0-9._:-]{1,120}$")

type Accepted struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Duplicate bool   `json:"duplicate"`
}

func GetReceipt(ctx context.Context, tx *sql.Tx, plugin, id string, now int64) (Receipt, error) {
	var r Receipt
	if !receiptID.MatchString(id) {
		return r, &rpc.Error{Code: "invalid_id", Message: "无效的消息 ID", Status: 400}
	}
	err := tx.QueryRowContext(ctx, "SELECT id,title,state,createdAt,sentAt,attempts,error FROM notification_jobs WHERE pluginId=? AND id=? AND createdAt>=?", plugin, id, now-7*86400000).Scan(&r.ID, &r.Title, &r.State, &r.CreatedAt, &r.SentAt, &r.Attempts, &r.Error)
	if errors.Is(err, sql.ErrNoRows) {
		return r, &rpc.Error{Code: "notification_missing", Message: "消息不存在或已超过 7 天保留期", Status: 404}
	}
	return r, err
}

func Existing(ctx context.Context, tx *sql.Tx, plugin, key string, m Message, now int64) (*Accepted, error) {
	if key == "" {
		return nil, nil
	}
	if !idempotencyKey.MatchString(key) {
		return nil, &rpc.Error{Code: "invalid_idempotency_key", Message: "Idempotency-Key 需为 1–120 位字母、数字或 . _ : -", Status: 400}
	}
	var r Accepted
	var fp string
	err := tx.QueryRowContext(ctx, "SELECT id,state,fingerprint FROM notification_jobs WHERE pluginId=? AND dedupe=? AND createdAt>=?", plugin, key, now-7*86400000).Scan(&r.ID, &r.Status, &fp)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if fp != m.fingerprint() {
		return nil, &rpc.Error{Code: "idempotency_conflict", Message: "相同 Idempotency-Key 不能用于不同内容", Status: 409}
	}
	r.Duplicate = true
	return &r, nil
}

func Enqueue(ctx context.Context, tx *sql.Tx, plugin, key string, m Message, connection, generation string, now int64) (*Accepted, error) {
	if _, err := tx.ExecContext(ctx, "DELETE FROM notification_jobs WHERE createdAt<? AND state NOT IN ('pending','sending')", now-7*86400000); err != nil {
		return nil, err
	}
	var minute, day, pending int
	if err := tx.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM notification_jobs WHERE createdAt>?), (SELECT count(*) FROM notification_jobs WHERE createdAt>?), (SELECT count(*) FROM notification_jobs WHERE state IN ('pending','sending'))`, now-60000, now-86400000).Scan(&minute, &day, &pending); err != nil {
		return nil, err
	}
	if minute >= 30 || day >= 1000 || pending >= 100 {
		return nil, &rpc.Error{Code: "notification_limit", Message: "消息提醒额度已达上限：每分钟 30 条、24 小时 1000 条、待发送最多 100 条", Status: 429}
	}
	id := uuid.NewString()
	if key == "" {
		key = uuid.NewString()
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO notification_jobs(id,pluginId,dedupe,fingerprint,connectionId,generation,title,text,state,createdAt,nextAt) VALUES(?,?,?,?,?,?,?,?,'pending',?,?)`, id, plugin, key, m.fingerprint(), connection, generation, m.Title, m.Text, now, now); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE notification_schedule SET revision=revision+1 WHERE id=1"); err != nil {
		return nil, err
	}
	return &Accepted{ID: id, Status: "pending"}, nil
}
