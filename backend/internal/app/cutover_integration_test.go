//go:build executor_integration

package app_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/app"
	"github.com/moutsea/wechatai/backend/internal/platform/config"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

// Rehearse a diagnostic read switch against a prepared account. The real
// readiness gate must still refuse business activation on an incomplete build.
func TestLocalCutoverRehearsal(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 90*time.Second)
	defer cancel()
	root := t.TempDir()
	edge := func(mode, origin string) {
		t.Helper()
		out, err := exec.CommandContext(ctx, "node", "testdata/cutover-bridge.mjs", mode, root, origin).CombinedOutput()
		if err != nil {
			t.Fatalf("workerd %s: %v\n%s", mode, err, out)
		}
	}
	edge("seed", "")
	var seed struct{ ID accounts.ID }
	data, err := os.ReadFile(filepath.Join(root, "seed.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &seed); err != nil {
		t.Fatal(err)
	}
	id, err := accounts.ParseID(string(seed.ID))
	if err != nil {
		t.Fatal(err)
	}
	copySnapshot := func(file, dir string) {
		t.Helper()
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
		db, err := sqlite.OpenReadOnly(ctx, file)
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		if _, err := sqlite.Backup(ctx, db, filepath.Join(dir, string(id)+".sqlite")); err != nil {
			t.Fatal(err)
		}
	}
	legacy := filepath.Join(root, "legacy")
	// workerd has stopped. SQLite's backup API also includes the committed WAL.
	copySnapshot(filepath.Join(root, "cloudflare", "do", "cutover-local-PersonalAccount", string(id)+".sqlite"), legacy)
	checkSourceLayout(t, ctx, filepath.Join(legacy, string(id)+".sqlite"))
	generation := filepath.Join(root, "backup")
	manifest, err := app.BackupData(ctx, legacy, generation)
	if err != nil {
		t.Fatal(err)
	}
	const owner = "isolated-rehearsal-user"
	if len(manifest.Accounts) != 1 || manifest.Accounts[0].Phase != "legacy" || manifest.Accounts[0].UserID != owner || manifest.Accounts[0].AccountID != id {
		t.Fatal("unexpected legacy backup", manifest)
	}
	// Reproduce the two legacy import failures using copies of the same real export.
	file := string(id) + ".sqlite"
	unbound := filepath.Join(root, "unbound")
	copySnapshot(filepath.Join(legacy, file), unbound)
	old, err := sqlite.OpenExisting(ctx, filepath.Join(unbound, file))
	if err != nil {
		t.Fatal(err)
	}
	defer old.Close()
	if err := accounts.Migrate(ctx, old); err != nil {
		t.Fatal(err)
	}
	unboundBackup := filepath.Join(root, "unbound-backup")
	if _, err := app.BackupData(ctx, unbound, unboundBackup); err != nil {
		t.Fatal(err)
	}
	recovered := filepath.Join(root, "recovered")
	if err := app.RecoverUnbound(ctx, unboundBackup, recovered, id, owner, 2, filepath.Join(root, "original-identity.json")); err != nil {
		t.Fatal(err)
	}
	rec, err := accounts.OpenSnapshot(ctx, recovered, id)
	if err != nil {
		t.Fatal(err)
	}
	defer rec.Close()
	rstate, err := accounts.State(ctx, rec)
	if err != nil || rstate.Phase != "prepared" || rstate.Match(id, owner, 2) != nil {
		t.Fatal(rstate, err)
	}
	var amount int64
	if err := rec.QueryRow("SELECT amount FROM credit_ledger WHERE id='grant:payment:fixture-payment-42'").Scan(&amount); err != nil || amount != 42000 {
		t.Fatal(amount, err)
	}
	incomplete := filepath.Join(root, "incomplete")
	copySnapshot(filepath.Join(legacy, file), incomplete)
	broken, err := sqlite.OpenExisting(ctx, filepath.Join(incomplete, file))
	if err != nil {
		t.Fatal(err)
	}
	defer broken.Close()
	if _, err := broken.Exec("DROP TABLE plugins"); err != nil {
		t.Fatal(err)
	}
	if _, err := app.BackupData(ctx, incomplete, filepath.Join(root, "broken-backup")); err == nil {
		t.Fatal("incomplete workerd export was accepted")
	}
	// Prepare a separate fixture from the verified generation, preserving both
	// the immutable backup and the local DO for the return trip.
	target := filepath.Join(root, "target")
	if err := app.PrepareLegacy(ctx, generation, target, id, owner, 2); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{AppURL: "https://comparison.example", DataDir: target, MaxOpenAccounts: 2, RPCSecret: strings.Repeat("s", 32), EncryptionKey: strings.Repeat("e", 32)}
	a, err := app.New(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	h, err := a.Accounts.Acquire(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	var outcome string
	if err := h.DB.QueryRowContext(ctx, `SELECT json_extract(wechatTextReceipts,'$."0".outcome') FROM inbox WHERE id='fixture-text-receipt' AND state='done'`).Scan(&outcome); err != nil || outcome != "unconfirmed" {
		t.Fatalf("imported WeChat text receipt: %q, %v", outcome, err)
	}
	var balance, granted, paymentCount int64
	if err := h.DB.QueryRowContext(ctx, "SELECT remaining FROM credit_buckets WHERE id='payment:fixture-payment-42'").Scan(&balance); err != nil || balance != 42000 {
		t.Fatal("payment bucket mismatch", balance, err)
	}
	if err := h.DB.QueryRowContext(ctx, "SELECT amount FROM credit_ledger WHERE id='grant:payment:fixture-payment-42'").Scan(&granted); err != nil || granted != balance {
		t.Fatal("payment ledger mismatch", granted, err)
	}
	if err := h.DB.QueryRowContext(ctx, "SELECT COUNT(*) FROM payments WHERE id='fixture-payment-42'").Scan(&paymentCount); err != nil || paymentCount != 1 {
		t.Fatal("payment deduplication mismatch", paymentCount, err)
	}
	if n, err := app.CheckData(ctx, target); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	server := httptest.NewServer(a.Handler("local-rehearsal"))
	defer server.Close()
	edge("switch", server.URL)
	state, err := accounts.State(ctx, h.DB)
	if err != nil || state.Phase != "prepared" {
		t.Fatal("business route unexpectedly active", state, err)
	}
	// A different disposable copy is provisioned as an active test account.
	// The actual cutover target above stays prepared behind its readiness gate.
	replica := filepath.Join(root, "comparison")
	if err := app.PrepareLegacy(ctx, generation, replica, id, owner, 2); err != nil {
		t.Fatal(err)
	}
	cfg.DataDir = replica
	comparison, err := app.New(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer comparison.Close()
	account, err := comparison.Accounts.Acquire(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer account.Close()
	if err := sqlite.Within(ctx, account.DB, func(tx *sql.Tx) error { return accounts.Activate(ctx, tx, id, owner, 2) }); err != nil {
		t.Fatal(err)
	}
	refServer := httptest.NewServer(comparison.Handler("comparison"))
	defer refServer.Close()
	edge("compare", refServer.URL)
	encrypted, err := comparison.Box.Encrypt(`{"baseUrl":"https://ilinkai.weixin.qq.com","token":"fixture-only","userId":"sender","botId":"bot"}`, string(id)+":wechat")
	if err != nil {
		t.Fatal(err)
	}
	if err := sqlite.Within(ctx, account.DB, func(tx *sql.Tx) error {
		if err := accounts.SetSetting(ctx, tx, "wechat:comparison:connection", map[string]string{"status": "connected", "generation": "test", "contextToken": "previous", "cursor": "committed", "encryptedCredentials": encrypted}); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO inbox(id,payload,createdAt,connectionId,state) VALUES('comparison:bot:sender:0','{}',1,'comparison','done')`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	edge("receiver", refServer.URL)
	var remembered, cursor, token string
	if err := account.DB.QueryRowContext(ctx, "SELECT wechatSeq FROM inbox WHERE id='comparison:bot:sender:0'").Scan(&remembered); err != nil || remembered != "10" {
		t.Fatal("old receipt identity was lost", remembered, err)
	}
	if err := account.DB.QueryRowContext(ctx, `SELECT json_extract(value,'$.cursor'),json_extract(value,'$.contextToken') FROM settings WHERE key='wechat:comparison:connection'`).Scan(&cursor, &token); err != nil || cursor != "next" || token != "last" {
		t.Fatal("invalid cursor or reply context", cursor, token, err)
	}
	var keys string
	if err := account.DB.QueryRowContext(ctx, `SELECT group_concat(id,'|') FROM (SELECT id FROM inbox WHERE connectionId='comparison' ORDER BY rowid)`).Scan(&keys); err != nil || keys != "comparison:bot:sender:0|comparison:bot:sender:11|comparison:bot:sender:wx64:9223372036854775808|comparison:bot:sender:wx64:9223372036854775809" {
		t.Fatal("replayed or lost a receipt", keys, err)
	}

	// Compare the original DO and Go financial records, including duplicate retries.
	type grant struct {
		ID, Note                   string
		Remaining, Expires, Amount int64
	}
	var expected, actual []grant
	raw, err := os.ReadFile(filepath.Join(root, "reference-grants.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &expected); err != nil {
		t.Fatal(err)
	}
	rows, err := account.DB.QueryContext(ctx, "SELECT b.id,b.remaining,b.expires,l.amount,l.note FROM credit_buckets b JOIN credit_ledger l ON l.id='grant:'||b.id WHERE b.kind='referral' ORDER BY b.id")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var g grant
		if err := rows.Scan(&g.ID, &g.Remaining, &g.Expires, &g.Amount, &g.Note); err != nil {
			t.Fatal(err)
		}
		actual = append(actual, g)
	}
	if err := rows.Err(); err != nil || len(expected) != 2 || !slices.Equal(expected, actual) {
		t.Fatal(expected, actual, err)
	}
	t.Log("D1-qualified referral grants matched original DO ledger and wallets after retries; incomplete export rejected and unbound recovery verified")
	t.Log("signed Go admin statistics, decrypted referral identity, notification credentials and OpenClaw upgrade notices matched the original workerd account")
	t.Log("42 credits and payment ID preserved; activation refused; diagnostic read switched DO -> Go -> DO")
}

// Detect drift between the Worker that initialized this export and the importer
// contract. A newer layout can then be reviewed alongside older supported exports.
func checkSourceLayout(t *testing.T, ctx context.Context, file string) {
	t.Helper()
	var contract map[string][]string
	data, err := os.ReadFile("../legacy/personal-account-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	// V1 predates both inbound message identity metadata and outbound text receipts.
	contract["inbox"] = append(contract["inbox"], "wechatRoundedId", "wechatExactId", "wechatSeq", "wechatTextReceipts")
	db, err := sqlite.OpenReadOnly(ctx, file)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rows, err := db.QueryContext(ctx, `SELECT s.name,p.name FROM sqlite_schema s JOIN pragma_table_info(s.name) p WHERE s.type='table' AND s.name NOT GLOB 'sqlite_*' AND s.name NOT GLOB '_cf_*' ORDER BY s.name,p.cid`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	source := map[string][]string{}
	for rows.Next() {
		var table, column string
		if err := rows.Scan(&table, &column); err != nil {
			t.Fatal(err)
		}
		source[table] = append(source[table], column)
	}
	if err := rows.Err(); err != nil || !reflect.DeepEqual(source, contract) {
		t.Fatalf("workerd schema differs from PersonalAccount import contract: %v", err)
	}
}
