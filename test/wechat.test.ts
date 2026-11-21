import { env, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "../src/server/security";
import { initWechatInbox } from "../src/server/wechat-inbox";
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
  it("adds nullable receipts to a legacy inbox without fabricating acknowledgements", async () => {
    const stub = await connectedAccount();
    await runInDurableObject(stub, async (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec("ALTER TABLE inbox DROP COLUMN wechatTextReceipts");
      sql.exec("INSERT INTO inbox (id,payload,state,createdAt) VALUES ('old','{}','done',1)");
      initWechatInbox(sql);
      initWechatInbox(sql);
      expect(sql.exec("SELECT state,wechatTextReceipts FROM inbox WHERE id='old'").one()).toEqual({
        state: "done",
        wechatTextReceipts: null,
      });
      await state.storage.deleteAlarm();
    });
  });
  it("records explicit WeChat errors on HTTP 200 and recognizes an ID-only retry receipt", async () => {
    const stub = await connectedAccount();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO inbox (id,payload,state,reply,createdAt) VALUES ('retry','{}','reply','test',1)",
      );
    });
    let sends = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith("/getupdates")) return Response.json({ ret: 0 });
      expect(String(url)).toMatch(/\/sendmessage$/);
      return Response.json(
        ++sends === 1
          ? { ret: -1, errcode: 429, errmsg: "private fixture" }
          : { message_id: "18446744073709551615" },
      );
    });
    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ state: string; receipt: string }>(
          "SELECT state, wechatTextReceipts AS receipt FROM inbox WHERE id='retry'",
        )
        .one();
      expect(row.state).toBe("reply");
      expect(JSON.parse(row.receipt)["0"]).toEqual({
        outcome: "error",
        httpStatus: 200,
        ret: -1,
        errcode: 429,
        hasMessageId: null,
        attempt: 1,
        at: expect.any(Number),
      });
    });
    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{ state: string; receipt: string }>(
          "SELECT state, wechatTextReceipts AS receipt FROM inbox WHERE id='retry'",
        )
        .one();
      expect(row.state).toBe("done");
      expect(JSON.parse(row.receipt)["0"]).toEqual({
        outcome: "accepted",
        httpStatus: 200,
        ret: null,
        errcode: null,
        hasMessageId: true,
        attempt: 2,
        at: expect.any(Number),
      });
      await state.storage.deleteAlarm();
    });
    expect(sends).toBe(2);
  });
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
          : Response.json({
              ret: 0,
              message_id: "18446744073709551614",
              errmsg: "private fixture",
            });
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
    // The first alarm now also infers and attempts delivery. Replay the committed
    // inference after that failed send, before any successful acknowledgement.
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE inbox SET state = 'pending'");
      const { receipt } = state.storage.sql
        .exec<{ receipt: string }>("SELECT wechatTextReceipts AS receipt FROM inbox")
        .one();
      expect(JSON.parse(receipt)["0"]).toMatchObject({
        outcome: "error",
        httpStatus: 503,
        ret: null,
        errcode: null,
        attempt: 1,
      });
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
      const row = state.storage.sql
        .exec<{ state: string; receipt: string }>(
          "SELECT state, wechatTextReceipts AS receipt FROM inbox",
        )
        .one();
      expect(row.state).toBe("done");
      expect(JSON.parse(row.receipt)).toEqual({
        "0": {
          outcome: "accepted",
          httpStatus: 200,
          ret: 0,
          errcode: null,
          hasMessageId: true,
          attempt: 2,
          at: expect.any(Number),
        },
      });
      await state.storage.deleteAlarm();
    });
  });
  it("records each text part without resending an ambiguous response", async () => {
    const stub = await connectedAccount();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO inbox (id,payload,state,reply,createdAt) VALUES (?, '{}', 'reply', ?, ?)",
        "long-reply",
        "好".repeat(1501),
        Date.now(),
      );
    });
    const ids: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith("/getupdates")) return Response.json({ ret: 0 });
      expect(String(url)).toMatch(/\/sendmessage$/);
      ids.push(JSON.parse(String(init?.body)).msg.client_id);
      return ids.length === 1
        ? Response.json({ errmsg: "private fixture" })
        : Response.json({ ret: 0 });
    });
    for (let i = 0; i < 3; i++) await runDurableObjectAlarm(stub);
    expect(ids).toEqual(["long-reply:0", "long-reply:1"]);
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{ state: string; receipt: string }>(
          "SELECT state, wechatTextReceipts AS receipt FROM inbox WHERE id='long-reply'",
        )
        .one();
      expect(row.state).toBe("done");
      expect(JSON.parse(row.receipt)).toEqual({
        "0": {
          outcome: "unconfirmed",
          httpStatus: 200,
          ret: null,
          errcode: null,
          hasMessageId: false,
          attempt: 1,
          at: expect.any(Number),
        },
        "1": {
          outcome: "accepted",
          httpStatus: 200,
          ret: 0,
          errcode: null,
          hasMessageId: false,
          attempt: 1,
          at: expect.any(Number),
        },
      });
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
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).endsWith("sendmessage"))).toBe(true);
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
