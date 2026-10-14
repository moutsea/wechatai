import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openClawInputSchema } from "../src/shared/openclaw";
import type { WxMessage } from "../src/server/wechat";
import { NotificationStore } from "../src/server/notification-store";

type Account = ReturnType<typeof env.ACCOUNTS.getByName>;
type Processor = {
  plugins(): unknown[];
  processWechat(id: string, message: WxMessage, link: string): Promise<string>;
};
const accounts: Account[] = [];
const api = async (stub: Account, action: string, payload: unknown = {}) =>
  JSON.parse(await stub.api(action, payload));
const send = (stub: Account, text: string) =>
  runInDurableObject(stub, (instance) =>
    (instance as unknown as Processor).processWechat(
      crypto.randomUUID(),
      { item_list: [{ type: 1, text_item: { text } }] },
      "default",
    ),
  );

async function setup() {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  await stub.applyPayment({
    id: "plus",
    kind: "subscription",
    units: 0,
    expires: Date.now() + 86400000,
  });
  expect((await api(stub, "wechat.create", { name: "测试微信" })).ok).toBe(true);
  return stub;
}
async function addModel(stub: Account) {
  const channel = await api(stub, "channel.save", {
    name: "测试渠道",
    protocol: "responses",
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    color: "sage",
  });
  expect(channel.ok).toBe(true);
  const model = await api(stub, "model.save", {
    channelId: channel.data.id,
    name: "测试模型",
    model: "model-a",
  });
  expect(model.ok).toBe(true);
  return model.data;
}
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, (_, state) => state.storage.deleteAlarm());
});

describe("case-insensitive shortcut uniqueness", () => {
  it.each([
    "wechatai/openclaw",
    "wechatai/hermes",
    "wechatai/web-research",
    "wechatai/image-generation",
    "wechatai/roleplay",
    "wechatai/personal-assistant",
  ])("rejects conflicting creates and edits for %s", async (pluginId) => {
    const stub = await setup();
    const model = await addModel(stub);
    const input = {
      pluginId,
      name: "测试插件",
      shortcut: "claw",
      modelId: model.id,
      description: "测试角色",
      searchProvider: "tavily",
      searchEndpoint: "https://search.example.com/search",
      apiKey: "test-search-key",
    };
    const first = await api(stub, "plugin.save", input);
    expect(first.ok).toBe(true);
    expect(await api(stub, "plugin.save", { ...input, shortcut: "CLAW" })).toMatchObject({
      ok: false,
      error: "shortcut_exists",
    });
    const second = await api(stub, "plugin.save", { ...input, shortcut: "other" });
    expect(second.ok).toBe(true);
    expect(
      await api(stub, "plugin.save", { ...input, id: second.data.id, shortcut: "ClAw" }),
    ).toMatchObject({ ok: false, error: "shortcut_exists" });
    // Changing only the case of one's own shortcut is valid.
    expect(
      await api(stub, "plugin.save", { ...input, id: first.data.id, shortcut: "CLAW" }),
    ).toMatchObject({ ok: true, data: { shortcut: "CLAW" } });
  });

  it("checks both model/plugin directions and other models", async () => {
    const stub = await setup();
    const model = await addModel(stub);
    const modelInput = { ...model, shortcut: "model" };
    expect((await api(stub, "model.save", modelInput)).ok).toBe(true);
    const plugin = { pluginId: "wechatai/openclaw", name: "Agent", shortcut: "MODEL" };
    expect(await api(stub, "plugin.save", plugin)).toMatchObject({
      ok: false,
      error: "shortcut_exists",
    });
    expect((await api(stub, "plugin.save", { ...plugin, shortcut: "claw" })).ok).toBe(true);
    expect(await api(stub, "model.save", { ...modelInput, shortcut: "CLAW" })).toMatchObject({
      ok: false,
      error: "shortcut_exists",
    });
    expect(
      await api(stub, "model.save", {
        channelId: model.channelId,
        model: "model-b",
        name: "第二个模型",
        shortcut: "MODEL",
      }),
    ).toMatchObject({ ok: false, error: "shortcut_exists" });
    expect(await api(stub, "model.save", { ...modelInput, shortcut: "MODEL" })).toMatchObject({
      ok: true,
      data: { shortcut: "MODEL" },
    });
  });

  it("keeps /use unambiguous after rejecting a case-only duplicate", async () => {
    const stub = await setup();
    const input = { pluginId: "wechatai/openclaw", name: "我的 Agent", shortcut: "claw" };
    const saved = await api(stub, "plugin.save", input);
    expect(saved.ok).toBe(true);
    expect(await api(stub, "plugin.save", { ...input, shortcut: "CLAW" })).toMatchObject({
      ok: false,
      error: "shortcut_exists",
    });
    expect(await send(stub, "/use ClAw")).toContain("已进入「我的 Agent」");
    expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBe(saved.data.id);
  });
});

