// Package notifications owns plugin-scoped notification credentials.
package notifications

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"

	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "notifications", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS notification_tokens(pluginId TEXT PRIMARY KEY,hash TEXT NOT NULL);
`}, {Version: 2, SQL: jobsSchema}}}
}

// Valid checks the current credential after the Worker authenticates its routing
// envelope. Fetch on each request so rotation and revocation take effect immediately.
func Valid(ctx context.Context, q sqlite.Querier, plugin, credential string) (bool, error) {
	var stored string
	err := q.QueryRowContext(ctx, "SELECT hash FROM notification_tokens WHERE pluginId=?", plugin).Scan(&stored)
	if sqlite.IsMissing(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	digest := sha256.Sum256([]byte(credential))
	return subtle.ConstantTimeCompare([]byte(stored), []byte(hex.EncodeToString(digest[:]))) == 1, nil
}
