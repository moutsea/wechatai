package app_test

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/iotest"
	"time"

	"github.com/google/uuid"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/app"
	"github.com/moutsea/wechatai/backend/internal/jobs"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func postExecutor(t *testing.T, a *app.App, account accounts.ID, action string, body []byte, epoch string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/internal/v1/executor/"+string(account)+"/"+epoch+"/"+action, bytes.NewReader(body))
	sum := sha256.Sum256(body)
	req.Header.Set("X-Wechatai-Body-SHA256", hex.EncodeToString(sum[:]))
	if err := a.Signer.Sign(req, body, "executor-fixture-id"); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	a.Handler("test").ServeHTTP(w, req)
	return w
}

func TestExecutorIncompleteUploadCanRetry(t *testing.T) {
	a, id := setup(t)
	body := []byte("saved-receipt")
	req := httptest.NewRequest("POST", "/internal/v1/executor/"+string(id)+"/1/complete", bytes.NewReader(body))
	sum := sha256.Sum256(body)
	req.Header.Set("X-Wechatai-Body-SHA256", hex.EncodeToString(sum[:]))
	if err := a.Signer.Sign(req, body, "test-short-upload"); err != nil {
		t.Fatal(err)
	}
	req.Body = io.NopCloser(io.MultiReader(bytes.NewReader(body[:3]), iotest.ErrReader(io.ErrUnexpectedEOF)))
	w := httptest.NewRecorder()
	a.Handler("test").ServeHTTP(w, req)
	if w.Code != 503 || !strings.Contains(w.Body.String(), "upload_interrupted") {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestExecutorLargeClaimCompletionAndAtomicConsumption(t *testing.T) {
	a, account := setup(t)
	ctx := t.Context()
	h, err := a.Accounts.Acquire(ctx, account, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	q := jobs.Queue{Now: a.Now, Box: a.Box, AccountID: account}
	jobID := strings.Repeat("e", 64)
	message := strings.Repeat("m", 3<<20)
	in, err := json.Marshal(map[string]any{"kind": "attachments", "text": message})
	if err != nil {
		t.Fatal(err)
	}
	intent := jobs.Job{ID: jobID, Kind: jobs.ExecutionKind, Payload: in, Safety: jobs.NoReplay, Deadline: a.Now().Add(time.Minute).UnixMilli()}
	if err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error { _, err := q.Enqueue(ctx, tx, intent); return err }); err != nil {
		t.Fatal(err)
	}
	stored, err := q.Get(ctx, h.DB, jobID)
	if err != nil || stored == nil || bytes.Contains(stored.Payload, []byte(message[:80])) {
		t.Fatal("executor plaintext persisted")
	}
	if w := postExecutor(t, a, account, "claim", []byte("{}"), "2"); w.Code != 409 {
		t.Fatalf("stale account epoch: %d", w.Code)
	}
	w := postExecutor(t, a, account, "claim", []byte("{}"), "1")
	var claim struct {
		Data struct {
			ID, Lease string
			ExpiresAt int64
			Input     json.RawMessage
		}
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &claim) != nil || claim.Data.ID != jobID || !bytes.Equal(claim.Data.Input, in) {
		t.Fatal("large claim did not preserve input")
	}
	lease, err := uuid.Parse(claim.Data.Lease)
	if err != nil || lease.Version() != 4 || claim.Data.ExpiresAt != intent.Deadline {
		t.Fatal("incompatible lease")
	}
	complete := func(value string) *httptest.ResponseRecorder {
		body, err := json.Marshal(map[string]any{"id": jobID, "lease": claim.Data.Lease, "result": map[string]any{"ok": true, "value": value}})
		if err != nil {
			t.Fatal(err)
		}
		return postExecutor(t, a, account, "complete", body, "1")
	}
	if w := complete(message); w.Code != 200 || !strings.Contains(w.Body.String(), "\"accepted\":true") {
		t.Fatalf("completion: %d", w.Code)
	}
	stored, err = q.Get(ctx, h.DB, jobID)
	if err != nil || len(stored.Payload) != 0 || len(stored.Result) < len(message) {
		t.Fatal("incorrect retention before consumption")
	}
	abort := errors.New("downstream commit failed")
	err = sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
		b, err := q.ConsumeResult(ctx, tx, jobID)
		if err != nil {
			return err
		}
		if len(b) < len(message) {
			t.Fatal("missing result before rollback")
		}
		return abort
	})
	if !errors.Is(err, abort) {
		t.Fatal(err)
	}
	if err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
		b, err := q.ConsumeResult(ctx, tx, jobID)
		if err != nil {
			return err
		}
		if len(b) < len(message) {
			t.Fatal("lost result during rollback")
		}
		again, err := q.ConsumeResult(ctx, tx, jobID)
		if again != nil {
			t.Fatal("duplicate consumption")
		}
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if w := complete(message); w.Code != 200 {
		t.Fatal("did not acknowledge identical result after consumption")
	}
	if w := complete("changed"); w.Code != 409 {
		t.Fatal("accepted different result after consumption")
	}
	stored, err = q.Get(ctx, h.DB, jobID)
	if err != nil || len(stored.Payload) != 0 || stored.Result != nil {
		t.Fatal("replay restored a consumed body")
	}
}

