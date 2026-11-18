package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/moutsea/wechatai/backend/contract"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type executorHandler func(context.Context, accounts.ID, int64, string, []byte) (any, error)

// The MAC covers the account, epoch, action, and SHA-256 of the original
// executor body. Authenticate the declared digest before reading a large body.
func executorTransport(o Options) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, idErr := accounts.ParseID(r.PathValue("account"))
		epoch, err := strconv.ParseInt(r.PathValue("epoch"), 10, 64)
		action := r.PathValue("action")
		if idErr != nil || err != nil || epoch < 1 || epoch > 1<<53-1 || r.URL.RawQuery != "" || (action != "claim" && action != "complete") {
			writeFailure(w, &rpc.Error{Code: "invalid_request", Message: "执行器路由无效", Status: 400})
			return
		}
		digest, err := hex.DecodeString(r.Header.Get("X-Wechatai-Body-SHA256"))
		if err != nil || len(digest) != sha256.Size || o.Signer.VerifyDigest(r, [sha256.Size]byte(digest)) != nil {
			writeFailure(w, &rpc.Error{Code: "unauthorized", Message: "内部请求鉴权失败", Status: 401})
			return
		}
		limit := contract.PayloadLimits.CommandBytes
		if action == "complete" {
			limit = int64(contract.PayloadLimits.ExecutionBytes)
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
		if err != nil {
			var oversized *http.MaxBytesError
			if errors.As(err, &oversized) {
				writeFailure(w, &rpc.Error{Code: "body_too_large", Message: "执行数据过大", Status: 413})
			} else {
				writeFailure(w, &rpc.Error{Code: "upload_interrupted", Message: "执行数据传输中断，请重试", Status: 503})
			}
			return
		}
		if sha256.Sum256(body) != [sha256.Size]byte(digest) {
			writeFailure(w, &rpc.Error{Code: "unauthorized", Message: "内部请求正文校验失败", Status: 401})
			return
		}
		data, err := o.Execute(r.Context(), id, epoch, action, body)
		if err != nil {
			writeFailure(w, err)
			return
		}
		writeJSON(w, 200, struct {
			Data any `json:"data"`
		}{data})
	}
}
