// Package wechat reads the account's stored WeChat bindings, including the
// original unprefixed default binding. Credentials never leave this package.
package wechat

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/cryptobox"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func Schema() sqlite.Schema {
	return sqlite.Schema{Module: "wechat", Migrations: []sqlite.Migration{{Version: 1, SQL: `
CREATE TABLE IF NOT EXISTS wechat_links(id TEXT PRIMARY KEY,name TEXT NOT NULL,createdAt INTEGER NOT NULL);
`}}}
}

const legacyDefault = `EXISTS(SELECT 1 FROM settings WHERE key='connection' AND json_type(value)='object')
AND NOT EXISTS(SELECT 1 FROM settings WHERE key='legacyLinkDeleted' AND json_extract(value,'$')=1)`

func LinkCounts(ctx context.Context, q sqlite.Querier, plus bool) (total, connected int, err error) {
	limit := 1
	if plus {
		limit = 10
	}
	err = q.QueryRowContext(ctx, `WITH links AS (
      SELECT id,0 legacy,createdAt,rowid position FROM wechat_links
      UNION ALL SELECT 'default',1,0,0 WHERE `+legacyDefault+`
      AND NOT EXISTS(SELECT 1 FROM wechat_links WHERE id='default')
    ), enabled AS (SELECT id FROM links ORDER BY legacy DESC,createdAt,position LIMIT ?)
    SELECT (SELECT count(*) FROM links), count(*) FROM enabled JOIN settings
    ON settings.key=CASE enabled.id WHEN 'default' THEN 'connection' ELSE 'wechat:'||enabled.id||':connection' END
    WHERE json_extract(settings.value,'$.status')='connected'`, limit).Scan(&total, &connected)
	return
}

// ReferralIdentity preserves the first identity used for qualification even
// after the user rebinds or removes the original connection.
func ReferralIdentity(ctx context.Context, tx *sql.Tx, box *cryptobox.Box, id accounts.ID) (*string, error) {
	saved, err := savedReferralIdentity(ctx, tx)
	if err != nil || saved != nil {
		return saved, err
	}
	encrypted, err := firstCredential(ctx, tx)
	if sqlite.IsMissing(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	hash, err := referralHash(box, id, encrypted)
	if err != nil {
		return nil, err
	}
	if err := accounts.SetSetting(ctx, tx, "referralWechatHash", hash); err != nil {
		return nil, err
	}
	return &hash, nil
}

func savedReferralIdentity(ctx context.Context, q sqlite.Querier) (*string, error) {
	used, err := accounts.Setting[*struct {
		Hash string `json:"hash"`
	}](ctx, q, "referralUse", nil)
	if err != nil {
		return nil, err
	}
	if used != nil {
		if used.Hash == "" {
			return nil, errors.New("missing stored referral identity")
		}
		return &used.Hash, nil
	}
	saved, err := accounts.Setting[string](ctx, q, "referralWechatHash", "")
	if err != nil {
		return nil, err
	}
	if saved != "" {
		return &saved, nil
	}
	return nil, nil
}

func firstCredential(ctx context.Context, tx *sql.Tx) (string, error) {
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO wechat_links SELECT 'default','我的微信',0 WHERE `+legacyDefault); err != nil {
		return "", err
	}
	// The Worker falls back to the unprefixed default setting when the list
	// contains no credential. Keep the same ordering for migrated accounts.
	var encrypted string
	err := tx.QueryRowContext(ctx, `WITH candidates AS (
        SELECT id,0 fallback,createdAt,rowid position FROM wechat_links
        UNION ALL SELECT 'default',1,0,0)
        SELECT json_extract(value,'$.encryptedCredentials') FROM candidates JOIN settings
        ON key=CASE id WHEN 'default' THEN 'connection' ELSE 'wechat:'||id||':connection' END
        WHERE json_extract(value,'$.encryptedCredentials') <> '' ORDER BY fallback,createdAt,position LIMIT 1`).Scan(&encrypted)
	return encrypted, err
}

func referralHash(box *cryptobox.Box, id accounts.ID, encrypted string) (string, error) {
	plain, err := box.Decrypt(encrypted, string(id)+":wechat")
	if err != nil {
		return "", err
	}
	var credentials struct {
		UserID string `json:"userId"`
	}
	if err = json.Unmarshal([]byte(plain), &credentials); err != nil || credentials.UserID == "" {
		return "", errors.New("invalid stored WeChat identity")
	}
	digest := sha256.Sum256([]byte("wechatai:referral:" + credentials.UserID))
	return hex.EncodeToString(digest[:]), nil
}

// Include the implicit default connection for snapshots exported before the
// first legacy read materialized wechat_links.
const effectiveLinks = `SELECT id,createdAt,rowid pos FROM wechat_links
UNION ALL SELECT 'default',0,0 WHERE NOT EXISTS(SELECT 1 FROM wechat_links WHERE id='default') AND ` + legacyDefault

func LinkExists(ctx context.Context, tx *sql.Tx, id string) (bool, error) {
	var exists bool
	err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM ("+effectiveLinks+") WHERE id=?)", id).Scan(&exists)
	return exists, err
}
func SelectedLink(ctx context.Context, tx *sql.Tx) (string, error) {
	selected, err := accounts.Setting(ctx, tx, "selectedWechatLink", "default")
	if err != nil {
		return "", err
	}
	var id string
	err = tx.QueryRowContext(ctx, "SELECT id FROM ("+effectiveLinks+") ORDER BY (id=?) DESC,createdAt,pos LIMIT 1", selected).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "default", nil
	}
	return id, err
}
