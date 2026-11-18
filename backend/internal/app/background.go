package app

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/moutsea/wechatai/backend/internal/accounts"
)

type accountTask struct {
	name string
	run  func(context.Context, accounts.ID, *sql.DB) (*time.Time, error)
}
type backgroundRunner struct{ app *App }

func (r backgroundRunner) Capabilities() []string {
	var names []string
	for _, task := range r.app.tasks {
		names = append(names, task.name)
	}
	return names
}

func (r backgroundRunner) Keys(ctx context.Context) ([]string, error) {
	files, err := os.ReadDir(r.app.Config.DataDir)
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, f := range files {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if !f.Type().IsRegular() || filepath.Ext(f.Name()) != ".sqlite" {
			continue
		}
		id, err := accounts.ParseID(strings.TrimSuffix(f.Name(), ".sqlite"))
		if err == nil {
			ids = append(ids, string(id))
		}
	}
	return ids, nil
}

func (r backgroundRunner) Run(ctx context.Context, key string) (*time.Time, error) {
	a := r.app
	id, err := accounts.ParseID(key)
	if err != nil {
		return nil, err
	}
	h, err := a.Accounts.Acquire(ctx, id, false)
	if errors.Is(err, accounts.ErrInactive) || errors.Is(err, accounts.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer h.Close()
	// Hold the migration gate across the external send and its receipt commit.
	done, err := h.Gate.Enter()
	if errors.Is(err, accounts.ErrInactive) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer done()
	state, err := accounts.State(ctx, h.DB)
	if err != nil || state.Phase != "active" {
		return nil, err
	}
	var next *time.Time
	var failures []error
	for _, task := range a.tasks {
		at, err := task.run(ctx, id, h.DB)
		if err != nil {
			failures = append(failures, err)
		}
		if at != nil && (next == nil || at.Before(*next)) {
			next = at
		}
	}
	return next, errors.Join(failures...)
}
