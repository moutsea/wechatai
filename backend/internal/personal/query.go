package personal

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func invalid() error {
	return &rpc.Error{Code: "invalid_input", Message: "请检查表单字段、长度和数值范围", Status: 400}
}
func trim(s string) string {
	return strings.Trim(s, " \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff")
}
func calendarDate(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return len(s) == 10 && err == nil
}

type Query struct {
	Kind, ReminderType, Text, From, To string
	Completed                          *bool
	Limit, Offset                      int
}

func ParseQuery(raw json.RawMessage) (Query, error) {
	q := Query{Limit: 20}
	if len(raw) == 0 || string(raw) == "null" {
		return q, nil
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return q, invalid()
	}
	for _, f := range []struct {
		key  string
		dest *string
	}{{"kind", &q.Kind}, {"reminderType", &q.ReminderType}, {"query", &q.Text}, {"from", &q.From}, {"to", &q.To}} {
		v, ok := fields[f.key]
		if !ok {
			continue
		}
		if v[0] != '"' || json.Unmarshal(v, f.dest) != nil {
			return q, invalid()
		}
	}
	q.Text = trim(q.Text)
	if fields["kind"] != nil && !slices.Contains([]string{"note", "entry", "task", "reminder"}, q.Kind) ||
		fields["reminderType"] != nil && !slices.Contains([]string{"message", "daily_tasks"}, q.ReminderType) ||
		fields["from"] != nil && !calendarDate(q.From) || fields["to"] != nil && !calendarDate(q.To) ||
		q.From != "" && q.To != "" && q.From > q.To || len(utf16.Encode([]rune(q.Text))) > 200 {
		return q, invalid()
	}
	if b := fields["completed"]; b != nil && (json.Unmarshal(b, &q.Completed) != nil || q.Completed == nil) {
		return q, invalid()
	}
	for _, f := range []struct {
		key      string
		dest     *int
		min, max float64
	}{{"limit", &q.Limit, 1, 50}, {"offset", &q.Offset, 0, 10000}} {
		if rawN := fields[f.key]; rawN != nil {
			var n *float64
			if json.Unmarshal(rawN, &n) != nil || n == nil || math.Trunc(*n) != *n || *n < f.min || *n > f.max {
				return q, invalid()
			}
			*f.dest = int(*n)
		}
	}
	return q, nil
}
func (q Query) filter(plugin, connection string) (string, []any) {
	parts := []string{"r.pluginId=?", "r.connectionId=?"}
	args := []any{plugin, connection}
	for _, f := range []struct{ where, value string }{{"r.kind=?", q.Kind}, {"r.kind='reminder' AND COALESCE(json_extract(r.data,'$.reminderType'),'message')=?", q.ReminderType}, {"r.date>=?", q.From}, {"r.date<=?", q.To}} {
		if f.value != "" {
			parts = append(parts, f.where)
			args = append(args, f.value)
		}
	}
	if q.Completed != nil {
		parts = append(parts, "json_extract(r.data,'$.completed')=?")
		args = append(args, *q.Completed)
	}
	if q.Text != "" {
		parts = append(parts, "(instr(lower(json_extract(r.data,'$.title')),lower(?))>0 OR instr(lower(json_extract(r.data,'$.content')),lower(?))>0 OR instr(lower(json_extract(r.data,'$.category')),lower(?))>0 OR instr(r.id,?)>0)")
		args = append(args, q.Text, q.Text, q.Text, q.Text)
	}
	return strings.Join(parts, " AND "), args
}

func Scopes(ctx context.Context, tx *sql.Tx, plugin string) ([]string, error) {
	rows, err := tx.QueryContext(ctx, "SELECT connectionId FROM personal_records WHERE pluginId=? UNION SELECT connectionId FROM personal_record_state WHERE pluginId=? ORDER BY connectionId", plugin, plugin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	scopes := []string{}
	for rows.Next() {
		var scope string
		if err := rows.Scan(&scope); err != nil {
			return nil, err
		}
		scopes = append(scopes, scope)
	}
	return scopes, rows.Err()
}

type Summary struct {
	Currency string `json:"currency"`
	Income   string `json:"income"`
	Expense  string `json:"expense"`
	Net      string `json:"net"`
}
type Page struct {
	Records []Record  `json:"records"`
	Total   int64     `json:"total"`
	Totals  []Summary `json:"totals"`
}

func cents(n int64) string {
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}
	return fmt.Sprintf("%s%d.%02d", sign, n/100, n%100)
}
func List(ctx context.Context, tx *sql.Tx, plugin, connection string, q Query) (Page, error) {
	page := Page{Records: []Record{}, Totals: []Summary{}}
	where, args := q.filter(plugin, connection)
	if err := tx.QueryRowContext(ctx, "SELECT count(*) FROM personal_records r WHERE "+where, args...).Scan(&page.Total); err != nil {
		return page, err
	}
	records, err := listRecords(ctx, tx, where, args, q.Limit, q.Offset)
	if err != nil {
		return page, err
	}
	page.Records = records
	rows, err := tx.QueryContext(ctx, `SELECT json_extract(r.data,'$.currency') currency,
	SUM(CASE WHEN json_extract(r.data,'$.direction')='income' THEN r.amountCents ELSE 0 END),
	SUM(CASE WHEN json_extract(r.data,'$.direction')='income' THEN 0 ELSE r.amountCents END)
	FROM personal_records r WHERE `+where+" AND r.kind='entry' GROUP BY currency ORDER BY currency", args...)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	for rows.Next() {
		var currency string
		var income, expense int64
		if err := rows.Scan(&currency, &income, &expense); err != nil {
			return page, err
		}
		page.Totals = append(page.Totals, Summary{currency, cents(income), cents(expense), cents(income - expense)})
	}
	return page, rows.Err()
}
