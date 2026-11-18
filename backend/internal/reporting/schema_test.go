package reporting_test

import (
	"path/filepath"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/reporting"
)

func TestImportHistoricalFailuresOnce(t *testing.T) {
	for _, migrated := range []bool{false, true} {
		name := "legacy"
		if migrated {
			name = "already migrated"
		}
		t.Run(name, func(t *testing.T) {
			ctx := t.Context()
			db, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "legacy.sqlite"))
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if err := accounts.Migrate(ctx, db); err != nil {
				t.Fatal(err)
			}
			_, err = db.Exec(`CREATE TABLE runs(id TEXT PRIMARY KEY,status TEXT,createdAt INTEGER);
                CREATE TABLE claw_jobs(id TEXT PRIMARY KEY,state TEXT,createdAt INTEGER);
                CREATE TABLE usage(id TEXT PRIMARY KEY,createdAt INTEGER,tokens INTEGER,units INTEGER);
                INSERT INTO runs VALUES('retry','failed',1),('missing','failed',2);
                INSERT INTO usage VALUES('retry',4,1,3);
                INSERT INTO claw_jobs VALUES('remote','failed',3)`)
			if err != nil {
				t.Fatal(err)
			}
			want := 2
			if migrated {
				want = 0
				if _, err := db.Exec("INSERT INTO settings VALUES('callFailuresMigrated','true')"); err != nil {
					t.Fatal(err)
				}
			}
			for range 2 {
				if err := reporting.Schema().Apply(ctx, db); err != nil {
					t.Fatal(err)
				}
			}
			var count int
			if err := db.QueryRow("SELECT count(*) FROM call_failures").Scan(&count); err != nil || count != want {
				t.Fatalf("import: %d want %d: %v", count, want, err)
			}
			if !migrated {
				var code string
				if err := db.QueryRow("SELECT code FROM call_failures WHERE id='legacy-remote:remote'").Scan(&code); err != nil || code != "remote_agent_failed" {
					t.Fatalf("wrong legacy reason: %s %v", code, err)
				}
			}
		})
	}
}
