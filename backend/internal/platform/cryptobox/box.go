// Package cryptobox preserves the existing Worker encryption format exactly.
package cryptobox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

type Box struct{ aead cipher.AEAD }

func New(secret string) (*Box, error) {
	if len(secret) < 32 {
		return nil, errors.New("encryption key must contain at least 32 bytes")
	}
	key := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

func (b *Box) Encrypt(plaintext, context string) (string, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := b.aead.Seal(nil, nonce, []byte(plaintext), []byte(context))
	return base64.StdEncoding.EncodeToString(nonce) + "." + base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (b *Box) Decrypt(value, context string) (string, error) {
	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return "", errors.New("invalid encrypted value")
	}
	nonce, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil || len(nonce) != b.aead.NonceSize() {
		return "", errors.New("invalid encrypted value")
	}
	ciphertext, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", errors.New("invalid encrypted value")
	}
	plaintext, err := b.aead.Open(nil, nonce, ciphertext, []byte(context))
	if err != nil {
		return "", errors.New("encrypted value authentication failed")
	}
	return string(plaintext), nil
}
