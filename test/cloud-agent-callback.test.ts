import { createHmac } from "node:crypto";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  CLOUD_CALLBACK_MAX_BYTES,
  cloudCallbackSecret,
  createCloudCallbackToken,
  parseCloudCallbackToken,
  readCloudCallbackBody,
  verifyCloudCallback,
} from "../src/server/cloud-agent-callback";

const accountId = "a".repeat(64);
const taskId = crypto.randomUUID();

function configuredEnv(values: Record<string, string>): Env {
  return new Proxy(env, {
    get(target, name) {
      return Reflect.has(values, name) ? Reflect.get(values, name) : Reflect.get(target, name);
    },
  });
}

function sign(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

const body = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "job:job-1:completed",
    type: "job.completed",
    callbackJobId: "job-1",
    tenantId: "ten",
    workspaceId: "wsp-1",
    createdAt: new Date().toISOString(),
    data: { status: "completed", result: "你好" },
    ...overrides,
  });

describe("cloud callback token", () => {
  it("round-trips and rejects tampering and expiry", () => {
    const token = createCloudCallbackToken(env, accountId, taskId, Date.now() + 60_000);
    expect(parseCloudCallbackToken(env, token)).toEqual({ accountId, taskId });

    const parts = token.split(".");
    const tampered = [...parts.slice(0, 4), String(Number(parts[4]) + 9999), parts[5]].join(".");
    expect(parseCloudCallbackToken(env, tampered)).toBeNull();
    expect(parseCloudCallbackToken(env, `${token}x`)).toBeNull();
    expect(parseCloudCallbackToken(env, token.replace(parts[2], "b".repeat(64)))).toBeNull();

    const expired = createCloudCallbackToken(env, accountId, taskId, Date.now() - 1000);
    expect(parseCloudCallbackToken(env, expired)).toBeNull();
  });

  it("derives a stable per-task secret without storing one", () => {
    const first = cloudCallbackSecret(env, accountId, taskId);
    expect(first).toBe(cloudCallbackSecret(env, accountId, taskId));
    expect(first).not.toBe(cloudCallbackSecret(env, accountId, crypto.randomUUID()));
    expect(first).not.toBe(cloudCallbackSecret(env, "b".repeat(64), taskId));
    expect(first).toHaveLength(43);
  });
});

