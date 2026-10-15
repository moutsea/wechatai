import {
  env,
  abortAllDurableObjects,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guideUrl, wechatHelp, welcomeGuide } from "../src/shared/guide";
import type { WxMessage } from "../src/server/wechat";
import { deferAutomaticAlarms } from "./helpers/wechat-delivery";

const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
type Account = ReturnType<typeof account>;
const accounts: Account[] = [];
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected outbound request"))),
  );
});
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.deleteAlarm();
    });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function network() {
  const sends: {
    client_id: string;
    to_user_id: string;
    context_token: string;
    item_list: { text_item: { text: string } }[];
  }[] = [];
  const batches: WxMessage[][] = [];
  const state = { owner: "owner", failedSends: 0, models: 0 };
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const request = new Request(url, init);
    const target = new URL(request.url);
    if (target.pathname.endsWith("get_bot_qrcode"))
      return Response.json({ qrcode: "test-qr", qrcode_img_content: "https://example.com/qr" });
    if (target.pathname.endsWith("get_qrcode_status"))
      return Response.json({
        status: "confirmed",
        bot_token: "test-token",
        ilink_user_id: state.owner,
        ilink_bot_id: "bot-1",
      });
    if (target.pathname.endsWith("getupdates"))
      return Response.json({ ret: 0, msgs: batches.shift() ?? [], get_updates_buf: "cursor" });
    if (target.pathname.endsWith("sendmessage")) {
      sends.push(((await request.json()) as { msg: (typeof sends)[number] }).msg);
      if (state.failedSends > 0) {
        state.failedSends--;
        return Response.json({ ret: 1 }, { status: 503 });
      }
      return Response.json({ ret: 0 });
    }
    if (target.hostname === "cloudflare-dns.com")
      return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
    if (target.hostname === "llm.example.com") {
      state.models++;
      const body = (await request.json()) as { input: { content: string }[] };
      expect(body.input.at(-1)?.content).toBe("帮我写一句问候语");
      return Response.json({
        output: [{ content: [{ type: "output_text", text: "你好，愿你今天顺利。" }] }],
        usage: { input_tokens: 100, output_tokens: 10 },
      });
    }
    throw new Error("Unexpected outbound endpoint");
  });
  return { sends, batches, state };
}
function message(text = "/help", from = "owner", id = 1): WxMessage {
  return {
    message_id: id,
    message_type: 1,
    from_user_id: from,
    context_token: `context-${from}`,
    item_list: [{ type: 1, text_item: { text } }],
  };
}
async function bind(stub: Account) {
  if (!(await stub.snapshot()).assistants.length)
    expect(
      JSON.parse(
        await stub.api("assistant.save", {
          name: "test",
          protocol: "responses",
          baseUrl: "https://llm.example.com",
          model: "test",
          apiKey: "test-key",
        }),
      ).ok,
    ).toBe(true);
  expect(JSON.parse(await stub.api("wechat.bind")).ok).toBe(true);
  await runDurableObjectAlarm(stub);
  expect((await stub.snapshot()).connection.status).toBe("connected");
}
async function newAccount() {
  const stub = account();
  accounts.push(stub);
  await runInDurableObject(stub, (_, state) => deferAutomaticAlarms(state));
  return stub;
}
async function restart(stub: Account) {
  await abortAllDurableObjects();
  const fresh = env.ACCOUNTS.get(stub.id);
  accounts[accounts.indexOf(stub)] = fresh;
  await runInDurableObject(fresh, (_, state) => deferAutomaticAlarms(state));
  return fresh;
}
async function makeRetryDue(stub: Account) {
  await runInDurableObject(stub, (_instance, state) => {
    const row = state.storage.sql
      .exec<{ value: string }>("SELECT value FROM settings WHERE key = 'guideDelivery'")
      .one();
    const delivery = JSON.parse(row.value);
    expect(delivery.status).toBe("pending");
    expect(delivery.retryAt).toBeGreaterThan(Date.now());
    state.storage.sql.exec(
      "UPDATE settings SET value = ? WHERE key = 'guideDelivery'",
      JSON.stringify({ ...delivery, retryAt: 0 }),
    );
  });
}

