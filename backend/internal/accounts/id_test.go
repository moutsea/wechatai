package accounts_test

import (
	"strings"
	"testing"

	"github.com/moutsea/wechatai/backend/internal/accounts"
)

func TestImportedIdentityIsPreserved(t *testing.T) {
	legacy := strings.Repeat("abcdef01", 8)
	id, err := accounts.ParseID(legacy)
	if err != nil || string(id) != legacy {
		t.Fatalf("changed imported identity: %q %v", id, err)
	}
	for _, value := range []string{"", "../account", strings.ToUpper(legacy), legacy + "x"} {
		if _, err := accounts.ParseID(value); err == nil {
			t.Fatalf("accepted %q", value)
		}
	}
	first, err := accounts.NewID()
	if err != nil {
		t.Fatal(err)
	}
	second, err := accounts.NewID()
	if err != nil || first == second {
		t.Fatalf("new identity is not unique: %v", err)
	}
	if _, err := accounts.ParseID(string(first)); err != nil {
		t.Fatal(err)
	}
}
