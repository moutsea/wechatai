package app_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/cloudagent"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func TestStorageUsageRevalidatesAccountOutsideProviderRequest(t *testing.T) {
	a, id := setup(t)
	ctx := context.Background()
	h, err := a.Accounts.Acquire(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	var hits atomic.Int32
	begun, finish := make(chan struct{}), make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempt := hits.Add(1)
		if r.Method != "GET" || r.URL.EscapedPath() != "/api/workspaces/space%2Fone/storage/usage" ||
			r.Header.Get("Authorization") != "Bearer fixture-private" || r.Header.Get("X-App-User") != "wechatai:"+string(id) {
			t.Error("wrong upstream scope or authentication")
		}
		switch attempt {
		case 2:
			w.Header().Set("Location", "/other")
			w.WriteHeader(http.StatusTemporaryRedirect)
			return
		case 3:
			w.Write([]byte(`{"physicalBytes":-1,"reservedBytes":2,"maxTotalBytes":500,"availableBytes":490}`))
			return
		case 4:
			close(begun)
			<-finish
		}
		w.Write([]byte(`{"physicalBytes":8,"reservedBytes":2,"maxTotalBytes":500,"availableBytes":490,"private":"ignored"}`))
	}))
	defer upstream.Close()
	a.Config.CloudOrigin = upstream.URL
	a.Config.CloudAppID = "app"
	a.Config.CloudTenantID = "tenant"
	a.Config.CloudAppKey = "fixture-private"
	run := func() *httptest.ResponseRecorder {
		return call(t, a, id, rpc.User, "target-user", "api", []any{"cloud.storage", map[string]any{}}, 1, true)
	}
	read := func(code string) cloudagent.Usage {
		t.Helper()
		res := run()
		if res.Code != 200 {
			t.Fatal(res.Code, res.Body.String())
		}
		var out struct{ Data string }
		var in struct {
			OK    bool
			Error string
			Data  cloudagent.Usage
		}
		if json.Unmarshal(res.Body.Bytes(), &out) != nil || json.Unmarshal([]byte(out.Data), &in) != nil || in.Error != code || in.OK != (code == "") {
			t.Fatal(res.Body.String())
		}
		return in.Data
	}
	if u := read(""); u.Available != 500*1024*1024 || hits.Load() != 0 {
		t.Fatal("empty workspace made a request", u)
	}
	scope, _ := json.Marshal([]string{upstream.URL, "app", "tenant"})
	save := func(external string) {
		t.Helper()
		raw, _ := json.Marshal(map[string]string{"scope": string(scope), "workspaceId": "space/one", "externalId": external})
		if _, err := h.DB.Exec("INSERT OR REPLACE INTO cloud_provision VALUES(1,?)", string(raw)); err != nil {
			t.Fatal(err)
		}
	}
	save("someone-else")
	read("cloud_scope_changed")
	if hits.Load() != 0 {
		t.Fatal("request made for different identity")
	}
	save("wechatai:" + string(id))
	if u := read(""); u != (cloudagent.Usage{Used: 8, Reserved: 2, Maximum: 500, Available: 490}) {
		t.Fatal(u)
	}
	read("cloud_agent_failed")
	read("cloud_agent_response")
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- run() }()
	<-begun
	save("replacement")
	close(finish)
	if res := <-done; res.Code != 409 {
		t.Fatal("workspace changed in flight", res.Code, res.Body.String())
	}
	if hits.Load() != 4 {
		t.Fatal("redirect followed or incorrect request count", hits.Load())
	}
}
