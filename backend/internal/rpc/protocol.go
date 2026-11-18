// Package rpc defines the authenticated edge-to-backend contract. It contains
// no business SQL and cannot turn a caller-selected method into arbitrary RPC.
package rpc

import (
	"encoding/json"
	"errors"
	"slices"

	"github.com/moutsea/wechatai/backend/internal/accounts"
)

const Version = "wechatai-rpc-v1"

type Scope string

const (
	User          Scope = "user"
	Admin         Scope = "admin"
	Billing       Scope = "billing"
	Connector     Scope = "connector"
	Receiver      Scope = "receiver"
	Executor      Scope = "executor"
	Notification  Scope = "notification"
	CloudCallback Scope = "cloud_callback"
	Referral      Scope = "referral"
	Migration     Scope = "migration"
)

// Principal is constructed by the Worker from verified session/credential data,
// never copied wholesale from the browser's JSON body.
type Principal struct {
	Scope      Scope  `json:"scope"`
	UserID     string `json:"userId,omitempty"`
	AdminUntil int64  `json:"adminUntil,omitempty"`
}

type Command struct {
	ConnectorRelease string          `json:"connectorRelease,omitempty"`
	Version          string          `json:"version"`
	AccountID        accounts.ID     `json:"accountId"`
	OwnerID          string          `json:"ownerId,omitempty"`
	RouteEpoch       int64           `json:"routeEpoch"`
	Principal        Principal       `json:"principal"`
	Method           string          `json:"method"`
	Params           json.RawMessage `json:"params"`
}

type Error struct {
	Code    string `json:"error"`
	Message string `json:"message"`
	Status  int    `json:"status"`
}

func (e *Error) Error() string { return e.Code }

type Result struct {
	OK   bool            `json:"ok"`
	Data json.RawMessage `json:"data,omitempty"`
	*Error
}

var ErrUnauthorized = errors.New("invalid backend request authentication")

// These are the cross-module entry points. Adding an endpoint requires an
// explicit capability decision, rather than exposing all exported Go methods.
var allowedScopes = map[string][]Scope{
	"imageAsset":                  {User},
	"identify":                    {User, Admin, Migration},
	"api":                         {User, Admin},
	"snapshot":                    {User, Admin, Billing},
	"adminStats":                  {Admin},
	"adminMembership":             {Admin},
	"adminGiftPlus":               {Admin},
	"applyPayment":                {Billing},
	"referralWechatIdentity":      {Referral},
	"applyReferralReward":         {Referral},
	"kimiseek":                    {User, Admin},
	"agtCallback":                 {CloudCallback},
	"receiverStatus":              {Receiver, Admin},
	"executionRequest":            {Executor},
	"openClawRequest":             {Connector},
	"notificationCredentialValid": {Notification},
	"notificationRequest":         {Notification},
	"connectorUpdateNotice":       {User, Admin},
	"readConnectorUpdateNotice":   {User, Admin},
	"migration.status":            {Migration},
	"migration.freeze":            {Migration},
	"migration.activate":          {Migration},
}

func (c Command) Validate() error {
	if c.Version != Version || c.RouteEpoch < 1 || c.Method == "" || !json.Valid(c.Params) {
		return &Error{Code: "invalid_request", Message: "内部请求格式无效", Status: 400}
	}
	if _, err := accounts.ParseID(string(c.AccountID)); err != nil {
		return &Error{Code: "invalid_account", Message: "账户标识无效", Status: 400}
	}
	if len(c.Principal.UserID) > 128 || len(c.OwnerID) > 128 {
		return &Error{Code: "invalid_identity", Message: "账户身份无效", Status: 400}
	}
	if !slices.Contains(allowedScopes[c.Method], c.Principal.Scope) {
		return &Error{Code: "forbidden", Message: "当前凭据无权执行此操作", Status: 403}
	}
	if (c.Principal.Scope == User || c.Principal.Scope == Admin) && c.Principal.UserID == "" {
		return &Error{Code: "invalid_identity", Message: "缺少受信任的用户身份", Status: 400}
	}
	if (c.Principal.Scope == User || c.Principal.Scope == Admin || c.Principal.Scope == Billing || c.Principal.Scope == Referral) && c.OwnerID == "" {
		return &Error{Code: "invalid_identity", Message: "缺少受信任的目标账户身份", Status: 400}
	}
	if c.Principal.Scope == User && c.Principal.UserID != c.OwnerID {
		return &Error{Code: "forbidden", Message: "不能访问其他用户的账户", Status: 403}
	}
	return nil
}
