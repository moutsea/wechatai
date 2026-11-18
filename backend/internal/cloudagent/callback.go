package cloudagent

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
)

type callbackTask struct {
	Origin, AppID, TenantID, CallbackVersion string
	Outcome                                  json.RawMessage
	Hidden                                   int
}

func ReceiveCallback(ctx context.Context, tx *sql.Tx, keys CallbackKeys, account, task string, raw []byte, h CallbackHeaders, now int64) (CallbackResult, error) {
	var state, job, taskData string
	err := tx.QueryRowContext(ctx, "SELECT state,jobId,data FROM cloud_tasks WHERE id=?", task).Scan(&state, &job, &taskData)
	if errors.Is(err, sql.ErrNoRows) {
		return reject(404, "task_missing"), nil
	}
	if err != nil {
		return CallbackResult{}, err
	}
	var t callbackTask
	if err = json.Unmarshal([]byte(taskData), &t); err != nil {
		return CallbackResult{}, err
	}
	key, err := keys.signingSecret(account, task, t.CallbackVersion)
	if err != nil {
		return CallbackResult{}, err
	}
	e, result := verifyEvent(key, raw, h, now)
	if !result.OK {
		return result, nil
	}
	result, err = verifyOwnership(ctx, tx, account, task, job, t, e)
	if err != nil || !result.OK {
		return result, err
	}
	newReceipt, result, err := recordCallback(ctx, tx, task, e, raw, now)
	if err != nil || !result.OK || !newReceipt {
		return result, err
	}
	if (state != "accepted" && state != "submitting") || (len(t.Outcome) != 0 && string(t.Outcome) != "null") {
		return result, nil
	}
	if _, err = tx.ExecContext(ctx, "UPDATE cloud_tasks SET nextAt=?,updatedAt=? WHERE id=?", now, now, task); err != nil {
		return CallbackResult{}, err
	}
	return result, releaseInputs(ctx, tx, task, job != "" || t.Hidden != 0)
}

func releaseInputs(ctx context.Context, tx *sql.Tx, task string, release bool) error {
	if !release {
		return nil
	}
	_, err := tx.ExecContext(ctx, "DELETE FROM cloud_task_images WHERE taskId=?", task)
	return err
}

func verifyOwnership(ctx context.Context, tx *sql.Tx, account, task, job string, t callbackTask, e callbackEvent) (CallbackResult, error) {
	var provision string
	err := tx.QueryRowContext(ctx, "SELECT data FROM cloud_provision WHERE id=1").Scan(&provision)
	if errors.Is(err, sql.ErrNoRows) {
		return reject(409, "identity_mismatch"), nil
	}
	if err != nil {
		return CallbackResult{}, err
	}
	var p struct{ Scope, WorkspaceID, AppUserID, ExternalID string }
	if err = json.Unmarshal([]byte(provision), &p); err != nil {
		return CallbackResult{}, err
	}
	if !scopeMatches(p.Scope, t.Origin, t.AppID, t.TenantID) ||
		p.WorkspaceID == "" || p.AppUserID == "" || p.ExternalID != "wechatai:"+account || e.workspace != p.WorkspaceID || e.tenant != t.TenantID ||
		(e.optionalJob != "" && e.optionalJob != e.job) || !matchesOptional(e.fields["appId"], t.AppID) || !matchesOptional(e.fields["appUserId"], p.AppUserID) {
		return reject(409, "identity_mismatch"), nil
	}
	var other bool
	if err = tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM cloud_tasks WHERE jobId=? AND id<>?)", e.job, task).Scan(&other); err != nil {
		return CallbackResult{}, err
	}
	if other || (job != "" && e.job != job) {
		return reject(409, "job_mismatch"), nil
	}
	return CallbackResult{OK: true}, nil
}

func recordCallback(ctx context.Context, tx *sql.Tx, task string, e callbackEvent, raw []byte, now int64) (bool, CallbackResult, error) {
	hash := sha256.Sum256(raw)
	digest := hex.EncodeToString(hash[:])
	insert, err := tx.ExecContext(ctx, "INSERT INTO cloud_callbacks(deliveryId,taskId,jobId,hash,createdAt) VALUES(?,?,?,?,?) ON CONFLICT(deliveryId) DO NOTHING", e.id, task, e.job, digest, now)
	if err != nil {
		return false, CallbackResult{}, err
	}
	n, err := insert.RowsAffected()
	if err != nil {
		return false, CallbackResult{}, err
	}
	if n == 0 {
		var same bool
		err = tx.QueryRowContext(ctx, "SELECT taskId=? AND jobId=? AND hash=? FROM cloud_callbacks WHERE deliveryId=?", task, e.job, digest, e.id).Scan(&same)
		if err != nil {
			return false, CallbackResult{}, err
		}
		if !same {
			return false, reject(409, "cloud_callback_conflict"), nil
		}
		return false, CallbackResult{OK: true}, nil
	}
	return true, CallbackResult{OK: true}, nil
}
