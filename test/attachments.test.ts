import { env, runInDurableObject, abortAllDurableObjects } from "cloudflare:test";
import { createCipheriv } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttachmentQueue, ATTACHMENT_TTL_MS, extractFileText } from "../src/server/attachments";
import { downloadMedia, type WxItem, type WxMessage } from "../src/server/wechat";
import { fitToolRequest } from "../src/server/llm-tools";
import { assistantSchema, type ModelMessage } from "../src/server/llm";
import type { Assistant, Protocol } from "../src/shared/types";

const accounts: ReturnType<typeof env.ACCOUNTS.getByName>[] = [];
const api = async (s: (typeof accounts)[number], action: string, value: unknown = {}) =>
  JSON.parse(await s.api(action, value));
afterEach(async () => {
  for (const s of accounts.splice(0))
    await runInDurableObject(s, async (_, state) => {
      await state.storage.deleteAlarm();
    });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function pdf(text = "Weather report") {
  const stream = `BT /F1 12 Tf 30 100 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(source.length);
    source += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const offset = source.length;
  source += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return strToU8(source);
}
const docx = (text = "会议纪要 &amp; 计划") =>
  zipSync({
    "word/document.xml": strToU8(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格内容</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
    ),
  });
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=",
  "base64",
);
const key = Buffer.alloc(16, 7);
function fixture(data: Uint8Array, name?: string, suffix = "a") {
  const cipher = createCipheriv("aes-128-ecb", key, Buffer.alloc(0));
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const media = {
    full_url: `https://novac2c.cdn.weixin.qq.com/${suffix}`,
    aes_key: key.toString("base64"),
  };
  const item: WxItem = name
    ? { type: 4, file_item: { file_name: name, len: String(data.length), media } }
    : { type: 2, image_item: { media } };
  return { item, encrypted, url: media.full_url };
}
type Account = (typeof accounts)[number];
function send(
  s: Account,
  items: WxItem[] | string,
  id: string = crypto.randomUUID(),
  connectionId = "default",
) {
  return runInDurableObject(s, (instance) =>
    (
      instance as unknown as {
        processWechat(id: string, m: WxMessage, connectionId: string): Promise<string>;
      }
    ).processWechat(
      id,
      { item_list: typeof items === "string" ? [{ type: 1, text_item: { text: items } }] : items },
      connectionId,
    ),
  );
}
async function pending(s: Account) {
  return runInDurableObject(s, (_, state) =>
    state.storage.sql.exec<{ items: string }>("SELECT items FROM pending_attachments").toArray(),
  );
}
async function setup(protocol: Protocol = "chat-completions", plugin = false, plus = true) {
  const s = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(s);
  if (plus)
    await s.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
  const saved = await api(s, "assistant.save", {
    name: "测试",
    protocol,
    model: "vision",
    baseUrl: "https://llm.example.com",
    apiKey: "key",
    maxInputTokens: 128000,
    contextTokens: 128000,
    maxOutputTokens: 1024,
    systemPrompt: "清晰回答",
  });
  expect(saved.ok).toBe(true);
  await api(s, "wechat.create", { name: "微信" });
  if (plugin) {
    const p = await api(s, "plugin.save", {
      name: "DS Chat",
      shortcut: "DS",
      modelId: saved.data.id,
      searchProvider: "deepseek",
      searchEndpoint: "https://search.example.com",
      apiKey: "key",
    });
    expect(p.ok).toBe(true);
    await send(s, "/use DS");
  }
  return s;
}
function network(protocol: Protocol, fixtures: ReturnType<typeof fixture>[]) {
  const calls: Record<string, unknown>[] = [];
  const state = { downloads: 0, fail: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      const target = String(url);
      const f = fixtures.find((v) => v.url === target);
      if (f) {
        state.downloads++;
        return new Response(f.encrypted);
      }
      if (target.includes("cloudflare-dns.com"))
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      if (!target.startsWith("https://llm.example.com/")) throw new Error("Unexpected endpoint");
      calls.push(JSON.parse(String(init?.body)));
      if (state.fail) return Response.json({ error: { message: "Unavailable" } }, { status: 503 });
      return Response.json(
        protocol === "responses"
          ? {
              status: "completed",
              output: [
                { type: "message", content: [{ type: "output_text", text: "已按要求处理" }] },
              ],
            }
          : protocol === "anthropic"
            ? { stop_reason: "end_turn", content: [{ type: "text", text: "已按要求处理" }] }
            : { choices: [{ finish_reason: "stop", message: { content: "已按要求处理" } }] },
      );
    }),
  );
  return { calls, state };
}

