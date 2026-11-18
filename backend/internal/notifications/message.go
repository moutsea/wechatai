package notifications

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf16"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type Message struct{ Title, Text string }

const jsWhitespace = " \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

func field(raw json.RawMessage, max int) (string, bool) {
	var value *string
	if json.Unmarshal(raw, &value) != nil || value == nil {
		return "", false
	}
	s := strings.Trim(*value, jsWhitespace)
	return s, len(utf16.Encode([]rune(s))) <= max
}

func ParseMessage(raw json.RawMessage) (Message, error) {
	invalid := &rpc.Error{Code: "invalid_message", Message: "请提供 text（1–4000 字）和可选 title（最多 120 字），或飞书文字消息格式", Status: 400}
	var v map[string]json.RawMessage
	var m Message
	if json.Unmarshal(raw, &v) != nil {
		return m, invalid
	}
	if len(v) == 2 && v["msg_type"] != nil {
		var kind string
		if json.Unmarshal(v["msg_type"], &kind) != nil || kind != "text" {
			return m, invalid
		}
		var content map[string]json.RawMessage
		if json.Unmarshal(v["content"], &content) != nil || len(content) != 1 {
			return m, invalid
		}
		v = content
	}
	var ok bool
	if m.Text, ok = field(v["text"], 4000); !ok || m.Text == "" {
		return m, invalid
	}
	if len(v) == 1 {
		return m, nil
	}
	if len(v) != 2 {
		return m, invalid
	}
	if m.Title, ok = field(v["title"], 120); !ok {
		return m, invalid
	}
	return m, nil
}

// Old receipts fingerprint JSON.stringify({title,text}). Preserve HTML and
// Unicode separators verbatim and escape only the JSON control characters.
func jsString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"', '\\':
			b.WriteByte('\\')
			b.WriteRune(r)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 32 {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}
func (m Message) fingerprint() string {
	sum := sha256.Sum256([]byte(`{"title":` + jsString(m.Title) + `,"text":` + jsString(m.Text) + `}`))
	return hex.EncodeToString(sum[:])
}
