package rpc

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const HeaderTime = "X-Wechatai-Time"
const HeaderRequestID = "X-Wechatai-Request-Id"
const HeaderSignature = "X-Wechatai-Signature"
const MaxClockSkew = time.Minute

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{8,128}$`)

type Signer struct {
	secret []byte
	Now    func() time.Time
}

func NewSigner(secret string) (*Signer, error) {
	if len(secret) < 32 {
		return nil, errors.New("backend RPC secret must contain at least 32 bytes")
	}
	return &Signer{secret: []byte(secret)}, nil
}

func (s Signer) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s Signer) signature(method, uri, timestamp, requestID string, digest [sha256.Size]byte) []byte {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(strings.Join([]string{Version, method, uri, timestamp, requestID, hex.EncodeToString(digest[:])}, "\n")))
	return mac.Sum(nil)
}

func (s Signer) Sign(request *http.Request, body []byte, requestID string) error {
	if !requestIDPattern.MatchString(requestID) {
		return errors.New("invalid backend request ID")
	}
	timestamp := strconv.FormatInt(s.now().UnixMilli(), 10)
	request.Header.Set(HeaderTime, timestamp)
	request.Header.Set(HeaderRequestID, requestID)
	request.Header.Set(HeaderSignature, base64.RawURLEncoding.EncodeToString(s.signature(request.Method, request.URL.RequestURI(), timestamp, requestID, sha256.Sum256(body))))
	return nil
}

// Verify authenticates the exact bytes, method and request target. Business
// idempotency is enforced separately using stable event/job/command IDs; a
// valid signature alone never authorizes replaying an external side effect.
func (s Signer) Verify(request *http.Request, body []byte) error {
	return s.VerifyDigest(request, sha256.Sum256(body))
}

func (s Signer) VerifyDigest(request *http.Request, digest [sha256.Size]byte) error {
	timestamp := request.Header.Get(HeaderTime)
	requestID := request.Header.Get(HeaderRequestID)
	at, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || at < 1 || !requestIDPattern.MatchString(requestID) {
		return ErrUnauthorized
	}
	now := s.now().UnixMilli()
	if at < now-MaxClockSkew.Milliseconds() || at > now+MaxClockSkew.Milliseconds() {
		return ErrUnauthorized
	}
	actual, err := base64.RawURLEncoding.DecodeString(request.Header.Get(HeaderSignature))
	if err != nil || !hmac.Equal(actual, s.signature(request.Method, request.URL.RequestURI(), timestamp, requestID, digest)) {
		return ErrUnauthorized
	}
	return nil
}