describe("attachment preparation", () => {
  it("extracts PDF, Word paragraphs/tables and UTF text inside Workers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("No external resources"))),
    );
    expect(await extractFileText("example.pdf", pdf())).toContain("Weather report");
    expect(await extractFileText("example.docx", docx())).toContain("会议纪要 & 计划\n表格内容");
    expect(await extractFileText("example.csv", strToU8("城市,温度\n上海,20"))).toContain(
      "上海,20",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects corrupt, encrypted/empty, binary and excessive documents", async () => {
    await expect(extractFileText("bad.pdf", strToU8("not a PDF"))).rejects.toThrow("解析失败");
    await expect(extractFileText("empty.pdf", pdf(""))).rejects.toThrow("没有读取到");
    await expect(
      extractFileText(
        "bad.docx",
        zipSync({ "word/document.xml": strToU8("<!DOCTYPE x [<!ENTITY xx 'x'>]><x>&xx;</x>") }),
      ),
    ).rejects.toThrow("解析失败");
    await expect(extractFileText("huge.docx", docx("a".repeat(2100000)))).rejects.toThrow(
      "解析失败",
    );
    await expect(extractFileText("binary.txt", new Uint8Array([0, 255]))).rejects.toThrow("UTF-8");
    await expect(extractFileText("large.txt", strToU8("字".repeat(100001)))).rejects.toThrow(
      "10 万字",
    );
  });
  it("prefers file aeskey and does not follow media redirects", async () => {
    const f = fixture(strToU8("文件正文"), "test.txt");
    f.item.file_item!.aeskey = key.toString("hex");
    f.item.file_item!.media!.aes_key = "invalid";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(f.encrypted)),
    );
    expect(new TextDecoder().decode(await downloadMedia(f.item))).toBe("文件正文");
    vi.mocked(fetch).mockResolvedValue(Response.redirect("https://other.example.com"));
    await expect(downloadMedia(f.item)).rejects.toThrow("附件下载失败");
  });
  it("budgets image pixels rather than their base64 transport in tool calls", () => {
    const model = {
      ...assistantSchema.parse({
        name: "a",
        protocol: "responses",
        baseUrl: "https://llm.example.com",
        model: "test",
        maxInputTokens: 40000,
      }),
      id: "m",
    } as Assistant;
    const image = { mime: "image/png", data: "abCD0123".repeat(50000) };
    const messages: ModelMessage[] = [{ role: "user", content: "比较", images: [image, image] }];
    const result = fitToolRequest(model, messages, [], [], 1024);
    expect(JSON.stringify(result)).toContain(image.data);
    expect(() =>
      fitToolRequest({ ...model, maxInputTokens: 30000 }, messages, [], [], 1024),
    ).toThrow("输入空间");
  });
});

describe.each<Protocol>(["chat-completions", "responses", "anthropic"])(
  "attachment batching over %s",
  (protocol) => {
    it.each([false, true])(
      "waits for voice/text, merges images and document once (plugin=%s)",
      async (plugin) => {
        let s = await setup(protocol, plugin);
        const a = fixture(png, undefined, "img1"),
          b = fixture(png, undefined, "img2"),
          c = fixture(strToU8("本季营收增长 20%"), "report.md", "doc");
        const { calls, state } = network(protocol, [a, b, c]);
        const before = await s.snapshot();
        const ack = await send(s, [a.item], "image-event");
        expect(ack).toContain("已暂存 1 个");
        expect(await send(s, [a.item], "image-event")).toBe(ack);
        await send(s, [b.item, c.item]);
        expect(calls).toHaveLength(0);
        expect(state.downloads).toBe(0);
        expect((await s.snapshot()).wallet.balance).toBe(before.wallet.balance);
        await send(s, "/help");
        expect(await send(s, [{ type: 3, voice_item: {} }])).toContain("没有转写");
        await abortAllDurableObjects();
        s = env.ACCOUNTS.get(s.id);
        accounts[accounts.length - 1] = s;
        expect(
          await send(s, [{ type: 3, voice_item: { text: "结合文件比较两张图" } }], "instruction"),
        ).toBe("已按要求处理");
        expect(calls).toHaveLength(1);
        expect(state.downloads).toBe(3);
        const body = JSON.stringify(calls[0]);
        expect(body).toContain("结合文件比较两张图");
        expect(body).toContain("本季营收增长 20%");
        expect(body.split(png.toString("base64"))).toHaveLength(3);
        expect(await pending(s)).toHaveLength(0);
        const after = await s.snapshot();
        expect(after.stats.messages).toBe(before.stats.messages + 2);
        expect(after.wallet.balance).toBeLessThan(before.wallet.balance);
        expect(await send(s, "ignored", "instruction")).toBe("已按要求处理");
        expect((await s.snapshot()).wallet.balance).toBe(after.wallet.balance);
        expect(calls).toHaveLength(1);
        await send(s, "下一题");
        expect(JSON.stringify(calls[1])).not.toContain(png.toString("base64"));
      },
    );
  },
);

