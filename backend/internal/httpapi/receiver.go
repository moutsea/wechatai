package httpapi

import (
	"context"
	"crypto/sha256"
	"net/http"
	"strconv"

	"github.com/coder/websocket"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type Receiver interface {
	Check(context.Context, accounts.ID, int64) error
	Serve(context.Context, accounts.ID, int64, *websocket.Conn)
}

func receiverTransport(o Options) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RawQuery != "" || r.ContentLength > 0 || o.Signer.VerifyDigest(r, sha256.Sum256(nil)) != nil {
			writeFailure(w, &rpc.Error{Code: "unauthorized", Message: "内部请求鉴权失败", Status: 401})
			return
		}
		id, err := accounts.ParseID(r.PathValue("account"))
		epoch, e := strconv.ParseInt(r.PathValue("epoch"), 10, 64)
		if err != nil || e != nil || epoch < 1 {
			writeFailure(w, &rpc.Error{Code: "invalid_account", Message: "账户标识无效", Status: 400})
			return
		}
		if err = o.Receiver.Check(r.Context(), id, epoch); err != nil {
			writeFailure(w, err)
			return
		}
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()
		o.Receiver.Serve(r.Context(), id, epoch, conn)
	}
}
