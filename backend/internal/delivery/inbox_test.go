package delivery_test

import (
	"path/filepath"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/delivery"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func TestLegacyInboxGainsLinkColumnsWithoutReplacingMessages(t *testing.T) {
	ctx := t.Context()
	db, err := sqlite.Open(ctx, filepath.Join(t.TempDir(), "legacy.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("CREATE TABLE inbox(id TEXT PRIMARY KEY,payload TEXT,state TEXT,reply TEXT,part INTEGER,attempts INTEGER,createdAt INTEGER); INSERT INTO inbox(id,payload) VALUES('old','{}')"); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := delivery.Migrate(ctx, db); err != nil {
			t.Fatal(err)
		}
	}
	var link, payload string
	if err := db.QueryRow("SELECT connectionId,payload FROM inbox WHERE id='old' AND sessionId IS NULL").Scan(&link, &payload); err != nil || link != "default" || payload != "{}" {
		t.Fatalf("old message: %s %s %v", link, payload, err)
	}
}
