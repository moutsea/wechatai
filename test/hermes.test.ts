import { env, SELF, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonalAccount } from "../src/server/personal-account";
import type { WxMessage } from "../src/server/wechat";
import { parseOpenClawPairing, parseOpenClawToken } from "../src/server/openclaw-token";
import { countTextTokens } from "../src/server/tokenizer";
import { creditUnits } from "../src/server/wallet";
import { deliverQueuedReplies } from "./helpers/wechat-delivery";

const accounts: DurableObjectStub<PersonalAccount>[] = [];
const api = async (
  stub: DurableObjectStub<PersonalAccount>,
  action: string,
  payload: unknown = {},
) => JSON.parse(await stub.api(action, payload));
const send = (stub: DurableObjectStub<PersonalAccount>, text: string, id = crypto.randomUUID()) =>
  runInDurableObject(stub, (instance) =>
    (
      instance as unknown as {
        processWechat(id: string, message: WxMessage, link: string): Promise<string>;
      }
    ).processWechat(id, { item_list: [{ type: 1, text_item: { text } }] }, "default"),
  );
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, (_, state) => state.storage.deleteAlarm());
  vi.restoreAllMocks();
});
async function setup(plus = true) {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  if (plus)
    await stub.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
  await api(stub, "wechat.create", { name: "微信" });
  await runInDurableObject(stub, (_, state) =>
    state.storage.sql.exec(
      "INSERT INTO settings VALUES ('connection', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      JSON.stringify({ status: "connected", generation: "g1", contextToken: "context" }),
    ),
  );
  const saved = await api(stub, "plugin.save", {
    pluginId: "wechatai/hermes",
    name: "我的 Hermes",
    shortcut: "hermes",
    agentId: "main",
  });
  expect(saved.ok).toBe(true);
  const id = saved.data.id;
  const pairing = await api(stub, "plugin.hermesPair", { id });
  expect(pairing.ok).toBe(true);
  const code = /"code":"([^"]+)"/.exec(pairing.data.command)![1];
  const auth = parseOpenClawPairing(env, `Bearer ${code}`, "hermes")!;
  expect(auth.pluginId).toBe(id);
  const exchange = (proof = "b".repeat(43)) =>
    stub
      .openClawRequest(
        id,
        auth.secret,
        "pair",
        {
          proof,
          agents: [{ id: "main", name: "Hermes 当前配置", isDefault: true }],
        },
        "hermes",
      )
      .then(JSON.parse);
  const paired = await exchange();
  expect(paired.ok).toBe(true);
  const token = paired.data.token;
  const secret = parseOpenClawToken(env, `Bearer ${token}`, "hermes")!.secret;
  const runnerId = crypto.randomUUID();
  const call = (action: string, body: Record<string, unknown> = {}) =>
    stub.openClawRequest(id, secret, action, { runnerId, ...body }, "hermes").then(JSON.parse);
  return { stub, saved, id, code, exchange, token, secret, runnerId, call };
}
async function ready() {
  const ctx = await setup();
  if (!ctx.call) throw new Error("setup");
  await send(ctx.stub, "/use hermes");
  const text = "请只回复连接成功";
  expect(await send(ctx.stub, text)).toBe("已成功转发，等待回复...");
  const job = (await ctx.call("poll")).data.jobs[0];
  expect((await ctx.call("claim", { id: job.id })).data.claimed).toBe(true);
  const event = {
    eventId: crypto.randomUUID(),
    routeId: job.routeId,
    jobId: job.id,
    status: "completed",
    text: "连接成功",
  };
  return { ...ctx, call: ctx.call, text, job, event };
}
describe("Hermes native channel", () => {
  it("reports the current plugin without billing, including disabled plugins after Plus expires", async () => {
    const ctx = await setup();
    await send(ctx.stub, "/use hermes");
    const before = (await api(ctx.stub, "snapshot")).data;
    const plusHelp = await send(ctx.stub, "/wx help");
    expect(plusHelp).toContain("`/wx plugins`：查看已配置插件");
    expect(plusHelp).toContain("`/use ds`：仅按插件别名");
    expect(plusHelp).not.toContain("Plus：");
    expect(await send(ctx.stub, "/wx status")).toBe(
      "**当前插件**\n\n- 名称：我的 Hermes\n- 快捷名：@hermes",
    );
    const after = (await api(ctx.stub, "snapshot")).data;
    expect(after.currentSession.id).toBe(before.currentSession.id);
    expect(after.wallet.balance).toBe(before.wallet.balance);
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, enabled: false });
    await runInDurableObject(ctx.stub, (_, state) =>
      state.storage.sql.exec("UPDATE settings SET value = '0' WHERE key = 'planUntil'"),
    );
    expect(await send(ctx.stub, "/wx status")).toBe(
      "**当前插件**\n\n- 名称：我的 Hermes（已停用）\n- 快捷名：@hermes",
    );
    const expiredHelp = await send(ctx.stub, "/wx help");
    expect(expiredHelp).toContain("`/wx plugins`");
    expect(expiredHelp).toContain("`/use ds`");
  });
  it("allows Free pairing without a platform LLM channel", async () => {
    const free = await setup(false);
    expect(free.saved.ok).toBe(true);
    expect(await send(free.stub, "/wx plugins")).toContain("我的 Hermes");
    expect(await send(free.stub, "/use hermes")).toContain("已进入");
    expect(await send(free.stub, "@hermes 你好")).toBe("已成功转发，等待回复...");
    expect((await free.call("poll")).data.jobs).toHaveLength(1);
    const plus = await setup();
    expect(plus.saved.data).toMatchObject({
      pluginId: "wechatai/hermes",
      shortcut: "hermes",
      maxInputTokens: 128000,
    });
  });
  it("isolates pairing and transport credentials from OpenClaw, and allows only same-proof retries", async () => {
    const ctx = await setup();
    expect(parseOpenClawPairing(env, `Bearer ${ctx.code}`)).toBeNull();
    expect(parseOpenClawToken(env, `Bearer ${ctx.token}`)).toBeNull();
    expect((await ctx.exchange!()).data.token).toBe(ctx.token);
    expect((await ctx.exchange!("c".repeat(43))).ok).toBe(false);
    expect(
      JSON.parse(await ctx.stub.openClawRequest(ctx.id!, ctx.secret!, "heartbeat", {})).ok,
    ).toBe(false);
    const wrong = await SELF.fetch("https://wechatai.app/api/openclaw/poll", {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.token}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(wrong.status).toBe(401);
    const status = (await api(ctx.stub, "plugin.hermesStatus", { id: ctx.id })).data;
    expect(JSON.stringify(status)).not.toContain(ctx.token);
    await ctx.call!("heartbeat");
    expect(
      (await api(ctx.stub, "plugin.hermesStatus", { id: ctx.id })).data.lastSeen,
    ).toBeGreaterThan(0);
  });
  it("charges only the boundary once and delivers user-requested replies without a source notice", async () => {
    const ctx = await ready();
    const before = (await api(ctx.stub, "snapshot")).data.wallet.balance;
    expect((await ctx.call("event", ctx.event)).ok).toBe(true);
    expect((await ctx.call("event", ctx.event)).ok).toBe(true);
    const after = (await api(ctx.stub, "snapshot")).data.wallet.balance;
    expect(after).toBeCloseTo(
      before - creditUnits(countTextTokens(ctx.text), countTextTokens(ctx.event.text)) / 1000,
      3,
    );
    const texts = await runInDurableObject(ctx.stub, (_, state) => [
      ...state.storage.sql.exec<{ text: string }>(
        "SELECT reply AS text FROM inbox WHERE state = 'reply'",
      ),
    ]);
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe(ctx.event.text);
  });
  it("adds source guidance and a separator to proactive messages even in the source plugin", async () => {
    const ctx = await ready();
    await ctx.call("event", ctx.event);
    const text = "后台任务已完成";
    const result = await ctx.call("event", {
      eventId: crypto.randomUUID(),
      routeId: ctx.job.routeId,
      text,
    });
    expect(result.ok).toBe(true);
    expect(result.data.cost).toBe(creditUnits(0, countTextTokens(text)) / 1000);
    const delivered = await deliverQueuedReplies(ctx.stub, 2);
    expect(delivered[1].text).toBe(
      "消息来自 Hermes（我的 Hermes）插件。\n使用 /use hermes 进入插件，或发送 @hermes 回复内容。\n\n──────────\n\n" +
        text,
    );
  });
  it.each(["temporary", "delayed"])(
    "labels %s Hermes replies while OpenClaw remains active without billing the notice",
    async (mode) => {
      const ctx = await setup();
      const call = ctx.call!;
      await api(ctx.stub, "plugin.save", { ...ctx.saved.data, allowProactive: false });
      const claw = await api(ctx.stub, "plugin.save", {
        pluginId: "wechatai/openclaw",
        name: "Claw",
        shortcut: "claw",
      });
      expect(claw.ok).toBe(true);
      await api(ctx.stub, "plugin.clawToken", { id: claw.data.id });
      await send(ctx.stub, mode === "temporary" ? "/use claw" : "/use hermes");
      const text = "今天上海天气如何";
      await send(ctx.stub, mode === "temporary" ? `@hermes ${text}` : text);
      const job = (await call("poll")).data.jobs[0];
      expect((await call("claim", { id: job.id })).data.claimed).toBe(true);
      if (mode === "delayed") await send(ctx.stub, "/use claw");
      const before = (await api(ctx.stub, "snapshot")).data;
      expect(before.currentSession.pluginInstanceId).toBe(claw.data.id);
      expect(await send(ctx.stub, "/wx status")).toBe(
        "**当前插件**\n\n- 名称：Claw\n- 快捷名：@claw",
      );
      const event = {
        eventId: crypto.randomUUID(),
        routeId: job.routeId,
        jobId: job.id,
        text: "上海今天阴到多云，出门可以带把伞。",
      };
      const result = await call("event", event);
      expect(result.ok).toBe(true);
      expect((await call("event", event)).data).toEqual(result.data);
      const cost = creditUnits(countTextTokens(text), countTextTokens(event.text)) / 1000;
      expect(result.data.cost).toBe(cost);
      const after = (await api(ctx.stub, "snapshot")).data;
      expect(after.currentSession.id).toBe(before.currentSession.id);
      expect(after.wallet.balance).toBeCloseTo(before.wallet.balance - cost, 3);
      const stored = await runInDurableObject(ctx.stub, (_, state) => {
        const rows = state.storage.sql
          .exec<{ reply: string; sessionId: string }>(
            "SELECT reply,sessionId FROM inbox WHERE id = ?",
            result.data.id,
          )
          .toArray();
        const history = state.storage.sql
          .exec<{ content: string }>(
            "SELECT content FROM messages WHERE sessionId = ? ORDER BY id DESC LIMIT 1",
            rows[0].sessionId,
          )
          .one().content;
        return { rows, history };
      });
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0].reply).toBe(event.text);
      const delivered = await deliverQueuedReplies(ctx.stub);
      expect(delivered[0].text).toBe(
        "消息来自 Hermes（我的 Hermes）插件。\n使用 /use hermes 进入插件，或发送 @hermes 回复内容。\n\n──────────\n\n" +
          event.text,
      );
      expect(stored.history).toBe(event.text);
    },
  );
  it("uses the destination link's mode instead of the link selected in the web dashboard", async () => {
    const ctx = await ready();
    const otherLink = await api(ctx.stub, "wechat.create", { name: "另一个微信" });
    expect(otherLink.ok).toBe(true);
    expect(otherLink.data.selectedConnectionId).not.toBe("default");
    expect(await send(ctx.stub, "/wx status")).toContain("我的 Hermes");
    const result = await ctx.call("event", ctx.event);
    expect(result.ok).toBe(true);
    const stored = await runInDurableObject(ctx.stub, (_, state) =>
      state.storage.sql
        .exec<{ reply: string; connectionId: string }>(
          "SELECT reply,connectionId FROM inbox WHERE id = ?",
          result.data.id,
        )
        .one(),
    );
    expect(stored).toEqual({ reply: ctx.event.text, connectionId: "default" });
    expect((await deliverQueuedReplies(ctx.stub))[0].text).toBe(ctx.event.text);
  });
  it("supports single-use @, direct switching and session reset", async () => {
    const ctx = await ready();
    await ctx.call("event", ctx.event);
    await send(ctx.stub, "/exit");
    expect(await send(ctx.stub, "@hermes 临时调用")).toBe("已成功转发，等待回复...");
    const claw = await api(ctx.stub, "plugin.save", {
      pluginId: "wechatai/openclaw",
      name: "Claw",
      shortcut: "claw",
      agentId: "main",
    });
    expect(claw.ok).toBe(true);
    await api(ctx.stub, "plugin.clawToken", { id: claw.data.id });
    expect(await send(ctx.stub, "/use claw")).toContain("Claw");
    expect(await send(ctx.stub, "/use hermes")).toContain("Hermes");
    await send(ctx.stub, "/wx reset");
    expect(
      (await ctx.call("event", { ...ctx.event, jobId: undefined, eventId: crypto.randomUUID() }))
        .ok,
    ).toBe(false);
    await send(ctx.stub, "新的会话");
    const jobs = (await ctx.call("poll")).data.jobs;
    expect(jobs.at(-1).routeId).not.toBe(ctx.job.routeId);
  });
  it("honors waiting notices and fails without charging", async () => {
    const ctx = await setup();
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, waitingMessageEnabled: false });
    await send(ctx.stub, "/use hermes");
    const text = await send(ctx.stub, "测试关闭提示");
    expect(text).not.toContain("等待回复");
    const before = (await api(ctx.stub, "snapshot")).data.wallet.balance;
    const job = (await ctx.call!("poll")).data.jobs[0];
    await ctx.call!("claim", { id: job.id });
    await ctx.call!("event", {
      eventId: crypto.randomUUID(),
      routeId: job.routeId,
      jobId: job.id,
      status: "failed",
      text: "",
    });
    expect((await api(ctx.stub, "snapshot")).data.wallet.balance).toBe(before);
    expect(await ctx.stub.adminStats()).toMatchObject({
      failedRequests: 1,
      lastFailureCode: "remote_agent_failed",
      credits: 0,
    });
  });
  it("exposes read-only machine-readable documentation", async () => {
    const doc = await SELF.fetch("https://wechatai.app/developers/hermes.md");
    expect(doc.status).toBe(200);
    expect(await doc.text()).toContain("/api/hermes/{action}");
    const manifest = await SELF.fetch("https://wechatai.app/api/plugins/hermes");
    expect(((await manifest.json()) as { manifest: { id: string } }).manifest.id).toBe(
      "wechatai/hermes",
    );
  });
});
