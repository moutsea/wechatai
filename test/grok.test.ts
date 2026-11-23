import { abortAllDurableObjects, env, SELF, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import routes from "../migrations/0019_account_backend_routes.sql?raw";
import type { WxMessage } from "../src/server/wechat";
import { readGrokHistory } from "../src/server/grok/history";
import { countTextTokens } from "../src/server/tokenizer";
import { creditUnits } from "../src/server/wallet";
import { grokMcp } from "../src/server/grok/mcp";
import {
  GROK_DISPATCH_UNAVAILABLE,
  GROK_SETUP_INCOMPLETE,
  GROK_WAITING_MESSAGE,
} from "../src/shared/grok-bot";
import type { GrokTasks } from "../src/server/grok/tasks";
import {
  connectForManualDelivery,
  deliverQueuedReplies,
  useManualAlarms,
} from "./helpers/wechat-delivery";

const endpoint = "https://wechatai.app/api/grok/mcp";
const webhookUrl = "https://api2.cursor.sh/automations/webhook/test-routine";
const webhookKey = "test-routine-secret";
const accounts: DurableObjectId[] = [];
beforeAll(async () => {
  for (const sql of routes.split(";").filter((s) => s.trim())) await env.DB.prepare(sql).run();
});
afterEach(async () => {
  for (const id of accounts.splice(0))
    await runInDurableObject(env.ACCOUNTS.get(id), (_, s) => s.storage.deleteAlarm());
  vi.restoreAllMocks();
});
// viaPrompt saves no Webhook; the Bot registers it through MCP with the setup prompt.
async function setup({ viaPrompt = false } = {}) {
  let stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub.id);
  await runInDurableObject(stub, (_, s) => useManualAlarms(s));
  const api = async (action: string, input: unknown = {}) =>
    JSON.parse(await stub.api(action, input));
  await api("wechat.create", { name: "微信" });
  await runInDurableObject(stub, (_, state) =>
    state.storage.sql.exec(
      "INSERT OR REPLACE INTO settings(key,value) VALUES('connection',?)",
      JSON.stringify({ status: "connected", generation: "g1", contextToken: "context" }),
    ),
  );
  const config = await api("plugin.save", {
    pluginId: "wechatai/grok",
    name: "测试 Bot",
    shortcut: "grok",
    ...(viaPrompt ? {} : { webhookUrl, webhookKey }),
  });
  expect(config).toMatchObject({ ok: true, data: { hasKey: false, webhookReady: !viaPrompt } });
  expect(JSON.stringify(config)).not.toContain(webhookKey);
  const id = config.data.id;
  const {
    data: { token },
  } = await api("plugin.grokToken", { id });
  const rpc = (method: string, params: unknown = {}, auth = token) =>
    SELF.fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: "Bearer " + auth,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  const tool = async (name: string, args: unknown, auth = token) => {
    const res = await rpc("tools/call", { name, arguments: args }, auth);
    expect(res.status).toBe(200);
    const reply = await res.json<{ result: { content: { text: string }[]; isError?: boolean } }>();
    if (reply.result.isError) throw Error(reply.result.content[0].text);
    return JSON.parse(reply.result.content[0].text);
  };
  if (viaPrompt)
    // Bots may copy the routine's ready-made header value instead of the bare key.
    expect(
      await tool("wechatai_register_webhook", { webhookUrl, webhookKey: `Bearer ${webhookKey}` }),
    ).toMatchObject({ registered: true });
  const send = (text: string, msg = crypto.randomUUID()) =>
    runInDurableObject(stub, (instance) =>
      (
        instance as unknown as {
          processWechat(id: string, m: WxMessage, link: string): Promise<string>;
        }
      ).processWechat(msg, { item_list: [{ type: 1, text_item: { text } }] }, "default"),
    );
  const wake = (status: number | "lost" = 204, viaAlarm = false, headers?: HeadersInit) =>
    runInDurableObject(stub, async (instance) => {
      let taskId = "";
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const r = new Request(input);
        if (viaAlarm && r.url.endsWith("getupdates")) return Response.json({ ret: 0, msgs: [] });
        const body = await r.text();
        const data = JSON.parse(body);
        expect(new URL(r.url).pathname).toBe("/internal/v1/grok/wake");
        const signature = [
          "wechatai-rpc-v1",
          "POST",
          new URL(r.url).pathname,
          r.headers.get("X-Wechatai-Time"),
          r.headers.get("X-Wechatai-Request-Id"),
          createHash("sha256").update(body).digest("hex"),
        ].join("\n");
        expect(r.headers.get("X-Wechatai-Signature")).toBe(
          createHmac("sha256", "test-only-grok-dispatch-key-32-characters")
            .update(signature)
            .digest("base64url"),
        );
        expect(data).toEqual({ taskId: expect.any(String), webhookUrl, webhookKey });
        taskId = data.taskId;
        if (status === "lost") throw new Error("response lost after acceptance");
        return new Response(null, { status, headers });
      });
      try {
        if (viaAlarm) await instance.alarm();
        else await (instance as unknown as { grok: GrokTasks }).grok.dispatchDue();
      } finally {
        fetch.mockRestore();
      }
      return taskId;
    });
  const restart = async () => {
    await abortAllDurableObjects();
    stub = env.ACCOUNTS.get(stub.id);
    await runInDurableObject(stub, (_, s) => useManualAlarms(s));
  };
  return {
    get stub() {
      return stub;
    },
    api,
    id,
    rpc,
    tool,
    send,
    wake,
    token,
    restart,
  };
}
it("runs a text round trip, reuses only the route history, and settles one result once", async () => {
  const c = await setup();
  expect(
    (
      await (
        await c.rpc("initialize", { protocolVersion: "2025-06-18" })
      ).json<{ result: { protocolVersion: string } }>()
    ).result.protocolVersion,
  ).toBe("2025-06-18");
  const listed = await (await c.rpc("tools/list")).json<{ result: { tools: unknown[] } }>();
  expect(listed.result.tools).toContainEqual(
    expect.objectContaining({
      name: "wechatai_claim",
      inputSchema: expect.objectContaining({ required: ["taskId", "claimId"] }),
    }),
  );
  expect(await c.send("/use grok")).toContain("Grok Bot");
  await c.send("列两条计划");
  const taskId = await c.wake();
  expect(taskId).toBeTruthy();
  const a = await c.tool("wechatai_claim", { taskId });
  expect(a).toMatchObject({ claimed: true, history: [], text: "列两条计划" });
  expect(await c.tool("wechatai_claim", { taskId })).toEqual({ claimed: false });
  const input = { taskId, receipt: a.receipt, status: "completed", text: "一，看书。二，散步。" };
  const before = (await c.stub.snapshot()).wallet.balance;
  const result = await c.tool("wechatai_finish", input);
  expect(result.taskStatus).toBe("completed");
  expect(result.cost).toBeGreaterThan(0);
  expect(await c.tool("wechatai_finish", { ...input, text: "重复结果" })).toEqual(result);
  await expect(c.tool("wechatai_finish", { ...input, status: "failed", text: "" })).rejects.toThrow(
    "已成功结算",
  );
  expect((await c.stub.snapshot()).wallet.balance).toBeCloseTo(before - result.cost, 3);
  expect((await deliverQueuedReplies(c.stub)).map((x) => x.text)).toContain(input.text);
  await c.send("展开第二条");
  const next = await c.wake();
  await expect(c.tool("wechatai_claim", { taskId: next, claimId: next })).rejects.toThrow();
  expect((await c.api("plugin.save", { id: c.id, maxOutputTokens: 512 })).ok).toBe(true);
  const claimants = [crypto.randomUUID(), crypto.randomUUID()];
  const results = await Promise.all(
    claimants.map((claimId) => c.tool("wechatai_claim", { taskId: next, claimId })),
  );
  expect(results.filter((x) => x.claimed)).toHaveLength(1);
  const winner = results.findIndex((x) => x.claimed);
  const followUp = results[winner];
  expect(followUp.maxOutputTokens).toBe(512);
  await c.restart();
  expect((await c.api("plugin.save", { id: c.id, maxOutputTokens: 256 })).ok).toBe(true);
  expect(await c.tool("wechatai_claim", { taskId: next, claimId: claimants[winner] })).toEqual(
    followUp,
  );
  expect(await c.tool("wechatai_claim", { taskId: next, claimId: claimants[1 - winner] })).toEqual({
    claimed: false,
  });
  expect(followUp).toMatchObject({
    text: "展开第二条",
    history: [
      { role: "user", text: "列两条计划" },
      { role: "assistant", text: input.text },
    ],
  });
  const billedInput = [a.text, input.text, followUp.text].reduce(
    (n, text) => n + countTextTokens(text),
    0,
  );
  const text = " word".repeat(400).trim();
  expect(countTextTokens(text)).toBe(400);
  const finish = { taskId: next, receipt: followUp.receipt, status: "completed", text };
  const reply = await c.tool("wechatai_finish", finish);
  expect(await c.tool("wechatai_finish", finish)).toEqual(reply);
  expect(reply.truncated).toBe(false);
  const delivered = await deliverQueuedReplies(c.stub, 2);
  expect(delivered.map((part) => part.text).join("")).toBe(text);
  expect(await c.tool("wechatai_claim", { taskId: next, claimId: claimants[winner] })).toEqual({
    claimed: false,
  });
  expect(reply.cost).toBe(creditUnits(billedInput, countTextTokens(text)) / 1000);
  await runInDurableObject(c.stub, (_, s) => {
    expect(
      s.storage.sql
        .exec("SELECT inputTokens FROM messages WHERE role='assistant' ORDER BY id DESC LIMIT 1")
        .one().inputTokens,
    ).toBe(billedInput);
    expect(s.storage.sql.exec("SELECT tokens FROM usage WHERE id=?", reply.id).one().tokens).toBe(
      billedInput + countTextTokens(text),
    );
  });
  expect((await c.rpc("tools/list", {}, "bad")).status).toBe(401);
  await c.api("plugin.grokRevoke", { id: c.id });
  expect((await c.rpc("tools/list")).status).toBe(401);
});
it.each(["new unkeyed", "existing keyed", "existing unkeyed"] as const)(
  "uses the recorded limit for %s claims across a restart",
  async (variant) => {
    const c = await setup();
    await c.send("/use grok");
    await c.send("生成待验收的文字");
    const taskId = await c.wake();
    expect((await c.api("plugin.save", { id: c.id, maxOutputTokens: 512 })).ok).toBe(true);
    const claimArgs =
      variant === "existing keyed" ? { taskId, claimId: crypto.randomUUID() } : { taskId };
    const claim = await c.tool("wechatai_claim", claimArgs);
    expect(claim.maxOutputTokens).toBe(512);
    if (variant !== "new unkeyed")
      await runInDurableObject(c.stub, (_, s) => {
        // The previous schema recorded the claim limit on the job only for keyed requests.
        s.storage.sql.exec("ALTER TABLE grok_tasks DROP COLUMN claimedOutputLimit");
        if (variant === "existing keyed")
          s.storage.sql.exec("UPDATE claw_jobs SET outputLimit=512");
      });
    await c.restart();
    const newLimit = variant === "new unkeyed" ? 1024 : 256;
    expect((await c.api("plugin.save", { id: c.id, maxOutputTokens: newLimit })).ok).toBe(true);
    if (variant === "existing keyed")
      expect(await c.tool("wechatai_claim", claimArgs)).toEqual(claim);
    const text = " word".repeat(600).trim();
    const result = await c.tool("wechatai_finish", {
      taskId,
      receipt: claim.receipt,
      status: "completed",
      text,
    });
    expect(result.truncated).toBe(true);
    const accepted = variant === "existing unkeyed" ? 256 : 512;
    expect(result.cost).toBe(creditUnits(countTextTokens(claim.text), accepted) / 1000);
    const sent = await deliverQueuedReplies(c.stub, 3);
    const delivery = sent.map((x) => x.text).join("");
    expect(delivery).toContain(`${accepted} tokens`);
    expect(countTextTokens(delivery.split("\n\n")[1])).toBe(accepted);
    await c.send("下一次");
    expect((await c.tool("wechatai_claim", { taskId: await c.wake() })).maxOutputTokens).toBe(
      newLimit,
    );
  },
);
it("keeps platform truncation notices in WeChat and bills only the accepted history text", async () => {
  const c = await setup();
  expect((await c.api("plugin.save", { id: c.id, maxOutputTokens: 256 })).ok).toBe(true);
  await c.send("/use grok");
  await c.send("写一篇长文");
  const taskId = await c.wake();
  const { receipt } = await c.tool("wechatai_claim", { taskId });
  const text = " 好".repeat(800).trim();
  const settled = await c.tool("wechatai_finish", { taskId, receipt, status: "completed", text });
  expect(settled.truncated).toBe(true);
  const [delivery] = await deliverQueuedReplies(c.stub);
  expect(delivery.text).toContain("此提示不计 credits。");
  const accepted = delivery.text.split("\n\n")[1];
  expect(accepted.length).toBeGreaterThan(0);
  await c.send("继续");
  const ref = await c.wake();
  const next = await c.tool("wechatai_claim", { taskId: ref });
  expect(next.history).toEqual([
    { role: "user", text: "写一篇长文" },
    { role: "assistant", text: accepted, truncated: true },
  ]);
  const answer = await c.tool("wechatai_finish", {
    taskId: ref,
    receipt: next.receipt,
    status: "completed",
    text: "好",
  });
  expect(answer.cost).toBe(
    creditUnits(
      countTextTokens("写一篇长文") + countTextTokens(accepted) + countTextTokens("继续"),
      countTextTokens("好"),
    ) / 1000,
  );
});

