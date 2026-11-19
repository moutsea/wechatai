import { Hono } from "hono";
import { z } from "zod";
import { accountForGrok } from "../account-route";
import { parseOpenClawToken } from "../openclaw-token";
import { trustedAppOrigins } from "../config";

const versions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const uuid = { type: "string", format: "uuid" };
const tools = [
  {
    name: "wechatai_claim",
    description:
      "领取本次 Webhook 的微信任务。仅在 claimed 为 true 时执行。history 中 taskStatus 为 failed 的条目是之前未完成的请求。",
    inputSchema: {
      type: "object",
      properties: { taskId: uuid },
      required: ["taskId"],
      additionalProperties: false,
    },
  },
  {
    name: "wechatai_finish",
    description: "向原微信会话提交最终结果。重试必须沿用同一 taskId 与 receipt。",
    inputSchema: {
      type: "object",
      properties: {
        taskId: uuid,
        receipt: uuid,
        status: { type: "string", enum: ["completed", "failed"] },
        text: { type: "string", maxLength: 30000 },
      },
      required: ["taskId", "receipt", "status", "text"],
      additionalProperties: false,
    },
  },
];
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
  if (!(await c.env.API_LIMIT.limit({ key: `grok:${token.accountId}:${token.pluginId}` })).success)
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
    method === "tools/call" && id !== undefined && tools.some((t) => t.name === params?.name);
  const action = call
    ? params?.name === "wechatai_claim"
      ? "grok.claim"
      : "grok.finish"
    : "grok.auth";
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
    if (reply.status === 401 || reply.status === 403) return c.body(null, reply.status);
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
