package receiver

import (
	"bytes"
	"encoding/json"
	"errors"
	"math"
	"strconv"

	"github.com/google/uuid"
)

// Direct iLink responses carry exact int64 digits. Convert unsafe numeric IDs
// to the receiver's lossless wire format before classifying legacy replays.
func ProviderBatch(link LinkConfig, raw []byte) ([]byte, error) {
	var data struct {
		Msgs   []json.RawMessage `json:"msgs"`
		Cursor *string           `json:"get_updates_buf"`
		Sync   *string           `json:"sync_buf"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	if data.Msgs == nil {
		data.Msgs = []json.RawMessage{}
	}
	for i, item := range data.Msgs {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(item, &m); err != nil || m == nil {
			return nil, ErrFrame
		}
		changed := false
		for _, k := range []string{"message_id", "seq"} {
			v := m[k]
			if len(v) == 0 || v[0] == '"' {
				continue
			}
			n, err := strconv.ParseFloat(string(v), 64)
			if err != nil {
				return nil, ErrFrame
			}
			if math.Abs(n) <= 9007199254740991 {
				continue
			}
			// Scientific notation or fractional digits do not encode a supported
			// WeChat int64. Never invent an identity from such a response.
			if bytes.ContainsAny(v, "eE.+") || len(v) > 21 {
				return nil, errors.New("invalid exact WeChat identifier")
			}
			m[k], err = json.Marshal(string(v))
			if err != nil {
				return nil, err
			}
			changed = true
		}
		if changed {
			v, err := json.Marshal(m)
			if err != nil {
				return nil, err
			}
			data.Msgs[i] = v
		}
	}
	cursor := link.Cursor
	if data.Cursor != nil {
		cursor = *data.Cursor
	} else if data.Sync != nil {
		cursor = *data.Sync
	}
	return json.Marshal(map[string]any{"type": "batch", "id": uuid.NewString(), "connectionId": link.ID, "generation": link.Generation, "fromCursor": link.Cursor, "cursor": cursor, "msgs": data.Msgs})
}
