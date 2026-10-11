import { env, SELF, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "../src/server/security";
import { parseOpenClawToken } from "../src/server/openclaw-token";
import type { PersonalAccount } from "../src/server/personal-account";
import type { WxMessage } from "../src/server/wechat";
import { creditUnits } from "../src/server/wallet";
import { countTextTokens } from "../src/server/tokenizer";

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
  vi.unstubAllGlobals();
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, (_, state) => state.storage.deleteAlarm());
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
  await api(stub, "wechat.create", { name: "测试微信" });
  await runInDurableObject(stub, (_, state) =>
    state.storage.sql.exec(
      "INSERT INTO settings VALUES ('connection', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      JSON.stringify({ status: "connected", generation: "g1", contextToken: "context" }),
    ),
  );
  const saved = await api(stub, "plugin.save", {
    pluginId: "wechatai/openclaw",
    name: "我的 Agent",
    shortcut: "claw",
    agentId: "main",
  });
  if (!plus) return { stub, saved } as const;
  expect(saved.ok).toBe(true);
  const token = (await api(stub, "plugin.clawToken", { id: saved.data.id })).data.token as string;
  const [accountId, pluginId, secret] = token.split(".");
  const runnerId = crypto.randomUUID();
  const call = async (action: string, body: Record<string, unknown> = {}) =>
    JSON.parse(await stub.openClawRequest(pluginId, secret, action, { runnerId, ...body }));
  return { stub, saved, token, accountId, pluginId, secret, runnerId, call };
}
async function ready() {
  const ctx = await setup();
  if (!ctx.call) throw new Error("setup");
  await send(ctx.stub, "/use claw");
  const text = "帮我安排今天的任务";
  const id = crypto.randomUUID();
  expect(await send(ctx.stub, text, id)).toBe("已成功转发，等待回复...");
  const poll = await ctx.call("poll");
  expect(poll.ok).toBe(true);
  const job = poll.data.jobs[0];
  expect(job.text).toBe(text);
  expect((await ctx.call("claim", { id })).data.claimed).toBe(true);
  const event = {
    eventId: crypto.randomUUID(),
    routeId: job.routeId,
    jobId: id,
    status: "completed",
    text: "任务已安排，请查收。",
  };
  return { ...ctx, call: ctx.call, id, text, job, event };
}
describe("OpenClaw native relay", () => {
  it("requires a capable connector and keeps native /new separate from platform history", async () => {
    const ctx = await setup();
    if (!ctx.call) throw new Error("setup");
    await send(ctx.stub, "/use claw");
    await expect(send(ctx.stub, "/new")).rejects.toThrow("升级连接器");
    await ctx.call("heartbeat", { nativeCommands: true });
    const before = (await api(ctx.stub, "snapshot")).data.currentSession;
    const id = crypto.randomUUID();
    expect(await send(ctx.stub, "/new", id)).toBe("");
    expect((await ctx.call("poll")).data.jobs).toEqual([]); // Old runners cannot claim native commands.
    const job = (await ctx.call("poll", { nativeCommands: true })).data.jobs[0];
    expect(job).toMatchObject({ id, text: "/new", command: "new" });
    expect((await ctx.call("claim", { id })).error).toBe("connector_upgrade_required");
    await ctx.call("claim", { id, nativeCommands: true });
    const event = {
      eventId: crypto.randomUUID(),
      routeId: job.routeId,
      jobId: id,
      text: "新会话已开始",
    };
    expect((await ctx.call("event", event)).ok).toBe(true);
    expect((await ctx.call("event", event)).ok).toBe(true);
    const after = (await api(ctx.stub, "snapshot")).data.currentSession;
    expect(after.id).toBe(before.id);
    await runInDurableObject(ctx.stub, (_, state) => {
      const rows = state.storage.sql
        .exec<{ role: string; content: string }>(
          "SELECT role,content FROM messages WHERE sessionId = ?",
          before.id,
        )
        .toArray();
      expect(rows.filter((r) => r.role === "system")).toHaveLength(1);
      expect(rows.some((r) => r.content === "/new")).toBe(true);
    });
    await send(ctx.stub, "/wx new");
    expect((await api(ctx.stub, "snapshot")).data.currentSession.id).not.toBe(before.id);
  });

  it.each(["@claw /exit", "@claw，/exit"])(
    "explicit command %s never triggers a second platform parse or changes the selected mode",
    async (input) => {
      const ctx = await setup();
      if (!ctx.call) throw new Error("setup");
      await ctx.call("heartbeat", { nativeCommands: true });
      await send(ctx.stub, "/use claw");
      const before = (await api(ctx.stub, "snapshot")).data.currentSession.id;
      await send(ctx.stub, input);
      const job = (await ctx.call("poll", { nativeCommands: true })).data.jobs[0];
      expect(job).toMatchObject({ text: "/exit", command: "exit" });
      expect((await api(ctx.stub, "snapshot")).data.currentSession.id).toBe(before);
      expect(await send(ctx.stub, "/wx help")).toContain("/wx status");
      expect(await send(ctx.stub, "/wx status")).toContain("我的 Agent");
      await send(ctx.stub, "/exit");
      expect(await send(ctx.stub, "/help")).toContain("微信命令速查");
    },
  );

  it("delivers /stop on a separate lane while a normal job is claimed, even at zero credits", async () => {
    const ctx = await ready();
    await ctx.call("heartbeat", { nativeCommands: true });
    await runInDurableObject(ctx.stub, (_, state) => {
      state.storage.sql.exec("UPDATE credit_buckets SET remaining = 0");
    });
    const id = crypto.randomUUID();
    await expect(send(ctx.stub, "/stop write a story")).rejects.toThrow("Credits 不足");
    await send(ctx.stub, "/stop", id);
    expect((await ctx.call("poll", { nativeCommands: true })).data.jobs[0].id).toBe(ctx.id);
    const stop = (await ctx.call("poll", { nativeCommands: true, lane: "control" })).data.jobs[0];
    expect(stop).toMatchObject({ id, command: "stop", routeId: ctx.job.routeId });
    await ctx.call("claim", { id, nativeCommands: true });
    const receipt = await ctx.call("event", {
      eventId: crypto.randomUUID(),
      jobId: id,
      routeId: stop.routeId,
      text: "已停止",
    });
    expect(receipt.data.cost).toBe(0);
    expect((await ctx.call("poll", { nativeCommands: true, lane: "control" })).data.jobs).toEqual(
      [],
    );
  });

  it("wakes a long poll as soon as a task is queued and retains single-run claims", async () => {
    const ctx = await setup();
    if (!ctx.call) throw new Error("setup");
    await send(ctx.stub, "/use claw");
    const id = crypto.randomUUID();
    const started = Date.now();
    const result = await runInDurableObject(ctx.stub, async (instance) => {
      let settled = false;
      const polling = instance
        .openClawRequest(ctx.pluginId!, ctx.secret!, "poll", {
          runnerId: ctx.runnerId,
          waitMs: 15000,
        })
        .then((raw) => {
          settled = true;
          return JSON.parse(raw);
        });
      await Promise.resolve();
      expect(settled).toBe(false);
      await (
        instance as unknown as {
          processWechat(id: string, message: WxMessage, link: string): Promise<string>;
        }
      ).processWechat(id, { item_list: [{ type: 1, text_item: { text: "立刻转发" } }] }, "default");
      return polling;
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.data.jobs).toMatchObject([{ id, text: "立刻转发", state: "pending" }]);
    expect(result.data.retryAfterMs).toBe(0);
    expect((await ctx.call("claim", { id })).data.claimed).toBe(true);
    expect((await ctx.call("claim", { id })).data.claimed).toBe(false);
  });

  it("bounds idle long polls and re-authenticates after a credential is revoked", async () => {
    const ctx = await setup();
    if (!ctx.call) throw new Error("setup");
    expect((await ctx.call("poll", { waitMs: 20 })).data).toMatchObject({
      jobs: [],
      retryAfterMs: 0,
    });
    expect((await ctx.call("poll", { waitMs: 15001 })).ok).toBe(false);
    const result = await runInDurableObject(ctx.stub, async (instance) => {
      const polling = instance.openClawRequest(ctx.pluginId!, ctx.secret!, "poll", {
        runnerId: ctx.runnerId,
        waitMs: 15000,
      });
      await instance.api("plugin.clawRevoke", { id: ctx.pluginId });
      return JSON.parse(await polling);
    });
    expect(result.error).toBe("unauthorized");
  });

  it("releases an idle WeChat receive poll when a result arrives and promptly sends it once", async () => {
    const ctx = await ready();
    await runInDurableObject(ctx.stub, async (_, state) => {
      const encryptedCredentials = await encrypt(
        env,
        JSON.stringify({
          token: "test",
          baseUrl: "https://ilinkai.weixin.qq.com",
          userId: "owner",
          botId: "bot",
        }),
        `${state.id}:wechat`,
      );
      state.storage.sql.exec(
        "UPDATE settings SET value = ? WHERE key = 'connection'",
        JSON.stringify({
          status: "connected",
          generation: "g1",
          contextToken: "context",
          encryptedCredentials,
        }),
      );
    });
    let pollStarted!: () => void;
    const receiving = new Promise<void>((resolve) => {
      pollStarted = resolve;
    });
    let aborted = false;
    const delivered: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const request = new Request(url, init);
        if (request.url.endsWith("getupdates")) {
          pollStarted();
          return new Promise<Response>((_, reject) => {
            request.signal.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(request.signal.reason);
              },
              { once: true },
            );
          });
        }
        if (request.url.endsWith("sendmessage")) {
          const body = await request.json<{
            msg: { item_list: { text_item: { text: string } }[] };
          }>();
          delivered.push(body.msg.item_list[0].text_item.text);
          return Response.json({ ret: 0 });
        }
        throw new Error("Unexpected endpoint");
      }),
    );
    await runInDurableObject(ctx.stub, async (instance, state) => {
      const alarm = instance.alarm();
      await receiving;
      const started = Date.now();
      try {
        const result = JSON.parse(
          await instance.openClawRequest(ctx.pluginId!, ctx.secret!, "event", {
            ...ctx.event,
            runnerId: ctx.runnerId,
          }),
        );
        expect(result.ok).toBe(true);
        await alarm;
        expect(aborted).toBe(true);
        expect(Date.now() - started).toBeLessThan(1500);
        expect(await state.storage.getAlarm()).toBeLessThanOrEqual(Date.now() + 100);
        await instance.alarm();
        expect(delivered).toHaveLength(1);
        expect(delivered[0]).toContain(ctx.event.text);
        await instance.openClawRequest(ctx.pluginId!, ctx.secret!, "event", {
          ...ctx.event,
          runnerId: ctx.runnerId,
        });
        expect(
          state.storage.sql.exec("SELECT id FROM inbox WHERE state = 'reply'").toArray(),
        ).toHaveLength(0);
      } finally {
        await state.storage.deleteAlarm();
      }
    });
  });

  it.each([true, false])(
    "honors waiting notices, enabled=%s, while keeping final replies and dedupe intact",
    async (enabled) => {
      const ctx = await setup();
      if (!ctx.call) throw new Error("setup");
      const notice = "助手收到啦，请稍候～";
      expect(
        (
          await api(ctx.stub, "plugin.save", {
            ...ctx.saved.data,
            waitingMessageEnabled: enabled,
            waitingMessage: notice,
          })
        ).ok,
      ).toBe(true);
      expect(
        (await api(ctx.stub, "plugin.save", { id: ctx.pluginId, name: "我的 Agent" })).data,
      ).toMatchObject({
        waitingMessageEnabled: enabled,
        waitingMessage: notice,
      });
      await send(ctx.stub, "/use claw");
      const id = crypto.randomUUID();
      const text = "整理今天的日程";
      const before = (await api(ctx.stub, "snapshot")).data.wallet.balance;
      await runInDurableObject(ctx.stub, async (_, state) => {
        const encryptedCredentials = await encrypt(
          env,
          JSON.stringify({
            token: "test",
            baseUrl: "https://ilinkai.weixin.qq.com",
            userId: "owner",
            botId: "bot",
          }),
          `${state.id}:wechat`,
        );
        state.storage.sql.exec(
          "UPDATE settings SET value = ? WHERE key = 'connection'",
          JSON.stringify({
            status: "connected",
            generation: "g1",
            contextToken: "context",
            encryptedCredentials,
          }),
        );
        state.storage.sql.exec(
          "INSERT INTO inbox (id,payload,state,createdAt,connectionId) VALUES (?,?,'pending',?,'default')",
          id,
          JSON.stringify({ item_list: [{ type: 1, text_item: { text } }] }),
          Date.now(),
        );
      });
      const delivered: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url, init) => {
          const request = new Request(url, init);
          if (request.url.endsWith("sendmessage")) {
            const body = await request.json<{
              msg: { item_list: { text_item: { text: string } }[] };
            }>();
            delivered.push(body.msg.item_list[0].text_item.text);
            return Response.json({ ret: 0 });
          }
          if (request.url.endsWith("getupdates")) return Response.json({ msgs: [] });
          throw new Error("Unexpected endpoint");
        }),
      );
      await runInDurableObject(ctx.stub, (instance) => instance.alarm());
      const state = await runInDurableObject(
        ctx.stub,
        (_, state) =>
          state.storage.sql
            .exec<{ state: string }>("SELECT state FROM inbox WHERE id = ?", id)
            .one().state,
      );
      expect(state).toBe("done");
      await runInDurableObject(ctx.stub, (instance) => instance.alarm());
      expect(delivered).toEqual(enabled ? [notice] : []);
      expect((await api(ctx.stub, "snapshot")).data.wallet.balance).toBe(before);
      expect(await send(ctx.stub, text, id)).toBe(enabled ? notice : "");
      const jobs = (await ctx.call("poll")).data.jobs;
      expect(jobs).toHaveLength(1);
      expect(jobs[0].text).toBe(text);
      expect((await ctx.call("claim", { id })).data.claimed).toBe(true);
      const reply = "日程已整理好。";
      const result = await ctx.call("event", {
        eventId: crypto.randomUUID(),
        jobId: id,
        routeId: jobs[0].routeId,
        text: reply,
      });
      expect(result.ok).toBe(true);
      expect(result.data.cost).toBe(
        creditUnits(countTextTokens(text), countTextTokens(reply)) / 1000,
      );
      await runInDurableObject(ctx.stub, (instance) => instance.alarm());
      expect(delivered).toHaveLength(enabled ? 2 : 1);
      expect(delivered.at(-1)).toBe(reply);
      expect(delivered).not.toContain("处理完成");
    },
  );

  it("defaults legacy configs to the original notice and validates custom notices", async () => {
    const ctx = await setup();
    await runInDurableObject(ctx.stub, (_, state) => {
      const row = state.storage.sql
        .exec<{ data: string }>("SELECT data FROM plugins WHERE id = ?", ctx.pluginId!)
        .one();
      const old = JSON.parse(row.data);
      delete old.waitingMessageEnabled;
      delete old.waitingMessage;
      state.storage.sql.exec(
        "UPDATE plugins SET data = ? WHERE id = ?",
        JSON.stringify(old),
        ctx.pluginId!,
      );
    });
    expect((await api(ctx.stub, "snapshot")).data.plugins[0]).toMatchObject({
      waitingMessageEnabled: true,
      waitingMessage: "已成功转发，等待回复...",
    });
    for (const waitingMessage of ["   ", "长".repeat(301)]) {
      expect((await api(ctx.stub, "plugin.save", { ...ctx.saved.data, waitingMessage })).ok).toBe(
        false,
      );
    }
    expect(
      (
        await api(ctx.stub, "plugin.save", {
          ...ctx.saved.data,
          waitingMessageEnabled: false,
          waitingMessage: "",
        })
      ).ok,
    ).toBe(true);
  });
  it("accepts long messages by default and forwards only the current input, not stored history", async () => {
    const ctx = await setup();
    if (!ctx.call) throw new Error("setup");
    expect(ctx.saved.data.maxInputTokens).toBe(128000);
    await send(ctx.stub, "/use claw");
    const text = "hello ".repeat(40000);
    expect(countTextTokens(text)).toBeGreaterThan(32000);
    const id = crypto.randomUUID();
    expect(await send(ctx.stub, text, id)).toBe("已成功转发，等待回复...");
    const job = (await ctx.call("poll")).data.jobs[0];
    expect(job.text).toBe(text);
    expect((await ctx.call("claim", { id })).data.claimed).toBe(true);
    const completed = await ctx.call("event", {
      eventId: crypto.randomUUID(),
      routeId: job.routeId,
      jobId: id,
      text: "收到。",
    });
    expect(completed.ok).toBe(true);
    const next = "继续";
    await send(ctx.stub, next);
    const nextJob = (await ctx.call("poll")).data.jobs[0];
    expect(nextJob.text).toBe(next);
    expect(nextJob.routeId).toBe(job.routeId);
  });
  it("retains an explicit smaller input budget and rejects oversized input before queueing or charging", async () => {
    const ctx = await setup();
    if (!ctx.call) throw new Error("setup");
    const saved = await api(ctx.stub, "plugin.save", { ...ctx.saved.data, maxInputTokens: 8000 });
    expect(saved.data.maxInputTokens).toBe(8000);
    await send(ctx.stub, "/use claw");
    const before = (await api(ctx.stub, "snapshot")).data.wallet.balance;
    await expect(send(ctx.stub, "hello ".repeat(9000))).rejects.toThrow("输入上限");
    expect((await ctx.call("poll")).data.jobs).toEqual([]);
    expect((await api(ctx.stub, "snapshot")).data.wallet.balance).toBe(before);
    const raised = await api(ctx.stub, "plugin.save", { ...saved.data, maxInputTokens: 2000000 });
    expect(raised.ok).toBe(true);
    expect(await send(ctx.stub, "hello ".repeat(9000))).toBe("已成功转发，等待回复...");
  });
  it("authenticates a signed token before routing to an account", async () => {
    const ctx = await setup();
    expect(parseOpenClawToken(env, `Bearer ${ctx.token}`)?.pluginId).toBe(ctx.pluginId);
    expect(
      parseOpenClawToken(env, `Bearer ${ctx.token!.replace(ctx.pluginId!, crypto.randomUUID())}`),
    ).toBeNull();
    expect(
      parseOpenClawToken(env, `Bearer ${ctx.token!.slice(0, -43)}${"a".repeat(43)}`),
    ).toBeNull();
  });
  it("retains a failed WeChat reply, resumes with a fresh context, and charges only once", async () => {
    const ctx = await ready();
    const result = await ctx.call("event", ctx.event);
    const before = (await api(ctx.stub, "snapshot")).data.wallet.balance;
    await runInDurableObject(ctx.stub, async (_, state) => {
      const encryptedCredentials = await encrypt(
        env,
        JSON.stringify({
          token: "test",
          baseUrl: "https://ilinkai.weixin.qq.com",
          userId: "owner",
          botId: "bot",
        }),
        `${state.id}:wechat`,
      );
      state.storage.sql.exec(
        "UPDATE settings SET value = ? WHERE key = 'connection'",
        JSON.stringify({
          status: "connected",
          generation: "g1",
          contextToken: "old",
          encryptedCredentials,
        }),
      );
      state.storage.sql.exec("UPDATE inbox SET attempts = 4 WHERE id = ?", result.data.id);
    });
    let failed = true;
    const delivered: { context_token: string; item_list: { text_item: { text: string } }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const req = new Request(url, init);
        if (req.url.endsWith("sendmessage")) {
          if (failed) return Response.json({ ret: 1 }, { status: 503 });
          const body = (await req.json()) as { msg: (typeof delivered)[number] };
          delivered.push(body.msg);
          return Response.json({ ret: 0 });
        }
        if (req.url.endsWith("getupdates"))
          return Response.json({
            ret: 0,
            msgs: [
              {
                message_type: 1,
                message_id: 1,
                from_user_id: "owner",
                context_token: "fresh",
                item_list: [{ type: 1, text_item: { text: "/wx help" } }],
              },
            ],
          });
        throw new Error("Unexpected outbound endpoint");
      }),
    );
    await runInDurableObject(ctx.stub, (instance) => instance.alarm());
    const status = () =>
      runInDurableObject(
        ctx.stub,
        (_, state) =>
          state.storage.sql
            .exec<{ state: string }>("SELECT state FROM inbox WHERE id = ?", result.data.id)
            .one().state,
      );
    expect(await status()).toBe("waiting_context");
    failed = false;
    await runInDurableObject(ctx.stub, (instance) => instance.alarm());
    expect(await status()).toBe("done");
    expect(delivered[0].context_token).toBe("fresh");
    expect(delivered[0].item_list[0].text_item.text).toBe(ctx.event.text);
    expect((await api(ctx.stub, "snapshot")).data.wallet.balance).toBe(before);
  });
  it("enforces Plus without needing a model channel", async () => {
    const free = await setup(false);
    expect(free.saved.error).toBe("plus_required");
    const { stub, saved } = await setup();
    const snapshot = (await api(stub, "snapshot")).data;
    expect(snapshot.assistants).toHaveLength(0);
    expect(saved.data.agentId).toBe("main");
    expect(saved.data.modelId).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain("tokenHash");
  });
  it("accepts text once and meters boundary tokens, ignoring falsified usage", async () => {
    const ctx = await ready();
    const before = (await api(ctx.stub, "snapshot")).data.wallet.balance;
    const result = await ctx.call("event", {
      ...ctx.event,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    expect(result.ok).toBe(true);
    const cost = creditUnits(countTextTokens(ctx.text), countTextTokens(ctx.event.text)) / 1000;
    expect(result.data.cost).toBe(cost);
    expect((await ctx.call("event", ctx.event)).data).toEqual(result.data);
    expect((await api(ctx.stub, "snapshot")).data.wallet.balance).toBeCloseTo(before - cost, 3);
    const another = await ctx.call("event", { ...ctx.event, eventId: crypto.randomUUID() });
    expect(another.error).toBe("claw_job_gone");
    expect(await send(ctx.stub, ctx.text, ctx.id)).toBe("已成功转发，等待回复...");
    expect((await ctx.call("poll")).data.jobs).toHaveLength(0);
  });
  it("supports proactive output with zero input and durable delivery state", async () => {
    const ctx = await ready();
    await ctx.call("event", ctx.event);
    const push = await ctx.call("event", {
      eventId: crypto.randomUUID(),
      routeId: ctx.job.routeId,
      text: "定时任务已完成",
    });
    expect(push.ok).toBe(true);
    expect(push.data.cost).toBe(creditUnits(0, countTextTokens("定时任务已完成")) / 1000);
    expect(push.data.status).toBe("queued");
    const status = await api(ctx.stub, "plugin.clawStatus", { id: ctx.pluginId });
    expect(status.data.deliveries).toHaveLength(2);
    expect(status.data.deliveries.every((d: { state: string }) => d.state === "reply")).toBe(true);
  });
  it("labels proactive messages with the source config, preserves the active plugin and bills only content", async () => {
    const ctx = await ready();
    await ctx.call("event", ctx.event);
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, name: "工作助手", shortcut: "work" });
    const other = await api(ctx.stub, "plugin.save", {
      pluginId: "wechatai/openclaw",
      name: "生活助手",
      shortcut: "life",
    });
    expect(other.ok).toBe(true);
    await api(ctx.stub, "plugin.clawToken", { id: other.data.id });
    await send(ctx.stub, "/use life");
    const before = (await api(ctx.stub, "snapshot")).data;
    const pushEvent = {
      eventId: crypto.randomUUID(),
      routeId: ctx.job.routeId,
      text: "**日报**\n\n- 今天的任务已完成",
      name: "伪造名称",
      shortcut: "fake", // Source guidance must come from the saved instance, not the sender.
    };
    const push = await ctx.call("event", pushEvent);
    expect(push.ok).toBe(true);
    const cost = creditUnits(0, countTextTokens(pushEvent.text)) / 1000;
    expect(push.data.cost).toBe(cost);
    expect((await ctx.call("event", pushEvent)).data).toEqual(push.data);
    const after = (await api(ctx.stub, "snapshot")).data;
    expect(after.currentSession.id).toBe(before.currentSession.id);
    expect(after.currentSession.pluginInstanceId).toBe(other.data.id);
    expect(after.wallet.balance).toBeCloseTo(before.wallet.balance - cost, 3);
    const stored = await runInDurableObject(ctx.stub, (_, state) => {
      const row = state.storage.sql
        .exec<{ reply: string; sessionId: string }>(
          "SELECT reply,sessionId FROM inbox WHERE id = ?",
          push.data.id,
        )
        .one();
      const history = state.storage.sql
        .exec<{ content: string }>(
          "SELECT content FROM messages WHERE sessionId = ? ORDER BY id DESC LIMIT 1",
          row.sessionId,
        )
        .one();
      const run = state.storage.sql
        .exec<{ response: string }>("SELECT response FROM runs WHERE id = ?", push.data.id)
        .one();
      return { reply: row.reply, history: history.content, response: JSON.parse(run.response) };
    });
    expect(stored.reply).toBe(
      "消息来自 OpenClaw（工作助手）插件。\n使用 /use work 进入插件，或发送 @work 回复内容。\n\n──────────\n\n" +
        pushEvent.text,
    );
    expect(stored.history).toBe(pushEvent.text);
    expect(stored.response).toEqual({ text: pushEvent.text, cost });

    await send(ctx.stub, "@work 继续完善日报");
    const job = (await ctx.call("poll")).data.jobs[0];
    expect(job.text).toBe("继续完善日报");
    expect(job.agentId).toBe("main");
    expect((await api(ctx.stub, "snapshot")).data.currentSession.id).toBe(before.currentSession.id);
    expect(await send(ctx.stub, "/use work")).toContain("工作助手");
    expect((await api(ctx.stub, "snapshot")).data.currentSession.pluginInstanceId).toBe(
      ctx.pluginId,
    );
  });
  it("labels delayed user-requested replies after leaving the source plugin", async () => {
    const ctx = await ready();
    await send(ctx.stub, "/exit");
    const before = (await api(ctx.stub, "snapshot")).data.currentSession;
    const result = await ctx.call("event", ctx.event);
    expect(result.ok).toBe(true);
    const reply = await runInDurableObject(
      ctx.stub,
      (_, state) =>
        state.storage.sql
          .exec<{ reply: string }>("SELECT reply FROM inbox WHERE id = ?", result.data.id)
          .one().reply,
    );
    expect(reply).toBe(
      "消息来自 OpenClaw（我的 Agent）插件。\n使用 /use claw 进入插件，或发送 @claw 回复内容。\n\n──────────\n\n" +
        ctx.event.text,
    );
    expect((await api(ctx.stub, "snapshot")).data.currentSession).toEqual(before);
  });
  it("does not let another runner claim or settle an executing task", async () => {
    const ctx = await ready();
    const other = crypto.randomUUID();
    expect((await ctx.call("poll", { runnerId: other })).data.jobs).toHaveLength(0);
    expect((await ctx.call("claim", { id: ctx.id, runnerId: other })).data.claimed).toBe(false);
    expect((await ctx.call("event", { ...ctx.event, runnerId: other })).error).toBe(
      "claw_job_gone",
    );
    expect((await ctx.call("event", ctx.event)).ok).toBe(true);
  });
  it.each(["reset", "clear", "archive", "delete"])(
    "revokes old routes on session %s",
    async (action) => {
      const ctx = await ready();
      const snapshot = (await api(ctx.stub, "snapshot")).data;
      expect(
        (await api(ctx.stub, "session.action", { id: snapshot.currentSession.id, action })).ok,
      ).toBe(true);
      expect((await ctx.call("event", ctx.event)).error).toBe("claw_route_gone");
    },
  );
  it("binds the route to its WeChat connection generation", async () => {
    const ctx = await ready();
    await runInDurableObject(ctx.stub, (_, state) =>
      state.storage.sql.exec(
        "UPDATE settings SET value = ? WHERE key = 'connection'",
        JSON.stringify({ status: "connected", generation: "g2" }),
      ),
    );
    expect((await ctx.call("event", ctx.event)).error).toBe("claw_route_gone");
  });
  it("invalidates old secrets when rotated and never reveals them in snapshots", async () => {
    const ctx = await ready();
    await api(ctx.stub, "plugin.clawToken", { id: ctx.pluginId });
    expect((await ctx.call("poll")).status).toBe(401);
    expect(JSON.stringify((await api(ctx.stub, "snapshot")).data)).not.toContain(ctx.secret);
  });
  it("rejects forged destinations and cross-connector job IDs", async () => {
    const ctx = await ready();
    expect((await ctx.call("event", { ...ctx.event, routeId: crypto.randomUUID() })).error).toBe(
      "claw_route_gone",
    );
    const other = await ready();
    expect((await other.call("event", ctx.event)).error).toBe("claw_route_gone");
  });
  it("checks proactive preference, account plan, and balance", async () => {
    const ctx = await ready();
    await ctx.call("event", ctx.event);
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, allowProactive: false });
    expect(
      (
        await ctx.call("event", {
          eventId: crypto.randomUUID(),
          routeId: ctx.job.routeId,
          text: "hi",
        })
      ).error,
    ).toBe("claw_push_disabled");
    await runInDurableObject(ctx.stub, (_, state) =>
      state.storage.sql.exec("UPDATE settings SET value = '0' WHERE key = 'planUntil'"),
    );
    expect((await ctx.call("poll")).error).toBe("plus_required");
  });
  it("limits output itself and does not bill failed tasks", async () => {
    const ctx = await ready();
    await api(ctx.stub, "plugin.save", { ...ctx.saved.data, maxOutputTokens: 256 });
    const result = await ctx.call("event", { ...ctx.event, text: "非常长的回复。".repeat(300) });
    expect(result.data.truncated).toBe(true);
    const other = await ready();
    const before = (await api(other.stub, "snapshot")).data.wallet.balance;
    const failure = await other.call("event", {
      ...other.event,
      status: "failed",
      text: "secret upstream error",
    });
    expect(failure.data.cost).toBe(0);
    const reply = await runInDurableObject(
      other.stub,
      (_, state) =>
        state.storage.sql
          .exec<{ reply: string }>("SELECT reply FROM inbox WHERE id = ?", failure.data.id)
          .one().reply,
    );
    expect(reply).toContain("OpenClaw 未完成这次任务，本次未扣费。");
    expect(reply).not.toContain("消息来自");
    expect(reply).not.toContain("/use claw");
    expect(reply).not.toContain("secret upstream error");
    expect((await api(other.stub, "snapshot")).data.wallet.balance).toBe(before);
  });
  it("keeps @ calls temporary and lets /use switch directly", async () => {
    const ctx = await ready();
    const other = (
      await api(ctx.stub, "plugin.save", {
        pluginId: "wechatai/openclaw",
        name: "第二个",
        shortcut: "other",
        agentId: "main",
      })
    ).data;
    await api(ctx.stub, "plugin.clawToken", { id: other.id });
    const before = (await api(ctx.stub, "snapshot")).data.currentSession.id;
    await send(ctx.stub, "@other 你好");
    expect((await api(ctx.stub, "snapshot")).data.currentSession.id).toBe(before);
    expect(await send(ctx.stub, "/use other")).toContain("已切换到");
    expect(await send(ctx.stub, "/exit")).toContain("退出");
  });
  it("requires connector bearer auth on its dedicated HTTP routes", async () => {
    const ctx = await setup();
    expect(
      (await SELF.fetch("https://example.com/api/openclaw/poll", { method: "POST", body: "{}" }))
        .status,
    ).toBe(401);
    const res = await SELF.fetch("https://example.com/api/openclaw/poll", {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.token}`, "content-type": "application/json" },
      body: JSON.stringify({ runnerId: ctx.runnerId }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("jobs");
  });
});

describe("OpenClaw guided pairing", () => {
  const agents = [
    { id: "main", name: "日常助手", isDefault: false },
    { id: "research", name: "研究助手", isDefault: true },
  ];
  async function pairing() {
    const ctx = await setup();
    const result = await api(ctx.stub, "plugin.clawPair", { id: ctx.pluginId });
    expect(result.ok).toBe(true);
    const code = /"code":"([^"]+)"/.exec(result.data.command)![1];
    const [, accountId, pluginId, secret] = code.split(".");
    const proof = "b".repeat(43);
    const exchange = (body = { proof, agents }) =>
      ctx.stub.openClawRequest(pluginId, secret, "pair", body).then(JSON.parse);
    return { ...ctx, code, secret, accountId, pluginId, proof, exchange };
  }
  it("chooses the real default, preserves an existing connection until exchange, and never exposes the token in status", async () => {
    const ctx = await pairing();
    expect((await ctx.call!("heartbeat")).ok).toBe(true);
    const result = await ctx.exchange();
    expect(result.data.agentId).toBe("research");
    expect((await ctx.call!("heartbeat")).ok).toBe(false);
    const state = (await api(ctx.stub, "plugin.clawStatus", { id: ctx.pluginId })).data;
    expect(state).toMatchObject({
      agentId: "research",
      lastSeen: 0,
      hasKey: true,
      pairingClaimed: true,
      agents,
    });
    expect(JSON.stringify(state)).not.toContain(result.data.token);
    const [, , secret] = result.data.token.split(".");
    await ctx.stub.openClawRequest(ctx.pluginId, secret, "heartbeat", { agents });
    expect(
      (await api(ctx.stub, "plugin.clawStatus", { id: ctx.pluginId })).data.lastSeen,
    ).toBeGreaterThan(0);
  });
  it("retries with the same installer proof without resetting state, but rejects another installer", async () => {
    const ctx = await pairing();
    const first = await ctx.exchange();
    const [, , secret] = first.data.token.split(".");
    await ctx.stub.openClawRequest(ctx.pluginId, secret, "heartbeat", { agents });
    const before = (await api(ctx.stub, "plugin.clawStatus", { id: ctx.pluginId })).data.lastSeen;
    expect((await ctx.exchange()).data.token).toBe(first.data.token);
    expect((await api(ctx.stub, "plugin.clawStatus", { id: ctx.pluginId })).data.lastSeen).toBe(
      before,
    );
    expect((await ctx.exchange({ proof: "c".repeat(43), agents })).error).toBe("pair_used");
  });
  it("expires and replaces pairing codes without rotating the active credential", async () => {
    const ctx = await pairing();
    await runInDurableObject(ctx.stub, (_, state) =>
      state.storage.sql.exec("UPDATE claw_pairings SET expiresAt=0"),
    );
    expect((await ctx.exchange()).error).toBe("pair_expired");
    await api(ctx.stub, "plugin.clawPair", { id: ctx.pluginId });
    expect((await ctx.exchange()).error).toBe("pair_expired");
    expect((await ctx.call!("heartbeat")).ok).toBe(true);
  });
  it("revokes unused and redeemed commands, and rejects disabled/expired membership", async () => {
    const ctx = await pairing();
    await api(ctx.stub, "plugin.clawRevoke", { id: ctx.pluginId });
    expect((await ctx.exchange()).ok).toBe(false);
    const used = await pairing();
    await used.exchange();
    await api(used.stub, "plugin.clawRevoke", { id: used.pluginId });
    expect((await used.exchange()).ok).toBe(false);
    const disabled = await pairing();
    await api(disabled.stub, "plugin.save", { ...disabled.saved.data, enabled: false });
    expect((await disabled.exchange()).ok).toBe(false);
    const expired = await pairing();
    await runInDurableObject(expired.stub, (_, state) =>
      state.storage.sql.exec("UPDATE settings SET value = '0' WHERE key = 'planUntil'"),
    );
    expect((await expired.exchange()).ok).toBe(false);
  });
  it("rejects unknown Agent selection and invalidates old routes when selecting a discovered Agent", async () => {
    const ctx = await ready();
    await ctx.call("heartbeat", { agents });
    expect(
      (await api(ctx.stub, "plugin.save", { ...ctx.saved.data, agentId: "missing" })).error,
    ).toBe("plugin_agent_unknown");
    expect((await ctx.call("poll")).data.jobs).toHaveLength(1);
    expect(
      (await api(ctx.stub, "plugin.save", { ...ctx.saved.data, agentId: "research" })).ok,
    ).toBe(true);
    expect((await ctx.call("event", ctx.event)).error).toBe("claw_route_gone");
    const newId = crypto.randomUUID();
    await send(ctx.stub, "测试新的助手", newId);
    const job = (await ctx.call("poll")).data.jobs[0];
    expect(job.agentId).toBe("research");
    expect(job.routeId).not.toBe(ctx.job.routeId);
  });
  it("validates catalog data before consuming a code", async () => {
    const ctx = await pairing();
    expect((await ctx.exchange({ proof: ctx.proof, agents: [agents[0], agents[0]] })).ok).toBe(
      false,
    );
    expect((await ctx.exchange()).ok).toBe(true);
  });
  it("enforces credential purpose and edge signature on the public exchange endpoint", async () => {
    const ctx = await pairing();
    const post = (action: string, token: string) =>
      SELF.fetch(`https://example.com/api/openclaw/${action}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ proof: ctx.proof, agents }),
      });
    expect((await post("poll", ctx.code)).status).toBe(401);
    expect((await post("pair", ctx.token!)).status).toBe(401);
    expect((await post("pair", ctx.code.replace(ctx.accountId, "a".repeat(64)))).status).toBe(401);
    const response = await post("pair", ctx.code);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { token: string };
    expect(parseOpenClawToken(env, `Bearer ${data.token}`)?.pluginId).toBe(ctx.pluginId);
  });
});
