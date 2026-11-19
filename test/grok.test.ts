import { env, SELF, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import routes from "../migrations/0019_account_backend_routes.sql?raw";
import type { PersonalAccount } from "../src/server/personal-account";
import type { WxMessage } from "../src/server/wechat";
import { readGrokHistory } from "../src/server/grok/history";
import type { GrokTasks } from "../src/server/grok/tasks";
import {
  connectForManualDelivery,
  deliverQueuedReplies,
  useManualAlarms,
} from "./helpers/wechat-delivery";

const endpoint = "https://wechatai.app/api/grok/mcp";
const webhookUrl = "https://api2.cursor.sh/automations/webhook/test-routine";
const webhookKey = "test-routine-secret";
const stubs: DurableObjectStub<PersonalAccount>[] = [];
beforeAll(async () => {
  for (const sql of routes.split(";").filter((s) => s.trim())) await env.DB.prepare(sql).run();
});
afterEach(async () => {
  for (const stub of stubs.splice(0))
    await runInDurableObject(stub, (_, s) => s.storage.deleteAlarm());
  vi.restoreAllMocks();
});
async function setup() {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  stubs.push(stub);
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
    webhookUrl,
    webhookKey,
  });
  expect(config).toMatchObject({ ok: true, data: { hasKey: false } });
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
  const tool = async (name: string, args: unknown) => {
    const res = await rpc("tools/call", { name, arguments: args });
    expect(res.status).toBe(200);
    const reply = await res.json<{ result: { content: { text: string }[]; isError?: boolean } }>();
    if (reply.result.isError) throw Error(reply.result.content[0].text);
    return JSON.parse(reply.result.content[0].text);
  };
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
  return { stub, api, id, rpc, tool, send, wake, token };
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
  expect((await c.rpc("tools/list")).status).toBe(200);
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
  expect(await c.tool("wechatai_claim", { taskId: next })).toMatchObject({
    text: "展开第二条",
    history: [
      { role: "user", text: "列两条计划" },
      { role: "assistant", text: input.text },
    ],
  });
  expect((await c.rpc("tools/list", {}, "bad")).status).toBe(401);
  await c.api("plugin.grokRevoke", { id: c.id });
  expect((await c.rpc("tools/list")).status).toBe(401);
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
  const { receipt } = await c.tool("wechatai_claim", { taskId: ref });
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

it("dispatches through the normal account alarm and cancels outstanding work across disable and re-enable", async () => {
  const c = await setup();
  await connectForManualDelivery(c.stub);
  await c.send("@grok 一条待取消任务");
  const taskId = await c.wake(204, true);
  expect(taskId).toBeTruthy();
  const claimed = await c.tool("wechatai_claim", { taskId });
  expect(claimed.claimed).toBe(true);
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

it("resumes a partially delivered Grok reply at the next part after disabling and re-enabling", async () => {
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
  expect((await c.api("plugin.save", { id: c.id, enabled: false })).ok).toBe(true);
  expect((await c.api("plugin.save", { id: c.id, enabled: true })).ok).toBe(true);
  expect(await deliverQueuedReplies(c.stub, 2)).toEqual([{ id: result.id + ":1", text: "第二段" }]);
});

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

it.each(["lost", 202, 504] as const)(
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
      expect(timing.due).toBe(timing.expires);
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
          return JSON.parse(await instance.api("wechat." + operation, { id: "default" }));
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
    const next = await c.tool("wechatai_claim", { taskId: await c.wake() });
    expect(next.history).toEqual([
      {
        role: "user",
        taskStatus: "failed",
        text: text.slice(0, 30000),
        ...(size > 30000 ? { truncated: true } : {}),
      },
    ]);
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
});

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
    expect(await c.tool("wechatai_claim", { taskId: pending })).toMatchObject({
      claimed: true,
      history: [
        { role: "user", text: "先前的问题" },
        { role: "assistant", text: "先前的答案" },
        { role: "user", text: "先前失败的任务", taskStatus: "failed" },
      ],
    });
  },
);

it("retries a dispatcher failure only when the dispatcher confirms that nothing was sent", async () => {
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
