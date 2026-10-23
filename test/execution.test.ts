import { env, runInDurableObject, abortAllDurableObjects } from "cloudflare:test";
import { beforeAll, afterEach, describe, it, expect, vi } from "vitest";
import migration from "../migrations/0012_execution_queue.sql?raw";
import { connectForManualDelivery, useManualAlarms } from "./helpers/wechat-delivery";
import { ExecutionStore, executionAuthorized } from "../src/server/execution-store";
import { ExecutionPending } from "../src/server/execution-context";
import type { HttpActivity } from "../src/server/execution-context";
const accounts: ReturnType<typeof env.ACCOUNTS.getByName>[] = [];
beforeAll(async () => {
  for (const sql of migration
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await env.DB.prepare(sql).run();
});
afterEach(async () => {
  for (const a of accounts.splice(0))
    await runInDurableObject(env.ACCOUNTS.get(a.id), async (_, s) => {
      await s.storage.deleteAlarm();
    });
  vi.restoreAllMocks();
});
const input: HttpActivity = {
  kind: "http",
  url: "https://llm.example.com/v1/chat/completions",
  method: "POST",
  headers: { authorization: "Bearer test-key" },
  body: "{}",
  timeoutMs: 1000,
  maxBytes: 100000,
};
async function setup() {
  const a = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(a);
  await connectForManualDelivery(a);
  await runInDurableObject(a, (instance) =>
    Object.assign(Reflect.get(instance, "env"), {
      EXECUTOR_SECRET: "executor-secret-at-least-thirty-two-characters",
      EXECUTOR_ACCOUNTS: "all",
    }),
  );
  return a;
}
const success = (text = "你好") => ({
  ok: true as const,
  value: {
    status: 200,
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify({ choices: [{ message: { content: text } }] })).toString(
      "base64",
    ),
  },
});
describe("durable execution", () => {
  it.each(["personal-assistant", "web-research"] as const)(
    "resumes %s tool rounds without duplicate model/search calls or writes",
    async (kind) => {
      const a = await setup();
      const model = JSON.parse(
        await a.api("assistant.save", {
          name: "test",
          model: "test-model",
          protocol: "chat-completions",
          baseUrl: "https://llm.example.com",
          apiKey: "test-key",
          maxInputTokens: 24000,
          maxOutputTokens: 1024,
          contextTokens: 32000,
          maxCredits: 0,
        }),
      );
      const plugin = JSON.parse(
        await a.api("plugin.save", {
          pluginId: "wechatai/" + kind,
          modelId: model.data.id,
          shortcut: "助手",
          name: "助手",
          ...(kind === "web-research"
            ? {
                searchProvider: "tavily",
                searchEndpoint: "https://search.example.com/search",
                apiKey: "search-key",
              }
            : {}),
        }),
      );
      expect(plugin.ok, JSON.stringify(plugin)).toBe(true);
      const raw = (value: unknown) => ({
        ok: true as const,
        value: {
          status: 200,
          headers: { "content-type": "application/json" },
          body: Buffer.from(JSON.stringify(value)).toString("base64"),
        },
      });
      const call =
        kind === "personal-assistant"
          ? {
              id: "tool-1",
              type: "function",
              function: {
                name: "personal_create",
                arguments: JSON.stringify({
                  kind: "note",
                  title: "迁移验证",
                  content: "只保存一次",
                  date: "2026-10-16",
                }),
              },
            }
          : {
              id: "tool-1",
              type: "function",
              function: { name: "web_search", arguments: JSON.stringify({ query: "上海天气" }) },
            };
      const responses = [
        raw({
          choices: [
            {
              finish_reason: "tool_calls",
              message: { role: "assistant", content: null, tool_calls: [call] },
            },
          ],
        }),
        ...(kind === "web-research"
          ? [
              raw({
                results: [
                  { url: "https://docs.example.com/weather", title: "天气", content: "今天晴天" },
                ],
              }),
            ]
          : []),
        success("完成了"),
      ];
      let calls = 0;
      await runInDurableObject(a, async (instance, state) => {
        await useManualAlarms(state);
        state.storage.sql.exec(
          "INSERT INTO inbox(id,payload,createdAt,connectionId) VALUES(?,?,?,'default')",
          "turn",
          JSON.stringify({
            message_type: 1,
            item_list: [{ type: 1, text_item: { text: "@助手 帮我处理" } }],
          }),
          Date.now(),
        );
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
          if (String(url).includes("cloudflare-dns.com"))
            return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
          if (String(url).includes("sendmessage") || String(url).includes("getupdates"))
            return Response.json({ ret: 0 });
          throw new Error("must not call model from cloud");
        });
        const store = new ExecutionStore(state.storage, env, a.id.toString());
        for (const result of responses) {
          await instance.alarm();
          expect(state.storage.sql.exec("SELECT count(*) n FROM personal_records").one().n).toBe(0);
          const job = (await store.claim())!;
          expect(job).not.toBeNull();
          calls++;
          store.settle(job.id, job.lease, result);
        }
        await instance.alarm();
        expect(state.storage.sql.exec("SELECT status FROM runs WHERE id='turn'").one().status).toBe(
          "complete",
        );
        expect(state.storage.sql.exec("SELECT count(*) n FROM personal_records").one().n).toBe(
          kind === "personal-assistant" ? 1 : 0,
        );
        expect(state.storage.sql.exec("SELECT count(*) n FROM usage").one().n).toBe(1);
        expect(calls).toBe(kind === "personal-assistant" ? 2 : 3);
        expect(store.active()).toBeUndefined();
      });
    },
  );
  it.each(["responses", "anthropic"] as const)(
    "executes %s responses through the same durable boundary",
    async (protocol) => {
      const a = await setup();
      const model = JSON.parse(
        await a.api("assistant.save", {
          name: "test",
          model: "test-model",
          protocol,
          baseUrl: "https://llm.example.com",
          apiKey: "test-key",
          maxInputTokens: 24000,
          maxOutputTokens: 1024,
          contextTokens: 32000,
          maxCredits: 0,
        }),
      );
      expect(model.ok).toBe(true);
      await runInDurableObject(a, async (instance, state) => {
        await useManualAlarms(state);
        state.storage.sql.exec(
          "INSERT INTO inbox(id,payload,createdAt,connectionId) VALUES(?,?,?,'default')",
          "turn",
          JSON.stringify({
            message_type: 1,
            item_list: [{ type: 1, text_item: { text: "你好" } }],
          }),
          Date.now(),
        );
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
          if (String(url).includes("cloudflare-dns.com"))
            return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
          if (String(url).includes("sendmessage") || String(url).includes("getupdates"))
            return Response.json({ ret: 0 });
          throw new Error("cloud upstream call");
        });
        await instance.alarm();
        const store = new ExecutionStore(state.storage, env, a.id.toString()),
          job = (await store.claim())!;
        expect(job.input.kind).toBe("http");
        const value =
          protocol === "responses"
            ? { output: [{ type: "message", content: [{ type: "output_text", text: "你好" }] }] }
            : { content: [{ type: "text", text: "你好" }], stop_reason: "end_turn" };
        store.settle(job.id, job.lease, {
          ok: true,
          value: {
            status: 200,
            headers: { "content-type": "application/json" },
            body: Buffer.from(JSON.stringify(value)).toString("base64"),
          },
        });
        await instance.alarm();
        expect(state.storage.sql.exec("SELECT status FROM runs WHERE id='turn'").one().status).toBe(
          "complete",
        );
        expect(state.storage.sql.exec("SELECT count(*) n FROM usage").one().n).toBe(1);
      });
    },
  );
  it("resumes an image-only account through generation and image download without activating its plugin", async () => {
    const a = await setup();
    const model = JSON.parse(
      await a.api("assistant.save", {
        name: "image",
        model: "qwen-image-3.0",
        protocol: "chat-completions",
        baseUrl: "https://image.example.com",
        apiKey: "test-key",
      }),
    );
    const plugin = JSON.parse(
      await a.api("plugin.save", {
        pluginId: "wechatai/image-generation",
        modelId: model.data.id,
        shortcut: "画图",
        name: "画图",
        waitingMessageEnabled: false,
      }),
    );
    expect(plugin.ok, JSON.stringify(plugin)).toBe(true);
    await runInDurableObject(a, async (instance, state) => {
      await useManualAlarms(state);
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,createdAt,connectionId) VALUES(?,?,?,'default')",
        "turn",
        JSON.stringify({
          message_type: 1,
          item_list: [{ type: 1, text_item: { text: "@画图 一只猫" } }],
        }),
        Date.now(),
      );
      // Keep the resulting image in the reply queue; this test concerns execution,
      // while image delivery itself is covered by the media sender tests.
      state.storage.sql.exec(
        "UPDATE settings SET value=json_remove(value,'$.contextToken') WHERE key='connection'",
      );
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("cloudflare-dns.com"))
          return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
        if (String(url).includes("getupdates")) return Response.json({ ret: 0 });
        throw new Error("cloud upstream call");
      });
      const store = new ExecutionStore(state.storage, env, a.id.toString());
      await instance.alarm();
      const first = (await store.claim())!;
      expect(first.input.kind).toBe("http");
      store.settle(first.id, first.lease, {
        ok: true,
        value: {
          status: 200,
          headers: { "content-type": "application/json" },
          body: Buffer.from(
            JSON.stringify({ data: [{ url: "https://image.example.com/cat.png" }] }),
          ).toString("base64"),
        },
      });
      await instance.alarm();
      const second = (await store.claim())!;
      expect(second.input).toMatchObject({ url: "https://image.example.com/cat.png" });
      store.settle(second.id, second.lease, {
        ok: true,
        value: {
          status: 200,
          headers: { "content-type": "image/png" },
          body: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=",
        },
      });
      await instance.alarm();
      expect(state.storage.sql.exec("SELECT status FROM runs WHERE id='turn'").one().status).toBe(
        "complete",
      );
      expect(state.storage.sql.exec("SELECT count(*) n FROM usage").one().n).toBe(1);
      expect(
        state.storage.sql.exec("SELECT value FROM settings WHERE key='current'").one().value,
      ).toBe('""');
      expect(store.active()).toBeUndefined();
    });
  });
  it.each(["canceled", "disconnected", "deadline"] as const)(
    "releases an abandoned %s turn before another claim",
    async (reason) => {
      const a = await setup();
      await runInDurableObject(a, async (instance, state) => {
        const store = new ExecutionStore(state.storage, env, a.id.toString());
        state.storage.sql.exec(
          "INSERT INTO inbox(id,payload,createdAt,connectionId) VALUES('turn','{}',?,'default')",
          Date.now(),
        );
        await expect(
          store.perform(store.scope("turn", "default", "g1"), input),
        ).rejects.toBeInstanceOf(ExecutionPending);
        if (reason === "canceled")
          state.storage.sql.exec("UPDATE inbox SET state='done' WHERE id='turn'");
        if (reason === "disconnected")
          state.storage.sql.exec(
            "UPDATE settings SET value=json_set(value,'$.status','disconnected') WHERE key='connection'",
          );
        if (reason === "deadline") state.storage.sql.exec("UPDATE execution_turns SET deadline=0");
        expect(await instance.executionRequest("claim", {})).toBeNull();
        expect(store.active()).toBeUndefined();
        expect(state.storage.sql.exec("SELECT count(*) n FROM execution_data").one().n).toBe(0);
        expect(state.storage.sql.exec("SELECT state FROM inbox WHERE id='turn'").one().state).toBe(
          reason === "deadline" ? "reply" : "done",
        );
      });
    },
  );
  it("retains discovery intent across a failed registry write", async () => {
    const a = await setup();
    await runInDurableObject(a, async (_, state) => {
      const broken = {
        ...env,
        DB: {
          prepare: () => {
            throw new Error("database unavailable");
          },
        },
      } as unknown as Env;
      const store = new ExecutionStore(state.storage, broken, a.id.toString());
      await expect(
        store.perform(store.scope("turn", "default", "g1"), input),
      ).rejects.toBeInstanceOf(ExecutionPending);
      await expect(store.sync()).rejects.toThrow("database unavailable");
      expect(store.dirty()).toBe(true);
      const restored = new ExecutionStore(state.storage, env, a.id.toString());
      await restored.sync();
      expect(restored.dirty()).toBe(false);
      expect(
        await env.DB.prepare("SELECT pending FROM execution_accounts WHERE account_id=?")
          .bind(a.id.toString())
          .first("pending"),
      ).toBe(1);
    });
  });
  it("requires a separate operator secret", () => {
    const configured = {
      ...env,
      EXECUTOR_SECRET: "executor-secret-at-least-thirty-two-characters",
    };
    expect(
      executionAuthorized(configured, "Bearer executor-secret-at-least-thirty-two-characters"),
    ).toBe(true);
    expect(executionAuthorized(configured, "Bearer receiver-key")).toBe(false);
    expect(executionAuthorized(env, "Bearer ")).toBe(false);
  });
  it("persists encrypted jobs, fences claims, replays results and never re-executes an expired claim", async () => {
    const a = await setup();
    await runInDurableObject(a, async (_, state) => {
      const store = new ExecutionStore(state.storage, env, a.id.toString());
      const turn = store.scope("turn", "default", "g1");
      await expect(store.perform(turn, input)).rejects.toBeInstanceOf(ExecutionPending);
      expect(
        JSON.stringify(state.storage.sql.exec("SELECT * FROM execution_data").toArray()),
      ).not.toContain("test-key");
      const job = (await store.claim())!;
      expect(job.input).toMatchObject(input);
      expect(await store.claim()).toBeNull();
      expect(store.settle(job.id, "wrong", success())).toEqual({ stale: true });
      expect(store.settle(job.id, job.lease, success())).toEqual({ accepted: true });
      expect(store.settle(job.id, job.lease, success("different"))).toEqual({ accepted: true });
      expect(await store.perform(turn, input)).toEqual(success().value);
      store.finish(turn.id);
      await expect(store.perform({ ...turn, id: "turn2" }, input)).rejects.toBeInstanceOf(
        ExecutionPending,
      );
      const next = (await store.claim())!;
      state.storage.sql.exec("UPDATE execution_jobs SET expiresAt=0 WHERE id=?", next.id);
      store.expire();
      expect(await store.claim()).toBeNull();
      await expect(store.perform({ ...turn, id: "turn2" }, input)).rejects.toThrow("未完成");
      expect(store.settle(next.id, next.lease, success())).toEqual({ accepted: true });
      await expect(store.perform({ ...turn, id: "turn2" }, input)).rejects.toThrow("未完成");
      store.finish("turn2");
      expect(store.active()).toBeUndefined();
    });
  });
  it("completes a real chat after a DO restart with one upstream activity and one charge", async () => {
    const a = await setup();
    const model = JSON.parse(
      await a.api("assistant.save", {
        name: "test",
        model: "test-model",
        protocol: "chat-completions",
        baseUrl: "https://llm.example.com",
        apiKey: "test-key",
        maxInputTokens: 24000,
        maxOutputTokens: 512,
        contextTokens: 32000,
        maxCredits: 0,
      }),
    );
    expect(model.ok).toBe(true);
    await runInDurableObject(a, async (instance, state) => {
      await useManualAlarms(state);
      state.storage.sql.exec(
        "INSERT INTO inbox(id,payload,createdAt,connectionId) VALUES(?,?,?,'default')",
        "turn",
        JSON.stringify({ message_type: 1, item_list: [{ type: 1, text_item: { text: "你好" } }] }),
        Date.now(),
      );
      const timeout = vi.spyOn(AbortSignal, "timeout");
      const network = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("cloudflare-dns.com"))
          return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
        throw new Error("cloud must not call upstream");
      });
      await instance.alarm();
      expect(state.storage.sql.exec("SELECT status FROM runs WHERE id='turn'").one().status).toBe(
        "interrupted",
      );
      expect(state.storage.sql.exec("SELECT count(*) n FROM usage").one().n).toBe(0);
      expect(
        state.storage.sql.exec("SELECT count(*) n FROM execution_jobs WHERE state='queued'").one()
          .n,
      ).toBe(1);
      expect(timeout).not.toHaveBeenCalled();
      timeout.mockRestore();
      network.mockRestore();
    });
    await abortAllDurableObjects();
    const fresh = env.ACCOUNTS.get(a.id);
    await runInDurableObject(fresh, async (instance, state) => {
      await useManualAlarms(state);
      const store = new ExecutionStore(state.storage, env, a.id.toString());
      const job = (await store.claim())!;
      expect(job.input.kind).toBe("http");
      store.settle(job.id, job.lease, success());
      const sent: string[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (String(url).includes("cloudflare-dns.com"))
          return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
        if (String(url).includes("sendmessage")) {
          sent.push(String(init?.body));
          return Response.json({ ret: 0 });
        }
        if (String(url).includes("getupdates")) return Response.json({ ret: 0 });
        throw new Error("duplicate upstream call");
      });
      await instance.alarm();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toContain("你好");
      expect(state.storage.sql.exec("SELECT count(*) n FROM usage").one().n).toBe(1);
      expect(store.active()).toBeUndefined();
      expect(store.settle(job.id, job.lease, success())).toEqual({ stale: true });
      await instance.alarm();
      expect(state.storage.sql.exec("SELECT count(*) n FROM usage").one().n).toBe(1);
    });
  });
});
