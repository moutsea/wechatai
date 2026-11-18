package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/moutsea/wechatai/backend/internal/cloudagent"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

// The provider request runs outside SQLite. Revalidate the saved workspace
// and the writable route before returning private usage to the dashboard.
func (a *App) cloudStorage(ctx context.Context, c rpc.Command, w cloudagent.Workspace) (json.RawMessage, error) {
	connection := cloudagent.Connection{Origin: a.Config.CloudOrigin, AppID: a.Config.CloudAppID, AppKey: a.Config.CloudAppKey, TenantID: a.Config.CloudTenantID}
	usage, err := w.Usage(ctx, connection, string(c.AccountID))
	if err != nil {
		var domain *rpc.Error
		if errors.As(err, &domain) {
			return encodedAction(nil, domain)
		}
		return nil, err
	}
	if w.WorkspaceID != "" {
		err = a.write(ctx, c, func(tx *sql.Tx) error {
			current, err := cloudagent.ReadWorkspace(ctx, tx)
			if err == nil && current != w {
				return &rpc.Error{Code: "account_changed", Message: "账户云端空间已变更，请重试", Status: 409}
			}
			return err
		})
		if err != nil {
			return nil, err
		}
	}
	return encodedAction(usage, nil)
}
