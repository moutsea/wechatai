import type { PlatformMeter } from "./plugins";
import type { UserPlugin } from "./image-generation";
import type { ModelKind } from "./model-kind";
export type Protocol = "chat-completions" | "responses" | "anthropic";
export type Channel = {
  integration?: "kimiseek";
  id: string;
  name: string;
  description: string;
  protocol: Protocol;
  baseUrl: string;
  color: string;
  createdAt: number;
  hasKey: boolean;
};
export type ChannelInput = Omit<Channel, "id" | "createdAt" | "hasKey" | "integration"> & {
  apiKey?: string;
};
export type ModelImportResult = {
  total: number;
  imported: number;
  existing: number;
  invalid: number;
  limited: number;
};
export type Assistant = {
  kind?: ModelKind;
  id: string;
  channelId: string;
  channelName: string;
  name: string;
  description: string;
  protocol: Protocol;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  shortcut: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  contextTokens: number;
  maxCredits: number;
  color: string;
  createdAt: number;
  hasKey: boolean;
};
// Retained for older clients. New clients configure channels and models separately.
export type AssistantInput = Omit<
  Assistant,
  "id" | "createdAt" | "hasKey" | "channelId" | "channelName"
> & { apiKey?: string };
export type ModelInput = Omit<AssistantInput, "protocol" | "baseUrl" | "apiKey"> & {
  channelId: string;
};
export type ChatSession = {
  pluginInstanceId?: string;
  pluginName?: string;
  id: string;
  connectionId?: string;
  assistantId: string | null;
  title: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  resetAt: number;
  messageCount: number;
};
export type ChatMessage = {
  id: number;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  estimated: boolean;
  model: string;
};
export type LedgerEntry = {
  meter?: PlatformMeter;
  id: string;
  kind: string;
  amount: number;
  note: string;
  createdAt: number;
};
export type Connection = {
  status: "disconnected" | "waiting" | "scanned" | "connected" | "expired" | "error";
  botId?: string;
  lastSeen?: number;
  error?: string;
  qrUrl?: string;
  qrExpires?: number;
};
export type WechatLink = Connection & {
  id: string;
  name: string;
  createdAt: number;
  paused: boolean;
  currentSessionId: string;
};
export type Snapshot = {
  onboardingDismissedAt?: number;
  plugins?: UserPlugin[];
  plan: "free" | "plus";
  planUntil: number;
  assistants: Assistant[];
  channels: Channel[];
  currentSession: {
    pluginInstanceId?: string;
    pluginName?: string;
    id: string;
    title: string;
    assistantId: string | null;
    assistantName: string;
    channelId: string;
    channelName: string;
    model: string;
  } | null;
  connection: Connection;
  connections: WechatLink[];
  selectedConnectionId: string;
  wallet: {
    balance: number;
    debt: number;
    daily: number;
    purchased: number;
    referral: number;
    subscription: number;
    dailyGrant: number;
    dailyGrants: { free: number; plus: number };
    resetsAt: number;
    spentToday: number;
  };
  stats: { sessions: number; messages: number; tokens: number };
  limits: {
    assistants: number;
    channels: number;
    modelsPerChannel: number;
    sessions: number;
    connections: number;
  };
  ledger: LedgerEntry[];
  activity: { day: string; credits: number }[];
};
export const protocolLabels: Record<Protocol, string> = {
  "chat-completions": "OpenAI Chat Completions",
  responses: "OpenAI Responses",
  anthropic: "Anthropic Messages",
};
export const formatCredits = (value: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 }).format(value);