it("records just the first authenticated MCP contact for each credential", async () => {
  const c = await setup();
  await runInDurableObject(c.stub, (_, s) => {
    s.storage.sql.exec(`CREATE TABLE seen_writes (seen INTEGER);
      CREATE TRIGGER count_seen AFTER UPDATE OF lastSeen ON claw_connectors
      BEGIN INSERT INTO seen_writes VALUES(NEW.lastSeen); END;`);
  });
  const writes = () =>
    runInDurableObject(c.stub, (_, s) =>
      s.storage.sql.exec("SELECT seen FROM seen_writes ORDER BY rowid").toArray(),
    );
  expect((await c.rpc("initialize", { protocolVersion: "2025-06-18" })).status).toBe(200);
  const first = await writes();
  expect(first).toEqual([{ seen: expect.any(Number) }]);
  for (const method of ["tools/list", "ping", "ping"])
    expect((await c.rpc(method)).status).toBe(200);
  await c.send("@grok 测试连接");
  const taskId = await c.wake();
  const { receipt } = await c.tool("wechatai_claim", { taskId });
  await c.tool("wechatai_finish", { taskId, receipt, status: "completed", text: "已接通" });
  expect(await writes()).toEqual(first);
  const {
    data: { token },
  } = await c.api("plugin.grokToken", { id: c.id });
  expect((await c.rpc("ping")).status).toBe(401);
  expect(await writes()).toEqual(first);
  for (const method of ["tools/list", "ping"])
    expect((await c.rpc(method, {}, token)).status).toBe(200);
  expect(await writes()).toHaveLength(2);
});

it("shares MCP quota only between authenticated calls and returns HTTP 429 before a claim", async () => {
  const c = await setup();
  const {
    data: { token: fresh },
  } = await c.api("plugin.grokToken", { id: c.id });
  await c.send("@grok 核实配额");
  const taskId = await c.wake();
  const claimArgs = { taskId, claimId: crypto.randomUUID() };
  const edgeLimit = vi.fn<RateLimit["limit"]>().mockResolvedValue({ success: true });
  const sharedLimit = vi.fn<RateLimit["limit"]>().mockResolvedValue({ success: false });
  const request = (auth: string) =>
    grokMcp.request(
      "/",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "wechatai_claim", arguments: claimArgs },
        }),
      },
      { ...env, API_LIMIT: { limit: edgeLimit } },
    );
  await runInDurableObject(c.stub, (instance) => {
    const ao = instance as unknown as { env: Env };
    ao.env = { ...ao.env, API_LIMIT: { limit: sharedLimit } };
  });
  expect((await request(c.token)).status).toBe(401);
  expect(sharedLimit).not.toHaveBeenCalled();
  expect((await request(fresh)).status).toBe(429);
  expect(sharedLimit).toHaveBeenCalledExactlyOnceWith({ key: `grok:${c.stub.id}:${c.id}` });
  const keys = edgeLimit.mock.calls.map(([{ key }]) => key);
  expect(new Set(keys).size).toBe(2);
  expect(keys.every((key) => /^grok:token:[a-f0-9]{64}$/.test(key))).toBe(true);
  sharedLimit.mockResolvedValue({ success: true });
  expect(await c.tool("wechatai_claim", claimArgs, fresh)).toMatchObject({ claimed: true });
  await runInDurableObject(c.stub, (instance) => {
    sharedLimit.mockImplementationOnce(async () => {
      const rotated = JSON.parse(await instance.api("plugin.grokToken", { id: c.id }));
      expect(rotated.ok).toBe(true);
      return { success: true };
    });
  });
  expect((await c.rpc("ping", {}, fresh)).status).toBe(401);
});
it("cancels rejected wakes without charging, and rejects untrusted webhook URLs", async () => {
  const c = await setup();
  const broken = await c.api("plugin.save", {
    id: c.id,
    webhookUrl: "https://example.org/steal",
    webhookKey,
  });
  expect(broken.ok).toBe(false);
  await c.send("@grok 请帮我整理");
  const before = (await c.stub.snapshot()).wallet.balance;
  const ref = await c.wake(422);
  await c.wake();
  expect(await c.tool("wechatai_claim", { taskId: ref })).toEqual({ claimed: false });
  expect((await c.stub.snapshot()).wallet.balance).toBe(before);
  expect((await deliverQueuedReplies(c.stub)).map((x) => x.text).join("")).toContain("未扣费");
});

