package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
	"unicode/utf16"

	"github.com/google/uuid"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/jobs"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

// Only the signed executor transport can construct this account command.
func (a *App) execute(ctx context.Context, id accounts.ID, epoch int64, action string, body []byte) (any, error) {
	command := rpc.Command{AccountID: id, RouteEpoch: epoch, Principal: rpc.Principal{Scope: rpc.Executor}}
	queue := jobs.Queue{Now: a.Now, Box: a.Box, AccountID: id}
	bad := &rpc.Error{Code: "invalid_request", Message: "执行器参数无效", Status: 400}
	var result any
	switch action {
	case "claim":
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil || payload == nil || len(payload) != 0 {
			return nil, bad
		}
		err := a.write(ctx, command, func(tx *sql.Tx) error {
			job, err := queue.Claim(ctx, tx, jobs.ExecutionKind, 6*time.Minute)
			if err != nil || job == nil {
				return err
			}
			result = struct {
				ID        string          `json:"id"`
				Lease     string          `json:"lease"`
				ExpiresAt int64           `json:"expiresAt"`
				Input     json.RawMessage `json:"input"`
			}{job.ID, job.Lease, job.LeaseUntil, job.Payload}
			return nil
		})
		return result, err
	case "complete":
		var p struct {
			ID, Lease string
			Result    json.RawMessage
		}
		if json.Unmarshal(body, &p) != nil {
			return nil, bad
		}
		if _, err := accounts.ParseID(p.ID); err != nil {
			return nil, bad
		}
		if uuid.Validate(p.Lease) != nil || len(p.Lease) != 36 {
			return nil, bad
		}
		var outcome struct {
			OK            *bool
			Code, Message *string
			Value         json.RawMessage
		}
		if json.Unmarshal(p.Result, &outcome) != nil || outcome.OK == nil {
			return nil, bad
		}
		if *outcome.OK && len(outcome.Value) == 0 {
			return nil, bad
		}
		if !*outcome.OK && (outcome.Code == nil || outcome.Message == nil) {
			return nil, bad
		}
		if !*outcome.OK && (len(utf16.Encode([]rune(*outcome.Code))) > 100 || len(utf16.Encode([]rune(*outcome.Message))) > 1000) {
			return nil, bad
		}
		h, err := a.Accounts.Acquire(ctx, id, false)
		if err != nil {
			return nil, accountError(err)
		}
		defer h.Close()
		// The phase check and the receipt serialize with the freeze transaction.
		// Closing admission to new work must still allow the original executor back in.
		err = sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
			state, err := accounts.State(ctx, tx)
			if err != nil {
				return err
			}
			if err := state.Match(id, "", epoch); err != nil {
				return err
			}
			switch state.Phase {
			case "frozen":
				return queue.ConfirmRecordedExecution(ctx, tx, p.ID, p.Lease, p.Result)
			case "active", "draining":
			default:
				return accounts.ErrInactive
			}
			return queue.CompleteExecution(ctx, tx, p.ID, p.Lease, p.Result)
		})
		if errors.Is(err, jobs.ErrStaleLease) {
			return map[string]bool{"stale": true}, nil
		}
		if errors.Is(err, jobs.ErrConflict) {
			return nil, &rpc.Error{Code: "job_conflict", Message: "任务结果与已确认记录不一致", Status: 409}
		}
		return map[string]bool{"accepted": true}, accountError(err)
	default:
		return nil, bad
	}
}
