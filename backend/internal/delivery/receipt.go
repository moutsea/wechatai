package delivery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"math/big"
	"regexp"
	"strconv"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

var wireDecimal = regexp.MustCompile(`^-?(0|[1-9][0-9]{0,19})$`)

// A quoted ID preserves WeChat's exact decimal digits. Older receivers send
// large JSON numbers after a JS Number round-trip; those remain ambiguous.
type WireID struct {
	value, rounded string
	exact, large   bool
}

func (v *WireID) UnmarshalJSON(raw []byte) error {
	s := string(raw)
	var n float64
	var err error
	if len(raw) > 0 && raw[0] == '"' {
		if json.Unmarshal(raw, &s) != nil || !wireDecimal.MatchString(s) {
			return errors.New("invalid decimal WeChat identifier")
		}
		v.exact = true
		n, err = strconv.ParseFloat(s, 64)
	} else {
		n, err = strconv.ParseFloat(s, 64)
	}
	if err != nil || math.IsNaN(n) || math.IsInf(n, 0) || math.Trunc(n) != n {
		return errors.New("invalid numeric WeChat identifier")
	}
	if n == 0 {
		n = 0
	}
	rendered, err := json.Marshal(n)
	if err != nil {
		return err
	}
	v.rounded = string(rendered)
	v.large = math.Abs(n) > 9007199254740991
	if v.exact {
		v.value = s
	} else {
		v.value = v.rounded
	}
	return nil
}
func (v WireID) valid() bool { return v.value != "" && v.value != "0" && v.value != "-0" }
func (v WireID) sequence() *string {
	if !v.valid() || v.value[0] == '-' || (!v.exact && v.large) {
		return nil
	}
	s := v.value
	return &s
}

type WechatMessage struct {
	ID      WireID          `json:"message_id"`
	Seq     WireID          `json:"seq"`
	Type    int             `json:"message_type"`
	Sender  string          `json:"from_user_id"`
	Token   string          `json:"context_token"`
	Created json.RawMessage `json:"create_time_ms"`
	Raw     json.RawMessage `json:"-"`
}

func (m WechatMessage) Receipt() WireID {
	if m.ID.valid() {
		return m.ID
	}
	return m.Seq
}
func (m WechatMessage) HasReceipt() bool { return m.Receipt().valid() }

func (m WechatMessage) SequenceNumber() *big.Int {
	seq := m.Seq.sequence()
	if seq == nil {
		return nil
	}
	n, _ := new(big.Int).SetString(*seq, 10)
	return n
}

type receipt struct {
	id                  string
	exact, seq, payload *string
}

func (r receipt) previousSeq() (WireID, error) {
	var v struct {
		Seq WireID `json:"seq"`
	}
	if r.payload != nil {
		if err := json.Unmarshal([]byte(*r.payload), &v); err != nil {
			return WireID{}, err
		}
	}
	return v.Seq, nil
}

