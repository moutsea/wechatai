package cryptobox_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/platform/cryptobox"
)

func TestWorkerCiphertextCompatibilityAndAccountIsolation(t *testing.T) {
	data, err := os.ReadFile("testdata/worker.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct{ Secret, Context, Plaintext, Ciphertext string }
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	box, err := cryptobox.New(fixture.Secret)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := box.Decrypt(fixture.Ciphertext, fixture.Context)
	if err != nil || plain != fixture.Plaintext {
		t.Fatalf("Worker ciphertext changed: %q %v", plain, err)
	}
	if _, err := box.Decrypt(fixture.Ciphertext, strings.Repeat("a", 64)+":wechat"); err == nil {
		t.Fatal("decrypted another account's data")
	}
	if _, err := box.Decrypt(fixture.Ciphertext, fixture.Context+":other"); err == nil {
		t.Fatal("decrypted a different credential context")
	}
	first, err := box.Encrypt(fixture.Plaintext, fixture.Context)
	if err != nil {
		t.Fatal(err)
	}
	second, err := box.Encrypt(fixture.Plaintext, fixture.Context)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("encryption reused nonce")
	}
	got, err := box.Decrypt(first, fixture.Context)
	if err != nil || got != fixture.Plaintext {
		t.Fatalf("roundtrip failed: %q %v", got, err)
	}
	for _, value := range []string{"", "a.b", "...", first + ".extra"} {
		if _, err := box.Decrypt(value, fixture.Context); err == nil {
			t.Errorf("accepted malformed ciphertext %q", value)
		}
	}
}
