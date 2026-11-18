package app_test

import (
	"encoding/json"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/openclaw"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func TestConnectorNoticesFollowEntitlementBindingVersionAndReadState(t *testing.T) {
	a, id := setup(t)
	h, err := a.Accounts.Acquire(t.Context(), id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	sql := func(query string, args ...any) {
		t.Helper()
		if _, err := h.DB.Exec(query, args...); err != nil {
			t.Fatal(err)
		}
	}
	version := "1.1.5"
	for _, p := range []struct {
		id, kind, version string
		enabled, bound    bool
	}{
		{"other", "other", "", true, true}, {"disabled", "wechatai/openclaw", "", false, true}, {"unbound", "wechatai/openclaw", "", true, false},
		{"current", "wechatai/openclaw", version, true, true}, {"future", "wechatai/openclaw", "999999.0.0", true, true},
		{"unknown", "wechatai/openclaw", "", true, true}, {"invalid", "wechatai/openclaw", "01.1.0", true, true}, {"old", "wechatai/openclaw", "0.99.0", true, true},
	} {
		sql("INSERT INTO plugins VALUES(?,json_object('id',?,'name',?,'shortcut',?,'enabled',json(?),'pluginId',?))", p.id, p.id, "连接"+p.id, p.id, p.enabled, p.kind)
		if p.bound {
			sql("INSERT INTO claw_connectors(pluginId,tokenHash,connectorVersion) VALUES(?,'key',?)", p.id, p.version)
		}
	}
	read := func(v string, want bool) {
		t.Helper()
		w := call(t, a, id, rpc.User, "target-user", "readConnectorUpdateNotice", []any{v}, 1, true)
		var out struct{ Data *bool }
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || w.Code != 200 || out.Data == nil || *out.Data != want {
			t.Fatal(w.Code, w.Body.String(), err)
		}
	}
	notice := func() *openclaw.Notice {
		t.Helper()
		w := call(t, a, id, rpc.User, "target-user", "connectorUpdateNotice", []any{}, 1, true)
		var out struct{ Data *openclaw.Notice }
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || w.Code != 200 {
			t.Fatal(w.Code, w.Body.String(), err)
		}
		return out.Data
	}
	read(version, false)
	if notice() != nil {
		t.Fatal("free plan must apply slot limit before filtering")
	}
	sql("INSERT INTO settings VALUES('planUntil',?)", a.Now().UnixMilli()+10000)
	sql(`INSERT INTO settings VALUES('openclawUpdateNotice','{"version":"0.0.0","isRead":true,"createdAt":1}')`)
	n := notice()
	if n == nil || n.Version != version || n.CreatedAt != a.Now().UnixMilli() || n.IsRead || len(n.Connections) != 3 {
		t.Fatalf("%+v", n)
	}
	for i, want := range []string{"unknown", "invalid", "old"} {
		if c := n.Connections[i]; c.ID != want || c.Name != "连接"+want || c.Shortcut != want {
			t.Fatal(c)
		}
	}
	if n.Connections[0].CurrentVersion != nil || n.Connections[1].CurrentVersion == nil || *n.Connections[1].CurrentVersion != "01.1.0" {
		t.Fatal(n.Connections)
	}
	read("0.0.0", false)
	read(version, true)
	read(version, true)
	if after := notice(); after.CreatedAt != n.CreatedAt || !after.IsRead {
		t.Fatal(after)
	}
	for _, test := range []struct {
		scope  rpc.Scope
		actor  string
		epoch  int64
		status int
	}{
		{rpc.User, "another", 1, 403}, {rpc.User, "target-user", 2, 409}, {rpc.Referral, "", 1, 403},
	} {
		if w := call(t, a, id, test.scope, test.actor, "connectorUpdateNotice", []any{}, test.epoch, true); w.Code != test.status {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	sql("UPDATE claw_connectors SET connectorVersion=?", version)
	if notice() != nil {
		t.Fatal("offline current connectors should not receive notices")
	}
}

func TestConnectorNoticesFollowSignedEdgeRelease(t *testing.T) {
	a, id := setup(t)
	h, err := a.Accounts.Acquire(t.Context(), id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	if _, err := h.DB.Exec(`INSERT INTO plugins VALUES('p','{"id":"p","name":"测试","shortcut":"p","enabled":true,"pluginId":"wechatai/openclaw"}');
	INSERT INTO claw_connectors(pluginId,tokenHash,connectorVersion) VALUES('p','test','1.1.3')`); err != nil {
		t.Fatal(err)
	}
	request := func(release, method string, args []string) json.RawMessage {
		t.Helper()
		params, err := json.Marshal(args)
		if err != nil {
			t.Fatal(err)
		}
		w := signedCall(t, a, rpc.Command{Version: rpc.Version, AccountID: id, OwnerID: "target-user", RouteEpoch: 1, Principal: rpc.Principal{Scope: rpc.User, UserID: "target-user"}, Method: method, Params: params}, release, true)
		var result struct{ Data json.RawMessage }
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || w.Code != 200 {
			t.Fatal(w.Code, w.Body.String(), err)
		}
		return result.Data
	}
	for _, release := range []string{"1.1.4", "1.1.6"} {
		var n openclaw.Notice
		if err := json.Unmarshal(request(release, "connectorUpdateNotice", []string{}), &n); err != nil || n.Version != release || n.IsRead {
			t.Fatal(n, err)
		}
		if string(request(release, "readConnectorUpdateNotice", []string{"1.1.3"})) != "false" || string(request(release, "readConnectorUpdateNotice", []string{release})) != "true" {
			t.Fatal("unexpected read state")
		}
		if string(request("", "connectorUpdateNotice", []string{})) != "null" || string(request("", "readConnectorUpdateNotice", []string{release})) != "false" {
			t.Fatal("missing release changed the notice")
		}
		if err := json.Unmarshal(request(release, "connectorUpdateNotice", []string{}), &n); err != nil || !n.IsRead {
			t.Fatal(n, err)
		}
	}
}