describe("alias-only plugin selection", () => {
  it("lists aliases without indexes and only switches by alias", async () => {
    const stub = await setup();
    const first = await api(stub, "plugin.save", {
      pluginId: "wechatai/openclaw",
      name: "2",
      shortcut: "claw2",
    });
    const second = await api(stub, "plugin.save", {
      pluginId: "wechatai/hermes",
      name: "我的 Hermes",
      shortcut: "hermes",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    for (const command of ["/wx plugins", "/use"]) {
      const list = await send(stub, command);
      expect(list).toContain("- 2 · @claw2");
      expect(list).toContain("- 我的 Hermes · @hermes");
      expect(list).toContain("/use 别名");
      expect(list).not.toMatch(/^\d+\./m);
    }
    for (const alias of ["ClAw2", "@ClAw2", "＠ClAw2"])
      expect(await send(stub, `/use ${alias}`)).toContain("已进入「2」");
    const current = (await stub.snapshot()).currentSession!.id;
    for (const command of [
      "/use 1",
      "/use 2",
      "/use @2",
      "/use ＠１２",
      "/use １２",
      "/use 我的 Hermes",
    ]) {
      expect(await send(stub, command)).toContain("别名");
      expect((await stub.snapshot()).currentSession?.id).toBe(current);
    }
    expect(await send(stub, "/use HeRmEs")).toContain("已切换到「我的 Hermes」");
    expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBe(second.data.id);
  });

  it.each([
    "wechatai/openclaw",
    "wechatai/hermes",
    "wechatai/web-research",
    "wechatai/image-generation",
    "wechatai/roleplay",
    "wechatai/personal-assistant",
  ])("rejects numeric aliases on creation and edit for %s", async (pluginId) => {
    const stub = await setup();
    const model = await addModel(stub);
    const input = {
      pluginId,
      name: "测试插件",
      shortcut: "claw2",
      modelId: model.id,
      description: "测试角色",
      searchProvider: "tavily",
      searchEndpoint: "https://search.example.com/search",
      apiKey: "test-search-key",
    };
    for (const shortcut of ["2", "１２", " 123 "]) {
      expect(await api(stub, "plugin.save", { ...input, shortcut })).toMatchObject({
        ok: false,
        error: "invalid_plugin_shortcut",
        message: expect.stringContaining("不能是纯数字"),
      });
    }
    const saved = await api(stub, "plugin.save", input);
    expect(saved.ok).toBe(true);
    expect(
      await api(stub, "plugin.save", { ...input, id: saved.data.id, shortcut: "2" }),
    ).toMatchObject({
      ok: false,
      error: "invalid_plugin_shortcut",
    });
    expect((await stub.snapshot()).plugins?.find((p) => p.id === saved.data.id)?.shortcut).toBe(
      "claw2",
    );
  });

  it("asks users to rename legacy numeric or case-duplicate aliases without switching", async () => {
    const stub = await setup();
    const saved = await api(stub, "plugin.save", {
      pluginId: "wechatai/openclaw",
      name: "旧插件",
      shortcut: "claw",
    });
    expect(saved.ok).toBe(true);
    const before = (await stub.snapshot()).currentSession?.id;
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE plugins SET data=json_set(data, '$.shortcut', '2') WHERE id=?",
        saved.data.id,
      );
    });
    expect(await send(stub, "/wx plugins")).toContain("请在网页修改纯数字别名");
    expect(await send(stub, "/use 2")).toContain("请在网页修改");
    expect((await stub.snapshot()).currentSession?.id).toBe(before);
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE plugins SET data=json_set(data, '$.shortcut', 'claw') WHERE id=?",
        saved.data.id,
      );
      state.storage.sql.exec(
        "INSERT INTO plugins SELECT 'legacy', json_set(data, '$.id', 'legacy', '$.shortcut', 'CLAW') FROM plugins WHERE id=?",
        saved.data.id,
      );
    });
    expect(await send(stub, "/use claw")).toContain("请在网页修改为不同别名");
    expect((await stub.snapshot()).currentSession?.id).toBe(before);
  });
});