func TestFreezeDrainsAcrossRestartAndFencesLateReceipts(t *testing.T) {
	for _, name := range []string{"on-time", "late-before-recovery", "late-after-recovery"} {
		late := name != "on-time"
		t.Run(name, func(t *testing.T) {
			a, id := setup(t)
			clock := a.Now()
			a.Now = func() time.Time { return clock }
			a.Signer.Now = a.Now
			ctx := t.Context()
			q := jobs.Queue{Box: a.Box, Now: a.Now, AccountID: id}
			h, err := a.Accounts.Acquire(ctx, id, false)
			if err != nil {
				t.Fatal(err)
			}
			jobID := strings.Repeat("d", 64)
			err = sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
				_, err := q.Enqueue(ctx, tx, jobs.Job{ID: jobID, Kind: jobs.ExecutionKind, Safety: jobs.NoReplay, Payload: json.RawMessage(`{"kind":"attachments","items":[],"timeoutMs":120000}`)})
				return err
			})
			h.Close()
			if err != nil {
				t.Fatal(err)
			}
			claim := postExecutor(t, a, id, "claim", []byte("{}"), "1")
			var response struct {
				Data struct {
					ID, Lease string
					ExpiresAt int64
				}
			}
			if json.Unmarshal(claim.Body.Bytes(), &response) != nil || response.Data.ID != jobID {
				t.Fatal(claim.Body.String())
			}
			migrate := func(method string) *httptest.ResponseRecorder {
				return call(t, a, id, rpc.Migration, "", "migration."+method, []any{}, 1, true)
			}
			if w := migrate("freeze"); w.Code != 409 || !strings.Contains(w.Body.String(), "account_draining") {
				t.Fatal(w.Code, w.Body.String())
			}
			if err := a.Close(); err != nil {
				t.Fatal(err)
			}
			a, err = app.New(ctx, a.Config)
			if err != nil {
				t.Fatal(err)
			}
			defer a.Close()
			a.Now = func() time.Time { return clock }
			a.Signer.Now = a.Now
			if w := migrate("status"); !strings.Contains(w.Body.String(), `"phase":"draining"`) {
				t.Fatal(w.Code, w.Body.String())
			}
			if w := postExecutor(t, a, id, "claim", []byte("{}"), "1"); w.Code != 503 {
				t.Fatal("claimed during drain", w.Code)
			}
			h, err = a.Accounts.Acquire(ctx, id, false)
			if err != nil {
				t.Fatal(err)
			}
			defer h.Close()
			if late {
				clock = time.UnixMilli(response.Data.ExpiresAt + 1)
			}
			if name == "late-after-recovery" {
				if err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error { return q.Recover(ctx, tx) }); err != nil {
					t.Fatal(err)
				}
			}
			result := func(v, lease string) []byte {
				b, err := json.Marshal(map[string]any{"id": jobID, "lease": lease, "result": map[string]any{"ok": true, "value": v}})
				if err != nil {
					t.Fatal(err)
				}
				return b
			}
			payload := result("original", response.Data.Lease)
			if w := postExecutor(t, a, id, "complete", result("wrong", uuid.NewString()), "1"); !strings.Contains(w.Body.String(), `"stale":true`) {
				t.Fatal(w.Body.String())
			}
			if w := postExecutor(t, a, id, "complete", payload, "2"); w.Code != 409 {
				t.Fatal("wrong epoch accepted", w.Code)
			}
			if w := postExecutor(t, a, id, "complete", payload, "1"); !strings.Contains(w.Body.String(), `"accepted":true`) {
				t.Fatal(w.Code, w.Body.String())
			}
			if w := migrate("freeze"); w.Code != 200 || !strings.Contains(w.Body.String(), `"phase":"frozen"`) {
				t.Fatal(w.Code, w.Body.String())
			}
			// The acknowledgement may be lost on the network during the cutover.
			if w := postExecutor(t, a, id, "complete", payload, "1"); !strings.Contains(w.Body.String(), `"accepted":true`) {
				t.Fatal(w.Body.String())
			}
			if w := postExecutor(t, a, id, "complete", result("different", response.Data.Lease), "1"); w.Code != 409 {
				t.Fatal(w.Code)
			}
			job, err := q.Get(ctx, h.DB, jobID)
			if err != nil || !bytes.Contains(job.Result, []byte("original")) {
				t.Fatal("lost receipt", err)
			}
			if late {
				if job.State != "uncertain" {
					t.Fatal(job.State)
				}
				if err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
					b, err := q.ConsumeResult(ctx, tx, jobID)
					if len(b) != 0 {
						t.Fatal("late receipt delivered as business result")
					}
					return err
				}); err != nil {
					t.Fatal(err)
				}
			} else if job.State != "complete" {
				t.Fatal(job.State)
			}
		})
	}
}
