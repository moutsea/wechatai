package app

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/moutsea/wechatai/backend/contract"
	"github.com/moutsea/wechatai/backend/internal/credits"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/rpc"
)

var referralUnits = contract.Load().ReferralCredits * credits.UnitsPerCredit

// D1 has attested the pair. Only its named recipient may receive this grant.
func referralGrant(c rpc.Command) (string, string, error) {
	var params []string
	if err := json.Unmarshal(c.Params, &params); err != nil || len(params) != 3 {
		return "", "", &rpc.Error{Code: "invalid_request", Message: "邀请奖励参数无效", Status: 400}
	}
	invitee, role, inviter := params[0], params[1], params[2]
	invalid := &rpc.Error{Code: "invalid_referral", Message: "邀请奖励资格或收款账户不匹配", Status: 403}
	if invitee == "" || inviter == "" || invitee == inviter || len(invitee) > 128 || len(inviter) > 128 {
		return "", "", invalid
	}
	id := "referral:" + invitee + ":" + role
	switch {
	case role == "inviter" && c.OwnerID == inviter:
		return id, "邀请好友奖励 · 永久有效", nil
	case role == "invitee" && c.OwnerID == invitee:
		return id, "受邀注册奖励 · 永久有效", nil
	default:
		return "", "", invalid
	}
}

func (a *App) applyReferralReward(ctx context.Context, c rpc.Command) (json.RawMessage, error) {
	id, note, err := referralGrant(c)
	if err != nil {
		return nil, err
	}
	err = a.write(ctx, c, func(tx *sql.Tx) error {
		until, err := membership.PlanUntil(ctx, tx)
		if err != nil {
			return err
		}
		if err := a.refreshAllowance(ctx, tx, until, a.Now().UnixMilli()); err != nil {
			return err
		}
		return (credits.Wallet{Now: a.Now}).Grant(ctx, tx, id, "referral", referralUnits, credits.MaxUnits, note)
	})
	return json.RawMessage("null"), err
}
