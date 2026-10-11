import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelsEndpoint } from "../src/shared/model-endpoint";
import type { Channel, Protocol } from "../src/shared/types";

const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
type Account = ReturnType<typeof account>;
const api = async (stub: Account, action: string, payload: unknown = {}) =>
  JSON.parse(await stub.api(action, payload));
async function channel(stub: Account, protocol: Protocol = "responses") {
  const result = await api(stub, "channel.save", {
    name: "导入渠道",
    baseUrl: "https://catalog.example.com/gateway/v1",
    protocol,
    apiKey: "catalog-private-key",
  });
  expect(result.ok).toBe(true);
  return result.data as Channel;
}
function mockCatalog(reply: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).includes("cloudflare-dns.com"))
      return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
    return reply(String(url), init);
  });
}
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected fetch"))),
  ),
);
afterEach(() => vi.unstubAllGlobals());

describe("model catalog import", () => {
  it.each([
    "",
    "/",
    "/v1",
    "/v1/",
    "/v1/responses",
    "/v1/chat/completions",
    "/v1/messages",
    "/v1/models",
  ])("normalizes an existing API suffix %s while preserving gateway prefixes", (suffix) => {
    expect(modelsEndpoint(`https://catalog.example.com/gateway${suffix}`)).toBe(
      "https://catalog.example.com/gateway/v1/models",
    );
  });
  it.each<Protocol>(["chat-completions", "responses", "anthropic"])(
    "authenticates %s and imports unique models without changing existing settings, sessions or credits",
    async (protocol) => {
      const stub = account();
      const c = await channel(stub, protocol);
      await api(stub, "model.save", {
        channelId: c.id,
        model: "alpha",
        name: "自定义名称",
        systemPrompt: "保留提示词",
        contextTokens: 12000,
      });
      const before = await stub.snapshot();
      const requests: { url: string; method?: string; headers: Headers; redirect?: string }[] = [];
      mockCatalog((url, init) => {
        requests.push({
          url,
          method: init?.method,
          headers: new Headers(init?.headers),
          redirect: init?.redirect,
        });
        return Response.json({
          data: [
            { id: "alpha" },
            { id: "beta", display_name: "Beta 显示名" },
            { id: "beta" },
            { id: " gamma ", context_length: 1000000 },
            {},
            { id: "x".repeat(121) },
          ],
        });
      });
      expect(await api(stub, "channel.importModels", { id: c.id })).toMatchObject({
        ok: true,
        data: { total: 3, imported: 2, existing: 1, invalid: 2, limited: 0 },
      });
      const after = await stub.snapshot();
      expect(after.assistants.map((a) => a.model)).toEqual(["alpha", "beta", "gamma"]);
      expect(after.assistants[0]).toEqual({ ...before.assistants[0], kind: "text" });
      expect(after.assistants[1]).toMatchObject({
        name: "Beta 显示名",
        channelId: c.id,
        maxOutputTokens: 8192,
        contextTokens: 128000,
      });
      expect(after.currentSession).toEqual(before.currentSession);
      expect(after.assistants[2].contextTokens).toBe(1000000);
      expect(after.wallet).toEqual(before.wallet);
      expect(after.ledger).toEqual(before.ledger);
      expect(JSON.stringify(after)).not.toMatch(/catalog-private-key|encryptedKey|keyContext/);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        url: "https://catalog.example.com/gateway/v1/models",
        method: "GET",
        redirect: "manual",
      });
      expect(
        requests[0].headers.get(protocol === "anthropic" ? "x-api-key" : "authorization"),
      ).toBe(protocol === "anthropic" ? "catalog-private-key" : "Bearer catalog-private-key");
      expect(requests[0].headers.get("anthropic-version")).toBe(
        protocol === "anthropic" ? "2023-06-01" : null,
      );
      expect(await api(stub, "channel.importModels", { id: c.id })).toMatchObject({
        ok: true,
        data: { imported: 0, existing: 3 },
      });
      expect((await stub.snapshot()).assistants).toEqual(after.assistants);
    },
  );
  it("keeps smaller-context models importable with the higher default output limit", async () => {
    const stub = account();
    const c = await channel(stub);
    mockCatalog(() => Response.json({ data: [{ id: "small-model", context_length: 8192 }] }));
    expect(await api(stub, "channel.importModels", { id: c.id })).toMatchObject({
      ok: true,
      data: { imported: 1 },
    });
    expect((await stub.snapshot()).assistants[0]).toMatchObject({
      contextTokens: 8192,
      maxOutputTokens: 4096,
    });
  });
  it("retrieves paginated models from the same endpoint and does not follow upstream URLs", async () => {
    const stub = account();
    const c = await channel(stub, "anthropic");
    const requests: string[] = [];
    mockCatalog((url) => {
      requests.push(url);
      return Response.json(
        requests.length === 1
          ? {
              data: [{ id: "alpha" }],
              has_more: true,
              last_id: "alpha",
              next: "https://untrusted.example.com/steal",
            }
          : { data: [{ id: "beta" }], has_more: false },
      );
    });
    expect(await api(stub, "channel.importModels", { id: c.id })).toMatchObject({
      ok: true,
      data: { imported: 2 },
    });
    expect(requests).toEqual([
      "https://catalog.example.com/gateway/v1/models",
      "https://catalog.example.com/gateway/v1/models?after_id=alpha",
    ]);
    expect((await stub.snapshot()).currentSession?.model).toBe("alpha");
    expect((await stub.snapshot()).stats.sessions).toBe(1);
  });
  it.each([401, 403, 404, 405, 429, 500, 302])(
    "reports upstream %s without exposing its response or importing anything",
    async (status) => {
      const stub = account();
      const c = await channel(stub);
      mockCatalog(
        () =>
          new Response("catalog-private-key private-upstream-details", {
            status,
            headers: { location: "https://untrusted.example.com" },
          }),
      );
      const result = await api(stub, "channel.importModels", { id: c.id });
      expect(result).toMatchObject({ ok: false, status: 502 });
      expect(JSON.stringify(result)).not.toMatch(/catalog-private-key|private-upstream-details/);
      expect((await stub.snapshot()).assistants).toHaveLength(0);
      expect(fetch).toHaveBeenCalledTimes(3);
    },
  );
  it("handles an empty catalog, malformed JSON, invalid schema and oversized responses", async () => {
    const stub = account();
    const c = await channel(stub);
    mockCatalog(() => Response.json({ data: [] }));
    expect(await api(stub, "channel.importModels", { id: c.id })).toMatchObject({
      ok: true,
      data: { total: 0, imported: 0 },
    });
    for (const body of [
      "<html>not an API</html>",
      '{"models":[]}',
      JSON.stringify({ data: [], error: "denied" }),
      "x".repeat(2_000_001),
    ]) {
      mockCatalog(() => new Response(body));
      expect(await api(stub, "channel.importModels", { id: c.id })).toMatchObject({
        ok: false,
        status: 502,
      });
    }
    expect((await stub.snapshot()).assistants).toHaveLength(0);
  });
  it("does not import a partial catalog if pagination or a later request fails", async () => {
    const stub = account();
    const c = await channel(stub, "anthropic");
    for (const failure of ["cursor", "network"]) {
      let page = 0;
      mockCatalog(() => {
        if (++page === 2 && failure === "network") throw new Error("catalog-private-key");
        return Response.json({ data: [{ id: "alpha" }], has_more: true, last_id: "alpha" });
      });
      const result = await api(stub, "channel.importModels", { id: c.id });
      expect(result).toMatchObject({ ok: false, status: 502 });
      expect(JSON.stringify(result)).not.toContain("catalog-private-key");
      expect((await stub.snapshot()).assistants).toHaveLength(0);
    }
  });
  it("isolates users and rejects private DNS before contacting the upstream", async () => {
    const stub = account();
    const c = await channel(stub);
    expect(await api(account(), "channel.importModels", { id: c.id })).toMatchObject({
      ok: false,
      error: "channel_missing",
    });
    expect(fetch).not.toHaveBeenCalled();
    // Each DNS request needs its own readable response body.
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ Answer: [{ type: 1, data: "127.0.0.1" }] }),
    );
    expect(await api(stub, "channel.importModels", { id: c.id })).toMatchObject({
      ok: false,
      error: "unsafe_dns",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rechecks duplicates and the channel limit after concurrent imports", async () => {
    const stub = account();
    const c = await channel(stub);
    for (let i = 0; i < 49; i++)
      expect(
        await api(stub, "model.save", { channelId: c.id, name: `Model ${i}`, model: `model-${i}` }),
      ).toMatchObject({ ok: true });
    mockCatalog(() => Response.json({ data: [{ id: "alpha" }, { id: "beta" }] }));
    const results = await Promise.all([
      api(stub, "channel.importModels", { id: c.id }),
      api(stub, "channel.importModels", { id: c.id }),
    ]);
    expect(results.every((r) => r.ok && r.data.limited === 1)).toBe(true);
    expect(results.reduce((sum, r) => sum + r.data.imported, 0)).toBe(1);
    expect((await stub.snapshot()).assistants).toHaveLength(50);
  });
  it.each(["edit", "delete"])(
    "does not apply stale results after a concurrent channel %s",
    async (change) => {
      const stub = account();
      const c = await channel(stub);
      await runInDurableObject(stub, async (instance) => {
        let release!: (value: Response) => void;
        let started!: () => void;
        const waiting = new Promise<void>((resolve) => {
          started = resolve;
        });
        mockCatalog(
          () =>
            new Promise<Response>((resolve) => {
              release = resolve;
              started();
            }),
        );
        const importing = instance.api("channel.importModels", { id: c.id });
        await waiting;
        const changed = JSON.parse(
          await instance.api(
            change === "edit" ? "channel.save" : "channel.delete",
            change === "edit" ? { ...c, name: "Changed" } : { id: c.id },
          ),
        );
        release(Response.json({ data: [{ id: "alpha" }] }));
        expect(changed.ok).toBe(true);
        expect(JSON.parse(await importing)).toMatchObject({
          ok: false,
          error: change === "edit" ? "channel_changed" : "channel_missing",
        });
        expect(instance.snapshot().assistants).toHaveLength(0);
      });
    },
  );
});
