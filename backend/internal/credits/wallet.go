package credits

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

type Bucket struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Remaining int64  `json:"remaining"`
	Expires   int64  `json:"expires"`
}

type Allocation struct {
	ID     string `json:"id"`
	Amount int64  `json:"amount"`
}

type Wallet struct{ Now func() time.Time }

func (w Wallet) now() time.Time {
	if w.Now != nil {
		return w.Now()
	}
	return time.Now()
}

func (w Wallet) Buckets(ctx context.Context, q sqlite.Querier) ([]Bucket, error) {
	rows, err := q.QueryContext(ctx, `SELECT id,kind,remaining,expires FROM credit_buckets WHERE expires>? AND remaining>0 ORDER BY expires,id`, w.now().UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	buckets := []Bucket{}
	for rows.Next() {
		var bucket Bucket
		if err := rows.Scan(&bucket.ID, &bucket.Kind, &bucket.Remaining, &bucket.Expires); err != nil {
			return nil, err
		}
		buckets = append(buckets, bucket)
	}
	return buckets, rows.Err()
}

func (w Wallet) Debt(ctx context.Context, q sqlite.Querier) (int64, error) {
	var debt int64
	err := q.QueryRowContext(ctx, `SELECT amount FROM credit_debt WHERE id=1`).Scan(&debt)
	return debt, err
}

func (w Wallet) Balance(ctx context.Context, q sqlite.Querier) (int64, error) {
	buckets, err := w.Buckets(ctx, q)
	if err != nil {
		return 0, err
	}
	total, err := bucketTotal(buckets)
	if err != nil {
		return 0, err
	}
	debt, err := w.Debt(ctx, q)
	return total - debt, err
}

// Grant, Daily, Charge and settlement accept an existing transaction, allowing
// the application to commit wallet changes together with history and outbox.
func (w Wallet) Grant(ctx context.Context, tx *sql.Tx, id, kind string, units, expires int64, note string) error {
	if id == "" || kind == "" || !validAmount(units) || expires < 0 || expires > MaxUnits {
		return ErrInvalidAmount
	}
	var exists int
	err := tx.QueryRowContext(ctx, `SELECT 1 FROM credit_buckets WHERE id=?`, id).Scan(&exists)
	if err == nil {
		return nil
	}
	if !sqlite.IsMissing(err) {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO credit_buckets VALUES(?,?,?,?)`, id, kind, units, expires); err != nil {
		return err
	}
	repaid, err := w.repayDebt(ctx, tx)
	if err != nil {
		return err
	}
	if repaid > 0 {
		note += fmt.Sprintf("；抵扣欠额 %.3f credits", float64(repaid)/1000)
	}
	return w.ledger(ctx, tx, "grant:"+id, kind, units, note)
}

func (w Wallet) Daily(ctx context.Context, tx *sql.Tx, units int64) error {
	if !validAmount(units) {
		return ErrInvalidAmount
	}
	day, _, end := DayWindow(w.now())
	var granted, count int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(amount),0),COUNT(*) FROM credit_ledger WHERE kind='daily' AND id GLOB ?`, "grant:daily:"+day+"*").Scan(&granted, &count); err != nil {
		return err
	}
	if granted >= units {
		return nil
	}
	id, note := "daily:"+day, "每日赠送"
	if count > 0 {
		id += fmt.Sprintf(":topup:%d", units)
		note = "每日赠送补足"
	}
	return w.Grant(ctx, tx, id, "daily", units-granted, end, note)
}

func (w Wallet) Charge(ctx context.Context, tx *sql.Tx, id string, actual, budget int64, kind string) (int64, error) {
	if id == "" || !validAmount(actual) || !validAmount(budget) || (kind != "usage" && kind != "context_summary") {
		return 0, ErrInvalidAmount
	}
	var previous int64
	err := tx.QueryRowContext(ctx, `SELECT amount FROM credit_ledger WHERE id=?`, "usage:"+id).Scan(&previous)
	if err == nil {
		if previous > 0 {
			return 0, errors.New("invalid usage ledger entry")
		}
		return -previous, nil
	}
	if !sqlite.IsMissing(err) {
		return 0, err
	}
	billed := min(actual, budget)
	if err := w.Expire(ctx, tx); err != nil {
		return 0, err
	}
	if err := w.spend(ctx, tx, billed); err != nil {
		return 0, err
	}
	note := "实际消耗"
	if kind == "context_summary" {
		note = "上下文整理"
	}
	err = w.ledger(ctx, tx, "usage:"+id, kind, -billed, fmt.Sprintf("%s %.3f credits", note, float64(billed)/1000))
	return billed, err
}

func (w Wallet) Reserve(ctx context.Context, tx *sql.Tx, id string, amount int64) error {
	if id == "" || amount <= 0 || !validAmount(amount) {
		return ErrInvalidAmount
	}
	var exists int
	err := tx.QueryRowContext(ctx, `SELECT 1 FROM reservations WHERE id=?`, id).Scan(&exists)
	if err == nil {
		return ErrDuplicate
	}
	if !sqlite.IsMissing(err) {
		return err
	}
	balance, err := w.Balance(ctx, tx)
	if err != nil {
		return err
	}
	if balance < amount {
		return ErrInsufficient
	}
	allocations, err := w.debit(ctx, tx, amount)
	if err != nil {
		return err
	}
	encoded, err := json.Marshal(allocations)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO reservations VALUES(?,?,?,'held',?)`, id, amount, string(encoded), w.now().UnixMilli()); err != nil {
		return err
	}
	return w.ledger(ctx, tx, "reserve:"+id, "reserve", -amount, "请求额度预留")
}

func (w Wallet) Settle(ctx context.Context, tx *sql.Tx, id string, actual int64, budget *int64) (int64, error) {
	if !validAmount(actual) || (budget != nil && !validAmount(*budget)) {
		return 0, ErrInvalidAmount
	}
	var hold int64
	var allocationsJSON, status string
	err := tx.QueryRowContext(ctx, `SELECT amount,allocations,status FROM reservations WHERE id=?`, id).Scan(&hold, &allocationsJSON, &status)
	if sqlite.IsMissing(err) || (err == nil && status != "held") {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	cap := hold
	if budget != nil {
		cap = *budget
	}
	billed := min(actual, cap)
	if billed > hold {
		if err := w.spend(ctx, tx, billed-hold); err != nil {
			return 0, err
		}
	}
	var allocations []Allocation
	if err := json.Unmarshal([]byte(allocationsJSON), &allocations); err != nil {
		return 0, errors.New("invalid legacy reservation allocations")
	}
	refund := max(int64(0), hold-billed)
	for i := len(allocations) - 1; i >= 0 && refund > 0; i-- {
		a := allocations[i]
		if a.Amount < 0 {
			return 0, ErrInvalidAmount
		}
		n := min(a.Amount, refund)
		result, err := tx.ExecContext(ctx, `UPDATE credit_buckets SET remaining=remaining+? WHERE id=?`, n, a.ID)
		if err != nil {
			return 0, err
		}
		changed, err := result.RowsAffected()
		if err != nil || changed != 1 {
			return 0, errors.New("reservation bucket is missing")
		}
		refund -= n
	}
	if refund != 0 {
		return 0, errors.New("reservation allocations do not cover refund")
	}
	if _, err := w.repayDebt(ctx, tx); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE reservations SET status='settled' WHERE id=?`, id); err != nil {
		return 0, err
	}
	kind, note := "refund", "未完成请求，释放预留额度"
	if billed > 0 {
		kind, note = "settlement", fmt.Sprintf("实际消耗 %.3f credits", float64(billed)/1000)
	}
	return billed, w.ledger(ctx, tx, "settle:"+id, kind, hold-billed, note)
}

