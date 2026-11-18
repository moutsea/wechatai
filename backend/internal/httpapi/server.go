// Package httpapi terminates the internal HTTP contract. Domain modules own
// authorization against account state and their transactional business rules.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/moutsea/wechatai/backend/contract"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/moutsea/wechatai/backend/internal/rpc"
)

type Dispatcher interface {
	Dispatch(context.Context, rpc.Command) (json.RawMessage, error)
}

type Options struct {
	Receiver   Receiver
	Execute    executorHandler
	Signer     *rpc.Signer
	Dispatcher Dispatcher
	Features   contract.Providers
	Version    string
	Now        func() time.Time
	Logger     *slog.Logger
}

type requestKey struct{}

func RequestID(ctx context.Context) string { id, _ := ctx.Value(requestKey{}).(string); return id }

func Handler(options Options) http.Handler {
	if options.Signer == nil || options.Dispatcher == nil {
		panic("missing HTTP backend dependencies")
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.Logger == nil {
		options.Logger = slog.Default()
	}
	mux := http.NewServeMux()
	if options.Receiver != nil {
		mux.HandleFunc("GET /internal/v1/receiver/{account}/{epoch}", receiverTransport(options))
	}
	if options.Execute != nil {
		mux.HandleFunc("POST /internal/v1/executor/{account}/{epoch}/{action}", executorTransport(options))
	}
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "wechatai-backend", "version": options.Version})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		available := options.Features.Capabilities()
		missing := contract.Missing(available)
		status := http.StatusOK
		if len(missing) > 0 {
			status = http.StatusServiceUnavailable
		}
		writeJSON(w, status, map[string]any{"ok": len(missing) == 0, "protocol": rpc.Version, "version": options.Version, "capabilities": available, "missing": missing})
	})
	mux.HandleFunc("POST /internal/v1/commands", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RawQuery != "" {
			writeFailure(w, &rpc.Error{Code: "invalid_request", Message: "内部命令不接受查询参数", Status: 400})
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, contract.PayloadLimits.CommandBytes))
		if err != nil {
			writeFailure(w, &rpc.Error{Code: "body_too_large", Message: "内部请求内容过大或读取失败", Status: 413})
			return
		}
		if err := options.Signer.Verify(r, body); err != nil {
			writeFailure(w, &rpc.Error{Code: "unauthorized", Message: "内部请求鉴权失败", Status: 401})
			return
		}
		var command rpc.Command
		if err := json.Unmarshal(body, &command); err != nil {
			writeFailure(w, &rpc.Error{Code: "invalid_request", Message: "内部请求格式无效", Status: 400})
			return
		}
		if err := command.Validate(); err != nil {
			writeFailure(w, err)
			return
		}
		if command.Principal.Scope == rpc.Admin && command.Principal.AdminUntil <= options.Now().UnixMilli() {
			writeFailure(w, &rpc.Error{Code: "forbidden", Message: "管理员权限已过期", Status: 403})
			return
		}
		requestID := r.Header.Get(rpc.HeaderRequestID)
		ctx := context.WithValue(r.Context(), requestKey{}, requestID)
		data, err := options.Dispatcher.Dispatch(ctx, command)
		if err != nil {
			var domainError *rpc.Error
			if !errors.As(err, &domainError) {
				options.Logger.ErrorContext(ctx, "backend command failed", "request_id", requestID, "method", command.Method)
			}
			writeFailure(w, err)
			return
		}
		if !json.Valid(data) {
			options.Logger.ErrorContext(ctx, "backend handler returned invalid JSON", "request_id", requestID, "method", command.Method)
			writeFailure(w, errors.New("invalid backend result"))
			return
		}
		writeJSON(w, http.StatusOK, rpc.Result{OK: true, Data: data})
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		defer func() {
			if recover() != nil {
				options.Logger.ErrorContext(r.Context(), "backend handler panic")
				writeFailure(w, errors.New("handler panic"))
			}
		}()
		mux.ServeHTTP(w, r)
	})
}

func writeFailure(w http.ResponseWriter, err error) {
	failure := &rpc.Error{Code: "internal_error", Message: "服务暂时不可用，请稍后重试", Status: 500}
	var domainError *rpc.Error
	if errors.As(err, &domainError) && domainError.Status >= 400 && domainError.Status < 600 {
		failure = domainError
	}
	writeJSON(w, failure.Status, rpc.Result{OK: false, Error: failure})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
}
