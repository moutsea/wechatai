package config

import (
	"encoding/json"
	"github.com/moutsea/wechatai/backend/internal/platform/cryptobox"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func environment(t *testing.T) {
	t.Helper()
	for _, name := range []string{"WECHATAI_LISTEN", "WECHATAI_DATA_DIR", "WECHATAI_MAX_OPEN_ACCOUNTS", "WECHATAI_RPC_SECRET", "WECHATAI_RPC_SECRET_FILE", "ENCRYPTION_KEY", "ENCRYPTION_KEY_FILE", "FREE_DAILY_CREDITS", "PLUS_DAILY_CREDITS"} {
		t.Setenv(name, "")
	}
	t.Setenv("WECHATAI_RPC_SECRET", "test-only-rpc-secret-at-least-32-bytes")
	t.Setenv("ENCRYPTION_KEY", "test-only-encryption-key-at-least-32-bytes")
}

func TestWorkerEncryptionKeyFromEnvironmentAndFile(t *testing.T) {
	environment(t)
	data, err := os.ReadFile("../cryptobox/testdata/worker.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct{ Secret, Context, Ciphertext, Plaintext string }
	if err = json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	value := "\ufeff " + fixture.Secret + " \r\n"
	file := filepath.Join(t.TempDir(), "key")
	if err = os.WriteFile(file, []byte(value), 0600); err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{"environment", "file"} {
		t.Run(source, func(t *testing.T) {
			t.Setenv("ENCRYPTION_KEY", value)
			if source == "file" {
				t.Setenv("ENCRYPTION_KEY", "")
				t.Setenv("ENCRYPTION_KEY_FILE", file)
			}
			c, err := Load()
			if err != nil {
				t.Fatal(err)
			}
			box, err := cryptobox.New(c.EncryptionKey)
			if err != nil {
				t.Fatal(err)
			}
			plain, err := box.Decrypt(fixture.Ciphertext, fixture.Context)
			if err != nil || plain != fixture.Plaintext {
				t.Fatalf("legacy ciphertext: %v", err)
			}
		})
	}
}

func TestDeploymentExampleCannotAuthorizeRPC(t *testing.T) {
	environment(t)
	for _, v := range []string{"", "REPLACE_WITH_A_SEPARATE_RANDOM_RPC_SECRET"} {
		t.Setenv("WECHATAI_RPC_SECRET", v)
		if _, err := Load(); err == nil {
			t.Fatal("example RPC secret accepted")
		}
	}
}

func TestInvalidSettingsDoNotEchoCredentials(t *testing.T) {
	environment(t)
	secret := "test-only-super-private-value-at-least-32"
	t.Setenv("ENCRYPTION_KEY", secret)
	t.Setenv("ENCRYPTION_KEY_FILE", "/missing/secret-file")
	if _, err := Load(); err == nil || strings.Contains(err.Error(), secret) {
		t.Fatal("ambiguous secrets accepted or leaked")
	}
	t.Setenv("ENCRYPTION_KEY_FILE", "")
	for _, value := range []string{"NaN", "Inf", "-1", "9007199254741"} {
		t.Setenv("FREE_DAILY_CREDITS", value)
		if _, err := Load(); err == nil {
			t.Fatalf("accepted invalid credits %s", value)
		}
	}
}

func TestDeploymentUsesConfiguredServiceCoordinates(t *testing.T) {
	environment(t)
	state := t.TempDir()
	t.Setenv("STATE_DIRECTORY", state)
	c, err := Load()
	if err != nil || c.DataDir != filepath.Join(state, "accounts") {
		t.Fatalf("default data: %q %v", c.DataDir, err)
	}
	t.Setenv("WECHATAI_DATA_DIR", filepath.Join(state, "custom directory"))
	t.Setenv("WECHATAI_LISTEN", "[::1]:9182")
	c, err = Load()
	if err != nil {
		t.Fatal(err)
	}
	settings, err := c.DeploymentSettings()
	if err != nil || settings.DataDir != c.DataDir || settings.HealthOrigin != "http://[::1]:9182" {
		t.Fatalf("settings: %+v %v", settings, err)
	}
	for listen, want := range map[string]string{":8123": "http://127.0.0.1:8123", "[::]:8123": "http://[::1]:8123", "192.0.2.1:8123": "http://192.0.2.1:8123"} {
		c.Listen = listen
		got, err := c.DeploymentSettings()
		if err != nil || got.HealthOrigin != want {
			t.Fatalf("probe for %s: %v %v", listen, got, err)
		}
	}
	c.Listen = "127.0.0.1:0"
	if _, err := c.DeploymentSettings(); err == nil {
		t.Fatal("ephemeral port cannot support release probes")
	}
}