func roundedReceipt(ctx context.Context, tx *sql.Tx, prefix string, m WechatMessage, replay bool) (string, bool, error) {
	v := m.Receipt()
	rounded := prefix + v.rounded
	rows, err := tx.QueryContext(ctx, `SELECT id,wechatExactId,wechatSeq,CASE WHEN wechatRoundedId IS NULL THEN payload END FROM inbox WHERE wechatRoundedId=? OR id=?`, rounded, rounded)
	if err != nil {
		return "", false, err
	}
	seq := m.Seq.sequence()
	storedRounded := false
	var match, fallback *receipt
	for rows.Next() {
		var r receipt
		if err = rows.Scan(&r.id, &r.exact, &r.seq, &r.payload); err != nil {
			break
		}
		storedRounded = storedRounded || r.id == rounded
		if v.exact && r.exact != nil {
			if *r.exact == v.value {
				rows.Close()
				return "", true, nil
			}
			continue
		}
		s := r.seq
		if s == nil {
			var previous WireID
			previous, err = r.previousSeq()
			if err != nil {
				break
			}
			s = previous.sequence()
		}
		if match == nil && seq != nil && s != nil && *seq == *s {
			match = &r
		}
		if fallback == nil && (seq == nil || s == nil) && (replay || !v.exact && r.exact == nil) {
			fallback = &r
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return "", false, err
	}
	if match == nil {
		match = fallback
	}
	if match != nil {
		var exact *string
		if v.exact {
			exact = &v.value
		}
		if exact != nil || (match.seq == nil && seq != nil) {
			_, err = tx.ExecContext(ctx, `UPDATE inbox SET wechatRoundedId=?,wechatExactId=COALESCE(wechatExactId,?),wechatSeq=COALESCE(wechatSeq,?) WHERE id=?`, rounded, exact, seq, match.id)
		}
		return "", true, err
	}
	if v.exact {
		return prefix + "wx64:" + v.value, false, nil
	}
	if seq != nil && storedRounded {
		return rounded + ":seq:" + *seq, false, nil
	}
	return rounded, false, nil
}
func legacyZero(ctx context.Context, tx *sql.Tx, prefix string, m WechatMessage, replay bool, canonical string) (bool, error) {
	seq := m.Seq.value
	rows, err := tx.QueryContext(ctx, `SELECT id,wechatSeq,CASE WHEN wechatSeq IS NULL THEN payload END FROM inbox WHERE id IN (?,?) AND (wechatSeq IS NULL OR wechatSeq=?)`, prefix+"0", prefix+"-0", seq)
	if err != nil {
		return false, err
	}
	var confirmed, fallback *receipt
	for rows.Next() {
		var r receipt
		if err = rows.Scan(&r.id, &r.seq, &r.payload); err != nil {
			break
		}
		var previous WireID
		previous, err = r.previousSeq()
		if err != nil {
			break
		}
		if r.seq != nil || previous.value == seq && (previous.exact || !previous.large || !m.Seq.exact) {
			confirmed = &r
			break
		}
		if replay && r.id == prefix+m.ID.value && r.payload != nil && (*r.payload == "{}" || !previous.exact && previous.large && previous.rounded == m.Seq.rounded) {
			fallback = &r
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return false, err
	}
	if confirmed == nil && fallback != nil {
		var existing int
		err = tx.QueryRowContext(ctx, "SELECT 1 FROM inbox WHERE id=?", canonical).Scan(&existing)
		if err == nil {
			return false, nil
		}
		if !sqlite.IsMissing(err) {
			return false, err
		}
		confirmed = fallback
	}
	if confirmed == nil {
		return false, nil
	}
	if confirmed.seq != nil {
		return true, nil
	}
	var rounded, exact *string
	if m.Seq.large {
		key := prefix + m.Seq.rounded
		rounded = &key
		if m.Seq.exact {
			exact = &seq
		}
	}
	_, err = tx.ExecContext(ctx, "UPDATE inbox SET wechatSeq=?,wechatRoundedId=?,wechatExactId=? WHERE id=?", seq, rounded, exact, confirmed.id)
	return true, err
}

// Receive deduplicates in the same transaction that advances the link cursor.
func Receive(ctx context.Context, tx *sql.Tx, prefix, connection string, m WechatMessage, replay bool, now int64) (bool, error) {
	v := m.Receipt()
	if !v.valid() || m.Type != 1 {
		return false, nil
	}
	id := prefix + v.value
	var rounded, exact, seq *string
	if v.large {
		var found bool
		var err error
		id, found, err = roundedReceipt(ctx, tx, prefix, m, replay)
		if err != nil || found {
			return false, err
		}
		r := prefix + v.rounded
		rounded = &r
		if v.exact {
			exact = &v.value
		}
		seq = m.Seq.sequence()
	}
	if !m.ID.valid() {
		found, err := legacyZero(ctx, tx, prefix, m, replay, id)
		if found || err != nil {
			return false, err
		}
	}
	return insertReceipt(ctx, tx, connection, now, m.Token, m.Raw, receiptKey{id: id, rounded: rounded, exact: exact, seq: seq})
}