it("lets the Bot register its own Webhook once, within the prompt window", async () => {
  const c = await setup({ viaPrompt: true });
  const grok = async () =>
    (await c.stub.snapshot()).plugins?.find((p: { id: string }) => p.id === c.id) as {
      hasKey: boolean;
      webhookReady: boolean;
      setupPending: boolean;
    };
  expect(await grok()).toMatchObject({ hasKey: true, webhookReady: true, setupPending: false });
  const register = { webhookUrl, webhookKey: "another-key" };
  await expect(c.tool("wechatai_register_webhook", register)).rejects.toThrow("已过期或已使用");
  // The registered Routine receives tasks with the normalized key (checked by wake).
  await c.send("/use grok");
  await c.send("用一句话问好");
  const taskId = await c.wake();
  const claim = await c.tool("wechatai_claim", { taskId });
  expect(claim).toMatchObject({ claimed: true, text: "用一句话问好" });
  // An expired prompt cannot replace the Routine either.
  const { data } = await c.api("plugin.grokToken", { id: c.id });
  expect(data.setupUntil).toBeGreaterThan(Date.now());
  await runInDurableObject(c.stub, (_, s) =>
    s.storage.sql.exec("UPDATE settings SET value='1' WHERE key=?", `grokSetup:${c.id}`),
  );
  await expect(c.tool("wechatai_register_webhook", register, data.token)).rejects.toThrow(
    "已过期或已使用",
  );
  const malformed = { webhookUrl: "https://example.com/hook", webhookKey: "k" };
  expect((await c.api("plugin.grokToken", { id: c.id })).ok).toBe(true);
  const { data: fresh } = await c.api("plugin.grokToken", { id: c.id });
  await expect(c.tool("wechatai_register_webhook", malformed, fresh.token)).rejects.toThrow(
    "Webhook URL",
  );
  expect(await grok()).toMatchObject({ webhookReady: true, setupPending: true });
  expect((await c.api("plugin.grokRevoke", { id: c.id })).ok).toBe(true);
  expect(await grok()).toMatchObject({ hasKey: false, setupPending: false });
});

it("asks to finish setup before queueing work, and keeps the Bot's connector on a first manual Webhook", async () => {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub.id);
  await runInDurableObject(stub, (_, s) => useManualAlarms(s));
  const api = async (action: string, input: unknown = {}) =>
    JSON.parse(await stub.api(action, input));
  await api("wechat.create", { name: "微信" });
  const config = await api("plugin.save", {
    pluginId: "wechatai/grok",
    name: "Bot",
    shortcut: "grok",
  });
  const id = config.data.id;
  const send = (text: string) =>
    runInDurableObject(stub, (instance) =>
      (
        instance as unknown as {
          processWechat(id: string, m: WxMessage, link: string): Promise<string>;
        }
      ).processWechat(
        crypto.randomUUID(),
        { item_list: [{ type: 1, text_item: { text } }] },
        "default",
      ),
    );
  expect(await send("/use grok")).toContain(GROK_SETUP_INCOMPLETE);
  await expect(send("帮我订会议室")).rejects.toThrow(GROK_SETUP_INCOMPLETE);
  await expect(send("@grok 帮我订会议室")).rejects.toThrow(GROK_SETUP_INCOMPLETE);
  expect((await api("plugin.grokToken", { id })).ok).toBe(true);
  const status = async () => (await api("plugin.grokStatus", { id })).data;
  expect(await status()).toMatchObject({ hasKey: true, webhookReady: false, setupPending: true });
  expect((await api("plugin.save", { id, webhookUrl, webhookKey })).ok).toBe(true);
  expect(await status()).toMatchObject({ hasKey: true, webhookReady: true, setupPending: false });
  // Replacing an existing Routine may move to another Bot, so the old credential stops.
  expect((await api("plugin.save", { id, webhookUrl, webhookKey: "rotated" })).ok).toBe(true);
  expect(await status()).toMatchObject({ hasKey: false, webhookReady: true });
});

it("sends, customizes or skips the Grok waiting notice as configured", async () => {
  const c = await setup();
  await c.send("/use grok");
  expect(await c.send("第一件事")).toBe(GROK_WAITING_MESSAGE);
  const save = (input: object) => c.api("plugin.save", { id: c.id, ...input });
  expect((await save({ waitingMessage: "收到，稍等" })).ok).toBe(true);
  expect(await c.send("第二件事")).toBe("收到，稍等");
  expect((await save({ waitingMessageEnabled: false })).ok).toBe(true);
  expect(await c.send("第三件事")).toBe("");
  // Changing the notice keeps the saved Webhook and the Bot's MCP connector.
  expect(
    (await c.stub.snapshot()).plugins?.find((p: { id: string }) => p.id === c.id),
  ).toMatchObject({ hasKey: true, webhookReady: true, waitingMessageEnabled: false });
});

it("lists only known MCP tools", async () => {
  const c = await setup();
  const listed = await (
    await c.rpc("tools/list")
  ).json<{ result: { tools: { name: string }[] } }>();
  expect(listed.result.tools.map((t) => t.name)).toEqual([
    "wechatai_claim",
    "wechatai_finish",
    "wechatai_register_webhook",
  ]);
  const res = await c.rpc("tools/call", { name: "toString", arguments: {} });
  expect(await res.json()).toMatchObject({ error: { code: -32602 } });
});

