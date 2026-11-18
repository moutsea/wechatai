package app

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"

	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/automation"
	"github.com/moutsea/wechatai/backend/internal/cloudagent"
	"github.com/moutsea/wechatai/backend/internal/conversation"
	"github.com/moutsea/wechatai/backend/internal/credits"
	"github.com/moutsea/wechatai/backend/internal/delivery"
	"github.com/moutsea/wechatai/backend/internal/jobs"
	"github.com/moutsea/wechatai/backend/internal/legacy"
	"github.com/moutsea/wechatai/backend/internal/media"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/notifications"
	"github.com/moutsea/wechatai/backend/internal/openclaw"
	"github.com/moutsea/wechatai/backend/internal/personal"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/reporting"
	"github.com/moutsea/wechatai/backend/internal/wechat"
)

func Schemas() []sqlite.Schema {
	return append([]sqlite.Schema{accounts.Schema()}, businessSchemas()...)
}

func businessSchemas() []sqlite.Schema {
	return []sqlite.Schema{credits.Schema(), jobs.Schema(), membership.Schema(), automation.Schema(), delivery.Schema(), wechat.Schema(), reporting.Schema(), conversation.Schema(), media.Schema(), cloudagent.Schema(), notifications.Schema(), openclaw.Schema(), personal.Schema()}
}

// CheckData is read-only and does not need application secrets. Run with the
// service's OS identity, while it is stopped when checking a binary rollback.
func CheckData(ctx context.Context, root string) (int, error) {
	if err := accounts.CheckDirectory(root); err != nil {
		return 0, err
	}
	return checkFiles(ctx, root, true)
}

// InspectData also accepts older compatible schemas and read-only backup directories.
func InspectData(ctx context.Context, root string) (int, error) { return checkFiles(ctx, root, false) }

func checkFiles(ctx context.Context, root string, current bool) (int, error) {
	files, err := os.ReadDir(root)
	if err != nil {
		return 0, err
	}
	count := 0
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sqlite") {
			continue
		}
		id, err := accounts.ParseID(strings.TrimSuffix(file.Name(), ".sqlite"))
		if err != nil {
			return count, fmt.Errorf("unexpected account database filename")
		}
		if _, err := inspectSchema(ctx, root, id, current); err != nil {
			return count, fmt.Errorf("account %s: %w", id, err)
		}
		count++
	}
	return count, nil
}

// Inspect the same read-only snapshot for status, preflight and backup manifests.
func inspectFile(ctx context.Context, root string, id accounts.ID) (accounts.Metadata, error) {
	return inspectSchema(ctx, root, id, false)
}

func inspectSchema(ctx context.Context, root string, id accounts.ID, current bool) (accounts.Metadata, error) {
	db, err := accounts.OpenSnapshot(ctx, root, id)
	if err != nil {
		return accounts.Metadata{}, err
	}
	defer db.Close()
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return accounts.Metadata{}, err
	}
	defer tx.Rollback()
	var state accounts.Metadata
	state, err = accounts.InspectIdentity(ctx, tx, id)
	if err != nil {
		return state, err
	}
	if state.Phase == "legacy" || state.Phase == "unbound" {
		if err := legacy.CheckLayout(ctx, tx); err != nil {
			return state, err
		}
	}
	validate := sqlite.CheckCompatibility
	if current && state.Phase != "legacy" && state.Phase != "unbound" {
		validate = sqlite.RequireCurrent
	}
	if err := validate(ctx, tx, Schemas()); err != nil {
		return state, err
	}
	if err := membership.CheckLayout(ctx, tx); err != nil {
		return state, fmt.Errorf("membership records: %w", err)
	}
	if err := credits.CheckLayout(ctx, tx); err != nil {
		return state, fmt.Errorf("wallet records: %w", err)
	}
	return state, tx.Commit()
}
