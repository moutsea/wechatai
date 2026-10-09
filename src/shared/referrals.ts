export const REFERRAL_CREDITS = 500;
export type ReferralStatus = "pending" | "qualified" | "rewarded" | "ineligible";
export type ReferralSummary = {
  url: string;
  reward: number;
  registered: number;
  completed: number;
  earned: number;
  received: ReferralStatus | null;
  recent: { id: string; name: string; status: ReferralStatus; createdAt: number }[];
};
export const referralStatusLabel: Record<ReferralStatus, string> = {
  pending: "待首次微信对话",
  qualified: "奖励发放中",
  rewarded: "奖励已到账",
  ineligible: "不符合奖励条件",
};