describe("guide links", () => {
  it("builds a public guide URL without account data or query parameters", () => {
    expect(guideUrl("https://app.example.com/path?token=private#hash")).toBe(
      "https://app.example.com/docs/getting-started",
    );
    expect(wechatHelp("https://app.example.com")).toContain(
      "https://app.example.com/docs/getting-started",
    );
    const welcome = welcomeGuide("https://app.example.com");
    expect(welcome).toContain("你好，欢迎使用微伴");
    expect(welcome).toContain("https://app.example.com/docs/commands");
    expect(welcome).not.toContain("/models");
    expect(welcome).not.toContain("/new");
  });
  it.each([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://[::1]:5173",
    "http://192.168.1.2:5173",
  ])("sends a direct guide link for a local site: %s", (url) => {
    expect(guideUrl(url)).toBe(`${url}/docs/getting-started`);
    expect(welcomeGuide(url)).toContain(`${url}/docs/commands`);
    expect(welcomeGuide(url)).not.toContain("工作台左下角");
    expect(wechatHelp(url)).toContain(`${url}/docs/getting-started`);
  });
  it.each(["ftp://app.example.com", "https://user:pass@app.example.com", "not-a-url"])(
    "does not send an unusable or credential-bearing link: %s",
    (url) => {
      expect(guideUrl(url)).toBeNull();
      expect(welcomeGuide(url)).toContain("网页工作台左下角「文档」");
      expect(welcomeGuide(url)).not.toContain(url);
    },
  );
});