// 1x1 PNG with complete pixel data.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=",
  "base64",
);
it("sends uploaded images after the text, bills each one and closes uploads at settlement", async () => {
  const c = await setup();
  await c.send("/use grok");
  await c.send("画一只猫");
  const taskId = await c.wake();
  const claim = await c.tool("wechatai_claim", { taskId, claimId: crypto.randomUUID() });
  expect(claim.imageUpload).toMatchObject({ maxImages: 4, maxBytes: 8 * 1024 * 1024 });
  const { url } = claim.imageUpload as { url: string };
  expect(new URL(url).pathname).toMatch(/^\/api\/grok\/uploads\/gup1\./);
  const put = (body: BodyInit, target = url) => SELF.fetch(target, { method: "PUT", body });
  expect((await put(png, url.replace(/\.[^.]+$/, `.${"A".repeat(43)}`))).status).toBe(401);
  expect((await put("not an image")).status).toBe(422);
  expect((await put(new Uint8Array(8 * 1024 * 1024 + 1))).status).toBe(413);
  const upload = async () => {
    const res = await put(png);
    expect(res.status).toBe(201);
    return (await res.json<{ imageId: string }>()).imageId;
  };
  const uploads = [];
  for (let i = 0; i < 8; i++) uploads.push(await upload());
  const limited = await put(png);
  expect(limited.status).toBe(409);
  expect(await limited.text()).toContain("最多上传 8 次");
  const [imageId, ...unused] = uploads;
  const finish = { taskId, receipt: claim.receipt, status: "completed", text: "画好了" };
  await expect(
    c.tool("wechatai_finish", { ...finish, images: [crypto.randomUUID()] }),
  ).rejects.toThrow("不属于这条任务");
  const before = (await c.stub.snapshot()).wallet.balance;
  const result = await c.tool("wechatai_finish", { ...finish, images: [imageId] });
  expect(result).toMatchObject({ taskStatus: "completed", images: 1 });
  expect(result.cost).toBe(
    (creditUnits(countTextTokens(claim.text), countTextTokens(finish.text)) + 5000) / 1000,
  );
  expect((await c.stub.snapshot()).wallet.balance).toBeCloseTo(before - result.cost, 3);
  expect(await c.tool("wechatai_finish", { ...finish, images: [] })).toEqual(result);
  expect((await put(png)).status).toBe(409);
  const sent = await deliverQueuedReplies(c.stub, 2);
  expect(sent.map((part) => part.imageBytes ?? part.text)).toEqual([finish.text, png.length]);
  await runInDurableObject(c.stub, (_, s) => {
    const committed = (id: string) =>
      s.storage.sql.exec("SELECT committed FROM output_assets WHERE id=?", id).one().committed;
    expect(committed(imageId)).toBe(1);
    expect(unused.map(committed)).toEqual(unused.map(() => -1));
    expect(
      s.storage.sql
        .exec("SELECT content FROM messages WHERE role='assistant' ORDER BY id DESC LIMIT 1")
        .one().content,
    ).toBe(`${finish.text}\n\n![Grok Bot 图片](/api/assets/${imageId})`);
  });
});
it("drops a failed task's uploads and keeps text-only results unchanged", async () => {
  const c = await setup();
  await c.send("/use grok");
  await c.send("画一只狗");
  const taskId = await c.wake();
  const claim = await c.tool("wechatai_claim", { taskId, claimId: crypto.randomUUID() });
  const res = await SELF.fetch(claim.imageUpload.url, { method: "PUT", body: png });
  const { imageId } = await res.json<{ imageId: string }>();
  const result = await c.tool("wechatai_finish", {
    taskId,
    receipt: claim.receipt,
    status: "failed",
    text: "",
    images: [imageId],
  });
  expect(result).toMatchObject({ taskStatus: "failed", cost: 0 });
  expect(result.images).toBeUndefined();
  expect((await deliverQueuedReplies(c.stub)).map((x) => x.imageBytes)).toEqual([undefined]);
  await runInDurableObject(c.stub, (_, s) =>
    expect(
      s.storage.sql.exec("SELECT committed FROM output_assets WHERE id=?", imageId).one().committed,
    ).toBe(-1),
  );
});

it("shows Grok Bot only to the configured accounts", async () => {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub.id);
  await runInDurableObject(stub, (_, s) => useManualAlarms(s));
  const api = async (action: string, input: unknown = {}) =>
    JSON.parse(await stub.api(action, input));
  const allow = (value: string) =>
    runInDurableObject(stub, (instance) => {
      (instance as unknown as { env: { GROK_BOT_ACCOUNTS: string } }).env.GROK_BOT_ACCOUNTS = value;
    });
  const config = { pluginId: "wechatai/grok", name: "测试 Bot", shortcut: "grok", webhookUrl };
  await allow("another-account");
  try {
    expect(await stub.snapshot()).toMatchObject({ grokBotVisible: false, grokBotReady: false });
    expect((await api("plugin.save", { ...config, webhookKey })).error).toBe("grok_unavailable");
    await allow(` another-account, ${stub.id.toString()} `);
    expect(await stub.snapshot()).toMatchObject({ grokBotVisible: true, grokBotReady: true });
    expect((await api("plugin.save", { ...config, webhookKey })).ok).toBe(true);
    await allow("");
    // A saved configuration stays visible so its owner can review or delete it.
    expect(await stub.snapshot()).toMatchObject({ grokBotVisible: true, grokBotReady: false });
  } finally {
    await allow("all");
  }
});

it("drains accepted work and rejects new WeChat messages while dispatch is disabled", async () => {
  const c = await setup();
  await c.send("/use grok");
  await c.send("先前已领取");
  const taskId = await c.wake();
  const claimArgs = { taskId, claimId: crypto.randomUUID() };
  const claim = await c.tool("wechatai_claim", claimArgs);
  await c.send("先前排队");
  const before = (await c.stub.snapshot()).wallet.balance;
  const setOrigin = (origin: string) =>
    runInDurableObject(c.stub, (instance) => {
      (instance as unknown as { env: { GROK_DISPATCH_ORIGIN: string } }).env.GROK_DISPATCH_ORIGIN =
        origin;
    });
  await setOrigin("");
  try {
    expect((await c.stub.snapshot()).grokBotReady).toBe(false);
    expect((await c.api("plugin.test", { id: c.id })).error).toBe("grok_unavailable");
    await expect(c.send("新消息")).rejects.toThrow(GROK_DISPATCH_UNAVAILABLE);
    const incoming = [
      {
        message_type: 1,
        message_id: 7,
        from_user_id: "owner",
        context_token: "fresh",
        item_list: [{ type: 1, text_item: { text: "@grok 新请求" } }],
      },
    ];
    const attempts = await deliverQueuedReplies(c.stub, 3, false, { incoming });
    expect(attempts.map((x) => x.text)).toContain(GROK_DISPATCH_UNAVAILABLE);
    await runInDurableObject(c.stub, (_, s) => {
      expect(s.storage.sql.exec("SELECT count(*) n FROM grok_tasks").one().n).toBe(2);
      expect(s.storage.sql.exec("SELECT count(*) n FROM messages WHERE role='user'").one().n).toBe(
        2,
      );
    });
    expect(await c.tool("wechatai_claim", claimArgs)).toEqual(claim);
    const finish = { taskId, receipt: claim.receipt, status: "completed", text: "可以交付" };
    const result = await c.tool("wechatai_finish", finish);
    expect(await c.tool("wechatai_finish", finish)).toEqual(result);
    expect(await c.wake()).toBe("");
    const sent = await deliverQueuedReplies(c.stub, 4);
    expect(sent.map((x) => x.text)).toContain(finish.text);
    expect(sent.map((x) => x.text).join("")).toContain("本次任务未发送，未扣平台 credits");
    expect((await c.stub.snapshot()).wallet.balance).toBeCloseTo(before - result.cost, 3);
  } finally {
    await setOrigin("https://grok-wake.example.test");
  }
  await c.send("恢复派发");
  expect(await c.tool("wechatai_claim", { taskId: await c.wake() })).toMatchObject({
    text: "恢复派发",
  });
});
it("serializes a conversation across transient failures and keeps each account isolated", async () => {
  const c = await setup();
  const other = await setup();
  await c.send("/use grok");
  await c.send("第一条私有任务");
  await c.send("第二条私有任务");
  const ref = await c.wake(429);
  expect(ref).toBeTruthy();
  expect(await c.wake()).toBe("");
  await expect(other.tool("wechatai_claim", { taskId: ref })).rejects.toThrow("任务不存在");
  await runInDurableObject(c.stub, (_, s) => {
    s.storage.sql.exec("UPDATE grok_tasks SET due=? WHERE ref=?", Date.now(), ref);
  });
  expect(await c.wake()).toBe(ref);
  const job = await c.tool("wechatai_claim", { taskId: ref });
  expect(job.text).toBe("第一条私有任务");
  expect(await c.wake()).toBe("");
  await expect(
    c.tool("wechatai_finish", {
      taskId: ref,
      receipt: crypto.randomUUID(),
      status: "completed",
      text: "错误结果",
    }),
  ).rejects.toThrow("凭据");
  await c.tool("wechatai_finish", {
    taskId: ref,
    receipt: job.receipt,
    status: "completed",
    text: "第一条结果",
  });
  const second = await c.wake();
  expect(second).toBeTruthy();
  expect(second).not.toBe(ref);
  expect(await c.tool("wechatai_claim", { taskId: second })).toMatchObject({
    text: "第二条私有任务",
    history: [
      { role: "user", text: job.text },
      { role: "assistant", text: "第一条结果" },
    ],
  });
  await other.send("@grok 另一账户的任务");
  expect(await other.tool("wechatai_claim", { taskId: await other.wake() })).toMatchObject({
    history: [],
    text: "另一账户的任务",
  });
});
it("rejects a late result, closes the expired job without billing and leaves no pending wake", async () => {
  const c = await setup();
  await c.send("/use grok");
  await c.send("慢任务");
  const ref = await c.wake();
  const claim = { taskId: ref, claimId: crypto.randomUUID() };
  const { receipt } = await c.tool("wechatai_claim", claim);
  const before = (await c.stub.snapshot()).wallet.balance;
  await runInDurableObject(c.stub, (_, s) => {
    const deadline = Date.now() - 1;
    s.storage.sql.exec(
      "UPDATE grok_tasks SET due=?,expires=? WHERE ref=?",
      deadline,
      deadline,
      ref,
    );
  });
  expect(await c.tool("wechatai_claim", claim)).toEqual({ claimed: false });
  await expect(
    c.tool("wechatai_finish", { taskId: ref, receipt, status: "completed", text: "超时结果" }),
  ).rejects.toThrow("超时");
  expect(await c.wake()).toBe("");
  await expect(
    c.tool("wechatai_finish", {
      taskId: ref,
      receipt,
      status: "completed",
      text: "闹钟结算后才回传",
    }),
  ).rejects.toThrow("已超时");
  const replies = await deliverQueuedReplies(c.stub, 2);
  expect(replies).toHaveLength(1);
  expect(replies[0].text).toContain("等待 Grok Bot 回传结果超时");
  expect(replies[0].text).toContain("未扣平台 credits");
  expect(replies[0].text).toContain("先到 Grok Bot 查看运行记录");
  expect((await c.stub.snapshot()).wallet.balance).toBe(before);
  expect(
    await runInDurableObject(c.stub, (i) => (i as unknown as { grok: GrokTasks }).grok.nextAt()),
  ).toBeNull();
  await c.send("核对上次任务");
  expect(await c.tool("wechatai_claim", { taskId: await c.wake() })).toMatchObject({
    history: [{ role: "user", text: "慢任务", taskStatus: "expired" }],
  });
});

