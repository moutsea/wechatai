package personal

import (
	"context"
	"database/sql"
	"encoding/json"
)

type Fields struct {
	Kind            string  `json:"kind"`
	Title           string  `json:"title"`
	Content         string  `json:"content"`
	Date            string  `json:"date"`
	Category        string  `json:"category"`
	Amount          *string `json:"amount"`
	Direction       string  `json:"direction"`
	Currency        string  `json:"currency"`
	Completed       bool    `json:"completed"`
	ReminderEnabled bool    `json:"reminderEnabled"`
	ReminderType    string  `json:"reminderType"`
	RemindAt        *string `json:"remindAt"`
	Repeat          string  `json:"repeat"`
}
type Record struct {
	Fields
	ID               string          `json:"id"`
	Revision         int64           `json:"revision"`
	CreatedAt        int64           `json:"createdAt"`
	UpdatedAt        int64           `json:"updatedAt"`
	ReminderState    *string         `json:"reminderState"`
	ReminderError    *string         `json:"reminderError"`
	ReminderErrorDue *int64          `json:"reminderErrorDueAt"`
	ReminderBlock    json.RawMessage `json:"reminderBlockReason,omitempty"`
	ReminderFailure  json.RawMessage `json:"reminderLastFailure,omitempty"`
	NextReminder     *int64          `json:"nextReminderAt"`
}

func listRecords(ctx context.Context, tx *sql.Tx, where string, args []any, limit, offset int) ([]Record, error) {
	rows, err := tx.QueryContext(ctx, `SELECT r.id,r.revision,r.createdAt,r.updatedAt,r.data,m.state,m.error,m.errorDueAt,m.blockReason,m.lastFailure,m.dueAt
	FROM personal_records r LEFT JOIN personal_reminders m ON m.recordId=r.id WHERE `+where+" ORDER BY r.updatedAt DESC,r.id LIMIT ? OFFSET ?", append(args, limit, offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Record{}
	for rows.Next() {
		var r Record
		var raw string
		var block, failure *string
		if err := rows.Scan(&r.ID, &r.Revision, &r.CreatedAt, &r.UpdatedAt, &raw, &r.ReminderState, &r.ReminderError, &r.ReminderErrorDue, &block, &failure, &r.NextReminder); err != nil {
			return nil, err
		}
		r.Fields = Fields{Direction: "expense", Currency: "CNY", ReminderEnabled: true, ReminderType: "message", Repeat: "none"}
		if err := json.Unmarshal([]byte(raw), &r.Fields); err != nil {
			return nil, err
		}
		r.Title, r.Content, r.Category = trim(r.Title), trim(r.Content), trim(r.Category)
		if block != nil && *block != "" {
			r.ReminderBlock = json.RawMessage(*block)
		}
		if failure != nil && *failure != "" {
			r.ReminderFailure = json.RawMessage(*failure)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
