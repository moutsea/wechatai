import { env, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "../src/server/security";
const input = {
  name: "微信助手",
  protocol: "responses",
  baseUrl: "https://llm.example.com/v1",
  model: "test",
  apiKey: "test-key",
  maxOutputTokens: 256,
  contextTokens: 8000,
  maxCredits: 30,
};
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected network call"))),
  ),
);
afterEach(() => vi.unstubAllGlobals());
async function connectedAccount() {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  await stub.api("assistant.save", input);
  await runInDurableObject(stub, async (_instance, state) => {
    const credentials = await encrypt(
      env,
      JSON.stringify({
        token: "wx-secret",
        baseUrl: "https://ilinkai.weixin.qq.com",
        userId: "owner",
        botId: "bot-1",
      }),
      `${state.id}:wechat`,
    );
    state.storage.sql.exec(
      "INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      "connection",
      JSON.stringify({
        status: "connected",
        generation: "g1",
        encryptedCredentials: credentials,
        cursor: "",
        contextToken: "reply-context",
      }),
    );
    await state.storage.setAlarm(Date.now() + 60000);
  });
  return stub;
}
describe("durable WeChat delivery", () => {
  it("persists inbox and cursor atomically, isolates sender, replays saved results and retries delivery without billing twice", async () => {
    const stub = await connectedAccount();
    const sends: string[] = [];
    let models = 0;
    let sendCount = 0;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.includes("getupdates"))
        return Response.json({
          ret: 0,
          get_updates_buf: "cursor-2",
          msgs: [
            {
              message_id: 1,
              message_type: 1,
              from_user_id: "owner",
              context_token: "new-context",
              item_list: [{ type: 1, text_item: { text: "你好" } }],
            },
            {
              message_id: 2,
              message_type: 1,
              from_user_id: "someone-else",
              item_list: [{ type: 1, text_item: { text: "ignore me" } }],
            },
          ],
        });
      if (target.includes("cloudflare-dns.com"))
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      if (target.includes("/responses")) {
        models++;
        return Response.json({
          output: [
            { type: "message", content: [{ type: "output_text", text: "你好，我是你的助手。" }] },
          ],
          usage: { input_tokens: 1000, output_tokens: 100 },
        });
      }
      if (target.includes("sendmessage")) {
        const body = JSON.parse(String(init?.body));
        sends.push(body.msg.client_id);
        sendCount++;
        return sendCount === 1
          ? Response.json({ ret: 1 }, { status: 503 })
          : Response.json({ ret: 0 });
      }
      throw new Error("Unexpected network endpoint");
    });
    const before = (await stub.snapshot()).wallet.balance;
    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, (_instance, state) => {
      expect(state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM inbox").one().n).toBe(
        1,
      );
      expect(
        JSON.parse(
          state.storage.sql
            .exec<{ value: string }>("SELECT value FROM settings WHERE key = 'connection'")
            .one().value,
        ).cursor,
      ).toBe("cursor-2");
    });
    await runDurableObjectAlarm(stub);
    // Simulate interruption after inference was committed but before the reply state was observed.
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE inbox SET state = 'pending'");
    });
    await runDurableObjectAlarm(stub);
    await runDurableObjectAlarm(stub);
    await runDurableObjectAlarm(stub);
    await runDurableObjectAlarm(stub);
    expect(models).toBe(1);
    expect(sends).toHaveLength(2);
    expect(sends[0]).toBe(sends[1]);
    const after = await stub.snapshot();
    expect(after.wallet.balance).toBeCloseTo(before - 0.024);
    expect(after.stats.messages).toBe(2);
    await runInDurableObject(stub, async (_instance, state) => {
      expect(state.storage.sql.exec<{ state: string }>("SELECT state FROM inbox").one().state).toBe(
        "done",
      );
      await state.storage.deleteAlarm();
    });
  });
  it("does not repeat a session command after a processing interruption", async () => {
    const stub = await connectedAccount();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO inbox (id,payload,createdAt) VALUES (?, ?, ?)",
        "command-1",
        JSON.stringify({
          message_type: 1,
          from_user_id: "owner",
          item_list: [{ type: 1, text_item: { text: "/new" } }],
        }),
        Date.now(),
      );
    });
    await runDurableObjectAlarm(stub);
    const first = (await stub.snapshot()).stats.sessions;
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE inbox SET state = 'pending' WHERE id = 'command-1'");
    });
    await runDurableObjectAlarm(stub);
    expect((await stub.snapshot()).stats.sessions).toBe(first);
    expect(fetch).not.toHaveBeenCalled();
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.deleteAlarm();
    });
  });
  it("stops polling when WeChat says the session is expired", async () => {
    const stub = await connectedAccount();
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ret: -14 }));
    await runDurableObjectAlarm(stub);
    expect((await stub.snapshot()).connection.status).toBe("expired");
    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.getAlarm()).toBeNull();
    });
  });
});