describe("connection onboarding", () => {
  it("waits for the owner context, sends the guide for free, then still answers /help", async () => {
    const mock = network();
    const stub = await newAccount();
    await bind(stub);
    const balance = (await stub.snapshot()).wallet.balance;
    mock.batches.push([message("ignore", "someone-else"), { ...message("echo"), message_type: 2 }]);
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(0);
    mock.batches.push([message()]);
    await runDurableObjectAlarm(stub); // Receive the owner context and deliver the guide.
    expect(mock.sends).toHaveLength(1);
    expect(mock.sends[0]).toMatchObject({ to_user_id: "owner", context_token: "context-owner" });
    expect(mock.sends[0].item_list[0].text_item.text).toContain("欢迎使用微伴");
    expect(mock.sends[0].item_list[0].text_item.text).toContain(
      new URL("/docs/commands", env.PUBLIC_SITE_URL).toString(),
    );
    await runDurableObjectAlarm(stub); // Handle and deliver /help.
    expect(mock.sends).toHaveLength(2);
    expect(mock.sends[1].item_list[0].text_item.text).toContain("/wx delete");
    expect(mock.sends[1].item_list[0].text_item.text).toContain("完整使用教程");
    expect(mock.sends[1].item_list[0].text_item.text).toContain(
      new URL("/docs/getting-started", env.PUBLIC_SITE_URL).toString(),
    );
    expect(mock.state.models).toBe(0);
    expect((await stub.snapshot()).wallet.balance).toBe(balance);
    expect((await stub.snapshot()).stats.messages).toBe(0);
  });
  it("preserves the first real question and bills only its model response", async () => {
    const mock = network();
    const stub = await newAccount();
    await stub.api("assistant.save", {
      name: "test",
      protocol: "responses",
      baseUrl: "https://llm.example.com",
      model: "test",
      apiKey: "test-key",
    });
    await bind(stub);
    const balance = (await stub.snapshot()).wallet.balance;
    mock.batches.push([message("帮我写一句问候语")]);
    for (let i = 0; i < 4; i++) await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(2);
    expect(mock.sends[0].item_list[0].text_item.text).toContain("欢迎使用微伴");
    expect(mock.sends[1].item_list[0].text_item.text).toBe("你好，愿你今天顺利。");
    expect(mock.state.models).toBe(1);
    expect((await stub.snapshot()).wallet.balance).toBeCloseTo(balance - 0.028);
    expect((await stub.snapshot()).stats.messages).toBe(2);
  });
  it("sends once per connection, survives restarts, and welcomes again after reconnecting", async () => {
    const mock = network();
    let stub = await newAccount();
    await bind(stub);
    mock.batches.push([message()]);
    await runDurableObjectAlarm(stub);
    await runDurableObjectAlarm(stub);
    stub = await restart(stub);
    await runDurableObjectAlarm(stub); // Handle the original /help after a restart.
    await runDurableObjectAlarm(stub);
    expect(
      mock.sends.filter((s) => s.item_list[0].text_item.text.includes("欢迎使用微伴")),
    ).toHaveLength(1);
    await stub.api("wechat.disconnect");
    await bind(stub);
    await runDurableObjectAlarm(stub); // The old connection's context must not be reused.
    expect(mock.sends).toHaveLength(2);
    mock.batches.push([message("/balance", "owner", 2)]);
    for (let i = 0; i < 4; i++) await runDurableObjectAlarm(stub);
    const welcomes = mock.sends.filter((s) =>
      s.item_list[0].text_item.text.includes("欢迎使用微伴"),
    );
    expect(welcomes).toHaveLength(2);
    expect(welcomes[0].client_id).not.toBe(welcomes[1].client_id);
    expect(welcomes[1].item_list[0].text_item.text).toContain("/docs/commands");
    expect(mock.sends.at(-1)?.item_list[0].text_item.text).toContain("可用额度");
    stub = await restart(stub);
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(4);
  });
  it("replaces the old account-wide sent marker on a new connection", async () => {
    const mock = network();
    const stub = await newAccount();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO settings VALUES ('guideDelivery', ?)",
        JSON.stringify({
          clientId: "legacy-welcome",
          userId: "owner",
          status: "sent",
          attempts: 0,
          retryAt: 0,
        }),
      );
    });
    await bind(stub);
    mock.batches.push([message()]);
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(1);
    expect(mock.sends[0].client_id).not.toBe("legacy-welcome");
    expect(mock.sends[0].item_list[0].text_item.text).toContain("/docs/commands");
  });
  it("starts a fresh welcome after reconnecting while an earlier send is backing off", async () => {
    const mock = network();
    const stub = await newAccount();
    await bind(stub);
    mock.batches.push([message()]);
    mock.state.failedSends = 1;
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(1);
    await stub.api("wechat.disconnect");
    await bind(stub);
    mock.batches.push([message("/help", "owner", 2)]);
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(2);
    expect(mock.sends[1].client_id).not.toBe(mock.sends[0].client_id);
    expect(mock.sends[1].item_list[0].text_item.text).toContain("/docs/commands");
  });
  it("retries with the same delivery ID across restart without blocking normal replies", async () => {
    const mock = network();
    let stub = await newAccount();
    await bind(stub);
    mock.batches.push([message()]);
    mock.state.failedSends = 1;
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(1);
    await runDurableObjectAlarm(stub); // Process /help while guide is backing off.
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(2);
    expect(mock.sends[1].item_list[0].text_item.text).toContain("/wx delete");
    await makeRetryDue(stub);
    stub = await restart(stub);
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(3);
    expect(mock.sends[2].client_id).toBe(mock.sends[0].client_id);
    expect(mock.state.models).toBe(0);
  });
  it("does not retry a queued welcome using a previous owner's context after rebinding", async () => {
    const mock = network();
    const stub = await newAccount();
    await bind(stub);
    mock.batches.push([message()]);
    mock.state.failedSends = 1;
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(1);
    await stub.api("wechat.disconnect");
    mock.state.owner = "new-owner";
    await bind(stub);
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(1);
    mock.batches.push([message("/help", "new-owner", 2)]);
    await runDurableObjectAlarm(stub);
    expect(mock.sends).toHaveLength(2);
    expect(mock.sends[1]).toMatchObject({
      to_user_id: "new-owner",
      context_token: "context-new-owner",
    });
  });
});
