package rpc_test

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

func TestWorkerWebCryptoRequestVerifiesInGo(t *testing.T) {
	data, err := os.ReadFile("testdata/worker-request.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Secret                             string
		Timestamp                          int64
		RequestID, Origin, Body, Signature string
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	signer, err := rpc.NewSigner(fixture.Secret)
	if err != nil {
		t.Fatal(err)
	}
	signer.Now = func() time.Time { return time.UnixMilli(fixture.Timestamp) }
	request, err := http.NewRequest(http.MethodPost, fixture.Origin+"/internal/v1/commands", strings.NewReader(fixture.Body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set(rpc.HeaderTime, "1794960000000")
	request.Header.Set(rpc.HeaderRequestID, fixture.RequestID)
	request.Header.Set(rpc.HeaderSignature, fixture.Signature)
	if err := signer.Verify(request, []byte(fixture.Body)); err != nil {
		t.Fatal(err)
	}
	var command rpc.Command
	if err := json.Unmarshal([]byte(fixture.Body), &command); err != nil {
		t.Fatal(err)
	}
	if err := command.Validate(); err != nil {
		t.Fatal(err)
	}
}
