package receiver

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/cryptobox"
	"github.com/moutsea/wechatai/backend/internal/wechat"
)

// The first connection on older accounts predates wechat_links. Never
// materialize it after an explicit deletion.
const receiverLinks = `WITH links(id,createdAt,pos) AS (
 SELECT id,createdAt,rowid FROM wechat_links
 UNION ALL SELECT 'default',0,0 WHERE NOT EXISTS(SELECT 1 FROM wechat_links WHERE id='default') AND EXISTS(SELECT 1 FROM settings WHERE key='connection' AND json_type(value)='object') AND NOT EXISTS(SELECT 1 FROM settings WHERE key='legacyLinkDeleted' AND json_extract(value,'$')=1)
),ordered AS(SELECT id,row_number() OVER(ORDER BY createdAt,pos) n FROM links)
SELECT l.id,l.n,s.value FROM ordered l JOIN settings s ON s.key=CASE l.id WHEN 'default' THEN 'connection' ELSE 'wechat:'||l.id||':connection' END WHERE json_extract(s.value,'$.status')='connected' AND COALESCE(json_extract(s.value,'$.encryptedCredentials'),'')!='' ORDER BY l.n`

type LinkConfig struct {
	ID                 string             `json:"id"`
	Generation         string             `json:"generation"`
	Cursor             string             `json:"cursor"`
	TypingUntil        int64              `json:"typingUntil"`
	TypingContextToken string             `json:"typingContextToken"`
	Credentials        wechat.Credentials `json:"credentials"`
}
type Config struct {
	Type  string       `json:"type"`
	Links []LinkConfig `json:"links"`
}

func Snapshot(ctx context.Context, tx *sql.Tx, box *cryptobox.Box, id accounts.ID, old string, now int64) (*Config, string, error) {
	until, err := accounts.Setting[int64](ctx, tx, "planUntil", 0)
	if err != nil {
		return nil, "", err
	}
	limit := 1
	if until > now {
		limit = 10
	}
	rows, err := tx.QueryContext(ctx, receiverLinks)
	if err != nil {
		return nil, "", err
	}
	type pending struct {
		link    LinkConfig
		cipher  string
		context string
		enabled bool
	}
	var links []pending
	for rows.Next() {
		var b binding
		var raw string
		var pos int
		var link LinkConfig
		if err = rows.Scan(&link.ID, &pos, &raw); err != nil {
			break
		}
		if err = json.Unmarshal([]byte(raw), &b); err != nil {
			break
		}
		link.Generation, link.Cursor = b.Generation, b.Cursor
		links = append(links, pending{link, b.EncryptedCredentials, b.ContextToken, pos <= limit})
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		return nil, "", err
	}
	hash := sha256.New()
	for i := range links {
		p := &links[i]
		if p.enabled && p.context != "" {
			var started int64
			err = tx.QueryRowContext(ctx, `SELECT MAX(COALESCE((SELECT MAX(createdAt) FROM inbox i WHERE connectionId=? AND state='pending' AND EXISTS(SELECT 1 FROM json_each(i.payload,'$.item_list') x WHERE trim(COALESCE(json_extract(x.value,'$.text_item.text'),json_extract(x.value,'$.voice_item.text'),''))!='' AND substr(trim(COALESCE(json_extract(x.value,'$.text_item.text'),json_extract(x.value,'$.voice_item.text'),'')),1,1)!='/')),0),COALESCE((SELECT MAX(j.createdAt) FROM claw_jobs j JOIN claw_routes r ON r.id=j.routeId JOIN sessions s ON s.id=r.sessionId JOIN plugins p ON p.id=j.pluginId WHERE j.state='claimed' AND r.connectionId=? AND r.generation=? AND json_extract(s.data,'$.archived')=0 AND json_extract(s.data,'$.resetAt')=r.epoch AND json_extract(p.data,'$.enabled')=1),0))`, p.link.ID, p.link.ID, p.link.Generation).Scan(&started)
			if err != nil {
				return nil, "", err
			}
			if started > 0 && started+14*60000 > now {
				p.link.TypingUntil = started + 14*60000
				p.link.TypingContextToken = p.context
			}
		}
		// The poller advances its cursor on ack. Reconfigure only when the
		// binding or typing changes, not after every poll.
		if err = json.NewEncoder(hash).Encode([]any{p.link.ID, p.link.Generation, p.cipher, p.link.TypingUntil, p.link.TypingContextToken}); err != nil {
			return nil, "", err
		}
	}
	key := hex.EncodeToString(hash.Sum(nil))
	if key == old {
		return nil, key, nil
	}
	config := &Config{Type: "config", Links: []LinkConfig{}}
	for _, p := range links {
		p.link.Credentials, err = wechat.OpenCredentials(box, id, p.cipher)
		if err != nil {
			return nil, "", err
		}
		config.Links = append(config.Links, p.link)
	}
	return config, key, nil
}