describe("legacy alias maintenance", () => {
  it.each([
    "wechatai/openclaw",
    "wechatai/hermes",
    "wechatai/web-research",
    "wechatai/image-generation",
    "wechatai/roleplay",
    "wechatai/personal-assistant",
  ])(
    "allows full edits retaining a stored numeric alias, but never a different numeric alias for %s",
    async (pluginId) => {
      const stub = await setup();
      const model = await addModel(stub);
      const input = {
        pluginId,
        name: "旧插件",
        shortcut: "legacy",
        modelId: model.id,
        description: "测试角色",
        searchProvider: "tavily",
        searchEndpoint: "https://search.example.com/search",
        apiKey: "test-search-key",
      };
      const saved = await api(stub, "plugin.save", input);
      expect(saved.ok).toBe(true);
      for (const shortcut of ["123", "１２３"]) {
        await runInDurableObject(stub, (_, state) =>
          state.storage.sql.exec(
            "UPDATE plugins SET data=json_set(data,'$.shortcut',?) WHERE id=?",
            shortcut,
            saved.data.id,
          ),
        );
        // Send the whole configuration, as the web editors do (not the maintenance branch).
        const edited = await api(stub, "plugin.save", {
          ...input,
          ...saved.data,
          id: saved.data.id,
          shortcut,
          name: "修改后的名称",
          description: "修改后的角色提示词",
        });
        expect(edited).toMatchObject({ ok: true, data: { name: "修改后的名称", shortcut } });
        if (pluginId === "wechatai/roleplay")
          expect(edited.data.description).toBe("修改后的角色提示词");
        for (const changedShortcut of ["456", `${shortcut}4`])
          expect(
            await api(stub, "plugin.save", {
              ...input,
              id: saved.data.id,
              shortcut: changedShortcut,
            }),
          ).toMatchObject({
            ok: false,
            error: "invalid_plugin_shortcut",
            message: expect.stringContaining("不能是纯数字"),
          });
        // The legacy exception must not bypass other configuration validation.
        expect(
          (await api(stub, "plugin.save", { ...input, id: saved.data.id, shortcut, name: "" })).ok,
        ).toBe(false);
        expect(await send(stub, `/use ${shortcut}`)).toContain("请在网页修改");
        expect(
          await api(stub, "plugin.save", { ...input, id: saved.data.id, shortcut: "renamed" }),
        ).toMatchObject({
          ok: true,
          data: { shortcut: "renamed" },
        });
        // After renaming, the old number no longer qualifies as a legacy alias.
        expect(
          await api(stub, "plugin.save", { ...input, id: saved.data.id, shortcut }),
        ).toMatchObject({
          ok: false,
          error: "invalid_plugin_shortcut",
        });
      }
    },
  );
  it("allows unrelated model edits after downgrade and clearing a conflicting alias", async () => {
    const stub = await setup();
    const first = await addModel(stub);
    expect((await api(stub, "model.save", { ...first, shortcut: "GPT" })).ok).toBe(true);
    const second = await api(stub, "model.save", {
      channelId: first.channelId,
      name: "B",
      model: "b",
      shortcut: "other",
    });
    expect(second.ok).toBe(true);
    await runInDurableObject(stub, (_, state) => {
      state.storage.sql.exec(
        "UPDATE assistants SET data=json_set(data,'$.shortcut','gpt') WHERE id=?",
        second.data.id,
      );
      state.storage.sql.exec("UPDATE settings SET value='0' WHERE key='planUntil'");
    });
    expect(
      await api(stub, "model.save", { ...first, shortcut: "GPT", name: "更新名称" }),
    ).toMatchObject({ ok: true });
    expect(await api(stub, "model.save", { ...second.data, shortcut: "gpt2" })).toMatchObject({
      ok: false,
      error: "plus_required",
    });
    expect(await api(stub, "model.save", { ...second.data, shortcut: "" })).toMatchObject({
      ok: true,
    });
    await runInDurableObject(stub, (_, state) =>
      expect(
        state.storage.sql
          .exec<{ data: string }>("SELECT data FROM assistants WHERE id=?", second.data.id)
          .one().data,
      ).toContain('"shortcut":""'),
    );
  });
  it("allows an old numeric alias to be disabled without renaming or requiring the model", async () => {
    const stub = await setup();
    const saved = await api(stub, "plugin.save", {
      pluginId: "wechatai/openclaw",
      name: "旧插件",
      shortcut: "claw",
    });
    await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec(
        "UPDATE plugins SET data=json_set(data,'$.shortcut','123') WHERE id=?",
        saved.data.id,
      ),
    );
    expect(await api(stub, "plugin.save", { id: saved.data.id, enabled: false })).toMatchObject({
      ok: true,
      data: { enabled: false, shortcut: "123" },
    });
    expect(await api(stub, "plugin.save", { id: saved.data.id, shortcut: "456" })).toMatchObject({
      ok: false,
      error: "invalid_plugin_shortcut",
    });
    expect(await api(stub, "plugin.save", { id: saved.data.id, shortcut: "claw" })).toMatchObject({
      ok: true,
      data: { enabled: false, shortcut: "claw" },
    });
  });
  it("allows an unchanged legacy case collision on unrelated plugin edits but rejects new collisions", async () => {
    const stub = await setup();
    const saved = await api(stub, "plugin.save", {
      pluginId: "wechatai/openclaw",
      name: "旧插件",
      shortcut: "claw",
    });
    await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec(
        "INSERT INTO plugins SELECT 'legacy',json_set(data,'$.id','legacy','$.shortcut','CLAW') FROM plugins WHERE id=?",
        saved.data.id,
      ),
    );
    expect(await api(stub, "plugin.save", { ...saved.data, name: "修改名称" })).toMatchObject({
      ok: true,
    });
    expect(await api(stub, "plugin.save", { id: "legacy", shortcut: "claw" })).toMatchObject({
      ok: false,
      error: "shortcut_exists",
    });
    expect(await api(stub, "plugin.save", { id: "legacy", shortcut: "other" })).toMatchObject({
      ok: true,
    });
  });
});