it("tells the user when the deadline passed before Grok claimed the task", async () => {
  const c = await setup();
  await c.send("@grok 等待领取");
  const ref = await c.wake();
  await runInDurableObject(c.stub, (_, s) => {
    s.storage.sql.exec("UPDATE grok_tasks SET due=0,expires=0 WHERE ref=?", ref);
  });
  expect(await c.wake()).toBe("");
  expect(await c.tool("wechatai_claim", { taskId: ref })).toEqual({ claimed: false });
  const replies = await deliverQueuedReplies(c.stub, 2);
  expect(replies).toHaveLength(1);
  expect(replies[0].text).toContain("未被 Grok Bot 领取");
  expect(replies[0].text).toContain("未扣平台 credits");
});
it("revokes the original token and pending work on rebinding and honors an account migration freeze", async () => {
  const c = await setup();
  await c.send("@grok 换绑前的任务");
  const taskId = await c.wake();
  const saved = await c.api("plugin.save", { id: c.id, webhookUrl, webhookKey: "different-key" });
  expect(saved).toMatchObject({ ok: true, data: { hasKey: false } });
  expect((await c.rpc("tools/list")).status).toBe(401);
  const {
    data: { token },
  } = await c.api("plugin.grokToken", { id: c.id });
  const claim = await c.rpc("tools/call", { name: "wechatai_claim", arguments: { taskId } }, token);
  const reply = await claim.json<{ result: { content: { text: string }[] } }>();
  expect(JSON.parse(reply.result.content[0].text)).toEqual({ claimed: false });
  expect(
    await runInDurableObject(
      c.stub,
      (_, s) => s.storage.sql.exec("SELECT state FROM claw_jobs").one().state,
    ),
  ).toBe("cancelled");
  await env.DB.prepare("INSERT INTO account_backend_routes VALUES (?,?,'frozen',1)")
    .bind(crypto.randomUUID(), c.stub.id.toString())
    .run();
  expect((await c.rpc("tools/list", {}, token)).status).toBe(503);
});

it.each(["rotate", "rebind"])(
  "starts a fresh Grok history for a new credential after %s",
  async (operation) => {
    const c = await setup();
    await c.send("/use grok");
    await c.send("旧凭据的任务");
    const taskId = await c.wake();
    const { receipt } = await c.tool("wechatai_claim", { taskId });
    await c.tool("wechatai_finish", { taskId, receipt, status: "completed", text: "旧回答" });
    const session = (await c.stub.snapshot()).currentSession?.id;
    if (operation === "rebind")
      expect((await c.api("plugin.save", { id: c.id, webhookUrl, webhookKey })).ok).toBe(true);
    const {
      data: { token },
    } = await c.api("plugin.grokToken", { id: c.id });
    expect((await c.rpc("ping")).status).toBe(401);
    await c.send("重新开始");
    expect((await c.stub.snapshot()).currentSession?.id).toBe(session);
    expect(await c.tool("wechatai_claim", { taskId: await c.wake() }, token)).toMatchObject({
      text: "重新开始",
      history: [],
    });
  },
);

it("dispatches through the normal account alarm and cancels outstanding work across disable and re-enable", async () => {
  const c = await setup();
  await connectForManualDelivery(c.stub);
  await c.send("/use grok");
  await c.send("已有问题");
  const first = await c.wake();
  const { receipt } = await c.tool("wechatai_claim", { taskId: first });
  await c.tool("wechatai_finish", {
    taskId: first,
    receipt,
    status: "completed",
    text: "已有回答",
  });
  await deliverQueuedReplies(c.stub);
  await c.send("一条待取消任务");
  const taskId = await c.wake(204, true);
  expect(taskId).toBeTruthy();
  const claimed = await c.tool("wechatai_claim", { taskId });
  expect(claimed.claimed).toBe(true);
  await c.send("排队中的任务");
  expect((await c.api("plugin.save", { id: c.id, enabled: false })).ok).toBe(true);
  expect((await c.api("plugin.save", { id: c.id, enabled: true })).ok).toBe(true);
  await expect(
    c.tool("wechatai_finish", {
      taskId,
      receipt: claimed.receipt,
      status: "completed",
      text: "旧任务结果",
    }),
  ).rejects.toThrow();
  expect(await c.tool("wechatai_claim", { taskId })).toEqual({ claimed: false });
  expect(await c.wake()).toBe("");
  await c.send("继续");
  expect(await c.tool("wechatai_claim", { taskId: await c.wake() })).toMatchObject({
    text: "继续",
    history: [
      { role: "user", text: "已有问题" },
      { role: "assistant", text: "已有回答" },
    ],
  });
});

it.each([
  ["disable", "plugin.save", { enabled: false }, 403],
  ["revoke", "plugin.grokRevoke", {}, 401],
  ["replace webhook", "plugin.save", { webhookUrl, webhookKey: "replacement-key" }, 401],
  ["rotate token", "plugin.grokToken", {}, 401],
] as const)(
  "keeps a settled reply deliverable exactly once across %s",
  async (_, action, changes, authStatus) => {
    const c = await setup();
    await c.send("/use grok");
    await c.send("给我一份清单");
    const taskId = await c.wake();
    const { receipt } = await c.tool("wechatai_claim", { taskId });
    const before = (await c.stub.snapshot()).wallet.balance;
    const result = await c.tool("wechatai_finish", {
      taskId,
      receipt,
      status: "completed",
      text: "已完成清单",
    });
    expect(result.cost).toBeGreaterThan(0);

    expect((await c.api(action, { id: c.id, ...changes })).ok).toBe(true);
    expect((await c.rpc("tools/list")).status).toBe(authStatus);

    expect(await deliverQueuedReplies(c.stub, 2)).toEqual([
      { id: result.id + ":0", text: "已完成清单" },
    ]);
    expect((await c.stub.snapshot()).wallet.balance).toBeCloseTo(before - result.cost, 3);
  },
);

it.each([
  { current: true, legacy: false },
  { current: false, legacy: false },
  { current: true, legacy: true },
  { current: false, legacy: true },
])(
  "delivers a settled first part after deletion and restart (current=$current legacy=$legacy)",
  async ({ current, legacy }) => {
    const c = await setup();
    if (current) await c.send("/use grok");
    await c.send(current ? "整理日程" : "@grok 整理日程");
    const taskId = await c.wake();
    const { receipt } = await c.tool("wechatai_claim", { taskId });
    const before = (await c.stub.snapshot()).wallet.balance;
    const text = "明天十点开会";
    const result = await c.tool("wechatai_finish", { taskId, receipt, status: "completed", text });
    expect(result.cost).toBeGreaterThan(0);
    if (legacy)
      await runInDurableObject(c.stub, (_, s) =>
        s.storage.sql.exec(
          "UPDATE inbox SET payload=json_remove(payload,'$.remoteReply.grokName') WHERE id=?",
          result.id,
        ),
      );
    expect((await c.api("plugin.delete", { id: c.id })).ok).toBe(true);
    await c.restart();
    const expected = {
      id: result.id + ":0",
      text: current
        ? text
        : `消息来自已删除的 Grok Bot 配置${legacy ? "" : "「测试 Bot」"}。\n\n${text}`,
    };
    expect(await deliverQueuedReplies(c.stub, 1, true)).toEqual([expected]);
    await c.restart();
    expect(await deliverQueuedReplies(c.stub, 2)).toEqual([expected]);
    expect((await c.stub.snapshot()).wallet.balance).toBeCloseTo(before - result.cost, 3);
  },
);

