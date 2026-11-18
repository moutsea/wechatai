// Package membership owns plan terms, payment deduplication and immutable gifts.
// It returns wallet effects for the application to apply in the same account
// transaction; it has no dependency on Stripe or the credits implementation.
package membership

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

const maxSafeInteger int64 = 1<<53 - 1

var ErrInvalid = errors.New("invalid membership event")
var ErrGiftConflict = errors.New("gift ID reused with different details")
var giftID = regexp.MustCompile(`(?i)^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$`)

type Payment struct {
	ID             string `json:"id"`
	Kind           string `json:"kind"`
	Months         int    `json:"months,omitempty"`
	Units          *int64 `json:"units,omitempty"`
	Expires        *int64 `json:"expires,omitempty"`
	SubscriptionID string `json:"subscriptionId,omitempty"`
}

type Grant struct {
	ID, Kind, Note string
	Units, Expires int64
}
type Effect struct {
	Duplicate bool
	Grant     *Grant
	PlanUntil int64
}

type Gift struct {
	ID                string `json:"id"`
	Reason            string `json:"reason"`
	ActorID           string `json:"actorId"`
	CreatedAt         int64  `json:"createdAt"`
	PreviousPlanUntil int64  `json:"previousPlanUntil"`
	PlanUntil         int64  `json:"planUntil"`
}

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "membership", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,createdAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS membership_gifts(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS membership_gifts_no_update BEFORE UPDATE ON membership_gifts BEGIN SELECT RAISE(ABORT,'immutable membership gift'); END;
CREATE TRIGGER IF NOT EXISTS membership_gifts_no_delete BEFORE DELETE ON membership_gifts BEGIN SELECT RAISE(ABORT,'immutable membership gift'); END;
`}}}
}

func Migrate(ctx context.Context, db *sql.DB) error { return Schema().Apply(ctx, db) }

func CheckLayout(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, "SELECT p.id,p.createdAt,g.id,g.data FROM payments p,membership_gifts g LIMIT 0")
	if err != nil {
		return err
	}
	return rows.Close()
}

func Extend(from int64, months int) (int64, error) {
	if from < 0 || from > 8640000000000000 || (months != 1 && months != 12) {
		return 0, ErrInvalid
	}
	zone := time.FixedZone("Asia/Shanghai", 8*3600)
	date := time.UnixMilli(from).In(zone)
	first := time.Date(date.Year(), date.Month()+time.Month(months), 1, date.Hour(), date.Minute(), date.Second(), date.Nanosecond(), zone)
	last := time.Date(first.Year(), first.Month()+1, 0, 0, 0, 0, 0, zone).Day()
	end := time.Date(first.Year(), first.Month(), min(date.Day(), last), date.Hour(), date.Minute(), date.Second(), date.Nanosecond(), zone).UnixMilli()
	if end > 8640000000000000 {
		return 0, ErrInvalid
	}
	return end, nil
}

func PlanUntil(ctx context.Context, q sqlite.Querier) (int64, error) {
	return accounts.Setting[int64](ctx, q, "planUntil", 0)
}

func ApplyPayment(ctx context.Context, tx *sql.Tx, event Payment, now int64) (Effect, error) {
	if event.ID == "" || len(event.ID) > 300 || (event.Kind != "membership" && event.Kind != "purchase" && event.Kind != "subscription") {
		return Effect{}, ErrInvalid
	}
	if event.Kind == "membership" {
		if event.Months != 1 && event.Months != 12 {
			return Effect{}, ErrInvalid
		}
	} else if event.Units == nil || event.Expires == nil || *event.Units < 0 || *event.Units > maxSafeInteger || *event.Expires < 0 || *event.Expires > maxSafeInteger {
		return Effect{}, ErrInvalid
	}
	until, err := PlanUntil(ctx, tx)
	if err != nil {
		return Effect{}, err
	}
	var found int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM payments WHERE id=?`, event.ID).Scan(&found)
	if err == nil {
		return Effect{Duplicate: true, PlanUntil: until}, nil
	}
	if !sqlite.IsMissing(err) {
		return Effect{}, err
	}
	effect := Effect{PlanUntil: until}
	if event.Kind == "purchase" {
		effect.Grant = &Grant{ID: "payment:" + event.ID, Kind: "purchase", Units: *event.Units, Expires: *event.Expires, Note: "Credits 充值"}
	} else {
		if event.Kind == "membership" {
			until, err = Extend(max(now, until), event.Months)
			if err != nil {
				return Effect{}, err
			}
		} else {
			until = max(until, *event.Expires)
			if event.SubscriptionID != "" {
				if err := accounts.SetSetting(ctx, tx, "subscriptionId", event.SubscriptionID); err != nil {
					return Effect{}, err
				}
			}
		}
		if err := accounts.SetSetting(ctx, tx, "planUntil", until); err != nil {
			return Effect{}, err
		}
		effect.PlanUntil = until
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO payments VALUES(?,?)`, event.ID, now)
	return effect, err
}

func Give(ctx context.Context, tx *sql.Tx, id, actorID, reason string, now int64) (Gift, bool, error) {
	reason = strings.TrimSpace(reason)
	if !giftID.MatchString(id) || actorID == "" || len(actorID) > 128 || len(utf16.Encode([]rune(reason))) > 200 {
		return Gift{}, false, ErrInvalid
	}
	var previous string
	err := tx.QueryRowContext(ctx, `SELECT data FROM membership_gifts WHERE id=?`, id).Scan(&previous)
	if err == nil {
		var gift Gift
		if err := json.Unmarshal([]byte(previous), &gift); err != nil {
			return Gift{}, false, err
		}
		if gift.ActorID != actorID || gift.Reason != reason {
			return Gift{}, false, ErrGiftConflict
		}
		return gift, false, nil
	}
	if !sqlite.IsMissing(err) {
		return Gift{}, false, err
	}
	until, err := PlanUntil(ctx, tx)
	if err != nil {
		return Gift{}, false, err
	}
	end, err := Extend(max(now, until), 1)
	if err != nil {
		return Gift{}, false, err
	}
	gift := Gift{ID: id, ActorID: actorID, Reason: reason, CreatedAt: now, PreviousPlanUntil: until, PlanUntil: end}
	encoded, err := json.Marshal(gift)
	if err != nil {
		return Gift{}, false, err
	}
	if err := accounts.SetSetting(ctx, tx, "planUntil", end); err != nil {
		return Gift{}, false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO membership_gifts VALUES(?,?)`, id, string(encoded))
	return gift, err == nil, err
}

func Gifts(ctx context.Context, db sqlite.Querier) ([]Gift, error) {
	rows, err := db.QueryContext(ctx, `SELECT data FROM membership_gifts ORDER BY rowid DESC LIMIT 20`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	gifts := []Gift{}
	for rows.Next() {
		var data string
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		var gift Gift
		if err := json.Unmarshal([]byte(data), &gift); err != nil {
			return nil, err
		}
		gifts = append(gifts, gift)
	}
	return gifts, rows.Err()
}
