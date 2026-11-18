//go:build receiver_integration

package receiverwatchdog

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

// Exercise the real Node transport, hibernating workerd socket, D1 registry and
// Go scan. Only WeChat polling and the time of a missed pong are simulated.
func TestReceiverHandoff(t *testing.T) {
	// The child is an independent OS process executing the same entry point as
	// "wechatai receiver-watchdog", with trust scoped to this local TLS fixture.
	if ca := os.Getenv("WECHATAI_TEST_WATCHDOG_CA"); ca != "" {
		pem, err := os.ReadFile(ca)
		if err != nil {
			t.Fatal(err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			t.Fatal("invalid fixture certificate")
		}
		tr := http.DefaultTransport.(*http.Transport).Clone()
		tr.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
		http.DefaultTransport = tr
		ctx, stop := signal.NotifyContext(t.Context(), syscall.SIGTERM)
		defer stop()
		if err := Run(ctx); err != nil {
			t.Fatal(err)
		}
		return
	}
	ctx, cancel := context.WithTimeout(t.Context(), 45*time.Second)
	defer cancel()
	root := t.TempDir()
	cmd := exec.CommandContext(ctx, "node", "testdata/bridge.mjs", root)
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	in, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait(); close(done) }()
	defer func() {
		in.Close()
		if err := <-done; err != nil || t.Failed() {
			t.Log(output.String())
			if err != nil {
				t.Error(err)
			}
		}
	}()
	var endpoints struct{ Edge, Local string }
	for {
		data, err := os.ReadFile(filepath.Join(root, "endpoints.json"))
		if err == nil {
			if err = json.Unmarshal(data, &endpoints); err != nil {
				t.Fatal(err)
			}
			break
		}
		select {
		case err := <-done:
			t.Fatalf("fixture exited: %v", err)
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		case <-time.After(50 * time.Millisecond):
		}
	}
	client := &http.Client{Timeout: 12 * time.Second}
	// Run the VPS service over TLS. Only the transport to the isolated workerd
	// origin is proxied; the production Worker handles auth and every command.
	upstream, err := url.Parse(endpoints.Edge)
	if err != nil {
		t.Fatal(err)
	}
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	beats := make(chan struct{}, 1)
	edge := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxy.ServeHTTP(w, r)
		if r.URL.Path == route+"/heartbeat" {
			beats <- struct{}{}
		}
	}))
	defer edge.Close()
	ca := filepath.Join(root, "local-test-ca.pem")
	if err := os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: edge.Certificate().Raw}), 0600); err != nil {
		t.Fatal(err)
	}
	local, err := url.Parse(endpoints.Local)
	if err != nil {
		t.Fatal(err)
	}
	scan := func() {
		t.Helper()
		cli := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestReceiverHandoff$")
		cli.Env = append(os.Environ(), "WECHATAI_TEST_WATCHDOG_CA="+ca, "HEALTH_PORT="+local.Port(), "WECHATAI_ENDPOINT="+edge.URL, "WECHAT_RECEIVER_SECRET=local-only-receiver-bearer-credential")
		var logs bytes.Buffer
		cli.Stderr = &logs
		if err := cli.Start(); err != nil {
			t.Fatal(err)
		}
		select {
		case <-beats:
			cli.Process.Signal(syscall.SIGTERM)
			if err := cli.Wait(); err != nil {
				t.Fatal(err, logs.String())
			}
		case <-ctx.Done():
			cli.Wait()
			t.Fatal(ctx.Err(), logs.String())
		}
	}
	get := func(url string, out any) {
		t.Helper()
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			t.Fatal(err)
		}
		res, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			b, _ := io.ReadAll(res.Body)
			t.Fatal(res.Status, string(b))
		}
		if out != nil {
			if err = json.NewDecoder(res.Body).Decode(out); err != nil {
				t.Fatal(err)
			}
		}
	}
	status := func(owner string, calls int, minimum, maximum time.Duration) {
		t.Helper()
		var v struct {
			Watchdog   string
			Recoveries int
			NextAlarm  int64
		}
		get(endpoints.Edge+"/fixture/inspect", &v)
		delay := time.Until(time.UnixMilli(v.NextAlarm))
		if v.Watchdog != owner || v.Recoveries != calls || delay < minimum || delay > maximum {
			t.Fatal(v, delay)
		}
	}
	scan()
	get(endpoints.Local+"/start", nil)
	for range 3 {
		scan()
	}
	status("vps", 0, 14*time.Minute, 15*time.Minute+time.Second)
	get(endpoints.Local+"/stale", nil)
	scan()
	status("account", 1, 0, time.Minute+time.Second)
	scan()
	status("account", 1, 0, time.Minute+time.Second)
}
