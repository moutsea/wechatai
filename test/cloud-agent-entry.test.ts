import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import authMigration from "../migrations/0001_auth.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import adminMigration from "../migrations/0005_admin.sql?raw";
import adminExpiryMigration from "../migrations/0017_admin_expiry.sql?raw";
import { CloudAgentStore } from "../src/server/cloud-agent-store";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { AttachmentQueue } from "../src/server/attachments";
import type { WxItem, WxMessage } from "../src/server/wechat";
import type { CloudAgentPlugin } from "../src/shared/cloud-agent";
import { wechatSetupIssue } from "../src/shared/wechat-readiness";
import {
  connectForManualDelivery,
  deliverQueuedReplies,
  useManualAlarms,
} from "./helpers/wechat-delivery";

type Account = ReturnType<typeof env.ACCOUNTS.getByName>;
const settings = {
  CLOUD_AGENT_ENABLED: "true",
  PLUS_SESSIONS: "200",
  AGT_ORIGIN: "https://agt.example.com",
  AGT_APP_ID: "app-one",
  AGT_APP_KEY: "test-only-app-key",
  AGT_TENANT_ID: "tenant-one",
  AGT_MODEL: "managed-model",
  PUBLIC_SITE_URL: "https://wechatai.example.com",
};
const api = async (stub: Account, action: string, value: unknown = {}) =>
  JSON.parse(await stub.api(action, value));
beforeAll(async () => {
  for (const migration of [
    authMigration,
    billingMigration,
    referralMigration,
    adminMigration,
    adminExpiryMigration,
  ])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
async function setup(plus = true, enabled: boolean | "admin" = true, ownerId?: string) {
  const stub = env.ACCOUNTS.getByName(ownerId ?? crypto.randomUUID());
  if (ownerId) await stub.identify(ownerId);
  await runInDurableObject(stub, async (instance, state) => {
    await useManualAlarms(state);
    Object.assign(Reflect.get(instance, "env"), settings, { CLOUD_AGENT_ENABLED: String(enabled) });
  });
  if (plus)
    await stub.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86_400_000,
    });
  await api(stub, "assistant.save", {
    name: "用户文本模型",
    model: "user-model",
    protocol: "responses",
    baseUrl: "https://llm.example.com/v1",
    apiKey: "test-user-api-key",
    systemPrompt: "使用用户配置的系统提示词。",
  });
  await api(stub, "wechat.create", { name: "测试微信" });
  await connectForManualDelivery(stub);
  return stub;
}
async function trial(grant: "active" | "expired" | "none" = "active", plus = true) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES (?,'测试管理员',?,?,?)",
  )
    .bind(id, `${id}@example.test`, Date.now(), Date.now())
    .run();
  if (grant !== "none")
    await env.DB.prepare("INSERT INTO admin_user(user_id,created_at,expires_at) VALUES (?,?,?)")
      .bind(id, Date.now(), grant === "active" ? null : Date.now() - 1000)
      .run();
  return { id, stub: await setup(plus, "admin", id) };
}
const save = async (stub: Account, value: Record<string, unknown> = {}) =>
  api(stub, "plugin.save", {
    pluginId: "wechatai/cloud-agent",
    modelId: (await stub.snapshot()).assistants[0]?.id ?? "",
    ...value,
  });
async function plugin(stub: Account) {
  const result = await save(stub);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.data as CloudAgentPlugin;
}
function send(stub: Account, items: string | WxItem[], id: string = crypto.randomUUID()) {
  return runInDurableObject(stub, (instance) => {
    const message: WxMessage = {
      item_list: typeof items === "string" ? [{ type: 1, text_item: { text: items } }] : items,
    };
    return (
      instance as unknown as {
        processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
      }
    ).processWechat(id, message, "default");
  });
}
const tasks = (stub: Account) =>
  runInDurableObject(stub, (_, state) => new CloudAgentStore(state.storage).page().tasks);
async function fullTask(stub: Account) {
  return runInDurableObject(stub, (_, state) => new CloudAgentStore(state.storage).active()[0]);
}
async function wake(stub: Account) {
  await runInDurableObject(stub, async (instance, state) => {
    const store = new CloudAgentStore(state.storage);
    for (const task of store.active()) store.patch(task, { nextAt: Date.now() });
    await instance.alarm();
  });
}
afterEach(async () => {
  vi.restoreAllMocks();
  await abortAllDurableObjects();
});

