package openclaw

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
)

const relayTables = `CREATE TABLE IF NOT EXISTS claw_routes(id TEXT PRIMARY KEY,pluginId TEXT NOT NULL,sessionId TEXT NOT NULL,connectionId TEXT NOT NULL,generation TEXT NOT NULL,epoch INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS claw_jobs(id TEXT PRIMARY KEY,routeId TEXT NOT NULL,pluginId TEXT NOT NULL,text TEXT NOT NULL,state TEXT NOT NULL,createdAt INTEGER NOT NULL,inputTokens INTEGER NOT NULL,outputLimit INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS claw_jobs_plugin ON claw_jobs(pluginId,state,createdAt);
CREATE TABLE IF NOT EXISTS claw_pairings(pluginId TEXT PRIMARY KEY,secretHash TEXT NOT NULL,expiresAt INTEGER NOT NULL,claimHash TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS claw_agents(pluginId TEXT PRIMARY KEY,agents TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS claw_events(id TEXT PRIMARY KEY,pluginId TEXT NOT NULL,receipt TEXT NOT NULL,createdAt INTEGER NOT NULL);`

type Status struct {
	PairingClaimed   bool            `json:"pairingClaimed"`
	HasKey           bool            `json:"hasKey"`
	NativeCommands   bool            `json:"nativeCommands"`
	LastSeen         int64           `json:"lastSeen"`
	ConnectorVersion *string         `json:"connectorVersion"`
	VersionSeenAt    int64           `json:"versionSeenAt"`
	Agents           json.RawMessage `json:"agents"`
}

func ReadStatus(ctx context.Context, tx *sql.Tx, id string) (Status, error) {
	var s Status
	var agents string
	err := tx.QueryRowContext(ctx, `SELECT COALESCE(p.claimHash!='',0),c.pluginId IS NOT NULL,COALESCE(c.nativeCommands,0),COALESCE(c.lastSeen,0),NULLIF(c.connectorVersion,''),COALESCE(c.versionSeenAt,0),COALESCE(a.agents,'[]')
	FROM (SELECT ? AS id) x LEFT JOIN claw_connectors c ON c.pluginId=x.id LEFT JOIN claw_agents a ON a.pluginId=x.id LEFT JOIN claw_pairings p ON p.pluginId=x.id`, id).Scan(&s.PairingClaimed, &s.HasKey, &s.NativeCommands, &s.LastSeen, &s.ConnectorVersion, &s.VersionSeenAt, &agents)
	s.Agents = json.RawMessage(agents)
	return s, err
}

type Delivery struct {
	ID        string `json:"id"`
	State     string `json:"state"`
	CreatedAt int64  `json:"createdAt"`
}

func Deliveries(ctx context.Context, tx *sql.Tx, id string) ([]Delivery, error) {
	rows, err := tx.QueryContext(ctx, "SELECT id,state,createdAt FROM inbox WHERE id LIKE ? ORDER BY createdAt DESC LIMIT 10", "claw:"+id+":%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	d := []Delivery{}
	for rows.Next() {
		var r Delivery
		if err := rows.Scan(&r.ID, &r.State, &r.CreatedAt); err != nil {
			return nil, err
		}
		d = append(d, r)
	}
	return d, rows.Err()
}

func Revoke(ctx context.Context, tx *sql.Tx, id string) error {
	for _, q := range []string{"DELETE FROM claw_pairings WHERE pluginId=?", "DELETE FROM claw_agents WHERE pluginId=?", "DELETE FROM claw_connectors WHERE pluginId=?", `UPDATE inbox SET state='done',payload='{}',reply='' WHERE id LIKE ('claw:'||?||':%')`, "DELETE FROM claw_routes WHERE pluginId=?", `UPDATE claw_jobs SET state='cancelled',text='' WHERE pluginId=? AND state IN ('pending','claimed')`} {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return err
		}
	}
	return nil
}

func newSecret() (string, string, error) {
	var bytes [32]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", "", err
	}
	s := base64.RawURLEncoding.EncodeToString(bytes[:])
	h := sha256.Sum256([]byte(s))
	return s, hex.EncodeToString(h[:]), nil
}
func signature(key, text string) string {
	m := hmac.New(sha256.New, []byte(key))
	m.Write([]byte(text))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
func Rotate(ctx context.Context, tx *sql.Tx, key, kind, account, id string) (string, error) {
	s, hash, err := newSecret()
	if err != nil {
		return "", err
	}
	if err = Revoke(ctx, tx, id); err != nil {
		return "", err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO claw_connectors(pluginId,tokenHash,lastSeen) VALUES(?,?,0)", id, hash); err != nil {
		return "", err
	}
	body := account + "." + id + "." + s
	return body + "." + signature(key, "wechatai-"+kind+"-v1:"+body), nil
}

type Pairing struct {
	Code      string `json:"pairingCode"`
	ExpiresAt int64  `json:"expiresAt"`
}

func CreatePairing(ctx context.Context, tx *sql.Tx, key, kind, account, id string, now int64) (Pairing, error) {
	s, hash, err := newSecret()
	p := Pairing{ExpiresAt: now + 600000}
	if err != nil {
		return p, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO claw_pairings(pluginId,secretHash,expiresAt,claimHash) VALUES(?,?,?,'') ON CONFLICT(pluginId) DO UPDATE SET secretHash=excluded.secretHash,expiresAt=excluded.expiresAt,claimHash=''`, id, hash, p.ExpiresAt); err != nil {
		return p, err
	}
	prefix := "pair1."
	if kind != "openclaw" {
		prefix = kind + "-pair1."
	}
	body := prefix + account + "." + id + "." + s
	p.Code = body + "." + signature(key, body)
	return p, nil
}
