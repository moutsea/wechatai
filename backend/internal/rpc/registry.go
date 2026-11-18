package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
)

type Handler func(context.Context, Command) (json.RawMessage, error)

// Registry is assembled before serving requests and then immutable. Every
// reported capability corresponds to a registered application handler.
type Registry struct{ handlers map[string]Handler }

func NewRegistry() *Registry { return &Registry{handlers: map[string]Handler{}} }

func (r *Registry) Register(name string, handler Handler) error {
	if name == "" || handler == nil || r.handlers[name] != nil {
		return fmt.Errorf("invalid or duplicate backend handler %q", name)
	}
	if _, allowed := allowedScopes[name]; !allowed {
		return fmt.Errorf("backend handler %q has no capability policy", name)
	}
	r.handlers[name] = handler
	return nil
}

func (r *Registry) Capabilities() []string {
	names := make([]string, 0, len(r.handlers))
	for name := range r.handlers {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

func (r *Registry) Dispatch(ctx context.Context, command Command) (json.RawMessage, error) {
	if err := command.Validate(); err != nil {
		return nil, err
	}
	handler := r.handlers[command.Method]
	if handler == nil {
		return nil, &Error{Code: "backend_not_ready", Message: "此后端功能尚未就绪，账户不能切换到 VPS", Status: 503}
	}
	return handler(ctx, command)
}