describe("cloud Agent user entry", () => {
  it("requires an explicit user model and rejects models outside the account", async () => {
    const stub = await setup();
    expect(await save(stub, { modelId: "" })).toMatchObject({
      ok: false,
      error: "cloud_model_required",
    });
    const other = await setup();
    expect(await save(stub, { modelId: (await other.snapshot()).assistants[0].id })).toMatchObject({
      ok: false,
      error: "assistant_missing",
    });
    expect(await tasks(stub)).toEqual([]);
  });

  it("keeps old cloud configuration editable but requires selecting a user model before use", async () => {
    const stub = await setup();
    const p = await plugin(stub);
    await runInDurableObject(stub, (_, state) => {
      const row = state.storage.sql
        .exec<{ data: string }>("SELECT data FROM plugins WHERE id=?", p.id)
        .one();
      const legacy = JSON.parse(row.data);
      delete legacy.modelId;
      state.storage.sql.exec("UPDATE plugins SET data=? WHERE id=?", JSON.stringify(legacy), p.id);
    });
    const snapshot = await stub.snapshot();
    const legacy = snapshot.plugins?.find((plugin) => plugin.id === p.id);
    expect(legacy?.pluginId === "wechatai/cloud-agent" && legacy.access?.code).toBe(
      "cloud_model_required",
    );
    await expect(send(stub, "/use 云")).rejects.toMatchObject({ code: "cloud_model_required" });
    expect(await tasks(stub)).toEqual([]);
    expect(await save(stub, { id: p.id, modelId: p.modelId })).toMatchObject({ ok: true });
    expect(await send(stub, "/use 云")).toContain("已进入");
  });
  it.each(["none", "expired"] as const)(
    "blocks %s admin access in both configuration and WeChat",
    async (grant) => {
      const { stub } = await trial(grant);
      const result = await save(stub, { isAdmin: true });
      expect(result).toMatchObject({ ok: false, error: "cloud_agent_unavailable" });
      expect(result.message).toContain("仅对管理员开放内测");
      const snapshot = await api(stub, "snapshot");
      expect(snapshot.data.cloudAgent.ready).toBe(false);
      expect(await send(stub, "@云 测试")).not.toContain("任务已接收");
      expect(await tasks(stub)).toHaveLength(0);
    },
  );

  it("retains Plus requirements for an administrator", async () => {
    const { stub } = await trial("active", false);
    expect(await save(stub)).toMatchObject({ ok: false, error: "cloud_plus_required" });
    expect((await api(stub, "snapshot")).data.cloudAgent.ready).toBe(true);
  });

  it("refreshes revoked administrator access before new tasks and background submission", async () => {
    const { id, stub } = await trial();
    await plugin(stub);
    await send(stub, "/use 云");
    expect(await send(stub, "管理员测试任务")).toContain("任务已接收");
    await env.DB.prepare("DELETE FROM admin_user WHERE user_id=?").bind(id).run();
    expect((await api(stub, "snapshot")).data.cloudAgent.ready).toBe(false);
    expect(await send(stub, "再创建任务").catch((error) => error.code)).toBe(
      "cloud_agent_unavailable",
    );
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("agt.example.com"))
        throw new Error("Revoked account must not submit");
      return Response.json({ ret: 0, msgs: [] });
    });
    await wake(stub);
    expect(await tasks(stub)).toMatchObject([{ state: "rejected", stopRequested: 1, settled: 0 }]);
    expect(fetch.mock.calls.some(([input]) => String(input).includes("agt.example.com"))).toBe(
      false,
    );
  });

  it("requires explicit selection after setup and does not charge for choosing the cloud plugin", async () => {
    const stub = await setup();
    const p = await plugin(stub);
    expect((await save(stub, { ...p, shortcut: "计划" })).ok).toBe(true);
    const before = await stub.snapshot();
    expect(before.currentSession?.pluginInstanceId).toBeUndefined();
    expect(await tasks(stub)).toHaveLength(0);
    await send(stub, "/use 计划");
    const selected = await stub.snapshot();
    expect(selected.currentSession?.pluginInstanceId).toBe(p.id);
    expect(selected.wallet.balance).toBe(before.wallet.balance);
    expect(await tasks(stub)).toHaveLength(0);
    expect(await send(stub, "帮我整理今天的计划")).toContain("任务已接收");
    expect(await tasks(stub)).toHaveLength(1);
    const after = await stub.snapshot();
    expect(after.wallet.balance).toBe(before.wallet.balance);
    expect(after.ledger.filter((entry) => entry.kind === "usage")).toHaveLength(0);
  });

  it.each(["service", "disabled", "expired"])(
    "archives cloud history and returns to the user model when cloud access is unavailable: %s",
    async (condition) => {
      const stub = await setup();
      const p = await plugin(stub);
      await send(stub, "/use 云");
      await send(stub, "保留这份计划");
      const task = await fullTask(stub);
      if (condition === "disabled")
        expect((await save(stub, { ...p, enabled: false })).ok).toBe(true);
      else
        await runInDurableObject(stub, (instance, state) => {
          if (condition === "service")
            Object.assign(Reflect.get(instance, "env"), {
              CLOUD_AGENT_ENABLED: "false",
              PLUS_SESSIONS: "200",
            });
          else
            state.storage.sql.exec(
              "INSERT INTO settings VALUES ('planUntil', '0') ON CONFLICT(key) DO UPDATE SET value='0'",
            );
        });
      const before = await stub.snapshot();
      const reply = await send(stub, "/wx archive");
      expect(reply).toContain("会话已归档，并开始新的会话");
      const after = await stub.snapshot();
      expect(after.currentSession?.pluginInstanceId).toBeUndefined();
      expect(after.currentSession?.assistantId).toBe(p.modelId);
      expect(after.stats.sessions).toBe(3);
      expect(after.wallet.balance).toBe(before.wallet.balance);
      expect(after.ledger).toEqual(before.ledger);
      expect(after.cloudAgent.usedToday).toBe(1);
      await runInDurableObject(stub, (_, state) => {
        const session = state.storage.sql
          .exec<{ data: string }>("SELECT data FROM sessions WHERE id=?", task.sessionId)
          .one();
        expect(JSON.parse(session.data).archived).toBe(true);
        expect(
          state.storage.sql
            .exec("SELECT content FROM messages WHERE sessionId=?", task.sessionId)
            .toArray(),
        ).toContainEqual({ content: "保留这份计划" });
        expect(new CloudAgentStore(state.storage).get(task.id)).toMatchObject({
          stopRequested: 1,
          stale: 1,
          hidden: 0,
          prompt: "保留这份计划",
        });
      });
      await abortAllDurableObjects();
      const restored = env.ACCOUNTS.get(stub.id);
      await runInDurableObject(restored, (_, state) => useManualAlarms(state));
      expect((await restored.snapshot()).currentSession?.assistantId).toBe(p.modelId);
      expect(await fullTask(restored)).toMatchObject({ id: task.id, stopRequested: 1, stale: 1 });
    },
  );

  it.each([true, false])(
    "archives through the API and selects a valid replacement when service availability is %s",
    async (available) => {
      const stub = await setup();
      const p = await plugin(stub);
      const model = await api(stub, "assistant.save", {
        name: "备用文本模型",
        baseUrl: "https://llm.example.com",
        apiKey: "test-key",
        protocol: "responses",
        model: "chat-model",
      });
      expect(model.ok).toBe(true);
      await send(stub, "/use 云");
      const before = await stub.snapshot();
      await runInDurableObject(stub, (instance) => {
        Object.assign(Reflect.get(instance, "env"), { CLOUD_AGENT_ENABLED: String(available) });
      });
      const result = await api(stub, "session.action", {
        id: before.currentSession!.id,
        action: "archive",
      });
      expect(result.ok).toBe(true);
      const after = await stub.snapshot();
      expect(after.currentSession?.id).not.toBe(before.currentSession!.id);
      expect(after.currentSession?.pluginInstanceId).toBe(available ? p.id : undefined);
      expect(after.currentSession?.assistantId).toBe(p.modelId);
      expect(after.wallet.balance).toBe(before.wallet.balance);
      expect(after.ledger).toEqual(before.ledger);
      expect(after.cloudAgent).toMatchObject({ active: 0, usedToday: 0 });
    },
  );

  it("archives through the API with a user model replacement and preserves another link's current session", async () => {
    const stub = await setup();
    const p = await plugin(stub);
    await send(stub, "/use 云");
    const first = (await stub.snapshot()).currentSession!;
    const added = await api(stub, "wechat.create", { name: "工作微信" });
    const secondLink = added.data.selectedConnectionId;
    const created = await api(stub, "session.create", {
      pluginInstanceId: p.id,
      connectionId: secondLink,
    });
    expect(created.ok).toBe(true);
    await runInDurableObject(stub, (instance) => {
      Object.assign(Reflect.get(instance, "env"), { CLOUD_AGENT_ENABLED: "false" });
    });
    expect(await api(stub, "session.action", { id: first.id, action: "archive" })).toMatchObject({
      ok: true,
    });
    const after = await stub.snapshot();
    expect(after.connections.find((link) => link.id === "default")?.currentSessionId).not.toBe(
      first.id,
    );
    expect(after.currentSession?.id).toBe(created.data.id);
    expect(after.selectedConnectionId).toBe(secondLink);
  });

  it("rolls back archive, cancellation and attachment cleanup if replacement creation fails", async () => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    await send(stub, "保留计划");
    const task = await fullTask(stub);
    await runInDurableObject(stub, (_, state) => {
      new AttachmentQueue(state.storage.sql).add(
        { connectionId: "default", sessionId: task.sessionId, generation: "g1", contextStart: 0 },
        [
          {
            type: 2,
            image_item: {
              media: { full_url: "https://novac2c.cdn.weixin.qq.com/test", aes_key: "test" },
            },
          },
        ],
        "attachment",
      );
      state.storage.sql.exec(
        "CREATE TRIGGER fail_archive_replacement BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'test replacement failure'); END",
      );
    });
    const before = await stub.snapshot();
    expect((await api(stub, "session.action", { id: task.sessionId, action: "archive" })).ok).toBe(
      false,
    );
    const after = await stub.snapshot();
    expect(after.currentSession).toEqual(before.currentSession);
    expect(after.stats).toEqual(before.stats);
    expect(after.wallet.balance).toBe(before.wallet.balance);
    expect(after.ledger).toEqual(before.ledger);
    await runInDurableObject(stub, (_, state) => {
      expect(new CloudAgentStore(state.storage).get(task.id)).toEqual(task);
      expect(state.storage.sql.exec("SELECT * FROM pending_attachments").toArray()).toHaveLength(1);
      const row = state.storage.sql
        .exec<{ data: string }>("SELECT data FROM sessions WHERE id=?", task.sessionId)
        .one();
      expect(JSON.parse(row.data).archived).toBe(false);
    });
  });

  it("creates and selects cloud-only sessions without submitting, cancelling or charging tasks", async () => {
    const stub = await setup();
    const p = await plugin(stub);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network expected"));
    const before = await stub.snapshot();
    const created = await api(stub, "session.create", {
      pluginInstanceId: p.id,
      connectionId: "default",
      title: "",
    });
    expect(created).toMatchObject({
      ok: true,
      data: {
        assistantId: p.modelId,
        pluginInstanceId: p.id,
        connectionId: "default",
        title: "新的对话",
        autoTitle: true,
      },
    });
    const snapshot = await stub.snapshot();
    expect(snapshot.channels).toHaveLength(1);
    expect(snapshot.assistants).toHaveLength(1);
    expect(snapshot.currentSession?.id).toBe(created.data.id);
    expect(snapshot.wallet.balance).toBe(before.wallet.balance);
    expect(snapshot.ledger).toEqual(before.ledger);
    expect(snapshot.cloudAgent).toMatchObject({ active: 0, usedToday: 0 });
    expect(await tasks(stub)).toEqual([]);
    expect(await send(stub, "整理计划")).toContain("任务已接收");
    const task = await fullTask(stub);
    expect(task.sessionId).toBe(created.data.id);
    const next = await api(stub, "session.create", {
      pluginInstanceId: p.id,
      connectionId: "default",
    });
    expect(next.ok).toBe(true);
    expect(next.data.id).not.toBe(created.data.id);
    expect((await stub.snapshot()).currentSession?.id).toBe(next.data.id);
    expect((await stub.snapshot()).cloudAgent).toMatchObject({ active: 1, usedToday: 1 });
    expect(await fullTask(stub)).toMatchObject({
      id: task.id,
      sessionId: created.data.id,
      stopRequested: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a stale cloud session selection when service closes without changing the current conversation", async () => {
    const stub = await setup();
    const p = await plugin(stub);
    await send(stub, "/use 云");
    const before = await stub.snapshot();
    await runInDurableObject(stub, (instance) => {
      Object.assign(Reflect.get(instance, "env"), { CLOUD_AGENT_ENABLED: "false" });
    });
    expect(await api(stub, "session.create", { pluginInstanceId: p.id })).toMatchObject({
      ok: false,
      error: "cloud_agent_unavailable",
    });
    const after = await stub.snapshot();
    expect(after.currentSession?.id).toBe(before.currentSession?.id);
    expect(after.stats.sessions).toBe(before.stats.sessions);
    expect(after.wallet.balance).toBe(before.wallet.balance);
    expect(after.ledger).toEqual(before.ledger);
    expect(await tasks(stub)).toEqual([]);
  });

  it("saves a user model reference and checks status without upstream calls or hidden tasks", async () => {
    const stub = await setup();
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network expected"));
    const p = await plugin(stub);
    expect(p).toMatchObject({
      shortcut: "云",
      hasKey: true,
      access: null,
      status: { ready: true, active: 0, usedToday: 0 },
    });
    expect(p.modelId).toBe((await stub.snapshot()).assistants[0].id);
    expect(p).not.toHaveProperty("encryptedKey");
    expect(p).not.toHaveProperty("apiKey");
    const checked = await api(stub, "plugin.test", { id: p.id });
    expect(checked).toMatchObject({ ok: true, data: { cost: 0 } });
    expect(checked.data.text).toContain("请在微信发送任务验证实际运行");
    expect(fetch).not.toHaveBeenCalled();
    expect(await tasks(stub)).toEqual([]);
    expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toEqual([]);
  });

  it.each([
    [false, true, "cloud_plus_required"],
    [true, false, "cloud_agent_unavailable"],
    [false, false, "cloud_agent_unavailable"],
  ] as const)(
    "rejects new configuration when Plus=%s and service=%s",
    async (plus, enabled, code) => {
      const stub = await setup(plus, enabled);
      expect(await save(stub)).toMatchObject({ ok: false, error: code });
      expect((await stub.snapshot()).plugins).toEqual([]);
    },
  );

  it.each([false, true])(
    "exposes service readiness before a plugin exists (enabled=%s)",
    async (enabled) => {
      const stub = await setup(false, enabled);
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("No network expected"));
      const snapshot = await stub.snapshot();
      expect(snapshot.plugins).toEqual([]);
      expect(snapshot.cloudAgent).toMatchObject({ ready: enabled, active: 0, usedToday: 0 });
      expect(snapshot.cloudAgent.reason).toBe(
        enabled ? undefined : "运营方尚未开启云端服务，请稍后再试。",
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rebinds an existing cloud user after removing their self-managed channel without calling or charging a model", async () => {
    const stub = await setup();
    const channel = await api(stub, "channel.save", {
      name: "原渠道",
      protocol: "responses",
      baseUrl: "https://llm.example.com",
      apiKey: "test-key",
    });
    expect(channel.ok).toBe(true);
    expect(
      (await api(stub, "model.save", { channelId: channel.data.id, name: "原模型", model: "test" }))
        .ok,
    ).toBe(true);
    await plugin(stub);
    await send(stub, "/use 云");
    expect((await api(stub, "channel.delete", { id: channel.data.id })).ok).toBe(true);
    expect(await send(stub, "整理计划")).toContain("任务已接收");
    expect((await api(stub, "wechat.disconnect", { id: "default" })).ok).toBe(true);
    const before = await stub.snapshot();
    expect(before.channels).toHaveLength(1);
    expect(before.assistants).toHaveLength(1);
    expect(before.currentSession?.channelName).toBe("用户文本模型");
    expect(wechatSetupIssue(before)).toBeNull();
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.includes("get_bot_qrcode"))
        return Response.json({
          qrcode: "cloud-rebind",
          qrcode_img_content: "https://wechat.example.test/qr",
        });
      expect(request.url).toContain("get_qrcode_status");
      return Response.json({
        status: "confirmed",
        bot_token: "test-only-token",
        ilink_user_id: "owner",
        ilink_bot_id: "cloud-bot",
      });
    });
    expect(await api(stub, "wechat.bind", { id: "default" })).toMatchObject({ ok: true });
    const after = await stub.snapshot();
    expect(after.connection.status).toBe("waiting");
    expect(after.wallet.balance).toBe(before.wallet.balance);
    expect(after.ledger).toEqual(before.ledger);
    expect(fetch).toHaveBeenCalledTimes(1);
    await wake(stub);
    expect((await stub.snapshot()).connection.status).toBe("connected");
    expect(fetch).toHaveBeenCalledTimes(2);
    // Rebinding also sends the welcome guide before the task acknowledgement.
    const replies = await deliverQueuedReplies(stub, 5, false, {
      incoming: [
        {
          message_id: 201,
          from_user_id: "owner",
          message_type: 1,
          context_token: "cloud-context",
          item_list: [{ type: 1, text_item: { text: "重新连接后的计划" } }],
        },
      ],
    });
    expect(replies.map((reply) => reply.text).join("\n")).toContain("任务已接收");
    const accepted = await fullTask(stub);
    expect(accepted.prompt).toBe("重新连接后的计划");
    expect((await stub.snapshot()).ledger).toEqual(before.ledger);
  });

  it.each(["service", "membership", "disabled"] as const)(
    "retains ordinary model connection readiness when cloud %s eligibility is lost",
    async (change) => {
      const stub = await setup();
      const p = await plugin(stub);
      if (change === "service")
        await runInDurableObject(stub, (instance) => {
          Reflect.get(instance, "env").CLOUD_AGENT_ENABLED = "false";
        });
      else if (change === "membership")
        await runInDurableObject(stub, (_, state) => {
          state.storage.sql.exec("UPDATE settings SET value='1' WHERE key='planUntil'");
        });
      else expect((await save(stub, { id: p.id, enabled: false })).ok).toBe(true);
      expect(wechatSetupIssue(await stub.snapshot())).toBeNull();
      expect((await stub.snapshot()).assistants[0].id).toBe(p.modelId);
    },
  );

  it("still permits self-managed text models when a saved cloud plugin is unavailable", async () => {
    const stub = await setup();
    await plugin(stub);
    expect(
      (
        await api(stub, "assistant.save", {
          name: "聊天",
          protocol: "responses",
          baseUrl: "https://llm.example.com",
          apiKey: "test-key",
          model: "test",
        })
      ).ok,
    ).toBe(true);
    await runInDurableObject(stub, (instance) => {
      Reflect.get(instance, "env").CLOUD_AGENT_ENABLED = "false";
    });
    expect(wechatSetupIssue(await stub.snapshot())).toBeNull();
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(new Request(input, init).url).toContain("get_bot_qrcode");
      return Response.json({
        qrcode: "byok",
        qrcode_img_content: "https://wechat.example.test/qr",
      });
    });
    expect((await api(stub, "wechat.bind", { id: "default" })).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("allows disabling and deleting when unavailable, but refuses reactivation", async () => {
    const stub = await setup();
    const p = await plugin(stub);
    await runInDurableObject(stub, (instance) => {
      Reflect.get(instance, "env").CLOUD_AGENT_ENABLED = "false";
    });
    expect(await save(stub, { id: p.id, enabled: false })).toMatchObject({
      ok: true,
      data: { enabled: false },
    });
    expect(await save(stub, { id: p.id, enabled: true })).toMatchObject({
      ok: false,
      error: "cloud_agent_unavailable",
    });
    expect(await api(stub, "plugin.delete", { id: p.id })).toMatchObject({ ok: true });
  });

  it.each(["public", "admin"])("executes %s tasks end to end", async (mode) => {
    const stub = mode === "admin" ? (await trial()).stub : await setup();
    const p = await plugin(stub);
    expect(await send(stub, "/use 云")).toContain("/wx stop 请求停止");
    const id = "bot:owner:101";
    const accepted = await deliverQueuedReplies(stub, 3, false, {
      incoming: [
        {
          message_id: 101,
          from_user_id: "owner",
          message_type: 1,
          item_list: [{ type: 1, text_item: { text: "帮我整理计划" } }],
        },
      ],
    });
    const reply = accepted[0]?.text;
    expect(reply).toContain("任务已接收");
    expect(await send(stub, "帮我整理计划", id)).toBe(reply);
    const task = await fullTask(stub);
    expect(task).toMatchObject({
      sourceId: id,
      pluginId: p.id,
      pluginContext: p.id,
      prompt: "帮我整理计划",
      settled: 0,
    });
    expect(await tasks(stub)).toHaveLength(1);
    const requests: string[] = [];
    const sent: string[] = [];
    let jobStatus = "running";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      requests.push(`${request.method} ${path}`);
      if (path === "/api/apps/app-one/model-channels") {
        if (request.method === "GET") return Response.json({ channels: [] });
        expect(await request.json()).toMatchObject({
          provider: "openai-compatible",
          api: "responses",
          baseUrl: "https://llm.example.com/v1",
          apiKey: "test-user-api-key",
          defaultModel: "user-model",
          isDefault: false,
        });
        return Response.json({ channel: { id: `mch_${"a".repeat(32)}` } });
      }
      if (path === "/api/apps/app-one/users")
        return Response.json({
          appUser: {
            id: "user-one",
            appId: "app-one",
            tenantId: "tenant-one",
            externalId: `wechatai:${stub.id}`,
          },
        });
      if (path === "/api/workspaces/ensure")
        return Response.json({
          workspace: {
            id: "workspace-one",
            tenantId: "tenant-one",
            name: task.workspaceName,
            accessMode: "restricted",
          },
        });
      if (path.startsWith("/api/workspaces/workspace-one/agents/")) return Response.json({});
      if (path === "/api/agent/jobs" || path === "/api/agent/workspace-one/jobs/job-one") {
        if (request.method === "POST") {
          const body = await request.json<{
            message: string;
            conversationId: string;
            model: string;
            systemPrompt: string;
          }>();
          expect(body.message).toBe(task.prompt);
          expect(body.conversationId).toBe(task.conversationId);
          expect(body.model).toBe(`channel:mch_${"a".repeat(32)}:user-model`);
          expect(body.systemPrompt).toBe("使用用户配置的系统提示词。");
        }
        return Response.json(
          {
            id: "job-one",
            workspaceId: "workspace-one",
            tenantId: "tenant-one",
            conversationId: task.conversationId,
            status: jobStatus,
            result: { text: "最终计划" },
          },
          { status: request.method === "POST" ? 202 : 200 },
        );
      }
      if (path.endsWith("/getupdates")) return Response.json({ ret: 0, msgs: [] });
      if (path.endsWith("/sendmessage")) {
        const body = await request.json<{
          msg: { item_list: { text_item: { text: string } }[] };
        }>();
        sent.push(body.msg.item_list[0].text_item.text);
        return Response.json({ ret: 0 });
      }
      throw new Error(`Unexpected endpoint ${path}`);
    });
    await wake(stub);
    jobStatus = "completed";
    await wake(stub);
    await wake(stub);
    expect(requests.filter((path) => path === "POST /api/agent/jobs")).toHaveLength(1);
    expect(sent.join("\n")).toContain("最终计划");
    expect(await tasks(stub)).toMatchObject([{ state: "completed" }]);
    await runInDurableObject(stub, (_, state) => {
      expect(
        state.storage.sql
          .exec("SELECT * FROM credit_ledger WHERE id=?", `usage:${task.id}`)
          .toArray(),
      ).toHaveLength(1);
      expect(
        state.storage.sql
          .exec("SELECT * FROM messages WHERE sessionId=?", task.sessionId)
          .toArray(),
      ).toHaveLength(2);
      expect(state.storage.sql.exec("SELECT * FROM runs WHERE id=?", id).toArray()).toHaveLength(1);
      expect(
        state.storage.sql.exec("SELECT state,sessionId FROM inbox WHERE id=?", id).one(),
      ).toEqual({ state: "done", sessionId: task.sessionId });
    });
  });

  it("uses @云 once in an ordinary session, preserves mode and treats /text as task content", async () => {
    const stub = await setup();
    await plugin(stub);
    const model = await api(stub, "assistant.save", {
      name: "普通模型",
      model: "test",
      protocol: "responses",
      baseUrl: "https://llm.example.com",
      apiKey: "key",
    });
    expect(model.ok, JSON.stringify(model)).toBe(true);
    expect(await send(stub, "/wx new")).toContain("已开始");
    const before = (await stub.snapshot()).currentSession!;
    expect(await send(stub, "@云 /整理计划")).toContain("任务已接收");
    const task = await fullTask(stub);
    expect(task).toMatchObject({
      sessionId: before.id,
      pluginContext: null,
      currentSessionId: before.id,
      prompt: "/整理计划",
    });
    expect((await stub.snapshot()).currentSession!.id).toBe(before.id);
    expect(await send(stub, "/stop")).toContain("等待云端确认");
    expect(await fullTask(stub)).toMatchObject({ stopRequested: 1, state: "submitting" });
    expect(await send(stub, "@云 再来一个").catch((e) => e.code)).toBe("cloud_agent_busy");
    await wake(stub);
    expect(await tasks(stub)).toMatchObject([{ state: "rejected" }]);
    expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toEqual([]);
  });

  it.each(["openclaw", "hermes"])(
    "stops an @云 task from %s mode via /wx stop while preserving native /stop",
    async (kind) => {
      const stub = await setup();
      await plugin(stub);
      const remote = await api(stub, "plugin.save", {
        pluginId: `wechatai/${kind}`,
        name: "自建 Agent",
        shortcut: "local",
      });
      expect(remote.ok).toBe(true);
      await send(stub, "/use local");
      await runInDurableObject(stub, (_, state) => {
        state.storage.sql.exec(
          "INSERT INTO claw_connectors(pluginId,tokenHash,lastSeen,nativeCommands) VALUES (?, 'test-only-hash', ?, 1)",
          remote.data.id,
          Date.now(),
        );
      });
      const before = (await stub.snapshot()).currentSession!.id;
      expect(await send(stub, "@云 整理计划")).toContain("任务已接收");
      expect((await stub.snapshot()).currentSession!.id).toBe(before);
      await send(stub, "/stop");
      expect((await fullTask(stub)).stopRequested).toBe(0);
      expect(await send(stub, "/wx stop")).toContain("等待云端确认");
      expect(await fullTask(stub)).toMatchObject({ sessionId: before, stopRequested: 1 });
      await runInDurableObject(stub, (_, state) => {
        expect(
          state.storage.sql
            .exec("SELECT text,lane FROM claw_jobs WHERE pluginId=?", remote.data.id)
            .toArray(),
        ).toEqual([{ text: "/stop", lane: "control" }]);
      });
    },
  );

  it.each([
    { items: [{ type: 2 }] },
    { items: [{ type: 4 }] },
    { items: [{ type: 3, voice_item: {} }] },
  ] satisfies { items: WxItem[] }[])(
    "rejects unsupported input without accepting a task: %j",
    async ({ items }) => {
      const stub = await setup();
      await plugin(stub);
      await send(stub, "/use 云");
      await expect(send(stub, items)).rejects.toMatchObject({ code: "cloud_text_only" });
      expect(await tasks(stub)).toEqual([]);
    },
  );

  it("keeps a submitted /stop task active until upstream cancellation is confirmed, without resubmission or charge", async () => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    await send(stub, "整理计划");
    const task = await fullTask(stub);
    await runInDurableObject(stub, (_, state) => {
      const store = new CloudAgentStore(state.storage);
      store.saveProvision({
        scope: cloudAgentScope(task),
        profiles: [task.profileId],
        externalId: `wechatai:${state.id}`,
        appUserId: "user-one",
        workspaceId: "workspace-one",
        configured: 1,
        updatedAt: Date.now(),
      });
      store.patch(task, { state: "accepted", jobId: "job-one", submittedAt: Date.now() });
    });
    expect(await send(stub, "/wx stop")).toContain("费用以最终结算为准");
    let status = "running";
    const paths: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(`${request.method} ${path}`);
      if (path.endsWith("/cancel")) return Response.json({ cancelled: true });
      if (path === "/api/agent/workspace-one/jobs/job-one")
        return Response.json({
          id: "job-one",
          workspaceId: "workspace-one",
          tenantId: task.tenantId,
          conversationId: task.conversationId,
          status,
        });
      if (path.endsWith("/getupdates")) return Response.json({ ret: 0, msgs: [] });
      if (path.endsWith("/sendmessage")) return Response.json({ ret: 0 });
      throw new Error(`Unexpected endpoint ${path}`);
    });
    await wake(stub);
    expect(await fullTask(stub)).toMatchObject({ state: "accepted", stopRequested: 1 });
    expect(paths).toContain("POST /api/agent/workspace-one/jobs/job-one/cancel");
    status = "cancelled";
    await wake(stub);
    await wake(stub);
    expect(await tasks(stub)).toMatchObject([{ state: "cancelled", settled: 0, units: 0 }]);
    expect(paths).not.toContain("POST /api/agent/jobs");
    expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toEqual([]);
  });

  it("preserves pending attachments for @云 and accepts transcribed voice after /cancel", async () => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    const session = (await stub.snapshot()).currentSession!;
    await runInDurableObject(stub, (_, state) => {
      new AttachmentQueue(state.storage.sql).add(
        { connectionId: "default", sessionId: session.id, generation: "g1", contextStart: 0 },
        [
          {
            type: 2,
            image_item: {
              media: { full_url: "https://novac2c.cdn.weixin.qq.com/test", aes_key: "test" },
            },
          },
        ],
        "attachment",
      );
    });
    await expect(send(stub, "@云 总结附件")).rejects.toMatchObject({ code: "cloud_text_only" });
    await runInDurableObject(stub, (_, state) => {
      expect(state.storage.sql.exec("SELECT * FROM pending_attachments").toArray()).toHaveLength(1);
    });
    expect(await tasks(stub)).toEqual([]);
    await send(stub, "/cancel");
    expect(await send(stub, [{ type: 3, voice_item: { text: "整理计划" } }])).toContain(
      "任务已接收",
    );
    expect(await fullTask(stub)).toMatchObject({ prompt: "整理计划" });
  });
});
