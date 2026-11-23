import { Hono } from "hono";
import { createHash } from "node:crypto";
import { z } from "zod";
import { accountForGrok } from "../account-route";
import { parseOpenClawToken } from "../openclaw-token";
import { trustedAppOrigins } from "../config";
import { GROK_SETUP_MINUTES } from "../../shared/grok-bot";
import { GROK_MAX_IMAGES } from "./upload";

const versions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const uuid = { type: "string", format: "uuid" };
const tools = [
  {
    name: "wechatai_claim",
    description:
      "每次 Routine 运行独立生成随机 UUID 作为 claimId。领取响应丢失时，以同一 taskId 和 claimId 重试。仅在 claimed 为 true 时执行一次。history 中 failed 表示任务失败，expired 表示微伴等待超时，重做前先核对 Grok 运行记录。truncated 为 true 表示内容不完整，重试依赖缺失要求时请先向用户确认。需要回复图片时按 imageUpload 上传。",
    inputSchema: {
      type: "object",
      properties: { taskId: uuid, claimId: uuid },
      required: ["taskId", "claimId"],
      additionalProperties: false,
    },
  },
  {
    name: "wechatai_finish",
    description:
      "向原微信会话提交最终结果。使用同一 taskId、receipt 和结算状态重试。以回执的 taskStatus 为准；已超时或结算冲突时结束本次回传。附带图片时 text 仍写一句文字说明，微信先收到文字再收到图片。",
    inputSchema: {
      type: "object",
      properties: {
        taskId: uuid,
        receipt: uuid,
        status: { type: "string", enum: ["completed", "failed"] },
        text: { type: "string", maxLength: 30000 },
        images: {
          type: "array",
          description: "按 imageUpload 上传后返回的 imageId，按发送顺序排列。仅 completed 时发送。",
          items: uuid,
          maxItems: GROK_MAX_IMAGES,
          uniqueItems: true,
        },
      },
      required: ["taskId", "receipt", "status", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "wechatai_register_webhook",
    description: `仅在配置时调用：提交本 Bot 中接收微伴任务的 Routine 的 Webhook POST 地址和 key，key 不含 Bearer 前缀。须在微伴网页生成配置指令后 ${GROK_SETUP_MINUTES} 分钟内调用，成功一次后关闭；需要更换时请用户在网页重新生成指令。`,
    inputSchema: {
      type: "object",
      properties: {
        webhookUrl: { type: "string", format: "uri" },
        webhookKey: { type: "string", maxLength: 2048 },
      },
      required: ["webhookUrl", "webhookKey"],
      additionalProperties: false,
    },
  },
];
const actions: Record<string, string> = {
  wechatai_claim: "grok.claim",
  wechatai_finish: "grok.finish",
  wechatai_register_webhook: "grok.register",
};
const message = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number().int()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export const grokMcp = new Hono<{ Bindings: Env }>();
grokMcp.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  return next();
});
grokMcp.post("/", async (c) => {
  const origin = c.req.header("Origin");
  if (origin && !trustedAppOrigins(c.env).includes(origin)) return c.body(null, 403);
  const token = parseOpenClawToken(c.env, c.req.header("Authorization") ?? "", "grok");
  if (!token) return c.body(null, 401, { "WWW-Authenticate": "Bearer" });
  const digest = createHash("sha256").update(token.secret).digest("hex");
  if (!(await c.env.API_LIMIT.limit({ key: `grok:token:${digest}` })).success)
    return c.body(null, 429);
  if (c.req.header("content-type")?.split(";")[0].trim() !== "application/json")
    return c.body(null, 415);
  const protocol = c.req.header("MCP-Protocol-Version");
  if (protocol && !versions.includes(protocol)) return c.body(null, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      400,
    );
  }
  const parsed = message.safeParse(body);
  if (!parsed.success)
    return c.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } },
      400,
    );
  const { id, method, params } = parsed.data;
  const result = (value: unknown) => c.json({ jsonrpc: "2.0", id, result: value });
  const error = (code: number, msg: string) =>
    c.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message: msg } });
  const call =
    method === "tools/call" &&
    id !== undefined &&
    typeof params?.name === "string" &&
    Object.hasOwn(actions, params.name)
      ? actions[params.name]
      : null;
  const action = call ?? "grok.auth";
  const account = await accountForGrok(c.env, token.accountId);
  const reply = JSON.parse(
    await account.openClawRequest(
      token.pluginId,
      token.secret,
      action,
      params?.arguments ?? {},
      "grok",
    ),
  );
  if (!reply.ok) {
    if (reply.status === 401 || reply.status === 403 || reply.status === 429)
      return c.body(null, reply.status);
    if (call) return result({ isError: true, content: [{ type: "text", text: reply.message }] });
    return error(-32603, "连接不可用");
  }
  if (id === undefined)
    return method.startsWith("notifications/")
      ? c.body(null, 202)
      : error(-32600, "Request id required");
  switch (method) {
    case "initialize":
      return result({
        protocolVersion: versions.includes(String(params?.protocolVersion))
          ? params?.protocolVersion
          : versions[0],
        capabilities: { tools: {} },
        serverInfo: { name: "wechatai-grok", version: "1.0.0" },
      });
    case "ping":
      return result({});
    case "tools/list":
      return result({ tools });
    case "tools/call":
      return call
        ? result({ content: [{ type: "text", text: JSON.stringify(reply.data) }] })
        : error(-32602, "Unknown tool");
    default:
      return error(-32601, "Method not found");
  }
});
grokMcp.all("/", (c) => c.body(null, 405, { Allow: "POST" }));