it.each(["disable", "delete"])(
  "resumes a partially delivered Grok reply at the next part after %s",
  async (operation) => {
    const c = await setup();
    await c.send("/use grok");
    await c.send("回复一篇长文");
    const taskId = await c.wake();
    const { receipt } = await c.tool("wechatai_claim", { taskId });
    const first = "a".repeat(1500);
    const result = await c.tool("wechatai_finish", {
      taskId,
      receipt,
      status: "completed",
      text: first + "第二段",
    });
    expect(await deliverQueuedReplies(c.stub)).toEqual([{ id: result.id + ":0", text: first }]);
    const balance = (await c.stub.snapshot()).wallet.balance;
    await c.send("在途任务");
    const pending = await c.wake();
    const live = await c.tool("wechatai_claim", { taskId: pending });
    if (operation === "delete") {
      expect((await c.api("plugin.delete", { id: c.id })).ok).toBe(true);
      await runInDurableObject(c.stub, (_, s) => {
        expect(
          s.storage.sql.exec("SELECT 1 FROM claw_connectors WHERE pluginId=?", c.id).toArray(),
        ).toEqual([]);
        expect(
          s.storage.sql
            .exec(
              "SELECT j.state FROM claw_jobs j JOIN grok_tasks t ON t.jobId=j.id WHERE ref=?",
              pending,
            )
            .one().state,
        ).toBe("cancelled");
        expect(
          s.storage.sql.exec("SELECT content FROM messages WHERE role='assistant'").one().content,
        ).toBe(first + "第二段");
      });
    } else {
      expect((await c.api("plugin.save", { id: c.id, enabled: false })).ok).toBe(true);
      expect((await c.api("plugin.save", { id: c.id, enabled: true })).ok).toBe(true);
    }
    await expect(
      c.tool("wechatai_finish", {
        taskId: pending,
        receipt: live.receipt,
        status: "completed",
        text: "旧回复",
      }),
    ).rejects.toThrow();
    expect(await deliverQueuedReplies(c.stub, 2)).toEqual([
      { id: result.id + ":1", text: "第二段" },
    ]);
    expect((await c.stub.snapshot()).wallet.balance).toBe(balance);
  },
);

it.each([false, true])(
  "respects history clearing for a parked Grok reply after token rotation (clear=%s)",
  async (clear) => {
    const c = await setup();
    await c.send("/use grok");
    await c.send("整理本周的安排");
    const taskId = await c.wake();
    const { receipt } = await c.tool("wechatai_claim", { taskId });
    const result = await c.tool("wechatai_finish", {
      taskId,
      receipt,
      status: "completed",
      text: "本周安排",
    });
    const part = { id: result.id + ":0", text: "本周安排" };
    expect(await deliverQueuedReplies(c.stub, 5, true)).toEqual(Array(5).fill(part));
    const balance = (await c.stub.snapshot()).wallet.balance;
    expect((await c.api("plugin.grokToken", { id: c.id })).ok).toBe(true);
    expect(
      await runInDurableObject(
        c.stub,
        (_, state) =>
          state.storage.sql.exec("SELECT state FROM inbox WHERE id = ?", result.id).one().state,
      ),
    ).toBe("waiting_context");
    if (clear) expect((await c.api("privacy.clear")).ok).toBe(true);
    const incoming = [
      {
        message_type: 1,
        message_id: 1,
        from_user_id: "owner",
        context_token: "fresh",
        item_list: [{ type: 1, text_item: { text: "/wx help" } }],
      },
    ];
    const onWake = await deliverQueuedReplies(c.stub, 1, false, { incoming });
    const afterWake = await deliverQueuedReplies(c.stub, 3);
    expect([...onWake, ...afterWake].filter((m) => m.id === part.id)).toEqual(clear ? [] : [part]);
    expect((await c.stub.snapshot()).wallet.balance).toBe(balance);
  },
);

it.each([false, true])(
  "identifies the original Grok session on late delivery and resumes its history (one-shot=%s)",
  async (oneShot) => {
    const c = await setup();
    if (oneShot) {
      await c.stub.applyPayment({
        id: "plus",
        kind: "subscription",
        units: 0,
        expires: Date.now() + 86400000,
      });
      const host = await c.api("plugin.save", {
        pluginId: "wechatai/grok",
        name: "其他配置",
        shortcut: "other",
        webhookUrl,
        webhookKey,
      });
      expect(host.ok).toBe(true);
    }
    await c.send(oneShot ? "/use other" : "/use grok");
    const ask = (text: string) => c.send(oneShot ? `@grok ${text}` : text);
    await ask("分析旧项目的预算");
    const original = (await c.stub.snapshot()).currentSession!;
    const taskId = await c.wake();
    const { receipt } = await c.tool("wechatai_claim", { taskId });
    expect(await c.send("/wx new")).toContain("已开始新的会话");
    const other = (await c.stub.snapshot()).currentSession!;
    expect(other.id).not.toBe(original.id);
    const before = (await c.stub.snapshot()).wallet.balance;
    const text = "这笔预算可以批准";
    const settled = await c.tool("wechatai_finish", { taskId, receipt, status: "completed", text });
    const [attempt] = await deliverQueuedReplies(c.stub, 1, true);
    expect(attempt.text).toContain(`来自会话「${original.title}」`);
    expect(attempt.text).toContain("/wx sessions");
    expect(attempt.text).toContain("/wx switch");
    expect(attempt.text).toContain(text);
    expect(attempt.text.includes(`/app/sessions?id=${original.id}`)).toBe(oneShot);
    expect(attempt.text.includes("@grok 追问")).toBe(oneShot);
    await ask("新话题");
    const fresh = await c.tool("wechatai_claim", { taskId: await c.wake() });
    expect(fresh.history).toEqual([]);
    const list = await c.send("/wx sessions");
    const number = list
      .split("\n")
      .find((line) => line.includes(original.title))
      ?.split(".")[0];
    expect(number).toMatch(/^\d+$/);
    expect(await c.send(`/wx switch ${number}`)).toContain(original.title);
    await c.restart();
    expect(await deliverQueuedReplies(c.stub, 2)).toEqual([attempt]);
    expect((await c.stub.snapshot()).wallet.balance).toBeCloseTo(before - settled.cost, 3);
    await ask("继续说明");
    const followUp = await c.tool("wechatai_claim", { taskId: await c.wake() });
    expect(followUp.history).toEqual([
      { role: "user", text: "分析旧项目的预算" },
      { role: "assistant", text },
    ]);
  },
);
it("remembers an unsuccessful request as failed only within its conversation until history is cleared", async () => {
  const c = await setup();
  await c.stub.applyPayment({
    id: "plus",
    kind: "subscription",
    units: 0,
    expires: Date.now() + 86400000,
  });
  await c.send("/use grok");
  const original = (await c.stub.snapshot()).currentSession!.id;
  await c.send("整理明天的会议安排");
  const taskId = await c.wake();
  const { receipt } = await c.tool("wechatai_claim", { taskId });
  const before = (await c.stub.snapshot()).wallet.balance;
  await c.tool("wechatai_finish", { taskId, receipt, status: "failed", text: "内部诊断详情" });
  expect((await c.stub.snapshot()).wallet.balance).toBe(before);
  expect((await c.api("session.create", { pluginInstanceId: c.id, title: "第二个会话" })).ok).toBe(
    true,
  );
  await c.send("另一件事");
  expect(await c.tool("wechatai_claim", { taskId: await c.wake() })).toMatchObject({
    text: "另一件事",
    history: [],
  });
  expect((await c.api("session.action", { id: original, action: "switch" })).ok).toBe(true);
  await c.send("再试一次");
  expect(await c.tool("wechatai_claim", { taskId: await c.wake() })).toMatchObject({
    text: "再试一次",
    history: [{ role: "user", text: "整理明天的会议安排", taskStatus: "failed" }],
  });
  expect((await c.api("privacy.clear")).ok).toBe(true);
  await c.send("/use grok");
  await c.send("从头开始");
  expect(await c.tool("wechatai_claim", { taskId: await c.wake() })).toMatchObject({
    text: "从头开始",
    history: [],
  });
});

