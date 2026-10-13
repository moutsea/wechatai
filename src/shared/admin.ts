import { z } from "zod";

export const adminGiftInputSchema = z
  .object({
    id: z.uuid(),
    reason: z.string().trim().max(200).default(""),
  })
  .strict();
export type AdminGiftInput = z.infer<typeof adminGiftInputSchema>;
export type AdminMembershipGift = AdminGiftInput & {
  actorId: string;
  createdAt: number;
  previousPlanUntil: number;
  planUntil: number;
};
export type AdminMembership = { planUntil: number; gifts: AdminMembershipGift[] };
export type AdminGiftResult = { gift: AdminMembershipGift; planUntil: number };

export type AdminUsage = { requests: number; tokens: number; credits: number };
export type AdminDay = AdminUsage & {
  failedRequests: number;
  day: string;
  activeUsers: number;
  newUsers: number;
  revenue: number;
  paidOrders: number;
};
export type AdminPluginUsage = AdminUsage & { pluginId: string; users: number };
export type AdminAccountStats = AdminUsage & {
  sampledAt: number;
  planUntil: number;
  links: number;
  connected: number;
  channels: number;
  models: number;
  plugins: number;
  sessions: number;
  purchasedCredits: number;
  debt: number;
  lastActiveAt: number | null;
  failedRequests: number;
  lastFailureAt: number | null;
  lastFailureCode: string | null;
  lastFailureStatus: number | null;
  daily: (AdminUsage & { day: string; failedRequests: number })[];
  pluginUsage: (AdminUsage & { pluginId: string; day: string })[];
};
export type AdminOverview = {
  mode: "test" | "live";
  generatedAt: number;
  coverage: { synced: number; oldest: number | null; newest: number | null };
  summary: AdminUsage & {
    failedRequests: number;
    users: number;
    plus: number;
    links: number;
    connected: number;
    channels: number;
    models: number;
    plugins: number;
    sessions: number;
    purchasedCredits: number;
    debt: number;
    revenue: number;
    paidOrders: number;
    payingUsers: number;
    membershipRevenue: number;
    creditsRevenue: number;
    rewardedReferrals: number;
  };
  daily: AdminDay[];
  plugins: AdminPluginUsage[];
};
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  isAdmin: number;
  syncedAt: number | null;
  planUntil: number | null;
  links: number | null;
  connected: number | null;
  requests: number | null;
  failedRequests: number | null;
  lastFailureAt: number | null;
  lastFailureCode: string | null;
  lastFailureStatus: number | null;
  credits: number | null;
  lastActiveAt: number | null;
  paidAmount: number;
};
export type AdminUsers = { items: AdminUser[]; total: number; page: number; totalPages: number };
export type AdminSync = { next: string | null; processed: number; failed: number };
export const adminPluginNames: Record<string, string> = {
  "wechatai/llm-chat": "LLM 对话",
  "wechatai/web-research": "DS Chat",
  "wechatai/image-generation": "AI 生图",
  "wechatai/openclaw": "OpenClaw",
  "wechatai/hermes": "Hermes",
  "wechatai/roleplay": "角色扮演",
  "wechatai/personal-assistant": "个人助理",
  legacy: "历史 / 未分类调用",
};
