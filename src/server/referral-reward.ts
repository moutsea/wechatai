import type { ReferralRow } from "./referrals";
import { AppError } from "./config";

// D1 owns eligibility. Each wallet verifies the recipient against its own
// account binding before it accepts a grant.
export async function referralRecipient(
  db: D1Database,
  inviteeId: string,
  role: "inviter" | "invitee",
) {
  const row = await db
    .prepare("SELECT invitee_id, inviter_id, status FROM referral WHERE invitee_id = ?")
    .bind(inviteeId)
    .first<ReferralRow>();
  const owner = role === "inviter" ? row?.inviter_id : row?.invitee_id;
  if (
    !row ||
    !owner ||
    !["inviter", "invitee"].includes(role) ||
    !["qualified", "rewarded"].includes(row.status) ||
    row.inviter_id === row.invitee_id
  ) {
    throw new AppError("invalid_referral", "邀请奖励资格或收款账户不匹配", 403);
  }
  return { owner, inviterId: row.inviter_id };
}
