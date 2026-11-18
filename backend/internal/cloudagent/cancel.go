package cloudagent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func (d detail) filesPending(settled bool) bool {
	return !settled && d.Frozen == "" && d.FileError == "" && d.Outcome != nil &&
		d.Outcome.Status == "completed" && len(d.Outcome.Attachments) > 0 && len(d.OutputFiles) != len(d.Outcome.Attachments)
}

// Mark the task for recovery. An upstream stop and a local file cancellation
// have different settlement rules, and retries must keep the original backoff.
func Cancel(ctx context.Context, tx *sql.Tx, id string, now int64) (Task, error) {
	var state, job, raw string
	var stop, settled bool
	err := tx.QueryRowContext(ctx, `SELECT state,jobId,stopRequested,settled,data FROM cloud_tasks
		WHERE id=? AND COALESCE(json_extract(data,'$.hidden'),0)=0`, id).Scan(&state, &job, &stop, &settled, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return Task{}, &rpc.Error{Code: "task_missing", Message: "找不到这个云端任务", Status: 404}
	}
	if err != nil {
		return Task{}, err
	}
	if state == "accepted" || state == "submitting" {
		var d detail
		if err := json.Unmarshal([]byte(raw), &d); err != nil {
			return Task{}, err
		}
		var update string
		switch {
		case d.filesPending(settled) && !d.FileCancelled:
			update = `UPDATE cloud_tasks SET data=json_set(data,'$.fileCancelled',json('true'),'$.error','正在取消生成文件的接收，本次不扣 credits。'),nextAt=?,updatedAt=? WHERE id=?`
		case d.Outcome == nil && !stop:
			update = `UPDATE cloud_tasks SET stopRequested=1,data=json_set(data,'$.stopReason','用户请求停止云端任务。','$.error','已请求停止云端任务，等待确认。已发生的外部操作无法撤销。'),nextAt=?,updatedAt=? WHERE id=?`
		}
		if update != "" {
			if _, err := tx.ExecContext(ctx, update, now, now, id); err != nil {
				return Task{}, err
			}
			if err := releaseInputs(ctx, tx, id, job != ""); err != nil {
				return Task{}, err
			}
		}
	}
	return Get(ctx, tx, id)
}
