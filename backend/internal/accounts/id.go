// Package accounts owns stable account identities and account database access.
// An account ID is also an encryption context and an external routing identity;
// imported IDs must never be regenerated from a user ID or a new namespace.
package accounts

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"regexp"
)

type ID string

var ErrInvalidID = errors.New("invalid account ID")
var idPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func ParseID(value string) (ID, error) {
	if !idPattern.MatchString(value) {
		return "", ErrInvalidID
	}
	return ID(value), nil
}

// NewID is only for newly registered accounts. Migration uses ParseID instead.
func NewID() (ID, error) {
	var value [32]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return ID(hex.EncodeToString(value[:])), nil
}