it.each(["lost", 202, 504, 521] as const)(
  "waits for the original claim after an uncertain wake (%s)",
  async (status) => {
    const c = await setup();
    await c.send("@grok 等候审批");
    const ref = await c.wake(status);
    expect(ref).toBeTruthy();
    await runInDurableObject(c.stub, (_, s) => {
      const timing = s.storage.sql
        .exec("SELECT due,expires,attempts FROM grok_tasks WHERE ref=?", ref)
        .one();
      if (status === 202) expect(timing.due).toBe(timing.expires);
      else expect(timing.due).toBeLessThan(Number(timing.expires));
      expect(timing.attempts).toBe(1);
    });
    expect(await c.wake()).toBe("");
    expect(await c.tool("wechatai_claim", { taskId: ref })).toMatchObject({ claimed: true });
    expect(await c.tool("wechatai_claim", { taskId: ref })).toEqual({ claimed: false });
  },
);

it.each(["disconnect", "bind", "changed generation"])(
  "drops old Grok work before another wake on %s",
  async (operation) => {
    const c = await setup();
    await c.send("/use grok");
    await c.send("旧连接上的任务");
    if (operation === "changed generation") {
      await runInDurableObject(c.stub, (_, s) =>
        s.storage.sql.exec(
          "UPDATE settings SET value=json_set(value,'$.generation','g2') WHERE key='connection'",
        ),
      );
    } else {
      const ref = await c.wake();
      const { receipt } = await c.tool("wechatai_claim", { taskId: ref });
      await c.send("尚未派发的第二条");
      const result = await runInDurableObject(c.stub, async (instance) => {
        const spy = vi
          .spyOn(globalThis, "fetch")
          .mockResolvedValue(Response.json({ qrcode: "mock", qrcode_img_content: "mock" }));
        try {
          return JSON.parse(
            await instance.api("wechat." + operation, {
              id: "default",
              regenerate: operation === "bind",
            }),
          );
        } finally {
          spy.mockRestore();
        }
      });
      expect(result.ok).toBe(true);
      await expect(
        c.tool("wechatai_finish", { taskId: ref, receipt, status: "completed", text: "旧结果" }),
      ).rejects.toThrow();
    }
    expect(await c.wake()).toBe("");
    await runInDurableObject(c.stub, (_, s) => {
      expect(
        s.storage.sql.exec("SELECT count(*) AS n FROM grok_tasks WHERE due IS NOT NULL").one().n,
      ).toBe(0);
      expect(s.storage.sql.exec("SELECT DISTINCT state FROM claw_jobs").toArray()).toEqual([
        { state: "cancelled" },
      ]);
    });
  },
);

it.each([3100, 31000])(
  "retains the latest failed instruction within the history budget (%i characters)",
  async (size) => {
    const c = await setup();
    await c.send("/use grok");
    const text = "a".repeat(size) + "最后以对照表呈现";
    await c.send(text);
    const taskId = await c.wake();
    const { receipt } = await c.tool("wechatai_claim", { taskId });
    const input = { taskId, receipt, status: "failed", text: "" };
    const result = await c.tool("wechatai_finish", input);
    expect(result).toMatchObject({ taskStatus: "failed", cost: 0 });
    expect(await c.tool("wechatai_finish", input)).toEqual(result);
    await expect(
      c.tool("wechatai_finish", { ...input, status: "completed", text: "迟到的结果" }),
    ).rejects.toThrow("已按失败结算");
    await c.send("按原要求再来一次");
    const nextId = await c.wake();
    const next = await c.tool("wechatai_claim", { taskId: nextId });
    expect(next.history).toEqual([
      {
        role: "user",
        taskStatus: "failed",
        text: text.slice(0, 30000),
        ...(size > 30000 ? { truncated: true } : {}),
      },
    ]);
    const billedInput = countTextTokens(next.text) + countTextTokens(text.slice(0, 30000));
    const before = (await c.stub.snapshot()).wallet.balance;
    const finish = { taskId: nextId, receipt: next.receipt, status: "completed", text: "好" };
    const settled = await c.tool("wechatai_finish", finish);
    expect(settled.cost).toBe(creditUnits(billedInput, countTextTokens("好")) / 1000);
    expect(await c.tool("wechatai_finish", finish)).toEqual(settled);
    expect((await c.stub.snapshot()).wallet.balance).toBeCloseTo(before - settled.cost, 3);
  },
);

it("keeps newer successful turns before spending the remaining history budget on a failed request", async () => {
  const c = await setup();
  await c.send("/use grok");
  const original = "甲".repeat(31_000);
  await c.send(original);
  const first = await c.wake();
  const failed = await c.tool("wechatai_claim", { taskId: first });
  await c.tool("wechatai_finish", {
    taskId: first,
    receipt: failed.receipt,
    status: "failed",
    text: "",
  });
  const question = "给我两个方案";
  const answer = "一是步行，二是骑车🚲";
  await c.send(question);
  const second = await c.wake();
  const job = await c.tool("wechatai_claim", { taskId: second });
  await c.tool("wechatai_finish", {
    taskId: second,
    receipt: job.receipt,
    status: "completed",
    text: answer,
  });
  await c.send("展开第二种方案");
  const next = await c.tool("wechatai_claim", { taskId: await c.wake() });
  expect(next.history).toEqual([
    {
      role: "user",
      text: original.slice(0, 30_000 - Array.from(question + answer).length),
      taskStatus: "failed",
      truncated: true,
    },
    { role: "user", text: question },
    { role: "assistant", text: answer },
  ]);
}, 30_000);

it("reads a bounded number of real SQLite rows at 10, 100 and 1000 turns", async () => {
  const c = await setup();
  const samples = await runInDurableObject(c.stub, (_, s) => {
    const db = s.storage.sql;
    const measured: number[] = [];
    let last = 0;
    for (const turns of [10, 100, 1000]) {
      const series =
        "WITH RECURSIVE nums(n) AS (SELECT ? UNION ALL SELECT n+1 FROM nums WHERE n<?)";
      db.exec(
        series +
          " INSERT INTO grok_tasks(ref,jobId,userMessage,answerMessage,expires,routeId,outcome) SELECT n,n,2*n-1,2*n,0,'bench','completed' FROM nums",
        last + 1,
        turns,
      );
      db.exec(
        series +
          " INSERT INTO messages(id,sessionId,role,content,createdAt) SELECT n,'bench',CASE n%2 WHEN 1 THEN 'user' ELSE 'assistant' END,CAST(n AS TEXT),0 FROM nums",
        last * 2 + 1,
        turns * 2,
      );
      const spy = vi.spyOn(db, "exec");
      try {
        const history = readGrokHistory(db, "bench", 2 * turns + 1);
        expect(history.map((x) => Number(x.text))).toEqual(
          Array.from({ length: 10 }, (_, i) => 2 * turns - 9 + i),
        );
        measured.push(
          spy.mock.results.reduce((n, r) => n + (r.type === "return" ? r.value.rowsRead : 0), 0),
        );
      } finally {
        spy.mockRestore();
      }
      last = turns;
    }
    return measured;
  });
  console.info("Grok history rows read (10/100/1000 turns)", JSON.stringify(samples));
  expect(samples[0]).toBeGreaterThan(0);
  expect(Math.max(...samples)).toBeLessThanOrEqual(150);
  expect(samples[1]).toBe(samples[0]);
  expect(samples[2]).toBe(samples[0]);
});

