import { pluginShortcutSchema } from "./plugin-shortcut";
import { z } from "zod";
import { pluginManifestSchema } from "./plugins";

export const personalAssistantInputSchema = z.object({
  name: z.string().trim().min(1).max(40).default("个人助理"),
  shortcut: pluginShortcutSchema.default("助理"),
  modelId: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  currency: z.enum(["CNY", "USD", "HKD", "EUR", "GBP", "JPY"]).default("CNY"),
  reminderConnectionId: z.string().max(200).default(""),
});
export type PersonalAssistantInput = z.infer<typeof personalAssistantInputSchema>;
export type PersonalAssistantPlugin = PersonalAssistantInput & {
  id: string;
  pluginId: "wechatai/personal-assistant";
  version: "1.0.0";
  createdAt: number;
  hasKey: boolean;
};
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }, "请输入有效日期");
export const dailyTasksReminderSchema = z
  .object({
    enabled: z.boolean(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "请输入有效时间，如 09:00")
      .optional(),
  })
  .refine((v) => !v.enabled || !!v.time, "启用每日待办提醒时，请提供北京时间 HH:mm");

export function nextDailyReminderAt(time: string, now = Date.now()) {
  dailyTasksReminderSchema.parse({ enabled: true, time });
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const at = Date.parse(`${today}T${time}:00+08:00`);
  return new Date(at > now ? at : at + 86400000).toISOString();
}
export const personalRecordFields = z.object({
  kind: z.enum(["note", "entry", "task", "reminder"]),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().max(6000).default(""),
  date: calendarDate,
  category: z.string().trim().max(40).default(""),
  amount: z
    .string()
    .regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, "金额需小于一亿元，最多两位小数")
    .nullable()
    .default(null),
  direction: z.enum(["income", "expense"]).default("expense"),
  currency: personalAssistantInputSchema.shape.currency,
  completed: z.boolean().default(false),
  reminderEnabled: z.boolean().default(true),
  reminderType: z.enum(["message", "daily_tasks"]).default("message"),
  remindAt: z.string().datetime({ offset: true }).nullable().default(null),
  repeat: z.enum(["none", "daily", "weekly"]).default("none"),
});
export const personalRecordInputSchema = personalRecordFields.superRefine((v, ctx) => {
  if (v.kind === "entry" && (!v.amount || amountCents(v.amount) <= 0))
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: "请输入大于 0 的金额，最多两位小数",
    });
  if (v.kind !== "entry" && v.amount !== null)
    ctx.addIssue({ code: "custom", path: ["amount"], message: "只有账目可以设置金额" });
  if (v.kind !== "task" && v.completed)
    ctx.addIssue({ code: "custom", path: ["completed"], message: "只有待办笔记可以设置完成状态" });
  if (v.kind !== "reminder" && (v.remindAt || v.repeat !== "none" || !v.reminderEnabled))
    ctx.addIssue({
      code: "custom",
      path: ["remindAt"],
      message: "请使用提醒类型设置定时提醒，笔记与待办不发送提醒",
    });
  if (v.kind === "reminder" && !v.remindAt)
    ctx.addIssue({ code: "custom", path: ["remindAt"], message: "请设置提醒时间" });
  if (v.reminderType === "daily_tasks" && (v.kind !== "reminder" || v.repeat !== "daily"))
    ctx.addIssue({
      code: "custom",
      path: ["reminderType"],
      message: "今日待办汇总必须是每天重复的独立提醒",
    });
});
export type PersonalRecordInput = z.infer<typeof personalRecordInputSchema>;
export type PersonalRecord = PersonalRecordInput & {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  reminderState?: string;
  reminderError?: string;
  nextReminderAt?: number | null;
};
export const personalQuerySchema = z
  .object({
    kind: z.enum(["note", "entry", "task", "reminder"]).optional(),
    reminderType: z.enum(["message", "daily_tasks"]).optional(),
    query: z.string().trim().max(200).default(""),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    completed: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, "开始日期不能晚于结束日期");
export type PersonalQuery = z.infer<typeof personalQuerySchema>;
export type PersonalSummary = { currency: string; income: string; expense: string; net: string };
export type PersonalRecords = {
  records: PersonalRecord[];
  total: number;
  totals: PersonalSummary[];
};
export function amountCents(amount: string) {
  const [whole, decimal = ""] = amount.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
export function centsAmount(cents: number) {
  return `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
}
export const beijingDate = (now = Date.now()) =>
  new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export const beijingTime = (time: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(time);
export const personalAssistantManifest = pluginManifestSchema.parse({
  protocolVersion: "1.0",
  id: "wechatai/personal-assistant",
  version: "1.0.0",
  name: "个人助理",
  author: "Wechatai",
  runtime: "builtin",
  capabilities: {
    input: ["text", "image"],
    output: ["text"],
    sessions: "platform",
    streaming: false,
    cancellation: false,
    approvals: false,
  },
  configSchema: z.toJSONSchema(personalAssistantInputSchema, { io: "input" }),
  permissions: { modelAccess: true, networkOrigins: [], storage: true },
});
