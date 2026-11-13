import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import authMigration from "../migrations/0001_auth.sql?raw";
import billingMigration from "../migrations/0002_billing.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import adminMigration from "../migrations/0005_admin.sql?raw";
import adminExpiryMigration from "../migrations/0017_admin_expiry.sql?raw";
import { CLOUD_FILE_RETRY_MS, CloudAgentStore } from "../src/server/cloud-agent-store";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { AttachmentQueue, ATTACHMENT_TTL_MS } from "../src/server/attachments";
import { prepareCloudAgentRequest } from "../src/server/cloud-agent-request";
import { parseJob } from "../src/server/cloud-agent-client";
import { settleCloudAgentTask } from "../src/server/cloud-agent-settlement";
import { CloudAgentDelivery } from "../src/server/cloud-agent-delivery";
import type { WxItem, WxMessage } from "../src/server/wechat";
import type { CloudAgentPlugin } from "../src/shared/cloud-agent";
import type { Protocol } from "../src/shared/types";
import { wechatSetupIssue } from "../src/shared/wechat-readiness";
import { gif } from "./helpers/generated-gif";
import { pixelPng, pngWithoutPixels } from "./helpers/generated-png";
import { generatedPdf, pdfWithMissingPage } from "./helpers/generated-pdf";
import { countTextTokens } from "../src/server/tokenizer";
import { creditUnits } from "../src/server/wallet";
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
async function setup(
  plus = true,
  enabled: boolean | "admin" = true,
  ownerId?: string,
  protocol: Protocol = "responses",
) {
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
    protocol,
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
function send(
  stub: Account,
  items: string | WxItem[],
  id: string = crypto.randomUUID(),
  connectionId = "default",
) {
  return runInDurableObject(stub, (instance) => {
    const message: WxMessage = {
      item_list: typeof items === "string" ? [{ type: 1, text_item: { text: items } }] : items,
    };
    return (
      instance as unknown as {
        processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
      }
    ).processWechat(id, message, connectionId);
  });
}
const tasks = (stub: Account) =>
  runInDurableObject(stub, (_, state) => new CloudAgentStore(state.storage).page().tasks);
const pendingFiles = (stub: Account) =>
  runInDurableObject(stub, (_, state) =>
    state.storage.sql.exec("SELECT * FROM pending_attachments").toArray(),
  );
function fileFixture(name: string, content: string | Uint8Array) {
  const key = Buffer.alloc(16, 7);
  const cipher = createCipheriv("aes-128-ecb", key, Buffer.alloc(0));
  const encrypted = Buffer.concat([
    cipher.update(typeof content === "string" ? strToU8(content) : content),
    cipher.final(),
  ]);
  const url = `https://novac2c.cdn.weixin.qq.com/${encodeURIComponent(name)}`;
  const item: WxItem = {
    type: 4,
    file_item: { file_name: name, media: { full_url: url, aes_key: key.toString("base64") } },
  };
  return { item, url, encrypted };
}
function fileNetwork(files: ReturnType<typeof fileFixture>[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    const file = files.find((file) => file.url === url);
    if (file) return new Response(file.encrypted);
    if (url.includes("agt.example.com/api/workspaces/") && url.includes("/files/"))
      return Response.json({ size: 1 }, { status: 201 });
    throw new Error(`Unexpected endpoint ${url}`);
  });
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=",
  "base64",
);
function imageFixture(name = "image", data: Uint8Array = png) {
  const file = fileFixture(name, data);
  return {
    ...file,
    item: { type: 2, image_item: { media: file.item.file_item!.media } } as WxItem,
  };
}
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
async function completedFile(
  data = generatedPdf(),
  name = "结果.pdf",
  contentType = "application/pdf",
  cap: number | null = null,
) {
  const stub = await setup();
  await plugin(stub);
  await send(stub, "/use 云");
  await send(stub, "生成文件给我");
  const task = await fullTask(stub);
  const path = `/outbound/results/${createHash("sha256").update(data).digest("hex")}`;
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
    store.patch(task, {
      state: "accepted",
      jobId: "job-one",
      submittedAt: Date.now(),
      invocation: { ...task.invocation!, limits: { ...task.invocation!.limits, creditUnits: cap } },
      outcome: parseJob({
        id: "job-one",
        workspaceId: "workspace-one",
        status: "completed",
        result: {
          text: "文件已生成。",
          attachments: [{ path, name, contentType, size: data.length }],
        },
      }),
    });
  });
  return { stub, task, path, data };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await abortAllDurableObjects();
});

