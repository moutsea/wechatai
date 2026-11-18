// Package automation owns durable schedules and their versioned transitions.
// Delivery adapters execute outside transactions and must claim/check a version
// before and after I/O. A timer is only a wakeup mechanism, never the schedule.
package automation

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

const dayMillis int64 = 86400000

type Schedule struct {
	Revision int64  `json:"revision"`
	NextAt   *int64 `json:"nextAt"`
}
type ReminderTarget struct {
	ConnectionID string `json:"connectionId"`
	Generation   string `json:"generation"`
}
type MembershipItem struct {
	Days     int             `json:"days"`
	DueAt    int64           `json:"dueAt"`
	CutoffAt int64           `json:"cutoffAt"`
	State    string          `json:"state"`
	RetryAt  int64           `json:"retryAt"`
	Attempts int             `json:"attempts"`
	Target   *ReminderTarget `json:"target,omitempty"`
	Text     string          `json:"text,omitempty"`
}
type MembershipState struct {
	PlanUntil    int64            `json:"planUntil"`
	Revision     int64            `json:"revision"`
	Acknowledged int64            `json:"acknowledged"`
	Items        []MembershipItem `json:"items"`
}

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "automation", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS membership_reminders(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
INSERT OR IGNORE INTO membership_reminders VALUES(1,'{"planUntil":0,"revision":0,"acknowledged":0,"items":[]}');
`}}}
}

func Migrate(ctx context.Context, db *sql.DB) error { return Schema().Apply(ctx, db) }

func Membership(ctx context.Context, db sqlite.Querier) (MembershipState, error) {
	var data string
	err := db.QueryRowContext(ctx, `SELECT data FROM membership_reminders WHERE id=1`).Scan(&data)
	if err != nil {
		return MembershipState{}, err
	}
	var state MembershipState
	err = json.Unmarshal([]byte(data), &state)
	return state, err
}

func saveMembership(ctx context.Context, tx *sql.Tx, state MembershipState) error {
	state.Revision++
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE membership_reminders SET data=? WHERE id=1`, string(data))
	return err
}

func active(state string) bool {
	return state == "pending" || state == "sending" || state == "retry" || state == "waiting"
}

func SyncMembership(ctx context.Context, tx *sql.Tx, until, now int64, catchUp bool) error {
	state, err := Membership(ctx, tx)
	if err != nil {
		return err
	}
	changed := false
	if state.PlanUntil != until {
		state.PlanUntil = until
		state.Items = []MembershipItem{}
		if until > now {
			for _, days := range []int{7, 3} {
				due := until - int64(days)*dayMillis
				cutoff := until
				if days == 7 {
					cutoff = until - 3*dayMillis
				}
				status := "pending"
				if due < now {
					status = "skipped"
				}
				state.Items = append(state.Items, MembershipItem{Days: days, DueAt: due, CutoffAt: cutoff, State: status, RetryAt: due})
			}
		}
		changed = true
	}
	for i := range state.Items {
		item := &state.Items[i]
		if catchUp && item.State == "skipped" && item.DueAt <= now && now < item.CutoffAt {
			item.State = "pending"
			item.RetryAt = now
			changed = true
		}
		if active(item.State) && item.CutoffAt <= now {
			item.State = "skipped"
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return saveMembership(ctx, tx, state)
}

// WakeMembership reopens only occurrences still inside their delivery window.
// The original target, text and attempt counter fence stale delivery results.
func WakeMembership(ctx context.Context, tx *sql.Tx, now int64) error {
	state, err := Membership(ctx, tx)
	if err != nil {
		return err
	}
	changed := false
	for i := range state.Items {
		item := &state.Items[i]
		if item.DueAt > now || now >= item.CutoffAt {
			continue
		}
		// A new context also invalidates a target lookup already in progress
		// for an eligible pending item or a timed-out send lease.
		if (item.State == "pending" || item.State == "sending") && item.RetryAt <= now {
			changed = true
		}
		if item.State == "waiting" || item.State == "retry" {
			item.State = "pending"
			item.RetryAt = now
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return saveMembership(ctx, tx, state)
}

func MembershipSchedule(state MembershipState) Schedule {
	var next *int64
	for _, item := range state.Items {
		if !active(item.State) {
			continue
		}
		at := min(item.RetryAt, item.CutoffAt)
		if item.State == "waiting" {
			at = item.CutoffAt
		}
		if next == nil || at < *next {
			value := at
			next = &value
		}
	}
	return Schedule{Revision: state.Revision, NextAt: next}
}

// ClaimMembership returns a durable occurrence. Renewal invalidates it through
// PlanUntil; retries are fenced by attempts and the original immutable target.
func ClaimMembership(ctx context.Context, tx *sql.Tx, term, revision int64, days, attempt int, target ReminderTarget, text string, now int64) (*MembershipItem, error) {
	state, err := Membership(ctx, tx)
	if err != nil {
		return nil, err
	}
	if state.PlanUntil != term || state.Revision != revision {
		return nil, nil
	}
	for i := range state.Items {
		item := &state.Items[i]
		if item.Days != days || item.Attempts != attempt || !active(item.State) || item.State == "waiting" || item.RetryAt > now || now >= item.CutoffAt {
			continue
		}
		if item.Target == nil {
			item.Target = &target
		}
		if item.Text == "" {
			item.Text = text
		}
		item.State = "sending"
		item.Attempts++
		item.RetryAt = now + 30000
		if err := saveMembership(ctx, tx, state); err != nil {
			return nil, err
		}
		copy := *item
		return &copy, nil
	}
	return nil, nil
}

func SettleMembership(ctx context.Context, tx *sql.Tx, term int64, days, attempt int, status string, now int64) error {
	if status != "sent" && status != "waiting" && status != "cancelled" && status != "retry" {
		return sql.ErrNoRows
	}
	return setMembershipOutcome(ctx, tx, term, days, attempt, status, now, nil)
}

// A missing or replaced binding can defer an occurrence before a send is
// claimed. Delivery callbacks may only settle their own in-flight attempt.
func DeferMembership(ctx context.Context, tx *sql.Tx, term, revision int64, days, attempt int, status string, now int64) error {
	if status != "waiting" && status != "cancelled" {
		return sql.ErrNoRows
	}
	return setMembershipOutcome(ctx, tx, term, days, attempt, status, now, &revision)
}

func setMembershipOutcome(ctx context.Context, tx *sql.Tx, term int64, days, attempt int, status string, now int64, observedRevision *int64) error {
	state, err := Membership(ctx, tx)
	if err != nil {
		return err
	}
	if state.PlanUntil != term || (observedRevision != nil && state.Revision != *observedRevision) {
		return nil
	}
	for i := range state.Items {
		item := &state.Items[i]
		if item.Days != days || item.Attempts != attempt {
			continue
		}
		if observedRevision == nil {
			if item.State != "sending" {
				continue
			}
		} else if (!active(item.State) || item.State == "waiting") || item.RetryAt > now || now >= item.CutoffAt {
			continue
		}
		item.State = status
		if status == "retry" {
			item.RetryAt = now + min(int64(300000), int64(5000)*(1<<min(item.Attempts, 6)))
		}
		return saveMembership(ctx, tx, state)
	}
	return nil
}