describe("cloud callback verification", () => {
  const secret = cloudCallbackSecret(env, accountId, taskId);
  const now = 1_700_000_000_000;
  const timestamp = String(Math.floor(now / 1000));
  const verify = (raw: string, overrides: Parameters<typeof verifyCloudCallback>[2] = {}) =>
    verifyCloudCallback(
      secret,
      raw,
      {
        event: "job.completed",
        delivery: "job:job-1:completed",
        timestamp,
        signature: sign(secret, timestamp, raw),
        ...overrides,
      },
      now,
    );

  it("accepts a signed body and rejects a reformatted one", () => {
    const raw = body();
    expect(verify(raw).ok).toBe(true);
    expect(
      verify(JSON.stringify(JSON.parse(raw), null, 2), {
        signature: sign(secret, timestamp, raw),
      }),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it.each([-301, 301])(
    "rejects a timestamp %i seconds away even with a valid signature",
    (skew) => {
      const raw = body();
      const old = String(Math.floor(now / 1000) + skew);
      expect(verify(raw, { timestamp: old, signature: sign(secret, old, raw) })).toMatchObject({
        ok: false,
        error: "stale_timestamp",
      });
    },
  );

  it("rejects a payload signed with another task's secret", () => {
    const raw = body();
    expect(verify(raw, { signature: sign("another-task-signing-secret", timestamp, raw) })).toEqual(
      {
        ok: false,
        status: 401,
        error: "invalid_signature",
      },
    );
  });

  it("rejects invalid JSON after authenticating the original body", () => {
    expect(verify("{not json}")).toEqual({ ok: false, status: 400, error: "invalid_json" });
  });

  it("accepts AGT's Web Crypto signature and result-free notification shape", async () => {
    const event = {
      id: "job:job-1:completed",
      type: "job.completed",
      severity: "info",
      tenantId: "ten",
      workspaceId: "wsp-1",
      createdAt: new Date(now - 3_600_000).toISOString(),
      title: "Agent 任务已完成",
      body: "任务结果已经保存，可以回到工作区查看。",
      jobId: "job-1",
      data: { status: "completed", task: { outcome: "partial" } },
      callbackJobId: "job-1",
    };
    const raw = JSON.stringify(event);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${raw}`),
    );
    expect(verify(raw, { signature: `sha256=${Buffer.from(signature).toString("hex")}` })).toEqual({
      ok: true,
      body: event,
      deliveryId: event.id,
    });
    // A retry has a fresh delivery timestamp; event creation time is not its expiry.
    const retryTimestamp = String(Number(timestamp) + 3600);
    expect(
      verifyCloudCallback(
        secret,
        raw,
        {
          event: event.type,
          delivery: event.id,
          timestamp: retryTimestamp,
          signature: sign(secret, retryTimestamp, raw),
        },
        now + 3_600_000,
      ),
    ).toMatchObject({ ok: true, deliveryId: event.id });
  });

  it.each([
    [{ delivery: "other" }, "delivery_mismatch"],
    [{ event: "job.failed" }, "event_mismatch"],
  ] as const)("rejects mismatched callback headers: %j", (headers, error) => {
    expect(verify(body(), headers)).toMatchObject({ ok: false, error });
  });

  it("requires the sha256= prefix and a well-formed event", () => {
    const raw = body();
    expect(
      verify(raw, { signature: sign(secret, timestamp, raw).replace("sha256=", "") }),
    ).toMatchObject({ ok: false, status: 401 });
    expect(verify(JSON.stringify({ id: "x", type: "job.completed" }))).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("cloud callback boundaries", () => {
  it("requires event and delivery headers and measures UTF-8 bytes", () => {
    const secret = "independent-test-secret";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const raw = body();
    expect(
      verifyCloudCallback(secret, raw, { timestamp, signature: sign(secret, timestamp, raw) }),
    ).toMatchObject({ ok: false, status: 400 });
    const unicode = body({ data: { result: "中".repeat(400_000) } });
    expect(unicode.length).toBeLessThan(1024 * 1024);
    expect(
      verifyCloudCallback(secret, unicode, {
        timestamp,
        signature: sign(secret, timestamp, unicode),
      }),
    ).toMatchObject({ ok: false, status: 413 });
  });

  it("keeps old key versions valid while new tasks use a new version", () => {
    const values = {
      AGT_CALLBACK_KEY_VERSION: "v1",
      AGT_CALLBACK_KEYS: JSON.stringify({ v1: "1".repeat(40), v2: "2".repeat(40) }),
    };
    const configured = configuredEnv(values);
    const old = createCloudCallbackToken(configured, accountId, taskId, Date.now() + 60_000);
    const first = cloudCallbackSecret(configured, accountId, taskId, "v1");
    values.AGT_CALLBACK_KEY_VERSION = "v2";
    expect(parseCloudCallbackToken(configured, old)).toEqual({ accountId, taskId });
    expect(cloudCallbackSecret(configured, accountId, taskId, "v1")).toBe(first);
    expect(cloudCallbackSecret(configured, accountId, taskId)).not.toBe(first);
    values.AGT_CALLBACK_KEYS = JSON.stringify({ v2: "2".repeat(40) });
    expect(parseCloudCallbackToken(configured, old)).toBeNull();
  });

  it.each(["not-json", "{}", JSON.stringify({ v1: "too-short" })])(
    "does not silently fall back to ENCRYPTION_KEY for an invalid key ring: %s",
    (keys) => {
      const token = createCloudCallbackToken(env, accountId, taskId, Date.now() + 60_000);
      const configured = configuredEnv({ AGT_CALLBACK_KEYS: keys });
      expect(() =>
        createCloudCallbackToken(configured, accountId, taskId, Date.now() + 60_000),
      ).toThrow();
      expect(parseCloudCallbackToken(configured, token)).toBeNull();
    },
  );
});

describe("cloud callback body stream", () => {
  function request(chunks: Uint8Array[], cancel?: () => void) {
    return new Request("https://wechatai.example/callback", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks.shift();
          if (chunk) controller.enqueue(chunk);
          else controller.close();
        },
        cancel,
      }),
    });
  }

  it("preserves UTF-8 characters split across chunks for signature verification", async () => {
    const raw = body();
    const bytes = new TextEncoder().encode(raw);
    const splitAt = bytes.indexOf(0xe4) + 1;
    const rawBody = await readCloudCallbackBody(
      request([bytes.slice(0, splitAt), bytes.slice(splitAt)]),
    );
    expect(rawBody).toBe(raw);
  });

  it("reads an empty body and accepts exactly the byte limit", async () => {
    expect(await readCloudCallbackBody(new Request("https://wechatai.example/callback"))).toBe("");
    const bytes = new Uint8Array(CLOUD_CALLBACK_MAX_BYTES).fill(0x61);
    expect(await readCloudCallbackBody(request([bytes]))).toHaveLength(CLOUD_CALLBACK_MAX_BYTES);
  });

  it("cancels an oversized stream without Content-Length", async () => {
    let cancelled = false;
    const incoming = request(
      [new Uint8Array(CLOUD_CALLBACK_MAX_BYTES), new Uint8Array(1), new Uint8Array(1)],
      () => {
        cancelled = true;
      },
    );
    expect(incoming.headers.has("Content-Length")).toBe(false);
    expect(await readCloudCallbackBody(incoming)).toBeNull();
    expect(cancelled).toBe(true);
    expect(incoming.body?.locked).toBe(false);
  });

  it.each([{ bytes: [0xff] }, { bytes: [0xe4, 0xbd] }])(
    "rejects invalid or incomplete UTF-8: $bytes",
    async ({ bytes }) => {
      const incoming = request([new Uint8Array(bytes)]);
      await expect(readCloudCallbackBody(incoming)).rejects.toThrow();
      expect(incoming.body?.locked).toBe(false);
    },
  );
});
