import { describe, expect, it } from "vitest";
import { backendRequest, callBackend, type BackendCommand } from "../src/server/backend-client";
import { forwardBackendExecution } from "../src/server/backend-executor";
import { openClawRelease } from "../src/shared/openclaw-release";
import contract from "../backend/contract/contract.json";
import { createHash } from "node:crypto";
import fixture from "../backend/internal/rpc/testdata/worker-request.json";

const command: BackendCommand = JSON.parse(fixture.body);

describe("edge-to-Go command boundary", () => {
  it("matches the WebCrypto vector independently verified by Go", async () => {
    const request = await backendRequest(fixture.origin, fixture.secret, command, {
      now: fixture.timestamp,
      requestId: fixture.requestId,
    });
    expect(await request.text()).toBe(fixture.body);
    expect(request.headers.get("X-Wechatai-Signature")).toBe(fixture.signature);
    expect(request.redirect).toBe("manual");
  });

  it("refuses untrusted origins and mismatched user identities before sending", async () => {
    await expect(
      backendRequest("http://remote.example.com", fixture.secret, command),
    ).rejects.toThrow();
    await expect(
      backendRequest("https://backend.example.com/another-path", fixture.secret, command),
    ).rejects.toThrow();
    await expect(
      backendRequest(fixture.origin, fixture.secret, {
        ...command,
        principal: { scope: "user", userId: "another-user" },
      }),
    ).rejects.toThrow(/identity/);
  });

  it("requires the target owner for referral identity lookup before signing", async () => {
    await expect(
      backendRequest(fixture.origin, fixture.secret, {
        ...command,
        method: "referralWechatIdentity",
        principal: { scope: "referral" },
        params: [],
        ownerId: undefined,
      }),
    ).rejects.toThrow(/identity/);
  });

  it("binds notices to the installed edge release and authorizes stale read requests", async () => {
    const notice: BackendCommand = {
      ...command,
      principal: { scope: "user", userId: command.ownerId },
      method: "connectorUpdateNotice",
      params: [],
    };
    const old = "0.0.1";
    const signed = await backendRequest(fixture.origin, fixture.secret, notice);
    expect(await signed.json()).toMatchObject({ connectorRelease: openClawRelease.version });
    await expect(
      backendRequest(fixture.origin, fixture.secret, {
        ...notice,
        connectorRelease: old,
      } as BackendCommand),
    ).rejects.toThrow();
    const result = await callBackend(fixture.origin, fixture.secret, notice, {
      transport: async () => Response.json({ ok: true, data: { version: old } }),
    });
    expect(result).toBeNull();
    const read = { ...notice, method: "readConnectorUpdateNotice", params: [old] };
    await expect(
      callBackend(fixture.origin, fixture.secret, read, {
        transport: async (input) => {
          expect(await new Request(input).json()).toMatchObject({
            connectorRelease: openClawRelease.version,
            params: [""],
          });
          return Response.json(
            { ok: false, error: "account_changed", message: "账户路由已变更", status: 409 },
            { status: 409 },
          );
        },
      }),
    ).rejects.toMatchObject({ code: "account_changed" });
    expect(read.params).toEqual([old]);
  });

  it("preserves structured domain failures and never retries unknown outcomes", async () => {
    let calls = 0;
    const transport = async () => {
      calls++;
      return Response.json(
        { ok: false, error: "account_changed", message: "账户路由已变更", status: 409 },
        { status: 409 },
      );
    };
    await expect(
      callBackend(fixture.origin, fixture.secret, command, { transport }),
    ).rejects.toMatchObject({ code: "account_changed", status: 409 });
    expect(calls).toBe(1);
    await expect(
      callBackend(fixture.origin, fixture.secret, command, {
        transport: async () => {
          throw new Error("sensitive origin details");
        },
      }),
    ).rejects.toMatchObject({
      code: "backend_unavailable",
      message: "后端服务暂时不可用，请稍后重试",
      status: 503,
    });
  });

  it("rejects oversized or inconsistent responses", async () => {
    await expect(
      callBackend(fixture.origin, fixture.secret, command, {
        transport: async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
      }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      callBackend(fixture.origin, fixture.secret, command, {
        transport: async () => Response.json({ ok: true, data: {} }, { status: 503 }),
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe("executor data transport", () => {
  const origin = fixture.origin;
  const target = { accountId: command.accountId, routeEpoch: 1 };
  const body = JSON.stringify({ result: { ok: true, value: "x".repeat(3 * 1024 * 1024) } });
  const hash = createHash("sha256").update(body).digest("hex");

  it.each([true, false])(
    "preserves a 3 MiB completion with a caller digest %s",
    async (withDigest) => {
      const response = await forwardBackendExecution(
        origin,
        fixture.secret,
        target,
        "complete",
        new Response(body).body!,
        {
          bodySHA256: withDigest ? hash : undefined,
          transport: async (input) => {
            const signed = new Request(input);
            expect(new URL(signed.url).pathname).toBe(
              `/internal/v1/executor/${target.accountId}/1/complete`,
            );
            expect(signed.headers.get("X-Wechatai-Body-SHA256")).toBe(hash);
            expect(await signed.text()).toBe(body);
            return Response.json({ data: { accepted: true } });
          },
        },
      );
      expect(await response.json()).toEqual({ data: { accepted: true } });
    },
  );

  it("keeps ordinary requests small and bounds unannounced executor uploads", async () => {
    await expect(
      backendRequest(origin, fixture.secret, { ...command, params: [body] }),
    ).rejects.toMatchObject({ status: 413 });
    let remaining = contract.limits.executionBytes + 1;
    const chunk = new Uint8Array(256 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const n = Math.min(remaining, chunk.length);
        if (n === 0) {
          controller.close();
          return;
        }
        controller.enqueue(chunk.subarray(0, n));
        remaining -= n;
      },
    });
    await expect(
      forwardBackendExecution(origin, fixture.secret, target, "complete", stream, {
        transport: async () => {
          throw new Error("oversized upload reached origin");
        },
      }),
    ).rejects.toMatchObject({ status: 413 });
  });
});