describe("cloud Agent user entry", () => {
  it("discards all partially copied files when cancellation arrives during a download", async () => {
    const { stub, task, path, data } = await completedFile();
    const second = generatedPdf("Second file");
    const secondPath = `/outbound/results/${createHash("sha256").update(second).digest("hex")}`;
    await runInDurableObject(stub, (_, state) => {
      const store = new CloudAgentStore(state.storage);
      const current = store.get(task.id)!;
      store.patch(current, {
        outcome: {
          ...current.outcome!,
          attachments: [
            ...current.outcome!.attachments!,
            {
              path: secondPath,
              name: "第二份.pdf",
              contentType: "application/pdf",
              size: second.length,
            },
          ],
        },
      });
    });
    let cancelDuringDownload!: () => void;
    const sentFiles: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith(path)) return new Response(data);
      if (request.url.endsWith(secondPath)) {
        cancelDuringDownload();
        return new Response(second);
      }
      if (request.url.endsWith("sendmessage")) {
        const body = await request.json<{ msg: { item_list: WxItem[] } }>();
        sentFiles.push(...body.msg.item_list.filter((item) => item.type === 4));
      }
      return Response.json({ ret: 0, msgs: [] });
    });
    await runInDurableObject(stub, async (instance, state) => {
      const store = new CloudAgentStore(state.storage);
      cancelDuringDownload = () => {
        expect(store.requestStop(store.get(task.id)!)).toBe("files");
      };
      await instance.alarm();
    });
    expect(await tasks(stub)).toMatchObject([{ state: "cancelled", settled: 0, outputFiles: [] }]);
    expect(sentFiles).toEqual([]);
    expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
    await runInDurableObject(stub, (_, state) => {
      expect(new CloudAgentStore(state.storage).active()).toHaveLength(0);
      expect(
        state.storage.sql.exec("SELECT id FROM output_assets WHERE committed>=0").toArray(),
      ).toEqual([]);
    });
  });

  it.each([
    {
      name: "report.pdf",
      type: "application/pdf",
      data: generatedPdf(),
      mime: "application/pdf",
      images: 0,
    },
    {
      name: "report.bin",
      type: "application/octet-stream",
      data: generatedPdf(),
      mime: "application/pdf",
      images: 0,
    },
    { name: "chart.png", type: "image/png", data: png, mime: "image/png", images: 1 },
    {
      name: "chart.bin",
      type: "application/octet-stream",
      data: png,
      mime: "image/png",
      images: 1,
    },
    { name: "animation.gif", type: "image/gif", data: gif, mime: "image/gif", images: 1 },
    {
      name: "animation.bin",
      type: "application/octet-stream",
      data: gif,
      mime: "image/gif",
      images: 1,
    },
    {
      name: "chart.txt",
      type: "text/plain",
      data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10"/></svg>'),
      mime: "image/svg+xml",
      images: 1,
    },
    {
      name: "report.html",
      type: "text/html",
      mime: "text/html",
      images: 0,
      data: Buffer.from(
        '<!doctype html><html><body><h1>Report</h1><svg width="100" height="100"><circle cx="10" cy="10" r="5"/></svg></body></html>',
      ),
    },
    {
      name: "example.txt",
      type: "text/plain",
      mime: "text/plain",
      images: 0,
      data: Buffer.from(
        'Example SVG code follows:\n<svg width="100" height="100"><path d="M0 0h10"/></svg>',
      ),
    },
  ])(
    "meters $name using its actual file contents while preserving download and delivery",
    async ({ name, type, data, mime, images }) => {
      const { stub, task } = await completedFile(data, name, type, images ? null : 1000);
      const sent: WxItem[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        const endpoint = new URL(request.url).pathname;
        if (endpoint.includes("/files/")) return new Response(data);
        if (endpoint.endsWith("getuploadurl")) {
          expect(await request.json()).toMatchObject({ media_type: 3, rawsize: data.length });
          return Response.json({
            ret: 0,
            upload_full_url: "https://novac2c.cdn.weixin.qq.com/result",
          });
        }
        if (endpoint === "/result")
          return new Response(null, { headers: { "x-encrypted-param": "download" } });
        if (endpoint.endsWith("sendmessage")) {
          const body = await request.json<{ msg: { item_list: WxItem[] } }>();
          sent.push(...body.msg.item_list);
        }
        return Response.json({ ret: 0, msgs: [] });
      });
      await wake(stub);
      for (let n = 0; n < 3 && !sent.some((item) => item.type === 4); n++) await wake(stub);
      const result = (await tasks(stub))[0];
      expect(result).toMatchObject({
        state: "completed",
        settled: 1,
        delivered: 1,
        outputFiles: [{ name, mime }],
      });
      expect(sent).toContainEqual(
        expect.objectContaining({
          type: 4,
          file_item: expect.objectContaining({ file_name: name }),
        }),
      );
      const asset = await stub.imageAsset(result.outputFiles![0].id);
      expect(asset.headers.get("content-type")).toBe(mime);
      expect(Buffer.from(await asset.arrayBuffer())).toEqual(data);
      await wake(stub);
      await runInDurableObject(stub, (_, state) => {
        const meters = state.storage.sql
          .exec<{ data: string }>("SELECT data FROM platform_metering WHERE id=?", task.id)
          .toArray();
        expect(meters).toHaveLength(1);
        expect(JSON.parse(meters[0].data)).toMatchObject({ outputImages: images });
      });
      if (images) expect(result.units).toBeGreaterThanOrEqual(5000);
      else expect(result.units).toBeLessThan(1000);
      expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(1);
    },
  );

  it.each([
    {
      name: "broken.pdf",
      type: "application/pdf",
      data: Buffer.from("%PDF-1.4\nfixture\n%%EOF\n"),
    },
    {
      name: "broken.bin",
      type: "application/octet-stream",
      data: Buffer.from("%PDF-1.4\nfixture\n%%EOF\n"),
    },
    {
      name: "broken-page.pdf",
      type: "application/pdf",
      data: pdfWithMissingPage,
    },
    { name: "no-pixels.png", type: "image/png", data: pngWithoutPixels },
    { name: "no-pixels.bin", type: "application/octet-stream", data: pngWithoutPixels },
    { name: "incomplete-pixels.png", type: "image/png", data: pixelPng([0, 1]) },
    { name: "invalid-filter.png", type: "image/png", data: pixelPng([5, 1, 2, 3]) },
    {
      name: "broken.svg",
      type: "image/svg+xml",
      data: Buffer.from('<svg width="100" height="100"><path'),
    },
    {
      name: "broken.txt",
      type: "text/plain",
      data: Buffer.from('<svg width="100" height="100"><path'),
    },
    { name: "broken.gif", type: "image/gif", data: gif.subarray(0, 10) },
    { name: "broken.bin", type: "application/octet-stream", data: gif.subarray(0, 10) },
    {
      name: "bad-pixels.gif",
      type: "image/gif",
      data: Buffer.from(gif.map((value, index) => (index === 31 ? 0x7c : value))),
    },
  ])(
    "rejects $name without billing, retrying or leaving files available",
    async ({ name, type, data }) => {
      const { stub } = await completedFile(data, name, type);
      const sent: WxItem[] = [];
      const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        if (request.url.includes("/files/")) return new Response(data);
        if (request.url.endsWith("sendmessage")) {
          const body = await request.json<{ msg: { item_list: WxItem[] } }>();
          sent.push(...body.msg.item_list);
        }
        return Response.json({ ret: 0, msgs: [] });
      });
      await wake(stub);
      await wake(stub);
      expect(await tasks(stub)).toMatchObject([
        {
          state: "failed",
          settled: 0,
          outputFiles: [],
          error: expect.stringContaining("未扣 credits"),
        },
      ]);
      expect(fetch.mock.calls.filter(([input]) => String(input).includes("/files/"))).toHaveLength(
        1,
      );
      expect(sent.some((item) => item.type === 4)).toBe(false);
      expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
      await runInDurableObject(stub, (_, state) => {
        expect(new CloudAgentStore(state.storage).active()).toHaveLength(0);
        expect(
          state.storage.sql.exec("SELECT id FROM output_assets WHERE committed>=0").toArray(),
        ).toEqual([]);
      });
      expect(await send(stub, "下一个任务")).toContain("已接收");
    },
  );

  it("discards previously received files when a later PDF cannot be parsed", async () => {
    const { stub, task, path, data } = await completedFile();
    const broken = pdfWithMissingPage;
    const brokenPath = `/outbound/results/${createHash("sha256").update(broken).digest("hex")}`;
    await runInDurableObject(stub, (_, state) => {
      const store = new CloudAgentStore(state.storage);
      const current = store.get(task.id)!;
      store.patch(current, {
        outcome: {
          ...current.outcome!,
          attachments: [
            ...current.outcome!.attachments!,
            {
              path: brokenPath,
              name: "broken.pdf",
              contentType: "application/pdf",
              size: broken.length,
            },
          ],
        },
      });
    });
    const sentFiles: WxItem[] = [];
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith(path)) return new Response(data);
      if (request.url.endsWith(brokenPath)) return new Response(broken);
      if (request.url.endsWith("sendmessage")) {
        const body = await request.json<{ msg: { item_list: WxItem[] } }>();
        sentFiles.push(...body.msg.item_list.filter((item) => item.type === 4));
      }
      return Response.json({ ret: 0, msgs: [] });
    });
    await wake(stub);
    const id = await runInDurableObject(stub, (_, state) => {
      const assets = state.storage.sql
        .exec<{ id: string; committed: number }>("SELECT id,committed FROM output_assets")
        .toArray();
      expect(assets).toHaveLength(1);
      expect(assets[0].committed).toBe(-1);
      expect(new CloudAgentStore(state.storage).active()).toHaveLength(0);
      return assets[0].id;
    });
    await wake(stub);
    expect(await tasks(stub)).toMatchObject([{ state: "failed", settled: 0, outputFiles: [] }]);
    expect(fetch.mock.calls.filter(([input]) => String(input).includes("/files/"))).toHaveLength(2);
    expect(sentFiles).toEqual([]);
    expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
    await runInDurableObject(stub, (_, state) => {
      expect(state.storage.sql.exec("SELECT id FROM output_assets").toArray()).toEqual([]);
    });
    expect((await stub.imageAsset(id)).status).toBe(404);
    expect(await send(stub, "下一个任务")).toContain("已接收");
  });

  it.each(["credits", "images"])(
    "rejects image output above the frozen %s cap without billing or retaining downloadable assets",
    async (limit) => {
      const { stub, task } = await completedFile(
        png,
        "chart.bin",
        "application/octet-stream",
        limit === "credits" ? 1000 : null,
      );
      if (limit === "images")
        await runInDurableObject(stub, (_, state) => {
          const store = new CloudAgentStore(state.storage);
          const current = store.get(task.id)!;
          store.patch(current, {
            invocation: {
              ...current.invocation!,
              limits: { ...current.invocation!.limits, outputImages: 0 },
            },
          });
        });
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
        String(input).includes("/files/") ? new Response(png) : Response.json({ ret: 0, msgs: [] }),
      );
      await wake(stub);
      expect(await tasks(stub)).toMatchObject([
        {
          state: "failed",
          settled: 0,
          outputFiles: [],
          error: expect.stringContaining(
            limit === "credits" ? "结果图片超过单次 credits 上限" : "返回图片数量超过本次上限",
          ),
        },
      ]);
      await runInDurableObject(stub, (_, state) => {
        expect(new CloudAgentStore(state.storage).active()).toHaveLength(0);
        expect(
          state.storage.sql.exec("SELECT id FROM output_assets WHERE committed>=0").toArray(),
        ).toEqual([]);
      });
      expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
      expect(await send(stub, "下一个任务")).toContain("已接收");
    },
  );

  it.each([404, 403, 413])(
    "ends a permanent file download failure (%s) and admits another task without a charge",
    async (status) => {
      const { stub } = await completedFile();
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
        String(input).includes("/files/")
          ? new Response("private upstream error", { status })
          : Response.json({ ret: 0, msgs: [] }),
      );
      await wake(stub);
      const result = (await tasks(stub))[0];
      expect(result).toMatchObject({ state: "failed", settled: 0 });
      expect(result.error).toContain("未扣 credits");
      expect(result.error).not.toContain("private upstream");
      expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
      expect(await send(stub, "下一个任务")).toContain("已接收");
    },
  );

  it("bounds transient file recovery across restarts and frees the active slot when the transfer window expires", async () => {
    let { stub } = await completedFile();
    let downloads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/files/")) {
        downloads++;
        return new Response(null, { status: 503 });
      }
      return Response.json({ ret: 0, msgs: [] });
    });
    await wake(stub);
    const task = (await tasks(stub))[0];
    expect(task).toMatchObject({
      state: "accepted",
      settled: 0,
      fileStartedAt: expect.any(Number),
    });
    expect(task.nextAt).toBeLessThanOrEqual(task.fileStartedAt! + CLOUD_FILE_RETRY_MS);
    await runInDurableObject(stub, (_, state) =>
      new CloudAgentStore(state.storage).patch(task, {
        fileStartedAt: Date.now() - CLOUD_FILE_RETRY_MS,
      }),
    );
    await abortAllDurableObjects();
    stub = env.ACCOUNTS.get(stub.id);
    await runInDurableObject(stub, async (instance, state) => {
      await useManualAlarms(state);
      Object.assign(Reflect.get(instance, "env"), settings);
    });
    await wake(stub);
    expect(downloads).toBe(1);
    expect(await tasks(stub)).toMatchObject([
      { state: "failed", settled: 0, error: expect.stringContaining("重试已超过 10 分钟") },
    ]);
    expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
    expect(await send(stub, "下一个任务")).toContain("已接收");
  });

  it.each(["web", "wechat"])(
    "cancels file transfer through %s without cancelling or rerunning the completed AGT job",
    async (source) => {
      const { stub, task } = await completedFile();
      const requests: string[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        requests.push(url);
        return url.includes("/files/")
          ? new Response(null, { status: 503 })
          : Response.json({ ret: 0, msgs: [] });
      });
      await wake(stub);
      expect(await api(stub, "cloud.task", { id: task.id })).toMatchObject({
        ok: true,
        data: { status: "finalizing", canCancelFiles: true },
      });
      if (source === "web") {
        expect(await api(stub, "cloud.cancel", { id: task.id })).toMatchObject({
          ok: true,
          data: { stopping: true },
        });
      } else {
        expect(await send(stub, "/wx stop")).toContain("取消生成文件的接收");
      }
      await wake(stub);
      expect(await tasks(stub)).toMatchObject([
        {
          state: "cancelled",
          settled: 0,
          outputFiles: [],
          error: expect.stringContaining("本次未扣 credits"),
        },
      ]);
      expect(requests.filter((url) => url.includes("/files/"))).toHaveLength(1);
      expect(requests.some((url) => url.includes("/jobs"))).toBe(false);
      expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
      expect(await send(stub, "下一个任务")).toContain("已接收");
    },
  );

  it.each([false, true])(
    "returns a PDF through download and WeChat, reusing the file and bill after restart (file-only=%s)",
    async (fileOnly) => {
      let stub = await setup();
      await plugin(stub);
      await send(stub, "/use 云");
      const input = fileFixture("中文原文.txt", "这是需要转成 PDF 的完整中文正文。");
      const staged = fileNetwork([input]);
      await send(stub, [input.item]);
      await send(stub, "能不能转成 pdf 格式给我");
      staged.mockRestore();
      const task = await fullTask(stub);
      const pdf = generatedPdf("Converted file");
      const path = `/outbound/results/${createHash("sha256").update(pdf).digest("hex")}`;
      let downloadFails = true,
        sendFails = true,
        downloads = 0,
        uploads = 0;
      let uploadKey = "",
        encrypted: Uint8Array | undefined;
      const sentFiles: { id: string; item: WxItem }[] = [];
      const assertions: unknown[] = [];
      const network = () =>
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
          try {
            const request = new Request(url, init);
            const endpoint = new URL(request.url).pathname;
            if (endpoint.includes("/files/") && request.method === "PUT") {
              expect(await request.text()).toBe("这是需要转成 PDF 的完整中文正文。");
              return Response.json({ size: 1 }, { status: 201 });
            }
            if (endpoint.endsWith(path)) {
              downloads++;
              expect(request.headers.get("x-app-user")).toBe(`wechatai:${stub.id}`);
              return downloadFails ? new Response(null, { status: 503 }) : new Response(pdf);
            }
            if (endpoint.endsWith("getupdates")) return Response.json({ ret: 0, msgs: [] });
            if (endpoint.endsWith("getuploadurl")) {
              uploads++;
              const body = await request.json<{
                media_type: number;
                aeskey: string;
                rawsize: number;
              }>();
              expect(body).toMatchObject({ media_type: 3, rawsize: pdf.length });
              uploadKey = body.aeskey;
              return Response.json({
                ret: 0,
                upload_full_url: "https://novac2c.cdn.weixin.qq.com/test-output",
              });
            }
            if (endpoint === "/test-output") {
              encrypted = new Uint8Array(await request.arrayBuffer());
              return new Response(null, { headers: { "x-encrypted-param": "private-download" } });
            }
            if (endpoint.endsWith("sendmessage")) {
              const body = await request.json<{
                msg: { client_id: string; item_list: WxItem[] };
              }>();
              if (body.msg.item_list[0].type === 4) {
                sentFiles.push({ id: body.msg.client_id, item: body.msg.item_list[0] });
                if (sendFails) return Response.json({ ret: 1 }, { status: 503 });
              }
              return Response.json({ ret: 0 });
            }
            throw new Error(`Unexpected endpoint ${endpoint}`);
          } catch (error) {
            assertions.push(error);
            throw error;
          }
        });
      network();
      await runInDurableObject(stub, async (instance, state) => {
        const store = new CloudAgentStore(state.storage);
        store.saveProvision({
          scope: cloudAgentScope(task),
          profiles: [task.profileId],
          externalId: `wechatai:${state.id}`,
          appUserId: "user-one",
          workspaceId: "workspace-one",
          configured: 1,
          updatedAt: Date.now(),
          modelChannel: {
            id: "file-channel",
            fingerprint: createHash("sha256")
              .update(JSON.stringify(task.modelConnection))
              .digest("hex"),
          },
        });
        const configured = Reflect.get(instance, "env");
        const raw = await prepareCloudAgentRequest(
          configured,
          store,
          state.id.toString(),
          task.id,
          () => undefined,
        );
        expect(JSON.parse(raw!).message).toContain("这是需要转成 PDF 的完整中文正文。");
        store.patch(task, {
          state: "accepted",
          jobId: "job-one",
          submittedAt: Date.now(),
          outcome: parseJob({
            id: "job-one",
            workspaceId: "workspace-one",
            status: "completed",
            result: {
              ...(fileOnly ? {} : { text: "PDF 已生成。" }),
              attachments: [
                { path, name: "中文原文.pdf", contentType: "application/pdf", size: pdf.length },
              ],
            },
          }),
        });
      });
      await wake(stub);
      expect(await tasks(stub)).toMatchObject([{ state: "accepted", settled: 0 }]);
      expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
      downloadFails = false;
      await wake(stub);
      for (let i = 0; i < 3 && !sentFiles.length; i++) await wake(stub);
      expect(await tasks(stub)).toMatchObject([{ state: "completed", settled: 1, delivered: 0 }]);
      expect(sentFiles.length).toBeGreaterThan(0);
      const downloadCount = downloads;
      const files = (await tasks(stub))[0].outputFiles!;
      expect(files).toHaveLength(1);
      expect(await api(stub, "cloud.task", { id: task.id })).toMatchObject({
        ok: true,
        data: { files: [{ id: files[0].id, name: "中文原文.pdf", bytes: pdf.length }] },
      });
      const asset = await stub.imageAsset(files[0].id);
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-disposition")).toContain(
        encodeURIComponent("中文原文.pdf"),
      );
      expect(Buffer.from(await asset.arrayBuffer())).toEqual(pdf);
      const other = env.ACCOUNTS.getByName(crypto.randomUUID());
      expect((await other.imageAsset(files[0].id)).status).toBe(404);
      await abortAllDurableObjects();
      stub = env.ACCOUNTS.get(stub.id);
      // Keep the same upstream responses but reconstruct all account objects.
      vi.restoreAllMocks();
      network();
      sendFails = false;
      await runInDurableObject(stub, async (instance, state) => {
        await useManualAlarms(state);
        Object.assign(Reflect.get(instance, "env"), settings);
        await Reflect.get(instance, "pollWechat").call(instance, "default", Date.now() + 5000, 0);
      });
      expect(await tasks(stub)).toMatchObject([{ state: "completed", delivered: 1 }]);
      expect(downloads).toBe(downloadCount);
      expect(uploads).toBe(1);
      expect(new Set(sentFiles.map((file) => file.id)).size).toBe(1);
      expect(sentFiles.at(-1)!.item.file_item).toMatchObject({
        file_name: "中文原文.pdf",
        len: String(pdf.length),
      });
      expect(
        Buffer.from(sentFiles.at(-1)!.item.file_item!.media!.aes_key!, "base64").toString(),
      ).toBe(uploadKey);
      const decipher = createDecipheriv(
        "aes-128-ecb",
        Buffer.from(uploadKey, "hex"),
        Buffer.alloc(0),
      );
      expect(Buffer.concat([decipher.update(encrypted!), decipher.final()])).toEqual(pdf);
      expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(1);
      expect(assertions).toEqual([]);
      expect((await api(stub, "session.action", { id: task.sessionId, action: "clear" })).ok).toBe(
        true,
      );
      expect((await stub.imageAsset(files[0].id)).status).toBe(404);
    },
  );

  it.each([2048, 8192])(
    "uses the original %i output limit when a Word task is truncated",
    async (maxOutputTokens) => {
      let stub = await setup();
      const model = (await stub.snapshot()).assistants[0];
      expect((await api(stub, "model.save", { ...model, maxOutputTokens })).ok).toBe(true);
      await plugin(stub);
      await send(stub, "/use 云");
      const file = fileFixture("方案.md", "# 转换验证\n\n请保留这份完整正文。");
      fileNetwork([file]);
      await send(stub, [file.item]);
      await send(stub, "请转为 Word 给我");
      const task = await fullTask(stub);
      expect(task.modelConnection?.maxOutputTokens).toBe(maxOutputTokens);
      // Later edits must not change guidance for the already accepted task.
      expect(
        (
          await api(stub, "model.save", {
            ...model,
            maxOutputTokens: maxOutputTokens === 2048 ? 8192 : 2048,
          })
        ).ok,
      ).toBe(true);
      expect(await pendingFiles(stub)).toEqual([]);
      await runInDurableObject(stub, (_, state) => {
        const store = new CloudAgentStore(state.storage);
        store.patch(task, {
          state: "accepted",
          jobId: "word-job",
          outcome: parseJob({
            id: "word-job",
            workspaceId: "workspace-one",
            status: "completed",
            result: { text: "现在开始解析 Markdown 格式并制作文件：", finishReason: "length" },
          }),
        });
      });
      await abortAllDurableObjects();
      stub = env.ACCOUNTS.get(stub.id);
      vi.restoreAllMocks();
      vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ret: 0, msgs: [] }));
      await wake(stub);
      expect(await tasks(stub)).toMatchObject([
        {
          state: "failed",
          settled: 0,
          result: "",
          error: expect.stringContaining("输出达到长度上限"),
        },
      ]);
      await runInDurableObject(stub, (_, state) => {
        const reply = state.storage.sql
          .exec<{ reply: string }>("SELECT reply FROM inbox WHERE id=?", `cloud:${task.id}`)
          .one().reply;
        if (maxOutputTokens < 8192) expect(reply).toContain("提高该模型的「输出 Token 上限」");
        else {
          expect(reply).toContain("将任务拆分为多次处理后重试");
          expect(reply).not.toContain("提高");
        }
        expect(reply).toContain("重新发送附件");
        expect(reply).not.toContain("现在开始");
      });
      const result = await stub.snapshot();
      expect(result.ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
    },
  );

  it.each(["invalid PDF", "digest mismatch", "invalid metadata", "partial"])(
    "rejects %s without charging or retrying forever",
    async (mode) => {
      const stub = await setup();
      await plugin(stub);
      await send(stub, "/use 云");
      await send(stub, "生成 PDF");
      const task = await fullTask(stub);
      const invalid = Buffer.from("not a PDF");
      const path = `/outbound/results/${mode === "digest mismatch" ? "b".repeat(64) : createHash("sha256").update(invalid).digest("hex")}`;
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
        store.patch(task, {
          state: "accepted",
          jobId: "job-one",
          outcome: parseJob({
            id: "job-one",
            workspaceId: "workspace-one",
            status: "completed",
            result: {
              text: "已生成 PDF",
              ...(mode === "partial" ? { task: { outcome: "partial" } } : {}),
              attachments: [
                {
                  path,
                  name: mode === "invalid metadata" ? "../结果.pdf" : "结果.pdf",
                  contentType: "application/pdf",
                  size: invalid.length,
                },
              ],
            },
          }),
        });
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
        String(input).includes("/files/")
          ? new Response(invalid)
          : Response.json({ ret: 0, msgs: [] }),
      );
      await wake(stub);
      expect(await tasks(stub)).toMatchObject([
        {
          state: "failed",
          settled: 0,
          error: expect.stringContaining(
            mode === "partial"
              ? "部分"
              : mode === "invalid metadata"
                ? "文件信息无效"
                : "文件不完整或校验失败",
          ),
        },
      ]);
      expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toHaveLength(0);
    },
  );

  it("processes a file before its later instruction when a received batch is reversed", async () => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    const file = fileFixture("source.txt", "需要转换的完整正文");
    fileNetwork([file]);
    const now = Date.now();
    const messages: WxMessage[] = [
      {
        message_id: 102,
        create_time_ms: now + 1,
        message_type: 1,
        from_user_id: "owner",
        item_list: [{ type: 1, text_item: { text: "能不能转成 pdf 格式给我" } }],
      },
      { message_id: 200, message_type: 2, from_user_id: "bot" },
      {
        message_id: 101,
        create_time_ms: now,
        message_type: 1,
        from_user_id: "owner",
        item_list: [file.item],
      },
    ];
    const received = await runInDurableObject(stub, (instance, state) => {
      Reflect.get(instance, "ingestWechat").call(
        instance,
        "default",
        "g1",
        "",
        { msgs: messages },
        { userId: "owner", botId: "bot" },
      );
      return state.storage.sql
        .exec<{ id: string; payload: string }>(
          "SELECT id,payload FROM inbox WHERE state='pending' ORDER BY createdAt,rowid",
        )
        .toArray();
    });
    for (const row of received) await send(stub, JSON.parse(row.payload).item_list, row.id);
    expect((await fullTask(stub)).prompt).toContain("需要转换的完整正文");
    expect(await pendingFiles(stub)).toEqual([]);
  });
  it("defaults to the account text model and rejects explicit models outside the account", async () => {
    const stub = await setup();
    const saved = await save(stub, { modelId: "" });
    expect(saved).toMatchObject({
      ok: true,
      data: { modelId: "", hasKey: true, access: null },
    });
    expect(await api(stub, "session.create", { pluginInstanceId: saved.data.id })).toMatchObject({
      ok: true,
      data: { assistantId: null, pluginInstanceId: saved.data.id },
    });
    const other = await setup();
    expect(await save(stub, { modelId: (await other.snapshot()).assistants[0].id })).toMatchObject({
      ok: false,
      error: "assistant_missing",
    });
    expect(await tasks(stub)).toEqual([]);
  });

  it("uses the default model for legacy cloud configurations without editing them", async () => {
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
    expect(legacy).toMatchObject({ modelId: "", hasKey: true, access: null });
    expect(await tasks(stub)).toEqual([]);
    expect(await send(stub, "/use 云")).toContain("已进入");
    expect((await stub.snapshot()).currentSession).toMatchObject({
      assistantId: null,
      assistantName: "用户文本模型",
      model: "user-model",
    });
    expect(await send(stub, "整理计划")).toContain("任务已接收");
    expect((await fullTask(stub)).modelConnection).toMatchObject({
      id: snapshot.assistants[0].id,
      model: "user-model",
      systemPrompt: "使用用户配置的系统提示词。",
    });
  });

  it.each(["mention", "enter", "web-session"] as const)(
    "uses the selected ordinary model and its budgets through the %s entry",
    async (entry) => {
      const stub = await setup();
      const selected = await api(stub, "assistant.save", {
        name: "默认模型 B",
        model: "selected-model-b",
        protocol: "responses",
        baseUrl: "https://selected.example.com/v1",
        apiKey: "test-selected-key",
        systemPrompt: "使用 B 的提示词。",
        maxInputTokens: 12000,
        maxOutputTokens: 2048,
        contextTokens: 32000,
        maxCredits: 1,
      });
      expect(selected.ok).toBe(true);
      expect((await api(stub, "assistant.activate", { id: selected.data.id })).ok).toBe(true);
      const saved = await save(stub, { modelId: "" });
      expect(saved.ok).toBe(true);
      expect((await stub.snapshot()).defaultModelId).toBe(selected.data.id);
      if (entry === "enter") expect(await send(stub, "/use 云")).toContain("已进入");
      if (entry === "web-session")
        expect((await api(stub, "session.create", { pluginInstanceId: saved.data.id })).ok).toBe(
          true,
        );
      expect((await stub.snapshot()).defaultModelId).toBe(selected.data.id);
      expect(await send(stub, entry === "mention" ? "@云 整理计划" : "整理计划")).toContain(
        "任务已接收",
      );
      expect(await fullTask(stub)).toMatchObject({
        modelConnection: {
          id: selected.data.id,
          model: "selected-model-b",
          systemPrompt: "使用 B 的提示词。",
          maxInputTokens: 12000,
          maxOutputTokens: 2048,
        },
        invocation: { limits: { inputTokens: 12000, outputTokens: 2048, creditUnits: 1000 } },
      });
      const original = (await stub.snapshot()).assistants[0];
      expect((await api(stub, "assistant.activate", { id: original.id })).ok).toBe(true);
      expect(await send(stub, "/use 云")).toContain("已进入");
      const after = await stub.snapshot();
      expect(after.defaultModelId).toBe(original.id);
      expect(after.currentSession?.model).toBe(original.model);
      expect(await fullTask(stub)).toMatchObject({
        modelConnection: { id: selected.data.id, model: "selected-model-b" },
        invocation: { limits: { creditUnits: 1000 } },
        stopRequested: 0,
      });
    },
  );

  it("keeps model selection and eligibility local to the receiving WeChat link", async () => {
    const stub = await setup();
    const selected = await api(stub, "assistant.save", {
      name: "工作模型 B",
      model: "work-model-b",
      protocol: "responses",
      baseUrl: "https://work.example.com/v1",
      apiKey: "test-work-key",
    });
    expect(selected.ok).toBe(true);
    expect((await api(stub, "assistant.activate", { id: selected.data.id })).ok).toBe(true);
    const saved = await save(stub, { modelId: "" });
    expect(saved.ok).toBe(true);
    const added = await api(stub, "wechat.create", { name: "另一个微信" });
    expect(added.ok).toBe(true);
    const otherLink = added.data.selectedConnectionId;
    const channel = await api(stub, "channel.save", {
      name: "尚未填写密钥的渠道",
      protocol: "responses",
      baseUrl: "https://incomplete.example.com/v1",
      apiKey: "temporary-test-key",
    });
    expect(channel.ok).toBe(true);
    const incomplete = await api(stub, "model.save", {
      channelId: channel.data.id,
      name: "另一个微信的默认模型",
      model: "incomplete-model",
    });
    expect(incomplete.ok).toBe(true);
    await runInDurableObject(stub, (_, state) => {
      const row = state.storage.sql
        .exec<{ data: string }>("SELECT data FROM channels WHERE id=?", channel.data.id)
        .one();
      const savedChannel = JSON.parse(row.data);
      state.storage.sql.exec(
        "UPDATE channels SET data=? WHERE id=?",
        JSON.stringify({ ...savedChannel, hasKey: false, encryptedKey: "" }),
        channel.data.id,
      );
    });
    expect(
      (await api(stub, "assistant.activate", { id: incomplete.data.id, connectionId: otherLink }))
        .ok,
    ).toBe(true);
    const before = await stub.snapshot();
    expect(before.defaultModelId).toBe(incomplete.data.id);
    expect(before.plugins?.find((plugin) => plugin.id === saved.data.id)).toMatchObject({
      hasKey: false,
      access: { code: "cloud_model_required" },
    });
    expect(
      (await api(stub, "plugin.activate", { id: saved.data.id, connectionId: "default" })).ok,
    ).toBe(true);
    expect(await send(stub, "整理工作计划")).toContain("任务已接收");
    expect((await fullTask(stub)).modelConnection?.id).toBe(selected.data.id);
    expect((await stub.snapshot()).defaultModelId).toBe(incomplete.data.id);
    expect((await api(stub, "wechat.select", { id: "default" })).ok).toBe(true);
    const after = await stub.snapshot();
    expect(after.defaultModelId).toBe(selected.data.id);
    expect(after.currentSession?.model).toBe("work-model-b");
    expect(after.plugins?.find((plugin) => plugin.id === saved.data.id)).toMatchObject({
      hasKey: true,
      access: null,
    });
    await expect(
      send(stub, "@云 另一个任务", crypto.randomUUID(), otherLink),
    ).rejects.toMatchObject({
      code: "cloud_model_required",
    });
    expect(
      await api(stub, "session.create", {
        pluginInstanceId: saved.data.id,
        connectionId: otherLink,
      }),
    ).toMatchObject({
      ok: false,
      error: "cloud_model_required",
    });
    expect(await tasks(stub)).toHaveLength(1);
  });

  it("follows a changed default without deleting the cloud session or changing an accepted task", async () => {
    const stub = await setup();
    const original = (await stub.snapshot()).assistants[0];
    const backup = await api(stub, "assistant.save", {
      name: "备用文本模型",
      baseUrl: "https://backup.example.com/v1",
      apiKey: "backup-test-key",
      protocol: "chat-completions",
      model: "backup-model",
    });
    expect(backup.ok).toBe(true);
    const saved = await save(stub, { modelId: "" });
    expect(saved.ok).toBe(true);
    await send(stub, "/use 云");
    const before = await stub.snapshot();
    await send(stub, "整理计划");
    const task = await fullTask(stub);
    expect(task.modelConnection?.id).toBe(original.id);
    expect((await api(stub, "assistant.delete", { id: original.id })).ok).toBe(true);
    const after = await stub.snapshot();
    expect(after.currentSession).toMatchObject({
      id: before.currentSession!.id,
      assistantId: null,
      assistantName: "备用文本模型",
      model: "backup-model",
    });
    expect(after.plugins?.find((plugin) => plugin.id === saved.data.id)).toMatchObject({
      modelId: "",
      hasKey: true,
      access: null,
    });
    expect(await fullTask(stub)).toMatchObject({
      id: task.id,
      stale: 0,
      stopRequested: 0,
      modelConnection: { id: original.id, model: "user-model" },
    });
  });

  it("uses an explicitly selected model instead of the default", async () => {
    const stub = await setup();
    const other = await api(stub, "assistant.save", {
      name: "单独指定的模型",
      baseUrl: "https://other.example.com/v1",
      apiKey: "other-test-key",
      protocol: "responses",
      model: "explicit-model",
    });
    expect(other.ok).toBe(true);
    expect((await save(stub, { modelId: other.data.id })).ok).toBe(true);
    expect(await send(stub, "@云 整理计划")).toContain("任务已接收");
    expect((await fullTask(stub)).modelConnection).toMatchObject({
      id: other.data.id,
      model: "explicit-model",
    });
  });

  it("explains missing default model setup without admitting or charging a task", async () => {
    const stub = await setup();
    expect((await save(stub, { modelId: "" })).ok).toBe(true);
    const model = (await stub.snapshot()).assistants[0];
    expect((await api(stub, "assistant.delete", { id: model.id })).ok).toBe(true);
    const before = await stub.snapshot();
    await expect(send(stub, "@云 整理计划")).rejects.toMatchObject({
      code: "cloud_model_required",
      message: expect.stringContaining("默认文本模型"),
    });
    expect(await tasks(stub)).toEqual([]);
    expect((await stub.snapshot()).wallet.balance).toBe(before.wallet.balance);
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
      displayPrompt: "帮我整理计划",
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

  it.each(["responses", "chat-completions", "anthropic"] as const)(
    "retains a one-off cloud document for ordinary follow-ups after restart without exposing execution text (%s)",
    async (protocol) => {
      let stub = await setup(true, true, undefined, protocol);
      await plugin(stub);
      await send(stub, "/wx new");
      const originalSession = (await stub.snapshot()).currentSession!.id;
      const body = "合同交付日是2031年4月17日，违约金为每日600元。";
      const document = fileFixture("contract.txt", body);
      const network = fileNetwork([document]);
      await send(stub, [document.item]);
      await send(stub, "@云 把这份合同整理成摘要", "contract-task");
      const task = await fullTask(stub);
      const displayPrompt = "把这份合同整理成摘要\n\n[文件：contract.txt]";
      const result = "这是一份包含交付期限与违约责任的合同。";
      expect(task.prompt).toContain(body);
      expect(task.displayPrompt).toBe(displayPrompt);
      expect(task.sessionId).toBe(originalSession);
      await runInDurableObject(stub, async (_, state) => {
        const store = new CloudAgentStore(state.storage);
        store.patch(task, {
          state: "accepted",
          jobId: "contract-job",
          submittedAt: Date.now(),
          outcome: parseJob({
            id: "contract-job",
            workspaceId: "workspace-one",
            status: "completed",
            result: { text: result },
          }),
        });
        const settled = await settleCloudAgentTask(state.storage, task.id, () => false);
        expect(settled?.state).toBe("completed");
        store.patch(settled!, { delivered: 1, deliveryStatus: "sent" });
      });
      network.mockRestore();
      await abortAllDurableObjects();
      stub = env.ACCOUNTS.get(stub.id);
      await runInDurableObject(stub, (_, state) => {
        expect(
          state.storage.sql
            .exec(
              "SELECT content,displayContent FROM messages WHERE sessionId=? AND role='user'",
              originalSession,
            )
            .toArray(),
        ).toEqual([{ content: task.prompt, displayContent: displayPrompt }]);
      });
      const visible = await api(stub, "session.messages", { id: originalSession });
      expect(visible.data[0].content).toBe(displayPrompt);
      expect(visible.data[0]).not.toHaveProperty("displayContent");
      expect(JSON.stringify(visible)).not.toContain(body);
      expect(JSON.stringify(visible)).not.toContain("attachments/");
      expect(await api(stub, "cloud.task", { id: task.id })).toMatchObject({
        ok: true,
        data: { prompt: displayPrompt },
      });
      const inputs: unknown[] = [];
      const followup = "刚才合同里交付日和违约金分别是多少？";
      const answer = "交付日是2031年4月17日，违约金为每日600元。";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const request = new Request(url, init);
        if (request.url.includes("cloudflare-dns.com"))
          return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
        if (!request.url.startsWith("https://llm.example.com/"))
          throw new Error(`Unexpected endpoint ${request.url}`);
        inputs.push(await request.json());
        return Response.json(
          protocol === "responses"
            ? {
                status: "completed",
                output: [{ type: "message", content: [{ type: "output_text", text: answer }] }],
              }
            : protocol === "anthropic"
              ? { stop_reason: "end_turn", content: [{ type: "text", text: answer }] }
              : { choices: [{ finish_reason: "stop", message: { content: answer } }] },
        );
      });
      const balance = (await stub.snapshot()).wallet.balance;
      expect(await send(stub, followup, "contract-followup")).toBe(answer);
      expect(await send(stub, followup, "contract-followup")).toBe(answer);
      expect(inputs).toHaveLength(1);
      expect(JSON.stringify(inputs[0])).toContain(body);
      expect(JSON.stringify(inputs[0])).toContain(result);
      const inputTokens = [
        task.modelConnection!.systemPrompt,
        task.prompt,
        result,
        followup,
      ].reduce((sum, text) => sum + countTextTokens(text), 0);
      await runInDurableObject(stub, (_, state) => {
        const row = state.storage.sql
          .exec<{ data: string }>("SELECT data FROM platform_metering WHERE id='contract-followup'")
          .one();
        expect(JSON.parse(row.data)).toMatchObject({
          inputTokens,
          units: creditUnits(inputTokens, countTextTokens(answer)),
        });
      });
      expect((await stub.snapshot()).wallet.balance).toBeCloseTo(
        balance - creditUnits(inputTokens, countTextTokens(answer)) / 1000,
      );
      expect((await stub.snapshot()).currentSession!.id).toBe(originalSession);
      expect(
        await api(stub, "session.action", { id: originalSession, action: "clear" }),
      ).toMatchObject({ ok: true });
      await runInDurableObject(stub, (_, state) => {
        expect(
          state.storage.sql
            .exec("SELECT * FROM messages WHERE sessionId=?", originalSession)
            .toArray(),
        ).toEqual([]);
        expect(new CloudAgentStore(state.storage).get(task.id)).toMatchObject({
          hidden: 1,
          prompt: "",
          displayPrompt: "",
        });
      });
    },
  );

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

  it("requires transcription for voice without accepting a task", async () => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    await expect(send(stub, [{ type: 3, voice_item: {} }])).rejects.toMatchObject({
      code: "cloud_input_unsupported",
    });
    expect(await tasks(stub)).toEqual([]);
  });

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

  it("preserves staged images after untranscribed voice and accepts text after /cancel", async () => {
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
    await expect(send(stub, [{ type: 3, voice_item: {} }])).rejects.toMatchObject({
      code: "cloud_input_unsupported",
    });
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

  it.each(["responses", "chat-completions", "anthropic"] as const)(
    "accepts mixed images and documents, restores private pixels and freezes references (%s)",
    async (protocol) => {
      const stub = await setup(true, true, undefined, protocol);
      await plugin(stub);
      const mention = protocol === "responses";
      await send(stub, mention ? "/wx new" : "/use 云");
      const before = await stub.snapshot();
      const first = imageFixture("first");
      const second = imageFixture("second", Buffer.concat([png, Buffer.from("second")]));
      const document = fileFixture("report.txt", "这是附带的说明文档");
      const network = fileNetwork([first, second, document]);
      expect(await send(stub, [first.item])).toContain("已暂存 1 个附件");
      expect(await send(stub, [second.item, document.item])).toContain("已暂存 3 个附件");
      expect(network).not.toHaveBeenCalled();
      expect(await tasks(stub)).toEqual([]);
      expect(
        await send(stub, mention ? "@云 结合说明比较两张图" : "结合说明比较两张图", "image-task"),
      ).toContain("任务已接收");
      const task = await fullTask(stub);
      expect(task.prompt).toContain("[图片 × 2]");
      expect(task.prompt).toContain("这是附带的说明文档");
      const displayPrompt = "结合说明比较两张图\n\n[文件：report.txt]\n\n[图片 × 2]";
      expect(task.displayPrompt).toBe(displayPrompt);
      expect(await api(stub, "cloud.task", { id: task.id })).toMatchObject({
        ok: true,
        data: { prompt: displayPrompt },
      });
      expect(await api(stub, "cloud.tasks")).toMatchObject({
        ok: true,
        data: { tasks: [{ id: task.id, prompt: displayPrompt }] },
      });
      expect(await api(stub, "session.messages", { id: task.sessionId })).toMatchObject({
        ok: true,
        data: [{ role: "user", content: displayPrompt }],
      });
      expect(task.imageIds).toHaveLength(2);
      for (const id of task.imageIds!) expect(task.prompt).toContain(`attachments/images/${id}`);
      expect(
        task.invocation?.messages[0].content.filter((part) => part.type === "image"),
      ).toHaveLength(2);
      expect(task.invocation?.messages[0].content.filter((part) => part.type === "text")).toEqual([
        { type: "text", text: task.prompt },
      ]);
      expect(await pendingFiles(stub)).toEqual([]);
      expect((await stub.snapshot()).wallet.balance).toBe(before.wallet.balance);
      expect((await stub.snapshot()).currentSession?.id).toBe(before.currentSession?.id);
      expect(await send(stub, "重复投递", "image-task")).toContain("任务已接收");
      expect((await fullTask(stub)).displayPrompt).toBe(displayPrompt);
      expect(network).toHaveBeenCalledTimes(3);
      await abortAllDurableObjects();

      const uploads: Request[] = [];
      const workspaceImages: { path: string; bytes: Buffer }[] = [];
      network.mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        if (request.method === "PUT" && request.url.includes("/files/")) {
          if (request.url.includes("/files/attachments/images/")) {
            const bytes = Buffer.from(await request.arrayBuffer());
            expect([png, Buffer.concat([png, Buffer.from("second")])]).toContainEqual(bytes);
            workspaceImages.push({
              path: new URL(request.url).pathname.split("/files/")[1],
              bytes,
            });
            expect(request.headers.get("x-app-user")).toBe(`wechatai:${stub.id}`);
            expect(request.headers.get("content-type")).toBe("application/octet-stream");
          } else expect(await request.text()).toBe("这是附带的说明文档");
          return Response.json({ size: 1 }, { status: 201 });
        }
        expect(request.url).toBe("https://agt.example.com/api/workspaces/workspace-one/images");
        expect(request.headers.get("x-app-user")).toBe(`wechatai:${stub.id}`);
        const bytes = Buffer.from(await request.clone().arrayBuffer());
        uploads.push(request);
        return Response.json(
          {
            id: `img_${createHash("sha256").update(bytes).digest("hex")}`,
            size: bytes.length,
            mediaType: "image/png",
          },
          { status: 201 },
        );
      });
      const restored = env.ACCOUNTS.get(stub.id);
      expect(await api(restored, "cloud.task", { id: task.id })).toMatchObject({
        ok: true,
        data: { prompt: displayPrompt },
      });
      const raw = await runInDurableObject(restored, async (instance, state) => {
        await useManualAlarms(state);
        const store = new CloudAgentStore(state.storage);
        expect(Buffer.from(store.image(task.id, task.imageIds![0])!)).toEqual(png);
        store.saveProvision({
          scope: cloudAgentScope(task),
          profiles: [task.profileId],
          externalId: `wechatai:${state.id}`,
          appUserId: "user-one",
          workspaceId: "workspace-one",
          configured: 1,
          updatedAt: Date.now(),
          modelChannel: {
            id: "image-channel",
            fingerprint: createHash("sha256")
              .update(JSON.stringify(task.modelConnection))
              .digest("hex"),
          },
        });
        const configured = Object.assign(Reflect.get(instance, "env"), settings);
        const firstRequest = await prepareCloudAgentRequest(
          configured,
          store,
          state.id.toString(),
          task.id,
          () => undefined,
        );
        expect(
          await prepareCloudAgentRequest(
            configured,
            store,
            state.id.toString(),
            task.id,
            () => undefined,
          ),
        ).toBe(firstRequest);
        return firstRequest;
      });
      expect(uploads).toHaveLength(2);
      expect(workspaceImages.map(({ path }) => path)).toEqual(
        task.imageIds!.map((id) => `attachments/images/${id}`),
      );
      expect(JSON.parse(raw!).images).toEqual(task.imageIds!.map((id) => ({ id })));
      expect(JSON.parse(raw!).message).toBe(task.prompt);
      expect(raw).not.toContain(png.toString("base64"));
      await runInDurableObject(restored, (_, state) => {
        const store = new CloudAgentStore(state.storage);
        store.patch(task, { state: "accepted", jobId: "image-job" });
        expect(store.image(task.id, task.imageIds![0])).toBeNull();
      });
    },
  );

  it("rejects oversized cloud images before creating a task and preserves the staged batch", async () => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    const image = imageFixture("large", Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]));
    fileNetwork([image]);
    await send(stub, [image.item]);
    const before = await stub.snapshot();
    await expect(send(stub, "说明图片")).rejects.toMatchObject({ code: "cloud_image_size" });
    expect(await tasks(stub)).toEqual([]);
    expect(await pendingFiles(stub)).toHaveLength(1);
    expect((await stub.snapshot()).wallet.balance).toBe(before.wallet.balance);
    expect((await stub.snapshot()).cloudAgent.usedToday).toBe(before.cloudAgent.usedToday);
  });

  it.each(["image", "document"] as const)(
    "recovers a failed %s task by following the delivered resend instructions",
    async (kind) => {
      let stub = await setup();
      await plugin(stub);
      await send(stub, "/use 云");
      const file =
        kind === "image" ? imageFixture("retry-image") : fileFixture("report.txt", "完整文件正文");
      fileNetwork([file]);
      const before = await stub.snapshot();
      await send(stub, [file.item]);
      await send(stub, "结合附件回答");
      const first = await fullTask(stub);
      expect(first.hasAttachments).toBe(true);
      expect(await pendingFiles(stub)).toEqual([]);
      await abortAllDurableObjects();
      stub = env.ACCOUNTS.get(stub.id);
      await runInDurableObject(stub, async (_, state) => {
        await useManualAlarms(state);
        const store = new CloudAgentStore(state.storage);
        store.patch(store.get(first.id)!, {
          state: "accepted",
          jobId: "failed-job",
          outcome: {
            id: "failed-job",
            workspaceId: "workspace-one",
            status: "failed",
            failureCode: "model_context_limit",
          },
        });
        const failed = await settleCloudAgentTask(state.storage, first.id, () => false);
        expect(failed).toMatchObject({ state: "failed", settled: 0, units: 0 });
        new CloudAgentDelivery(state.storage, () => false).sync(first.id);
      });
      const replies = await deliverQueuedReplies(stub, 2);
      expect(
        replies.some((reply) =>
          reply.text.includes("请重新发送附件，等暂存成功后再发送完整处理要求"),
        ),
      ).toBe(true);
      expect((await stub.snapshot()).wallet.balance).toBe(before.wallet.balance);
      expect((await stub.snapshot()).ledger.filter((row) => row.kind === "usage")).toEqual([]);

      fileNetwork([file]);
      await send(stub, [file.item]);
      expect(await send(stub, "结合附件重新回答")).toContain("任务已接收");
      const retried = await fullTask(stub);
      expect(retried.id).not.toBe(first.id);
      expect(retried.hasAttachments).toBe(true);
      expect(retried.prompt).toContain("结合附件重新回答");
      if (kind === "image") expect(retried.imageIds).toEqual(first.imageIds);
      else expect(retried.prompt).toContain("完整文件正文");
      expect(await pendingFiles(stub)).toEqual([]);
    },
  );

  it.each([
    { name: "large-image", code: "cloud_image_size" },
    { name: "long.txt", code: "cloud_input_too_long" },
    { name: "too-long.txt", code: "file_text_size" },
    { name: "bad.docx", code: "file_parse" },
  ])("recovers from $code by following the clear-and-replace guidance", async ({ name, code }) => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    const image = name === "large-image";
    const bad = image
      ? imageFixture(name, Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]))
      : fileFixture(
          name,
          name === "bad.docx"
            ? "不是 Word 文件"
            : "资料".repeat(name === "long.txt" ? 25_001 : 50_001),
        );
    const good = image ? imageFixture("compressed") : fileFixture("short.txt", "处理后的正文");
    fileNetwork([bad, good]);
    await send(stub, [bad.item]);
    const before = await stub.snapshot();
    await expect(send(stub, "总结附件")).rejects.toMatchObject({
      code,
      message: expect.stringContaining("先发送 /cancel 清空"),
    });
    expect(await tasks(stub)).toEqual([]);
    expect(await pendingFiles(stub)).toHaveLength(1);
    expect((await stub.snapshot()).wallet.balance).toBe(before.wallet.balance);
    expect((await stub.snapshot()).cloudAgent.usedToday).toBe(before.cloudAgent.usedToday);

    await send(stub, "/cancel");
    await send(stub, [good.item]);
    expect(await send(stub, "总结附件")).toContain("任务已接收");
    expect(await pendingFiles(stub)).toEqual([]);
    expect(await tasks(stub)).toHaveLength(1);
    const task = await fullTask(stub);
    if (image)
      expect(task.imageIds).toEqual([`img_${createHash("sha256").update(png).digest("hex")}`]);
    else {
      expect(task.prompt).toContain("处理后的正文");
      expect(task.prompt).not.toContain(name);
    }
  });

  it.each(["default", "mention"])(
    "submits staged file text once with its instructions and billing input (%s)",
    async (mode) => {
      const stub = await setup();
      await plugin(stub);
      await send(stub, mode === "default" ? "/use 云" : "/wx new");
      const before = await stub.snapshot();
      const report = fileFixture("report.md", "本季营收增长 20%");
      const notes = fileFixture(
        "notes.docx",
        zipSync({
          "word/document.xml": strToU8(
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>下季计划扩展业务</w:t></w:r></w:p></w:body></w:document>',
          ),
        }),
      );
      const network = fileNetwork([report, notes]);
      const ack = await send(stub, [report.item], "report-file");
      expect(ack).toContain("已暂存 1 个附件");
      expect(await send(stub, [report.item], "report-file")).toBe(ack);
      expect(await send(stub, [notes.item])).toContain("已暂存 2 个附件");
      expect(network).not.toHaveBeenCalled();
      expect(await tasks(stub)).toEqual([]);
      expect((await stub.snapshot()).cloudAgent.usedToday).toBe(before.cloudAgent.usedToday);

      const instruction =
        mode === "default"
          ? [{ type: 3, voice_item: { text: "总结这两份文件" } }]
          : "@云 总结这两份文件";
      const reply = await send(stub, instruction, "file-task");
      expect(reply).toContain("任务已接收");
      expect(network).toHaveBeenCalledTimes(2);
      const task = await fullTask(stub);
      expect(task.prompt).toContain("用户要求：总结这两份文件");
      expect(task.displayPrompt).toBe("总结这两份文件\n\n[文件：report.md、notes.docx]");
      expect(task.prompt).toContain('"name":"report.md","text":"本季营收增长 20%"');
      expect(task.prompt).toContain("下季计划扩展业务");
      expect(task.prompt).not.toContain("cdn.weixin.qq.com");
      expect(task.invocation?.messages[0].content).toEqual([{ type: "text", text: task.prompt }]);
      expect(await pendingFiles(stub)).toEqual([]);
      const after = await stub.snapshot();
      expect(after.wallet.balance).toBe(before.wallet.balance);
      expect(after.currentSession?.id).toBe(before.currentSession?.id);
      expect(after.cloudAgent.usedToday).toBe(before.cloudAgent.usedToday + 1);
      expect(await send(stub, "忽略重复投递的正文", "file-task")).toBe(reply);
      expect(network).toHaveBeenCalledTimes(2);
      expect(await tasks(stub)).toHaveLength(1);

      const raw = await runInDurableObject(stub, (instance, state) => {
        const store = new CloudAgentStore(state.storage);
        store.saveProvision({
          scope: cloudAgentScope(task),
          profiles: [task.profileId],
          externalId: `wechatai:${state.id}`,
          appUserId: "user-one",
          workspaceId: "workspace-one",
          configured: 1,
          updatedAt: Date.now(),
          modelChannel: {
            id: "file-model-channel",
            fingerprint: createHash("sha256")
              .update(JSON.stringify(task.modelConnection))
              .digest("hex"),
          },
        });
        return prepareCloudAgentRequest(
          Reflect.get(instance, "env"),
          store,
          state.id.toString(),
          task.id,
          () => undefined,
        );
      });
      expect(JSON.parse(raw!).message).toBe(task.prompt);
      expect(JSON.parse(raw!).model).toBe("channel:file-model-channel:user-model");
    },
  );

  it("preserves files after a download failure and allows retry without taking another slot", async () => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    const file = fileFixture("report.txt", "文件正文");
    const network = fileNetwork([file]);
    await send(stub, [file.item]);
    const before = await stub.snapshot();
    network.mockImplementationOnce(async () => new Response("Unavailable", { status: 503 }));
    await expect(send(stub, "总结文件")).rejects.toThrow("附件下载失败");
    expect(await pendingFiles(stub)).toHaveLength(1);
    expect(await tasks(stub)).toEqual([]);
    expect((await stub.snapshot()).wallet.balance).toBe(before.wallet.balance);
    expect((await stub.snapshot()).cloudAgent.usedToday).toBe(before.cloudAgent.usedToday);
    expect(await send(stub, "重试总结文件")).toContain("任务已接收");
    expect((await fullTask(stub)).prompt).toContain("文件正文");
    expect(await pendingFiles(stub)).toEqual([]);
  });

  it.each([
    { name: "bad.docx", content: "不是 Word 文件", code: "file_parse" },
    { name: "long.txt", content: "资料".repeat(25_001), code: "cloud_input_too_long" },
    {
      name: "quoted.csv",
      content: '"a"\n'.repeat(7_000) + "DOCUMENT_END",
      code: "cloud_input_too_long",
    },
  ])("rejects unusable files before admission ($code)", async ({ name, content, code }) => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    const file = fileFixture(name, content);
    fileNetwork([file]);
    await send(stub, [file.item]);
    const before = await stub.snapshot();
    await expect(send(stub, "总结文件")).rejects.toMatchObject({ code });
    expect(await tasks(stub)).toEqual([]);
    expect(await pendingFiles(stub)).toHaveLength(1);
    const after = await stub.snapshot();
    expect(after.wallet.balance).toBe(before.wallet.balance);
    expect(after.cloudAgent.usedToday).toBe(before.cloudAgent.usedToday);
  });

  it.each(["expired", "cancelled"])("does not submit a file after it is %s", async (mode) => {
    const stub = await setup();
    await plugin(stub);
    await send(stub, "/use 云");
    const file = fileFixture("report.txt", "不应读取的正文");
    const network = fileNetwork([file]);
    await send(stub, [file.item]);
    if (mode === "expired") {
      await runInDurableObject(stub, (_, state) => {
        state.storage.sql.exec(
          "UPDATE pending_attachments SET expiresAt = ?",
          Date.now() - ATTACHMENT_TTL_MS,
        );
      });
      expect(await send(stub, "总结文件")).toContain("附件已过期");
      expect(await tasks(stub)).toEqual([]);
    } else {
      await send(stub, "/cancel");
      expect(await send(stub, "只处理文字")).toContain("任务已接收");
      expect((await fullTask(stub)).prompt).toBe("只处理文字");
    }
    expect(await pendingFiles(stub)).toEqual([]);
    expect(network).not.toHaveBeenCalled();
  });
});