describe("case-insensitive temporary mentions", () => {
  it.each(["free", "plus"])(
    "resolves mixed-case plugin aliases on %s without changing modes",
    async (plan) => {
      const stub = await setup();
      if (plan === "free")
        await runInDurableObject(stub, (_, state) =>
          state.storage.sql.exec("UPDATE settings SET value='0' WHERE key='planUntil'"),
        );
      const saved = await api(stub, "plugin.save", {
        pluginId: "wechatai/openclaw",
        name: "我的助手",
        shortcut: "CLAW",
      });
      expect(saved.ok).toBe(true);
      expect((await api(stub, "plugin.clawToken", { id: saved.data.id })).ok).toBe(true);
      await runInDurableObject(stub, (_, state) =>
        state.storage.sql.exec(
          "UPDATE settings SET value=? WHERE key='connection'",
          JSON.stringify({ status: "connected", generation: "g1", contextToken: "test" }),
        ),
      );
      expect(await send(stub, "/use claw")).toContain("已进入");
      await send(stub, "/exit");
      for (const command of ["@CLAW", "@claw", "@ClAw"]) {
        expect(await send(stub, `${command}，Keep My CASE`)).toBe("已成功转发，等待回复...");
        expect((await stub.snapshot()).currentSession).toBeNull();
      }
      await runInDurableObject(stub, (_, state) => {
        const jobs = state.storage.sql
          .exec<{ text: string }>("SELECT text FROM claw_jobs")
          .toArray();
        expect(jobs).toHaveLength(3);
        expect(jobs.every((job) => job.text === "Keep My CASE")).toBe(true);
      });
    },
  );

  it("resolves model aliases without lowercasing the prompt or changing the selected session", async () => {
    const stub = await setup();
    const model = await addModel(stub);
    expect((await api(stub, "model.save", { ...model, shortcut: "BASE" })).ok).toBe(true);
    const before = (await stub.snapshot()).currentSession!.id;
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const request = new Request(url, init);
        if (new URL(request.url).hostname === "cloudflare-dns.com")
          return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
        expect(request.url).toContain("llm.example.com");
        const body = await request.text();
        expect(body).toContain("Keep My CASE");
        calls++;
        return Response.json({
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "已收到" }],
            },
          ],
        });
      }),
    );
    expect(await send(stub, "@bAsE Keep My CASE")).toBe("已收到");
    expect(calls).toBe(1);
    expect((await stub.snapshot()).currentSession?.id).toBe(before);
  });

  it.each(["plugin", "model"])(
    "does not silently select a legacy duplicate %s alias",
    async (kind) => {
      const stub = await setup();
      const model = await addModel(stub);
      const saved = await api(stub, "plugin.save", {
        pluginId: "wechatai/openclaw",
        name: "助手",
        shortcut: "claw",
      });
      expect(saved.ok).toBe(true);
      await runInDurableObject(stub, (_, state) => {
        if (kind === "plugin")
          state.storage.sql.exec(
            "INSERT INTO plugins SELECT 'legacy',json_set(data,'$.id','legacy','$.shortcut','CLAW') FROM plugins WHERE id=?",
            saved.data.id,
          );
        else
          state.storage.sql.exec(
            "UPDATE assistants SET data=json_set(data,'$.shortcut','CLAW') WHERE id=?",
            model.id,
          );
      });
      const before = await stub.snapshot();
      expect(await send(stub, "@ClAw 你好")).toContain("有多个模型或插件使用了相同别名");
      const after = await stub.snapshot();
      expect(after.currentSession?.id).toBe(before.currentSession?.id);
      expect(after.wallet.balance).toBe(before.wallet.balance);
    },
  );
});

