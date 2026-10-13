import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initCallFailures, recordCallFailure } from "../src/server/call-failures";
import { AppError } from "../src/server/config";
import { upstreamPaymentError } from "../src/server/upstream-error";
import { readAdminAccountStats } from "../src/server/admin-account";
import { callFailureReason } from "../src/shared/call-failures";
import type { WxMessage } from "../src/server/wechat";

afterEach(() => vi.unstubAllGlobals());

describe("upstream payment guidance", () => {
  it("uses the configured public site and exact provider origin, never a display name or suffix match", () => {
    const config = { ...env, PUBLIC_SITE_URL: "https://wechatai.app" };
    for (const url of ["https://api.kimiseek.app/v1", env.KIMISEEK_API_URL]) {
      const error = upstreamPaymentError(config, url, 402)!;
      expect(error).toMatchObject({ code: "kimiseek_insufficient_balance", upstreamStatus: 402 });
      expect(error.message).toContain("https://wechatai.app/app/channels");
      expect(error.message).toContain("分开计算");
      expect(error.message).not.toContain("localhost");
    }
    for (const url of [
      "https://api.kimiseek.app.evil.test",
      "https://elsewhere.test",
      "http://api.kimiseek.app",
    ]) {
      const error = upstreamPaymentError(config, url, 402)!;
      expect(error.code).toBe("upstream_payment_required");
      expect(error.message).not.toContain("KimiSeek");
    }
    for (const status of [400, 401, 403, 429, 500, 502])
      expect(upstreamPaymentError(config, env.KIMISEEK_API_URL, status)).toBeNull();
  });

  it.each(["chat-completions", "responses", "anthropic"])(
    "%s: records a real failed WeChat call once, charges nothing, and preserves it after history deletion",
    async (protocol) => {
      const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
      const saved = JSON.parse(
        await stub.api("assistant.save", {
          name: "Not a provider name",
          protocol,
          baseUrl: env.KIMISEEK_API_URL,
          model: "test",
          apiKey: "never-persist-key",
          maxOutputTokens: 8192,
        }),
      );
      expect(saved.ok).toBe(true);
      await stub.api("wechat.create", { name: "Test" });
      let calls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) => {
          if (String(url).includes("cloudflare-dns.com"))
            return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
          calls++;
          return Response.json(
            { error: { message: "private upstream text never-persist-key" } },
            { status: 402 },
          );
        }),
      );
      await runInDurableObject(stub, async (instance, state) => {
        const before = instance.snapshot().wallet.balance;
        const processor = instance as unknown as {
          processWechat(id: string, message: WxMessage, connectionId: string): Promise<string>;
        };
        const message = { item_list: [{ type: 1, text_item: { text: "private user prompt" } }] };
        await expect(processor.processWechat("failure", message, "default")).rejects.toMatchObject({
          code: "kimiseek_insufficient_balance",
          message: expect.stringContaining("KimiSeek 余额不足"),
        });
        // A duplicate delivery does not contact the model or create a second failure.
        await expect(processor.processWechat("failure", message, "default")).rejects.toBeDefined();
        const stats = instance.adminStats();
        expect(stats).toMatchObject({
          requests: 0,
          credits: 0,
          failedRequests: 1,
          lastFailureCode: "kimiseek_insufficient_balance",
          lastFailureStatus: 402,
        });
        expect(stats.daily[0]).toMatchObject({ requests: 0, failedRequests: 1, credits: 0 });
        expect(instance.snapshot().wallet.balance).toBe(before);
        expect(instance.snapshot().ledger.filter((l) => l.kind === "usage")).toHaveLength(0);
        expect(JSON.stringify(stats)).not.toMatch(/private|never-persist-key/);
        state.storage.sql.exec("DELETE FROM runs");
        state.storage.sql.exec("DELETE FROM messages");
        expect(instance.adminStats().failedRequests).toBe(1);
        await state.storage.deleteAlarm();
      });
      expect(calls).toBe(1);
    },
  );
});

describe("durable failure statistics", () => {
  it("recovers old remote failures even when their reply-delivery run is complete", async () => {
    const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      sql.exec("DELETE FROM settings WHERE key='callFailuresMigrated'");
      sql.exec(
        "INSERT INTO claw_jobs(id,routeId,pluginId,text,state,createdAt,inputTokens,outputLimit) VALUES ('old-remote','route','plugin','','failed',100,0,1024)",
      );
      sql.exec("INSERT INTO runs VALUES ('old-remote',NULL,'complete','{}',100)");
      initCallFailures(sql);
      initCallFailures(sql);
      expect(readAdminAccountStats(sql)).toMatchObject({
        requests: 0,
        credits: 0,
        failedRequests: 1,
        lastFailureCode: "remote_agent_failed",
      });
    });
  });

  it("backfills only confirmed failures once without guessing their reason or touching billing", async () => {
    const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      sql.exec("DELETE FROM settings WHERE key='callFailuresMigrated'");
      const now = Date.now();
      for (const [id, status] of [
        ["old", "failed"],
        ["pending", "interrupted"],
        ["success", "complete"],
        ["billed", "failed"],
      ])
        sql.exec("INSERT INTO runs VALUES (?,NULL,?,'private response',?)", id, status, now);
      sql.exec("INSERT INTO usage VALUES ('billed',?,10,200)", now);
      state.storage.transactionSync(() => initCallFailures(sql));
      initCallFailures(sql);
      const stats = readAdminAccountStats(sql);
      expect(stats).toMatchObject({
        requests: 1,
        credits: 0.2,
        failedRequests: 1,
        lastFailureCode: "legacy_unknown",
        lastFailureStatus: null,
      });
      expect(sql.exec("SELECT * FROM call_failures").toArray()).toEqual([
        { id: "old", createdAt: now, code: "legacy_unknown", upstreamStatus: null },
      ]);
      expect(callFailureReason(stats.lastFailureCode)).toContain("未记录具体原因");
    });
  });

  it("does not count post-commit failures and stores only allowlisted codes, never raw messages", async () => {
    const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
    await runInDurableObject(stub, (_, state) => {
      const sql = state.storage.sql;
      sql.exec("INSERT INTO usage VALUES ('settled',?,1,1)", Date.now());
      recordCallFailure(sql, "settled", new Error("private reminder sync error"));
      recordCallFailure(
        sql,
        "failed",
        new AppError("unknown-private-code", "private API key"),
        100,
      );
      recordCallFailure(
        sql,
        "failed",
        new AppError("model_http_error", "another error", 502, 500),
        200,
      );
      expect(sql.exec("SELECT * FROM call_failures").toArray()).toEqual([
        { id: "failed", createdAt: 100, code: "request_failed", upstreamStatus: null },
      ]);
      expect(readAdminAccountStats(sql)).toMatchObject({ requests: 1, failedRequests: 1 });
      expect(callFailureReason("model_http_error", 401)).toContain("鉴权或权限失败");
    });
  });
});
