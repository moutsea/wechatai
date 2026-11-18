//go:build executor_integration

package app_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/jobs"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

// Run via pnpm test:backend-executor with the project JS dependencies installed.
func TestNodeExecutorThroughEdgeTransport(t *testing.T) {
	a, id := setup(t)
	a.Now = time.Now
	a.Signer.Now = a.Now
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	h, err := a.Accounts.Acquire(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	q := jobs.Queue{AccountID: id, Box: a.Box}
	const payloadBytes = 31 << 20 // Keep room for the legacy 32 MiB JSON envelope.
	payload, err := json.Marshal(map[string]any{"kind": "attachments", "timeoutMs": 60000, "items": []string{strings.Repeat("x", payloadBytes)}})
	if err != nil {
		t.Fatal(err)
	}
	job := jobs.Job{ID: strings.Repeat("e", 64), Kind: jobs.ExecutionKind, Safety: jobs.NoReplay, Payload: payload, Deadline: time.Now().Add(time.Minute).UnixMilli()}
	if err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error { _, err := q.Enqueue(ctx, tx, job); return err }); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.Handler("cross-language"))
	defer server.Close()
	probe := exec.CommandContext(ctx, "node", "testdata/executor-bridge.mjs", server.URL, string(id), t.TempDir(), strconv.Itoa(payloadBytes))
	out, err := probe.CombinedOutput()
	if err != nil {
		t.Fatalf("Node executor: %v\n%s", err, out)
	}
	err = sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
		result, err := q.ConsumeResult(ctx, tx, job.ID)
		if err != nil {
			return err
		}
		var response struct {
			OK    bool
			Value string
		}
		if err := json.Unmarshal(result, &response); err != nil {
			return err
		}
		if !response.OK || response.Value != strings.Repeat("y", payloadBytes) {
			t.Fatal("large result changed in transit")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