describe("plugin list query scaling", () => {
  it("dispatches a notification batch without loading the full plugin table", async () => {
    const stub = await setup();
    for (const plan of ["plus", "free"]) {
      await runInDurableObject(stub, async (instance, state) => {
        state.storage.sql.exec("DELETE FROM plugins; DELETE FROM notification_jobs");
        state.storage.sql.exec(
          "UPDATE settings SET value=? WHERE key='connection'",
          JSON.stringify({ status: "connected", generation: "g1", contextToken: "test" }),
        );
        if (plan === "free")
          state.storage.sql.exec("UPDATE settings SET value='0' WHERE key='planUntil'");
        for (let i = 0; i < 500; i++)
          state.storage.sql.exec(
            "INSERT INTO plugins VALUES (?,?)",
            `notice-${i}`,
            JSON.stringify({
              id: `notice-${i}`,
              pluginId: "wechatai/notification",
              enabled: true,
              connectionId: "default",
              name: "测试",
              shortcut: `notice_${i}`,
            }),
          );
        const store = new NotificationStore(state.storage);
        for (let i = 0; i < 5; i++)
          store.enqueue(`notice-${i}`, `job-${i}`, { title: "", text: "通知" }, "default", "g1");
        const spy = vi.spyOn(instance as unknown as Processor, "plugins");
        try {
          await instance.dispatchNotifications();
          expect(spy).not.toHaveBeenCalled();
          expect(
            state.storage.sql
              .exec("SELECT 1 FROM notification_jobs WHERE state='pending'")
              .toArray(),
          ).toHaveLength(5);
        } finally {
          spy.mockRestore();
        }
      });
    }
  });
  it.each([
    { plan: "plus", text: "/wx plugins" },
    { plan: "free", text: "/wx plugins" },
    { plan: "plus", text: "@missing 你好" },
    { plan: "free", text: "@missing 你好" },
  ])("keeps reads bounded for $plan with $text", async ({ plan, text }) => {
    const stub = await setup();
    const base = openClawInputSchema.parse({ name: "Agent", shortcut: "agent" });
    const reads: number[] = [];
    for (const count of [20, 500]) {
      const result = await runInDurableObject(stub, async (instance, state) => {
        state.storage.sql.exec("DELETE FROM plugins");
        if (plan === "free")
          state.storage.sql.exec("UPDATE settings SET value='0' WHERE key='planUntil'");
        for (let i = 0; i < count; i++)
          state.storage.sql.exec(
            "INSERT INTO plugins VALUES (?,?)",
            `plugin-${i}`,
            JSON.stringify({
              ...base,
              id: `plugin-${i}`,
              name: `Agent ${i}`,
              shortcut: `agent${i}`,
              enabled: i !== 1,
              pluginId: "wechatai/openclaw",
              version: "1.0.0",
              createdAt: i,
              encryptedKey: "",
            }),
          );
        const account = instance as unknown as Processor;
        const spy = vi.spyOn(account, "plugins");
        try {
          const reply = await account.processWechat(
            crypto.randomUUID(),
            { item_list: [{ type: 1, text_item: { text } }] },
            "default",
          );
          return { reply, reads: spy.mock.calls.length };
        } finally {
          spy.mockRestore();
        }
      });
      reads.push(result.reads);
      expect(result.reads).toBeLessThanOrEqual(2);
      if (text === "/wx plugins") {
        expect(result.reply).toContain(`Agent ${count - 1}`);
        expect((result.reply.match(/超出套餐上限/g) ?? []).length).toBe(
          plan === "free" ? count - 1 : 0,
        );
      } else {
        expect(result.reply).toContain("@agent0：");
        expect(result.reply).not.toContain("@agent1：");
        expect(result.reply.includes("@agent2：")).toBe(plan === "plus");
      }
    }
    expect(reads[1]).toBe(reads[0]);
  });
});