describe("pending attachment lifecycle", () => {
  it("keeps attachments after a model failure and uses them on the next instruction", async () => {
    const s = await setup();
    const f = fixture(png);
    const { calls, state } = network("chat-completions", [f]);
    await send(s, [f.item]);
    const balance = (await s.snapshot()).wallet.balance;
    state.fail = true;
    await expect(send(s, "描述图片")).rejects.toThrow();
    expect(await pending(s)).toHaveLength(1);
    expect((await s.snapshot()).wallet.balance).toBe(balance);
    state.fail = false;
    expect(await send(s, "再试一次，描述图片")).toBe("已按要求处理");
    expect(calls).toHaveLength(2);
    expect(await pending(s)).toHaveLength(0);
  });
  it.each(["/cancel", "/new", "/reset", "/archive", "/exit"])(
    "clears pending attachments on %s",
    async (command) => {
      const s = await setup("responses", true);
      const f = fixture(png);
      const { calls } = network("responses", [f]);
      await send(s, [f.item]);
      await send(s, command);
      expect(await pending(s)).toHaveLength(0);
      expect(calls).toHaveLength(0);
    },
  );
  it("expires bytes, explains expiration and isolates links", async () => {
    const s = await setup();
    const f = fixture(png);
    const { calls } = network("chat-completions", [f]);
    await send(s, [f.item]);
    const other = await api(s, "wechat.create", { name: "其他微信" });
    const otherId = other.data.selectedConnectionId;
    await send(s, "普通问题", crypto.randomUUID(), otherId);
    expect(JSON.stringify(calls[0])).not.toContain(png.toString("base64"));
    const time = vi.spyOn(Date, "now").mockReturnValue(Date.now() + ATTACHMENT_TTL_MS + 1);
    await runInDurableObject(s, (_, state) => {
      new AttachmentQueue(state.storage.sql).expire();
    });
    expect((await pending(s))[0].items).toBe("[]");
    expect(await send(s, "分析刚才图片")).toContain("已过期");
    expect(calls).toHaveLength(1);
    time.mockRestore();
  });
  it("enforces Plus, count and file format without downloading", async () => {
    const free = await setup("responses", false, false);
    const paid = await setup();
    const f = fixture(png);
    const { calls, state } = network("responses", [f]);
    expect(await send(free, [f.item])).toContain("升级 Plus");
    expect(await pending(free)).toHaveLength(0);
    await send(paid, [f.item, f.item, f.item, f.item]);
    await expect(send(paid, [f.item])).rejects.toThrow("最多暂存 4 个");
    expect(JSON.parse((await pending(paid))[0].items).items).toHaveLength(4);
    await send(paid, "/cancel");
    await expect(send(paid, [fixture(strToU8("bad"), "x.exe").item])).rejects.toThrow("目前支持");
    expect(calls).toHaveLength(0);
    expect(state.downloads).toBe(0);
  });
  it("deduplicates mixed message staging and rejects a reset during download", async () => {
    const s = await setup();
    const f = fixture(png);
    const n = network("chat-completions", [f]);
    await runInDurableObject(s, (_, state) => {
      const q = new AttachmentQueue(state.storage.sql);
      const scope = { connectionId: "other", sessionId: "s", contextStart: 0, generation: "g" };
      q.add(scope, [f.item], "same");
      q.add(scope, [f.item], "same");
      expect(q.get(scope)?.items).toHaveLength(1);
      q.clear("other");
    });
    await send(s, [f.item]);
    const original = vi.mocked(fetch).getMockImplementation()!;
    await runInDurableObject(s, async (instance) => {
      const handler = instance as unknown as {
        processWechat(id: string, m: WxMessage, connectionId: string): Promise<string>;
      };
      // Interleave a reset at the download await boundary, in the same DO I/O context.
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (String(url) === f.url)
          await handler.processWechat(
            crypto.randomUUID(),
            {
              item_list: [{ type: 1, text_item: { text: "/reset" } }],
            },
            "default",
          );
        return original(url, init);
      });
      await expect(
        handler.processWechat(
          crypto.randomUUID(),
          {
            item_list: [{ type: 1, text_item: { text: "请分析" } }],
          },
          "default",
        ),
      ).rejects.toThrow("会话已变更");
    });
    expect(n.calls).toHaveLength(0);
  });
});
