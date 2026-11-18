// Package app is the composition root and owns cross-module application flows.
// Atomic flows pass the same SQL transaction to the table-owning modules.
package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/moutsea/wechatai/backend/contract"
	"github.com/moutsea/wechatai/backend/internal/accounts"
	"github.com/moutsea/wechatai/backend/internal/httpapi"
	"github.com/moutsea/wechatai/backend/internal/platform/config"
	"github.com/moutsea/wechatai/backend/internal/platform/cryptobox"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/receiver"
	"github.com/moutsea/wechatai/backend/internal/rpc"
	"github.com/moutsea/wechatai/backend/internal/scheduler"
	"github.com/moutsea/wechatai/backend/internal/wechat"
)

type App struct {
	Accounts     *accounts.Store
	Registry     *rpc.Registry
	features     contract.Providers
	actions      accountActions
	tasks        []accountTask
	schedule     *scheduler.Engine
	wechatSender wechat.Sender
	receivers    *receiver.Hub
	polls        *receiver.Polls
	Signer       *rpc.Signer
	Box          *cryptobox.Box
	Config       config.Config
	Now          func() time.Time
}

func New(ctx context.Context, c config.Config) (*App, error) {
	signer, err := rpc.NewSigner(c.RPCSecret)
	if err != nil {
		return nil, err
	}
	box, err := cryptobox.New(c.EncryptionKey)
	if err != nil {
		return nil, err
	}
	var initializers []accounts.Initializer
	for _, schema := range businessSchemas() {
		initializers = append(initializers, schema.Apply)
	}
	store, err := accounts.NewStore(c.DataDir, c.MaxOpenAccounts, func(ctx context.Context, db *sql.DB) error {
		return sqlite.RequireCurrent(ctx, db, Schemas())
	}, initializers...)
	if err != nil {
		return nil, err
	}
	a := &App{receivers: receiver.NewHub(), polls: receiver.NewPolls(32), Accounts: store, Registry: rpc.NewRegistry(), Signer: signer, Box: box, Config: c, Now: time.Now}
	if err := a.register(); err != nil {
		store.Close()
		return nil, err
	}
	a.schedule, err = scheduler.New(backgroundRunner{a}, scheduler.Options{Workers: 4})
	if err != nil {
		store.Close()
		return nil, err
	}
	return a, nil
}

func (a *App) register() error {
	a.tasks = []accountTask{{"notifications", a.deliverNotice}, {"membershipReminders", a.deliverMembershipReminder}, {"receiver", a.reconcileReceiver}}
	a.features.Runtime = []contract.Provider{backgroundRunner{a}}
	a.features.Methods = []contract.Provider{a.Registry}
	a.actions = a.accountActions()
	a.features.Actions = []contract.Provider{a.actions}
	streamCommands := rpc.NewRegistry()
	if err := streamCommands.Register("imageAsset", a.imageAsset); err != nil {
		return err
	}
	a.features.Streams = []contract.Provider{streamCommands, receiverSocket{a}}
	for _, name := range streamCommands.Capabilities() {
		if err := a.Registry.Register(name, streamCommands.Dispatch); err != nil {
			return err
		}
	}
	for method, handler := range map[string]rpc.Handler{
		"connectorUpdateNotice": a.connectorUpdateNotice, "readConnectorUpdateNotice": a.readConnectorUpdateNotice,
		"agtCallback": a.agtCallback, "applyReferralReward": a.applyReferralReward, "receiverStatus": a.receiverStatus,
		"api": a.api, "identify": a.identify, "applyPayment": a.applyPayment,
		"notificationCredentialValid": a.notificationCredentialValid, "notificationRequest": a.notificationRequest,
		"adminStats": a.adminStats, "referralWechatIdentity": a.referralWechatIdentity,
		"adminMembership": a.adminMembership, "adminGiftPlus": a.adminGiftPlus,
		"migration.status": a.migration, "migration.freeze": a.migration, "migration.activate": a.migration,
	} {
		if err := a.Registry.Register(method, handler); err != nil {
			return err
		}
	}
	return nil
}

// CompiledCapabilities inspects the handlers without opening production data
// or requiring secrets. Release tools use it before stopping a running service.
func CompiledCapabilities() []string {
	a := &App{Registry: rpc.NewRegistry()}
	if err := a.register(); err != nil {
		panic(err)
	}
	return a.features.Capabilities()
}

func (a *App) Handler(version string) http.Handler {
	return httpapi.Handler(httpapi.Options{Receiver: receiverSocket{a}, Execute: a.execute, Signer: a.Signer, Dispatcher: a.Registry, Features: a.features, Version: version, Now: func() time.Time { return a.Now() }})
}

func (a *App) Close() error { a.receivers.Close(); return a.Accounts.Close() }

func (a *App) RunBackground(ctx context.Context) error {
	if !a.polls.Start(ctx) {
		return errors.New("account scheduler already running")
	}
	defer a.polls.Stop()
	return a.schedule.Run(ctx)
}