func PollKeys(ctx context.Context, db *sql.DB, id accounts.ID, epoch int64) ([]PollKey, error) {
	rows, err := db.QueryContext(ctx, receiverLinks)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []PollKey
	for rows.Next() {
		var link, raw string
		var position int
		if err := rows.Scan(&link, &position, &raw); err != nil {
			return nil, err
		}
		var b binding
		if err := json.Unmarshal([]byte(raw), &b); err != nil {
			return nil, err
		}
		keys = append(keys, PollKey{Account: id, Link: link, Generation: b.Generation, Epoch: epoch})
	}
	return keys, rows.Err()
}

func PollBinding(ctx context.Context, tx *sql.Tx, box *cryptobox.Box, key PollKey) (*LinkConfig, error) {
	var b binding
	b, err := accounts.Setting(ctx, tx, settingKey(key.Link), b)
	if err != nil || b.Generation != key.Generation || b.Status != "connected" || b.EncryptedCredentials == "" {
		return nil, err
	}
	var retained bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM wechat_links WHERE id=? UNION ALL SELECT 1 WHERE ?='default' AND NOT EXISTS(SELECT 1 FROM settings WHERE key='legacyLinkDeleted' AND json_extract(value,'$')=1))`, key.Link, key.Link).Scan(&retained)
	if err != nil || !retained {
		return nil, err
	}
	cred, err := wechat.OpenCredentials(box, key.Account, b.EncryptedCredentials)
	if err != nil {
		return nil, err
	}
	return &LinkConfig{ID: key.Link, Generation: b.Generation, Cursor: b.Cursor, Credentials: cred}, nil
}

func ConnectedLinks(ctx context.Context, tx *sql.Tx, now int64) (int, error) {
	limit := 1
	until, err := accounts.Setting[int64](ctx, tx, "planUntil", 0)
	if err != nil {
		return 0, err
	}
	if until > now {
		limit = 10
	}
	var count int
	err = tx.QueryRowContext(ctx, `WITH links(id,createdAt,pos) AS (SELECT id,createdAt,rowid FROM wechat_links UNION ALL SELECT 'default',0,0 WHERE NOT EXISTS(SELECT 1 FROM wechat_links WHERE id='default') AND EXISTS(SELECT 1 FROM settings WHERE key='connection' AND json_type(value)='object') AND NOT EXISTS(SELECT 1 FROM settings WHERE key='legacyLinkDeleted' AND json_extract(value,'$')=1)), ordered AS (SELECT id,row_number() OVER(ORDER BY createdAt,pos) n FROM links)
SELECT COUNT(*) FROM ordered JOIN settings s ON s.key=CASE id WHEN 'default' THEN 'connection' ELSE 'wechat:'||id||':connection' END WHERE json_extract(s.value,'$.status')='connected' AND (n<=? OR COALESCE(json_extract(s.value,'$.encryptedCredentials'),'')!='')`, limit).Scan(&count)
	return count, err
}
