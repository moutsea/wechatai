package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/moutsea/wechatai/backend/contract"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/app"
	"github.com/moutsea/wechatai/backend/internal/platform/config"
	"github.com/moutsea/wechatai/backend/internal/receiverwatchdog"
)

var version = "development"

func checkReady() error {
	missing := contract.Missing(app.CompiledCapabilities())
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": len(missing) == 0, "version": version, "protocol": contract.Load().Protocol, "missing": missing}); err != nil {
		return err
	}
	if len(missing) > 0 {
		return fmt.Errorf("backend has %d unimplemented capabilities; activation refused", len(missing))
	}
	return nil
}

func run() error {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "receiver-watchdog":
			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			return receiverwatchdog.Run(ctx)
		case "version":
			return json.NewEncoder(os.Stdout).Encode(map[string]string{"version": version, "protocol": contract.Load().Protocol})
		case "check-ready":
			return checkReady()
		case "check-standby":
			if len(os.Args) != 3 || os.Args[2] == "" {
				return errors.New("usage: wechatai check-standby <account-directory>")
			}
			return checkStandbyDirectory(os.Args[2])
		case "check-deployment":
			c, err := config.Load()
			if err != nil {
				return err
			}
			if c.Standby {
				return checkStandbyDirectory(c.DataDir)
			}
			if err := checkReady(); err != nil {
				return err
			}
			_, err = app.CheckData(context.Background(), c.DataDir)
			return err
		case "deployment-settings":
			c, err := config.Load()
			if err != nil {
				return err
			}
			settings, err := c.DeploymentSettings()
			if err != nil {
				return err
			}
			return json.NewEncoder(os.Stdout).Encode(settings)
		case "check-data", "inspect-data":
			if len(os.Args) != 3 {
				return fmt.Errorf("usage: wechatai %s <account-directory>", os.Args[1])
			}
			dir := os.Args[2]
			// An explicitly empty systemd override has the same meaning as
			// an unset value for the serving process.
			if dir == "" {
				dir = config.DataDirectory()
			}
			check := app.CheckData
			if os.Args[1] == "inspect-data" {
				check = app.InspectData
			}
			count, err := check(context.Background(), dir)
			if err != nil {
				return err
			}
			return json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": true, "version": version, "accounts": count})
		case "prepare-legacy", "upgrade-account", "recover-unbound":
			recovery := os.Args[1] == "recover-unbound"
			if recovery && len(os.Args) != 8 {
				return errors.New("usage: wechatai recover-unbound <backup-directory> <new-staging-directory> <account-id> <owner-id> <route-epoch> <original-identity.json>")
			}
			if !recovery && len(os.Args) != 7 {
				return fmt.Errorf("usage: wechatai %s <backup-directory> <new-staging-directory> <account-id> <owner-id> <route-epoch>", os.Args[1])
			}
			id, err := accounts.ParseID(os.Args[4])
			if err != nil {
				return err
			}
			epoch, err := strconv.ParseInt(os.Args[6], 10, 64)
			if err != nil {
				return err
			}
			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			switch os.Args[1] {
			case "prepare-legacy":
				err = app.PrepareLegacy(ctx, os.Args[2], os.Args[3], id, os.Args[5], epoch)
			case "upgrade-account":
				err = app.UpgradeAccount(ctx, os.Args[2], os.Args[3], id, os.Args[5], epoch)
			case "recover-unbound":
				err = app.RecoverUnbound(ctx, os.Args[2], os.Args[3], id, os.Args[5], epoch, os.Args[7])
			}
			if err != nil {
				return err
			}
			result := map[string]any{"ok": true, "accountId": id, "routeEpoch": epoch, "destination": os.Args[3]}
			if os.Args[1] != "upgrade-account" {
				result["phase"] = "prepared"
			}
			return json.NewEncoder(os.Stdout).Encode(result)
		case "backup-data":
			if len(os.Args) != 4 {
				return errors.New("usage: wechatai backup-data <account-directory> <new-backup-directory>")
			}
			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			manifest, err := app.BackupData(ctx, os.Args[2], os.Args[3])
			if err != nil {
				return err
			}
			return json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": true, "accounts": len(manifest.Accounts), "destination": os.Args[3]})
		case "serve":
		default:
			return errors.New("usage: wechatai [serve|receiver-watchdog|version|check-ready|check-deployment|check-standby|deployment-settings|check-data|inspect-data|backup-data|prepare-legacy|recover-unbound|upgrade-account]")
		}
	}
	configuration, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if configuration.Standby {
		if err := checkStandbyDirectory(configuration.DataDir); err != nil {
			return err
		}
		return serveHTTP(ctx, configuration.Listen, standbyHandler(), nil)
	}
	application, err := app.New(ctx, configuration)
	if err != nil {
		return err
	}
	defer application.Close()
	background := make(chan error, 1)
	go func() { defer close(background); background <- application.RunBackground(ctx) }()
	defer func() { stop(); <-background }()
	return serveHTTP(ctx, configuration.Listen, application.Handler(version), background)
}

func serveHTTP(ctx context.Context, address string, handler http.Handler, background <-chan error) error {
	server := &http.Server{Addr: address, Handler: handler, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 15 * time.Minute, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 32768}
	completed := make(chan error, 1)
	go func() { completed <- server.ListenAndServe() }()
	slog.Info("backend listening", "address", address, "version", version)
	select {
	case err := <-completed:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case backgroundErr := <-background:
		if ctx.Err() == nil {
			server.Close()
			<-completed
			return fmt.Errorf("background scheduler stopped: %w", backgroundErr)
		}
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdown); err != nil {
		server.Close()
		return err
	}
	if err := <-completed; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func main() {
	if err := run(); err != nil {
		slog.Error("backend stopped", "error", err.Error())
		os.Exit(1)
	}
}