func (w Wallet) Expire(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `SELECT id,kind,remaining FROM credit_buckets WHERE expires<=? AND remaining>0`, w.now().UnixMilli())
	if err != nil {
		return err
	}
	var expired []Bucket
	for rows.Next() {
		var b Bucket
		if err := rows.Scan(&b.ID, &b.Kind, &b.Remaining); err != nil {
			rows.Close()
			return err
		}
		expired = append(expired, b)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, b := range expired {
		if _, err := tx.ExecContext(ctx, `UPDATE credit_buckets SET remaining=0 WHERE id=?`, b.ID); err != nil {
			return err
		}
		note := "会员周期额度到期"
		if b.Kind == "daily" {
			note = "每日赠送额度到期"
		}
		if err := w.ledger(ctx, tx, "expiry:"+b.ID+":"+rand.Text(), "expiry", -b.Remaining, note); err != nil {
			return err
		}
	}
	return nil
}

func (w Wallet) Reap(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `SELECT id FROM reservations WHERE status='held' AND createdAt<?`, w.now().UnixMilli()-180000)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		if _, err := w.Settle(ctx, tx, id, 0, nil); err != nil {
			return err
		}
	}
	return w.Expire(ctx, tx)
}

func bucketTotal(buckets []Bucket) (int64, error) {
	var total int64
	for _, b := range buckets {
		if !validAmount(b.Remaining) || b.Remaining > MaxUnits-total {
			return 0, ErrInvalidAmount
		}
		total += b.Remaining
	}
	return total, nil
}

