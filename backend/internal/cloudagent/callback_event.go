// Verified callbacks only wake recovery. Billing and final results come from a
// separate upstream reconciliation, even if the event claims the job completed.
package cloudagent

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

func utf16Length(value string) int {
	n := 0
	for _, r := range value {
		n += utf16.RuneLen(r)
	}
	return n
}

type CallbackHeaders struct{ Event, Delivery, Timestamp, Signature string }
type CallbackResult struct {
	OK     bool   `json:"ok"`
	Status int    `json:"status,omitempty"`
	Error  string `json:"error,omitempty"`
}

func reject(status int, code string) CallbackResult {
	return CallbackResult{Status: status, Error: code}
}

type CallbackKeys struct {
	Current  string
	Versions map[string]string // nil uses the original Worker's v1 encryption secret.
	Legacy   string
}

func (k CallbackKeys) signingSecret(account, task, version string) (string, error) {
	if version == "" {
		version = k.Current
		if version == "" {
			version = "v1"
		}
	}
	key := k.Versions[version]
	if k.Versions == nil && version == "v1" {
		key = k.Legacy
	}
	if key == "" || (k.Versions != nil && utf16Length(key) < 32) {
		return "", errors.New("missing cloud callback key version")
	}
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte("wechatai-agt-callback-v1:" + account + ":" + task))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

var timestampDigits = regexp.MustCompile(`^[0-9]{1,12}$`)
var signatureFormat = regexp.MustCompile(`^sha256=[a-f0-9]{64}$`)

type callbackEvent struct {
	id, kind, job, tenant, workspace, optionalJob string
	fields                                        map[string]json.RawMessage
}

func decodeEvent(raw []byte) (callbackEvent, bool) {
	var e callbackEvent
	if json.Unmarshal(raw, &e.fields) != nil || e.fields == nil {
		return e, false
	}
	var data map[string]json.RawMessage
	if json.Unmarshal(e.fields["data"], &data) != nil || data == nil {
		return e, false
	}
	for _, field := range []struct {
		fields   map[string]json.RawMessage
		key      string
		min, max int
		optional bool
		dest     *string
	}{
		{e.fields, "id", 1, 200, false, &e.id}, {e.fields, "type", 1, 100, false, &e.kind},
		{e.fields, "callbackJobId", 1, 200, false, &e.job}, {e.fields, "tenantId", 0, 200, false, &e.tenant},
		{e.fields, "workspaceId", 0, 200, false, &e.workspace}, {e.fields, "jobId", 0, 200, true, &e.optionalJob},
		{e.fields, "createdAt", 0, 100, true, nil}, {data, "status", 0, 40, true, nil}, {data, "result", 0, -1, true, nil},
	} {
		v := field.fields[field.key]
		if v == nil && field.optional {
			continue
		}
		var s string
		if len(v) == 0 || v[0] != '"' || json.Unmarshal(v, &s) != nil {
			return e, false
		}
		n := utf16Length(s)
		if n < field.min || (field.max >= 0 && n > field.max) {
			return e, false
		}
		if field.dest != nil {
			*field.dest = s
		}
	}
	if seq, ok := data["seq"]; ok {
		var n float64
		if string(seq) == "null" || json.Unmarshal(seq, &n) != nil || n < 0 || n > 9007199254740991 || math.Trunc(n) != n {
			return e, false
		}
	}
	if task, ok := data["task"]; ok && (len(task) == 0 || task[0] != '{') {
		return e, false
	}
	return e, true
}

func verifyEvent(key string, raw []byte, h CallbackHeaders, now int64) (callbackEvent, CallbackResult) {
	var e callbackEvent
	if len(raw) > 1<<20 {
		return e, reject(413, "body_too_large")
	}
	if !signatureFormat.MatchString(h.Signature) {
		return e, reject(401, "invalid_signature")
	}
	if !timestampDigits.MatchString(h.Timestamp) {
		return e, reject(401, "invalid_timestamp")
	}
	ts, _ := strconv.ParseInt(h.Timestamp, 10, 64)
	if delta := now/1000 - ts; delta < -300 || delta > 300 {
		return e, reject(401, "stale_timestamp")
	}
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(h.Timestamp + "."))
	mac.Write(raw)
	signature, _ := hex.DecodeString(strings.TrimPrefix(h.Signature, "sha256="))
	if !hmac.Equal(mac.Sum(nil), signature) {
		return e, reject(401, "invalid_signature")
	}
	if !utf8.Valid(raw) || !json.Valid(raw) {
		return e, reject(400, "invalid_json")
	}
	e, ok := decodeEvent(raw)
	if !ok {
		return e, reject(400, "invalid_event")
	}
	if h.Event != e.kind {
		return e, reject(400, "event_mismatch")
	}
	if h.Delivery != e.id {
		return e, reject(400, "delivery_mismatch")
	}
	return e, CallbackResult{OK: true}
}

func matchesOptional(raw json.RawMessage, expected string) bool {
	if raw == nil {
		return true
	}
	var value *string
	return json.Unmarshal(raw, &value) == nil && value != nil && *value == expected
}