it.each([1, 3])(
  "upgrades existing Grok history and outstanding attempt %i atomically",
  async (attempts) => {
    const c = await setup();
    await c.send("/use grok");
    for (const status of ["completed", "failed"] as const) {
      await c.send(status === "completed" ? "先前的问题" : "先前失败的任务");
      const taskId = await c.wake();
      const { receipt } = await c.tool("wechatai_claim", { taskId });
      await c.tool("wechatai_finish", {
        taskId,
        receipt,
        status,
        text: status === "completed" ? "先前的答案" : "",
      });
    }
    await c.send("旧版本已派发");
    const pending = await c.wake();
    await runInDurableObject(c.stub, (instance, s) => {
      const db = s.storage.sql;
      db.exec(`DROP TRIGGER grok_task_cancelled;
      ALTER TABLE grok_tasks RENAME TO old_fixture;
      CREATE TABLE grok_tasks (ref TEXT PRIMARY KEY,jobId TEXT NOT NULL UNIQUE,userMessage INTEGER NOT NULL,
        answerMessage INTEGER,attempts INTEGER NOT NULL DEFAULT 0,due INTEGER,expires INTEGER NOT NULL);
      INSERT INTO grok_tasks SELECT ref,jobId,userMessage,answerMessage,attempts,due,expires FROM old_fixture;
      DROP TABLE old_fixture;`);
      db.exec("UPDATE grok_tasks SET attempts=?,due=? WHERE ref=?", attempts, Date.now(), pending);
      const queue = (instance as unknown as { grok: GrokTasks }).grok;
      queue.init();
      queue.init();
    });
    expect(await c.wake()).toBe("");
    const claim = { taskId: pending, claimId: crypto.randomUUID() };
    const first = await c.tool("wechatai_claim", claim);
    expect(await c.tool("wechatai_claim", claim)).toEqual(first);
    expect(first).toMatchObject({
      claimed: true,
      history: [
        { role: "user", text: "先前的问题" },
        { role: "assistant", text: "先前的答案" },
        { role: "user", text: "先前失败的任务", taskStatus: "failed" },
      ],
    });
  },
);

it("keeps confirmed unsent wakes closed and allows a claim during an uncertain replay", async () => {
  const c = await setup();
  await c.send("@grok 明确未发送后重试");
  const ref = await c.wake(503, false, { "X-Wechatai-Grok-Wake": "not-sent" });
  expect(await c.tool("wechatai_claim", { taskId: ref })).toEqual({ claimed: false });
  await runInDurableObject(c.stub, (_, s) =>
    s.storage.sql.exec("UPDATE grok_tasks SET due=? WHERE ref=?", Date.now(), ref),
  );
  expect(await c.wake(503)).toBe(ref);
  expect(await c.wake()).toBe("");
  expect(await c.tool("wechatai_claim", { taskId: ref })).toMatchObject({ claimed: true });
});

it.each([204, 503] as const)(
  "reconciles the same task after a Worker restart and preserves the original claim (last HTTP %i)",
  async (lastStatus) => {
    const c = await setup();
    await c.send("/use grok");
    await c.send("第一条");
    await c.send("第二条");
    const before = (await c.stub.snapshot()).wallet.balance;
    const start = Date.now();
    const ref = await c.wake("lost");
    expect(ref).toBeTruthy();
    await c.restart();
    for (const [attempt, status] of [
      [1, 521],
      [2, lastStatus],
    ] as const) {
      await runInDurableObject(c.stub, (instance, s) => {
        const task = s.storage.sql
          .exec<{ attempts: number; due: number; expires: number }>(
            "SELECT attempts,due,expires FROM grok_tasks WHERE ref=?",
            ref,
          )
          .one();
        expect(task.attempts).toBe(attempt);
        expect(task.due).toBeGreaterThanOrEqual(start + attempt * 60_000);
        expect(task.due).toBeLessThan(task.expires);
        expect((instance as unknown as { grok: GrokTasks }).grok.nextAt()).toBe(task.due);
        s.storage.sql.exec("UPDATE grok_tasks SET due=0 WHERE ref=?", ref);
      });
      expect(await c.wake(status, false, { "X-Wechatai-Grok-Wake": "not-sent" })).toBe(ref);
    }
    expect(await c.wake()).toBe("");
    await runInDurableObject(c.stub, (_, s) => {
      expect(
        s.storage.sql
          .exec("SELECT attempts,due=expires AS waiting FROM grok_tasks WHERE ref=?", ref)
          .one(),
      ).toEqual({ attempts: 3, waiting: 1 });
    });
    const { receipt } = await c.tool("wechatai_claim", { taskId: ref });
    const finish = { taskId: ref, receipt, status: "completed", text: "已处理" };
    const paid = await c.tool("wechatai_finish", finish);
    expect(await c.tool("wechatai_finish", finish)).toEqual(paid);
    expect((await c.stub.snapshot()).wallet.balance).toBeCloseTo(before - paid.cost, 3);
    expect(await c.tool("wechatai_claim", { taskId: await c.wake() })).toMatchObject({
      text: "第二条",
      history: [
        { role: "user", text: "第一条" },
        { role: "assistant", text: "已处理" },
      ],
    });
  },
);

it.each([429, 502])(
  "closes an uncertain wake on a confirmed HTTP %i decline from Go",
  async (transient) => {
    const c = await setup();
    await c.send("/use grok");
    await c.send("被拒任务");
    await c.send("下一条");
    const ref = await c.wake(502);
    const before = (await c.stub.snapshot()).wallet.balance;
    for (const status of [transient, 422]) {
      await runInDurableObject(c.stub, (_, s) =>
        s.storage.sql.exec("UPDATE grok_tasks SET due=0 WHERE ref=?", ref),
      );
      expect(await c.wake(status, false, { "X-Wechatai-Grok-Receipt": "declined" })).toBe(ref);
      expect(await c.tool("wechatai_claim", { taskId: ref })).toEqual({ claimed: false });
    }
    expect(await c.wake()).toBe("");
    expect((await c.stub.snapshot()).wallet.balance).toBe(before);
    expect(await c.tool("wechatai_claim", { taskId: await c.wake() })).toMatchObject({
      text: "下一条",
    });
  },
);

it.each([
  ["a confirmed unsent wake", 503, { "X-Wechatai-Grok-Wake": "not-sent" }, 5_000],
  ["a provider rate limit", 429, {}, 60_000],
] as const)("schedules the first retry after %s", async (_, status, headers, delay) => {
  const c = await setup();
  await c.send("@grok 跨境连接慢");
  const task = (ref: string) =>
    runInDurableObject(c.stub, (_, s) =>
      s.storage.sql
        .exec<{ due: number; attempts: number }>(
          "SELECT due,attempts FROM grok_tasks WHERE ref=?",
          ref,
        )
        .one(),
    );
  const before = Date.now();
  const ref = await c.wake(status, false, headers);
  const first = await task(ref);
  expect(first.attempts).toBe(1);
  expect(first.due).toBeGreaterThanOrEqual(before + delay);
  expect(first.due).toBeLessThan(Date.now() + delay + 1_000);
  // Only the first unsent retry is quick, so an outage still spans minutes.
  await runInDurableObject(c.stub, (_, s) =>
    s.storage.sql.exec("UPDATE grok_tasks SET due=0 WHERE ref=?", ref),
  );
  const retried = Date.now();
  expect(await c.wake(503, false, { "X-Wechatai-Grok-Wake": "not-sent" })).toBe(ref);
  const second = await task(ref);
  expect(second.attempts).toBe(2);
  expect(second.due).toBeGreaterThanOrEqual(retried + 120_000);
});

it("releases the route without charging after three confirmed unsent attempts", async () => {
  const c = await setup();
  await c.send("/use grok");
  await c.send("第一条任务");
  await c.send("下一条任务");
  const before = (await c.stub.snapshot()).wallet.balance;
  const notSent = { "X-Wechatai-Grok-Wake": "not-sent" };
  const ref = await c.wake(503, false, notSent);
  expect(ref).toBeTruthy();
  for (const attempt of [2, 3]) {
    await runInDurableObject(c.stub, (_, s) => {
      const { due, expires, attempts } = s.storage.sql
        .exec<{ due: number; expires: number; attempts: number }>(
          "SELECT due,expires,attempts FROM grok_tasks WHERE ref=?",
          ref,
        )
        .one();
      expect(attempts).toBe(attempt - 1);
      expect(due).toBeGreaterThan(Date.now());
      expect(due).toBeLessThan(expires);
      s.storage.sql.exec("UPDATE grok_tasks SET due=0 WHERE ref=?", ref);
    });
    expect(await c.wake(503, false, notSent)).toBe(ref);
  }
  expect(await c.wake()).toBe("");
  expect(await c.tool("wechatai_claim", { taskId: ref })).toEqual({ claimed: false });
  expect((await c.stub.snapshot()).wallet.balance).toBe(before);
  expect(await c.tool("wechatai_claim", { taskId: await c.wake() })).toMatchObject({
    claimed: true,
    text: "下一条任务",
  });
});
