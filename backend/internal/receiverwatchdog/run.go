package receiverwatchdog

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"
)

func Run(ctx context.Context) error {
	u, err := url.Parse(os.Getenv("WECHATAI_ENDPOINT"))
	if err != nil {
		return err
	}
	if u.String() == "" {
		u = &url.URL{Scheme: "https", Host: "wechatai.app"}
	}
	if u.Scheme != "https" || u.Hostname() == "" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("WECHATAI_ENDPOINT must be an HTTPS origin")
	}
	port := os.Getenv("HEALTH_PORT")
	if port == "" {
		port = "18180"
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return errors.New("invalid receiver HEALTH_PORT")
	}
	secret := os.Getenv("WECHAT_RECEIVER_SECRET")
	if len(secret) < 32 {
		return errors.New("missing receiver operator secret")
	}
	supervisor := Supervisor{
		ReceiverURL: "http://127.0.0.1:" + port + "/watchdog",
		EdgeURL:     "https://" + u.Host,
		Secret:      secret,
		Client: &http.Client{
			Timeout:       8 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		check, cancel := context.WithTimeout(ctx, 45*time.Second)
		err := supervisor.Check(check)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Warn("receiver watchdog check failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}
