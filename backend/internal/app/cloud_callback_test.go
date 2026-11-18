package app_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/cloudagent"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
)

func TestCallbackAndCancellationPreserveSettlementAndBackoff(t *testing.T) {
	a, id := setup(t)
	ctx := context.Background()
	h, err := a.Accounts.Acquire(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	var now int64 = 1900000000000
	const task = "cloud-task"
	_, err = h.DB.Exec(`INSERT INTO cloud_tasks(id,pluginId,sessionId,connectionId,state,jobId,createdAt,updatedAt,deadline,nextAt,data) VALUES('cloud-task','cloud','chat','link','accepted','job',1,2,999,99,'{"callbackVersion":"old","tenantId":"tenant","origin":"https://agt","appId":"app"}');
	 INSERT INTO cloud_task_images VALUES('cloud-task','123',0,X'01');
	 INSERT INTO cloud_provision VALUES(1,json_object('externalId',?,'workspaceId','workspace','appUserId','user','scope',json_array('https://agt','app','tenant')||''))`, "wechatai:"+string(id))
	if err != nil {
		t.Fatal(err)
	}
	old := "test-old-callback-key-32-characters-long"
	keys := cloudagent.CallbackKeys{Current: "new", Versions: map[string]string{"old": old, "new": "test-new-callback-key-32-characters-long"}, Legacy: old}
	raw := []byte(`{"id":"delivery","type":"completed","callbackJobId":"job","tenantId":"tenant","workspaceId":"workspace","data":{"result":"private","status":"completed"}}`)
	mac := hmac.New(sha256.New, []byte(old))
	mac.Write([]byte("wechatai-agt-callback-v1:" + string(id) + ":" + task))
	secret := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	receive := func() (cloudagent.CallbackResult, error) {
		ts := strconv.FormatInt(now/1000, 10)
		m := hmac.New(sha256.New, []byte(secret))
		m.Write([]byte(ts + "."))
		m.Write(raw)
		headers := cloudagent.CallbackHeaders{Delivery: "delivery", Event: "completed", Timestamp: ts, Signature: "sha256=" + hex.EncodeToString(m.Sum(nil))}
		var result cloudagent.CallbackResult
		err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error {
			var err error
			result, err = cloudagent.ReceiveCallback(ctx, tx, keys, string(id), task, raw, headers, now)
			return err
		})
		return result, err
	}
	if r, err := receive(); err != nil || !r.OK {
		t.Fatal(r, err)
	}
	var next int64
	var records, images, charges, settled int
	var data string
	read := func() {
		t.Helper()
		err := h.DB.QueryRow(`SELECT nextAt,settled,data,(SELECT count(*) FROM cloud_callbacks),(SELECT count(*) FROM cloud_task_images),(SELECT count(*) FROM credit_ledger) FROM cloud_tasks WHERE id=?`, task).Scan(&next, &settled, &data, &records, &images, &charges)
		if err != nil {
			t.Fatal(err)
		}
	}
	read()
	if next != now || records != 1 || images != 0 || charges != 0 || settled != 0 {
		t.Fatal(next, records, images, charges, settled)
	}
	if _, err = h.DB.Exec("UPDATE cloud_tasks SET nextAt=789"); err != nil {
		t.Fatal(err)
	}
	now += 2000
	if r, err := receive(); err != nil || !r.OK {
		t.Fatal(r, err)
	}
	read()
	if next != 789 || records != 1 {
		t.Fatal("duplicate overrode retry backoff")
	}
	delete(keys.Versions, "old")
	if _, err := receive(); err == nil {
		t.Fatal("removed key accepted through fallback")
	}
	cancel := func() cloudagent.Task {
		t.Helper()
		var result cloudagent.Task
		err := sqlite.Within(ctx, h.DB, func(tx *sql.Tx) error { var err error; result, err = cloudagent.Cancel(ctx, tx, task, now); return err })
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	if result := cancel(); !result.Stopping || result.Credits != nil {
		t.Fatal(result)
	}
	if _, err = h.DB.Exec("UPDATE cloud_tasks SET nextAt=999"); err != nil {
		t.Fatal(err)
	}
	cancel()
	read()
	var stored map[string]json.RawMessage
	if json.Unmarshal([]byte(data), &stored) != nil || stored["stopReason"] == nil || stored["result"] != nil || stored["outcome"] != nil || charges != 0 || next != 999 {
		t.Fatal("receipt changed settlement or lost stop backoff", data, charges, next)
	}
	if _, err = h.DB.Exec(`UPDATE cloud_tasks SET stopRequested=0,data=json_set(data,'$.outcome',json('{"status":"completed","attachments":[{}]}'))`); err != nil {
		t.Fatal(err)
	}
	result := cancel()
	if !result.CanCancelFiles || !result.Stopping || result.Status != "finalizing" {
		t.Fatal(result)
	}
	var flag bool
	if err = h.DB.QueryRow("SELECT stopRequested FROM cloud_tasks").Scan(&flag); err != nil || flag {
		t.Fatal("file transfer requested upstream cancellation", err)
	}
}
