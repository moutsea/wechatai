package accounts

import (
	"context"
	"database/sql"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

type Metadata struct {
	AccountID  ID     `json:"accountId"`
	UserID     string `json:"userId"`
	RouteEpoch int64  `json:"routeEpoch"`
	Phase      string `json:"phase"`
}

func State(ctx context.Context, q sqlite.Querier) (Metadata, error) {
	var state Metadata
	err := q.QueryRowContext(ctx, `SELECT accountId,userId,routeEpoch,phase FROM backend_account WHERE id=1`).Scan(&state.AccountID, &state.UserID, &state.RouteEpoch, &state.Phase)
	return state, err
}

func (m Metadata) Match(id ID, owner string, epoch int64) error {
	if m.AccountID != id || (owner != "" && m.UserID != owner) || m.RouteEpoch != epoch {
		return ErrIdentity
	}
	return nil
}

// SetDrainPhase is called in the transaction that inspects outstanding leases.
// A retry may finish a persistent drain, but never reopen a frozen account.
func SetDrainPhase(ctx context.Context, tx *sql.Tx, outstanding bool) error {
	phase := "frozen"
	if outstanding {
		phase = "draining"
	}
	_, err := tx.ExecContext(ctx, `UPDATE backend_account SET phase=? WHERE id=1 AND phase IN ('active','draining')`, phase)
	return err
}

// Activate accepts only a prepared database (or an identical activation retry).
// Reusing a frozen old snapshot requires an offline import and a new epoch.
func Activate(ctx context.Context, tx *sql.Tx, id ID, owner string, epoch int64) error {
	state, err := State(ctx, tx)
	if err != nil {
		return err
	}
	if state.AccountID != id || state.UserID != owner || state.RouteEpoch != epoch {
		return ErrIdentity
	}
	if state.Phase != "prepared" && state.Phase != "active" {
		return ErrInactive
	}
	_, err = tx.ExecContext(ctx, `UPDATE backend_account SET phase='active' WHERE id=1 AND phase='prepared'`)
	return err
}
