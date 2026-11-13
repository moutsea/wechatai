import { env, SELF, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonalAccount } from "../src/server/personal-account";
import type { WxMessage } from "../src/server/wechat";
import { parseOpenClawPairing, parseOpenClawToken } from "../src/server/openclaw-token";
import { deliverQueuedReplies } from "./helpers/wechat-delivery";
import { countTextTokens, limitTextTokens } from "../src/server/tokenizer";
import { creditUnits } from "../src/server/wallet";

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
    pluginId: "wechatai/muse",
    name: "我的 Muse",
    shortcut: "muse",
    agentId: "main",
  });
  expect(saved.ok).toBe(true);
  const id = saved.data.id;
  const pairing = await api(stub, "plugin.musePair", { id });
  expect(pairing.ok).toBe(true);
  const code = /"code":"([^"]+)"/.exec(pairing.data.command)![1];
  const auth = parseOpenClawPairing(env, `Bearer ${code}`, "muse")!;
  expect(auth.pluginId).toBe(id);
  const exchange = (proof = "b".repeat(43)) =>
    stub
      .openClawRequest(
        id,
        auth.secret,
        "pair",
        {
          proof,
          agents: [{ id: "main", name: "Muse 托管助理", isDefault: true }],
        },
        "muse",
      )
      .then(JSON.parse);
  const paired = await exchange();
  expect(paired.ok).toBe(true);
  const token = paired.data.token;
  const secret = parseOpenClawToken(env, `Bearer ${token}`, "muse")!.secret;
  const runnerId = crypto.randomUUID();
  const call = (action: string, body: Record<string, unknown> = {}) =>
    stub.openClawRequest(id, secret, action, { runnerId, ...body }, "muse").then(JSON.parse);
  return { stub, saved, id, code, exchange, token, secret, runnerId, call };
}
describe("Muse hosted hook channel", () => {
  it("pairs without a platform model and remains waiting until the hook connects", async () => {
    const ctx = await setup(false);
    const status = (await api(ctx.stub, "plugin.museStatus", { id: ctx.id })).data;
    expect(status).toMatchObject({ hasKey: true, lastSeen: 0, nativeCommands: false });
    expect(JSON.stringify(status)).not.toContain(ctx.token);
    const pair = await api(ctx.stub, "plugin.musePair", { id: ctx.id });
    expect(pair.data.command).toContain("Muse 托管环境");
    expect(pair.data.command).toContain("SETUP.md");
    expect(pair.data.command).toContain("wechatai-muse-connect.py");
    await ctx.call("heartbeat", {
      agents: [{ id: "main", name: "Muse 托管助理", isDefault: true }],
      connectorVersion: "1.0.0",
    });
    expect(
      (await api(ctx.stub, "plugin.museStatus", { id: ctx.id })).data.lastSeen,
    ).toBeGreaterThan(0);
  });

  it("separates Muse credentials and one-time pairing from other agents", async () => {
    const ctx = await setup();
    for (const kind of ["hermes", "openclaw"] as const) {
      expect(parseOpenClawPairing(env, `Bearer ${ctx.code}`, kind)).toBeNull();
      expect(parseOpenClawToken(env, `Bearer ${ctx.token}`, kind)).toBeNull();
    }
    expect((await ctx.exchange()).data.token).toBe(ctx.token);
    expect((await ctx.exchange("c".repeat(43))).ok).toBe(false);
    expect((await api(ctx.stub, "plugin.hermesStatus", { id: ctx.id })).ok).toBe(false);
    const wrong = await SELF.fetch("https://wechatai.app/api/hermes/poll", {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.token}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(wrong.status).toBe(401);
    const correct = await SELF.fetch("https://wechatai.app/api/muse/poll", {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.token}`, "content-type": "application/json" },
      body: JSON.stringify({ runnerId: ctx.runnerId }),
    });
    expect(correct.status).toBe(200);
  });

  it("claims once and settles only accepted final text, with duplicate event protection", async () => {
    const ctx = await setup();
    const entered = await send(ctx.stub, "/use muse");
    expect(entered).toContain("Muse 托管助理");
    expect(entered).not.toContain("命令会交给");
    const text = "请整理本周计划";
    await send(ctx.stub, text);
    const job = (await ctx.call("poll")).data.jobs[0];
    expect(job.text).toBe(text);
    expect((await ctx.call("claim", { id: job.id })).data).toMatchObject({
      claimed: true,
      maxOutputTokens: 4096,
    });
    expect((await ctx.call("claim", { id: job.id })).data.claimed).toBe(false);
    const before = (await ctx.stub.snapshot()).wallet.balance;
    const event = {
      eventId: crypto.randomUUID(),
      routeId: job.routeId,
      jobId: job.id,
      text: "计划已经整理完成",
    };
    const first = await ctx.call("event", event);
    expect(first.ok).toBe(true);
    expect(first.data.acceptedText).toBe(event.text);
    expect(first.data.cost).toBe(
      creditUnits(countTextTokens(text), countTextTokens(event.text)) / 1000,
    );
    expect((await ctx.call("event", event)).data).toEqual(first.data);
    expect((await ctx.stub.snapshot()).wallet.balance).toBeCloseTo(before - first.data.cost, 3);
    expect((await ctx.call("poll")).data.jobs).toHaveLength(0);
    const delivered = await deliverQueuedReplies(ctx.stub);
    expect(delivered[0].text).toBe(event.text);
  });

  it.each(["clear", "delete", "privacy.clear"])(
    "%s removes reply bodies after a route reset while keeping billing deduplication",
    async (action) => {
      const ctx = await setup();
      await send(ctx.stub, "/use muse");
      await send(ctx.stub, "第一段会话的要求");
      const sessionId = (await ctx.stub.snapshot()).currentSession!.id;
      const job = (await ctx.call("poll")).data.jobs[0];
      await ctx.call("claim", { id: job.id });
      const events = [
        {
          eventId: crypto.randomUUID(),
          routeId: job.routeId,
          jobId: job.id,
          text: "需要删除的最终回复",
        },
        { eventId: crypto.randomUUID(), routeId: job.routeId, text: "需要删除的主动通知" },
      ];
      const receipts: { id: string; acceptedText: string }[] = [];
      for (const event of events) {
        const accepted = await ctx.call("event", event);
        expect(accepted.ok).toBe(true);
        receipts.push(accepted.data);
      }
      // Clearing must still find receipts after their original route is gone.
      await send(ctx.stub, "/wx reset");
      await send(ctx.stub, "/wx new");
      await send(ctx.stub, "另一段会话的要求");
      const other = (await ctx.call("poll")).data.jobs[0];
      await ctx.call("claim", { id: other.id });
      const otherEvent = {
        eventId: crypto.randomUUID(),
        routeId: other.routeId,
        jobId: other.id,
        text: "其他会话保留的回复",
      };
      expect((await ctx.call("event", otherEvent)).ok).toBe(true);
      const balance = (await ctx.stub.snapshot()).wallet.balance;
      const cleared =
        action === "privacy.clear"
          ? await api(ctx.stub, "privacy.clear")
          : await api(ctx.stub, "session.action", { id: sessionId, action });
      expect(cleared.ok).toBe(true);
      for (const [i, event] of events.entries()) {
        const retry = await ctx.call("event", event);
        expect(retry.data).toEqual({ ...receipts[i], acceptedText: "", historyCleared: true });
      }
      const otherRetry = await ctx.call("event", otherEvent);
      expect(otherRetry.data.acceptedText).toBe(action === "privacy.clear" ? "" : otherEvent.text);
      expect((await ctx.stub.snapshot()).wallet.balance).toBe(balance);
      await runInDurableObject(ctx.stub, (_, state) => {
        const sql = state.storage.sql;
        expect(
          sql.exec("SELECT * FROM messages WHERE sessionId = ?", sessionId).toArray(),
        ).toHaveLength(0);
        expect(
          sql.exec("SELECT * FROM inbox WHERE sessionId = ? AND reply != ''", sessionId).toArray(),
        ).toHaveLength(0);
        for (const receipt of receipts) {
          expect(sql.exec("SELECT * FROM runs WHERE id = ?", receipt.id).toArray()).toHaveLength(0);
          const stored = sql
            .exec<{ receipt: string }>(
              "SELECT receipt FROM claw_events WHERE id = ?",
              receipt.id.slice(5),
            )
            .one();
          expect(stored.receipt).not.toContain("需要删除");
        }
      });
      expect((await ctx.call("event", { ...events[0], eventId: crypto.randomUUID() })).status).toBe(
        409,
      );
      expect((await ctx.stub.snapshot()).wallet.balance).toBe(balance);
    },
  );

  it("returns the same accepted text and bill after truncation, config changes and retries", async () => {
    const ctx = await setup();
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, maxOutputTokens: 256 });
    await send(ctx.stub, "/use muse");
    const input = "分析内容";
    await send(ctx.stub, input);
    const job = (await ctx.call("poll")).data.jobs[0];
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, maxOutputTokens: 1024 });
    expect((await ctx.call("claim", { id: job.id })).data.maxOutputTokens).toBe(256);
    const text = "这是一份完整的分析内容。".repeat(100) + "未发送的选项";
    const acceptedText = limitTextTokens(text, 256);
    const event = { eventId: crypto.randomUUID(), routeId: job.routeId, jobId: job.id, text };
    const before = (await ctx.stub.snapshot()).wallet.balance;
    const first = await ctx.call("event", event);
    expect(first.data.truncated).toBe(true);
    expect(first.data.acceptedText.startsWith("【回复已截断】")).toBe(true);
    expect(first.data.acceptedText.endsWith("\n\n" + acceptedText)).toBe(true);
    expect(first.data.acceptedText).toContain("256 tokens 回复上限");
    expect(first.data.acceptedText).toContain("此提示不计 credits");
    expect(first.data.acceptedText).not.toContain("未发送的选项");
    const cost = creditUnits(countTextTokens(input), countTextTokens(acceptedText)) / 1000;
    expect(first.data.cost).toBe(cost);
    const stored = await runInDurableObject(ctx.stub, (_, state) =>
      state.storage.sql
        .exec<{ content: string; outputTokens: number }>(
          "SELECT content,outputTokens FROM messages WHERE role='assistant' ORDER BY id DESC LIMIT 1",
        )
        .one(),
    );
    expect(stored).toMatchObject({
      content: first.data.acceptedText,
      outputTokens: countTextTokens(acceptedText),
    });
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, maxOutputTokens: 1024 });
    expect((await ctx.call("event", event)).data).toEqual(first.data);
    expect((await ctx.stub.snapshot()).wallet.balance).toBeCloseTo(before - cost, 3);
    const delivered = await deliverQueuedReplies(ctx.stub);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].text).toBe(first.data.acceptedText);
  });

  it("gives the worker the reduced reply limit in effect at claim time", async () => {
    const ctx = await setup();
    await send(ctx.stub, "/use muse");
    await send(ctx.stub, "整理方案");
    const job = (await ctx.call("poll")).data.jobs[0];
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, maxOutputTokens: 256 });
    expect((await ctx.call("claim", { id: job.id })).data).toMatchObject({
      claimed: true,
      maxOutputTokens: 256,
    });
  });

  it("settles a retried proactive event once and allows the next scheduled occurrence", async () => {
    const ctx = await setup();
    await send(ctx.stub, "/use muse");
    await send(ctx.stub, "建立通知会话");
    const job = (await ctx.call("poll")).data.jobs[0];
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, maxOutputTokens: 256 });
    const text = "定时通知正文。".repeat(200);
    const event = { eventId: "886313e1-3b8a-5372-9b90-0c9aee199e5d", routeId: job.routeId, text };
    const before = (await ctx.stub.snapshot()).wallet.balance;
    const first = await ctx.call("event", event);
    const cost = creditUnits(0, countTextTokens(limitTextTokens(text, 256))) / 1000;
    expect(first.ok).toBe(true);
    expect(first.data.cost).toBe(cost);
    expect(first.data.acceptedText).toContain("【回复已截断】");
    const accepted = await ctx.call("event", { ...event, text: "命令重试时生成了不同正文" });
    expect(accepted.data).toEqual(first.data);
    expect((await ctx.stub.snapshot()).wallet.balance).toBeCloseTo(before - cost, 3);
    const firstDelivery = await deliverQueuedReplies(ctx.stub);
    expect(firstDelivery).toHaveLength(1);
    expect(firstDelivery[0].text).toContain(first.data.acceptedText);
    expect(await deliverQueuedReplies(ctx.stub)).toHaveLength(0);
    const next = await ctx.call("event", { ...event, eventId: crypto.randomUUID() });
    expect(next.data.cost).toBe(cost);
    expect((await ctx.stub.snapshot()).wallet.balance).toBeCloseTo(before - cost * 2, 3);
    expect(await deliverQueuedReplies(ctx.stub)).toHaveLength(1);
  });

  it("resumes a completed result and the next queued task after temporary plugin suspension", async () => {
    const ctx = await setup();
    await send(ctx.stub, "/use muse");
    await send(ctx.stub, "第一条任务");
    await send(ctx.stub, "后续任务");
    const job = (await ctx.call("poll")).data.jobs[0];
    await ctx.call("claim", { id: job.id });
    const event = {
      eventId: crypto.randomUUID(),
      routeId: job.routeId,
      jobId: job.id,
      text: "第一条已完成",
    };
    const before = (await ctx.stub.snapshot()).wallet.balance;
    await api(ctx.stub, "plugin.save", { id: ctx.id, enabled: false });
    const denied = await SELF.fetch("https://wechatai.app/api/muse/event", {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.token}`, "content-type": "application/json" },
      body: JSON.stringify({ ...event, runnerId: ctx.runnerId }),
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: "plugin_disabled" });
    expect((await ctx.stub.snapshot()).wallet.balance).toBe(before);
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, enabled: true });
    const accepted = await ctx.call("event", event);
    expect(accepted.data.acceptedText).toBe(event.text);
    // The first acceptance may have succeeded even if its HTTP response was lost.
    await api(ctx.stub, "plugin.save", { id: ctx.id, enabled: false });
    expect((await ctx.call("event", event)).error).toBe("plugin_disabled");
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, enabled: true });
    expect((await ctx.call("event", event)).data).toEqual(accepted.data);
    expect((await ctx.stub.snapshot()).wallet.balance).toBeCloseTo(before - accepted.data.cost, 3);
    const next = (await ctx.call("poll")).data.jobs[0];
    expect(next).toMatchObject({ state: "pending", text: "后续任务" });
    expect((await ctx.call("claim", { id: next.id })).data.claimed).toBe(true);
    const delivered = await deliverQueuedReplies(ctx.stub);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].text).toBe(event.text);
  });

  it("retains a claimed Muse task across membership expiry and accepts it after renewal", async () => {
    const ctx = await setup();
    const second = (
      await api(ctx.stub, "plugin.save", {
        pluginId: "wechatai/muse",
        name: "工作 Muse",
        shortcut: "work",
      })
    ).data;
    const token = (await api(ctx.stub, "plugin.museToken", { id: second.id })).data.token;
    const secret = parseOpenClawToken(env, `Bearer ${token}`, "muse")!.secret;
    const call = (action: string, body: Record<string, unknown> = {}) =>
      ctx.stub
        .openClawRequest(second.id, secret, action, { runnerId: ctx.runnerId, ...body }, "muse")
        .then(JSON.parse);
    await send(ctx.stub, "/use work");
    await send(ctx.stub, "需要返回的任务");
    const job = (await call("poll")).data.jobs[0];
    await call("claim", { id: job.id });
    const event = {
      eventId: crypto.randomUUID(),
      routeId: job.routeId,
      jobId: job.id,
      text: "完整任务结果",
    };
    await runInDurableObject(ctx.stub, (_, state) =>
      state.storage.sql.exec(
        "UPDATE settings SET value=? WHERE key='planUntil'",
        JSON.stringify(Date.now() - 1000),
      ),
    );
    expect(await call("event", event)).toMatchObject({
      ok: false,
      status: 403,
      error: "plugin_limit",
      reason: "membership_expired",
    });
    await ctx.stub.applyPayment({
      id: "renew",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
    const before = (await ctx.stub.snapshot()).wallet.balance;
    const accepted = await call("event", event);
    expect(accepted.data.acceptedText).toBe(event.text);
    expect((await call("event", event)).data).toEqual(accepted.data);
    expect((await ctx.stub.snapshot()).wallet.balance).toBeCloseTo(before - accepted.data.cost, 3);
    expect((await call("poll")).data.jobs).toHaveLength(0);
  });

  it("fails interrupted tasks without billing, rejects stale routes and honors proactive settings", async () => {
    const ctx = await setup();
    await send(ctx.stub, "/use muse");
    await send(ctx.stub, "执行任务");
    const job = (await ctx.call("poll")).data.jobs[0];
    await ctx.call("claim", { id: job.id });
    const before = (await ctx.stub.snapshot()).wallet.balance;
    const failed = await ctx.call("event", {
      eventId: crypto.randomUUID(),
      routeId: job.routeId,
      jobId: job.id,
      status: "failed",
      text: "内部错误不应展示",
    });
    expect(failed.data.cost).toBe(0);
    expect(failed.data.acceptedText).toContain("Muse 未完成这次任务，本次未扣费。");
    expect(failed.data.acceptedText).not.toContain("内部错误不应展示");
    expect((await ctx.stub.snapshot()).wallet.balance).toBe(before);
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, allowProactive: false });
    expect(
      (
        await ctx.call("event", {
          eventId: crypto.randomUUID(),
          routeId: job.routeId,
          text: "后台通知",
        })
      ).status,
    ).toBe(403);
    await send(ctx.stub, "/wx reset");
    expect(
      (
        await ctx.call("event", {
          eventId: crypto.randomUUID(),
          routeId: job.routeId,
          text: "旧路由",
        })
      ).status,
    ).toBe(409);
  });

  it("does not pretend Muse supports native commands", async () => {
    const ctx = await setup();
    await expect(send(ctx.stub, "@muse /stop")).rejects.toThrow("Muse 暂不支持");
    expect((await ctx.call("poll")).data.jobs).toHaveLength(0);
  });

  it("publishes the Muse guide and matching manifest", async () => {
    const manifest = await (
      await SELF.fetch("https://wechatai.app/api/plugins/muse")
    ).json<{ manifest: { id: string; capabilities: { commands: string } } }>();
    expect(manifest.manifest.id).toBe("wechatai/muse");
    expect(manifest.manifest.capabilities.commands).toBe("platform");
    const guide = await SELF.fetch("https://wechatai.app/developers/muse.md");
    expect(guide.headers.get("content-type")).toContain("text/markdown");
    expect(await guide.text()).toContain("不是 Muse Code");
  });
});