func (w Wallet) debit(ctx context.Context, tx *sql.Tx, amount int64) ([]Allocation, error) {
	buckets, err := w.Buckets(ctx, tx)
	if err != nil {
		return nil, err
	}
	total, err := bucketTotal(buckets)
	if err != nil {
		return nil, err
	}
	if total < amount {
		return nil, ErrInsufficient
	}
	allocations := []Allocation{}
	for _, b := range buckets {
		take := min(amount, b.Remaining)
		if take <= 0 {
			break
		}
		if _, err := tx.ExecContext(ctx, `UPDATE credit_buckets SET remaining=remaining-? WHERE id=?`, take, b.ID); err != nil {
			return nil, err
		}
		allocations = append(allocations, Allocation{ID: b.ID, Amount: take})
		amount -= take
	}
	return allocations, nil
}

func (w Wallet) spend(ctx context.Context, tx *sql.Tx, amount int64) error {
	buckets, err := w.Buckets(ctx, tx)
	if err != nil {
		return err
	}
	total, err := bucketTotal(buckets)
	if err != nil {
		return err
	}
	available := min(amount, total)
	if _, err := w.debit(ctx, tx, available); err != nil {
		return err
	}
	debt, err := w.Debt(ctx, tx)
	if err != nil {
		return err
	}
	if amount-available > MaxUnits-debt {
		return ErrInvalidAmount
	}
	_, err = tx.ExecContext(ctx, `UPDATE credit_debt SET amount=amount+? WHERE id=1`, amount-available)
	return err
}

func (w Wallet) repayDebt(ctx context.Context, tx *sql.Tx) (int64, error) {
	buckets, err := w.Buckets(ctx, tx)
	if err != nil {
		return 0, err
	}
	total, err := bucketTotal(buckets)
	if err != nil {
		return 0, err
	}
	debt, err := w.Debt(ctx, tx)
	if err != nil {
		return 0, err
	}
	repaid := min(debt, total)
	if repaid == 0 {
		return 0, nil
	}
	if _, err := w.debit(ctx, tx, repaid); err != nil {
		return 0, err
	}
	_, err = tx.ExecContext(ctx, `UPDATE credit_debt SET amount=amount-? WHERE id=1`, repaid)
	return repaid, err
}

func (w Wallet) ledger(ctx context.Context, tx *sql.Tx, id, kind string, amount int64, note string) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO credit_ledger VALUES(?,?,?,?,?)`, id, kind, amount, note, w.now().UnixMilli())
	return err
}
