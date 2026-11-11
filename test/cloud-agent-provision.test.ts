import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudAgentStore } from "../src/server/cloud-agent-store";
import { cloudAgentScope, ensureCloudAgentProvision } from "../src/server/cloud-agent-provision";
import type { CloudAgentConfig } from "../src/server/config";

const config: CloudAgentConfig = {
  origin: "https://agt.example.com",
  appId: "app-one",
  appKey: "test-only-app-key",
  tenantId: "tenant-one",
  agentId: "wechatai-v1",
  model: "test-model",
  workspacePrefix: "test",
  maxActive: 1,
  dailyLimit: 30,
  deadlineMs: 600_000,
};
const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
function inStore<T>(stub: ReturnType<typeof account>, run: (store: CloudAgentStore) => T) {
  return runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    store.init();
    return run(store);
  });
}
function provision(stub: ReturnType<typeof account>, settings = config) {
  const id = stub.id.toString();
  return inStore(stub, (store) =>
    ensureCloudAgentProvision(settings, store, id, `test-${id.slice(0, 32)}`),
  );
}

/** The fake preserves upstream side effects even when a response is lost. */
function fakeAgt(
  options: {
    loseResponseAt?: number;
    workspace?: Record<string, unknown>;
  } = {},
) {
  const calls: { path: string; body: Record<string, unknown>; authorization: string | null }[] = [];
  const users = new Map<string, string>();
  const workspaces = new Map<string, string>();
  const profiles = new Map<string, unknown>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      const body = await request.json<Record<string, unknown>>();
      calls.push({ path, body, authorization: request.headers.get("authorization") });
      let response: Response;
      if (path.endsWith("/users")) {
        const externalId = String(body.externalId);
        if (!users.has(externalId)) users.set(externalId, `user-${users.size + 1}`);
        response = Response.json(
          {
            appUser: {
              id: users.get(externalId),
              appId: config.appId,
              tenantId: config.tenantId,
              externalId,
            },
          },
          { status: 201 },
        );
      } else if (path === "/api/workspaces/ensure") {
        expect(body.accessMode).toBe("restricted");
        const name = String(body.name);
        if (!workspaces.has(name)) workspaces.set(name, `workspace-${workspaces.size + 1}`);
        response = Response.json(
          {
            workspace: {
              id: workspaces.get(name),
              tenantId: config.tenantId,
              name,
              accessMode: "restricted",
              ...options.workspace,
            },
          },
          { status: 201 },
        );
      } else if (path.includes("/agents/")) {
        profiles.set(path, body.model);
        response = Response.json({ ok: true });
      } else throw new Error(`Unexpected provisioning request: ${path}`);
      if (calls.length === options.loseResponseAt)
        throw new TypeError("Upstream response was lost");
      return response;
    }),
  );
  return { calls, users, workspaces, profiles, options };
}
afterEach(() => vi.unstubAllGlobals());

describe("durable AGT account provisioning", () => {
  it("creates an account-scoped mapping and reuses it after a restart without storing credentials", async () => {
    const network = fakeAgt();
    const stub = account();
    const saved = await provision(stub);
    expect(saved).toMatchObject({
      scope: cloudAgentScope(config),
      externalId: `wechatai:${stub.id}`,
      appUserId: "user-1",
      workspaceId: "workspace-1",
      profiles: ["wechatai-v1"],
      configured: 1,
    });
    expect(network.calls.map((call) => call.path)).toEqual([
      "/api/apps/app-one/users",
      "/api/workspaces/ensure",
      "/api/workspaces/workspace-1/agents/wechatai-v1",
    ]);
    expect(network.calls[1].body.name).toBe(`test-${stub.id.toString().slice(0, 32)}`);
    expect(JSON.stringify(saved)).not.toContain(config.appKey);
    await abortAllDurableObjects();
    expect(await provision(env.ACCOUNTS.get(stub.id))).toEqual(saved);
    expect(network.calls).toHaveLength(3);
  });

  it.each([1, 2, 3])(
    "resumes after response %i is lost without duplicating upstream resources",
    async (step) => {
      const network = fakeAgt({ loseResponseAt: step });
      const stub = account();
      await inStore(stub, async (store) => {
        await expect(
          ensureCloudAgentProvision(
            config,
            store,
            stub.id.toString(),
            `test-${stub.id.toString().slice(0, 32)}`,
          ),
        ).rejects.toMatchObject({ code: "cloud_agent_unreachable" });
        const partial = store.provision();
        expect(Boolean(partial?.appUserId)).toBe(step > 1);
        expect(Boolean(partial?.workspaceId)).toBe(step > 2);
        expect(partial?.configured ?? 0).toBe(0);
      });
      await abortAllDurableObjects();
      const restored = await provision(env.ACCOUNTS.get(stub.id));
      expect(restored.configured).toBe(1);
      expect(restored.profiles).toEqual([config.agentId]);
      expect(network.calls).toHaveLength(4);
      expect(network.users.size).toBe(1);
      expect(network.workspaces.size).toBe(1);
      expect(network.profiles.size).toBe(1);
    },
  );

  it("rejects an incorrect tenant without saving a mapping and recovers after the configuration is corrected", async () => {
    const network = fakeAgt();
    const stub = account();
    await inStore(stub, async (store) => {
      await expect(
        ensureCloudAgentProvision(
          { ...config, tenantId: "incorrect-tenant" },
          store,
          stub.id.toString(),
          `test-${stub.id.toString().slice(0, 32)}`,
        ),
      ).rejects.toMatchObject({ code: "cloud_agent_identity" });
      expect(store.provision()).toBeUndefined();
    });
    expect(network.calls).toHaveLength(1);
    expect(network.workspaces.size).toBe(0);
    expect(network.profiles.size).toBe(0);
    await abortAllDurableObjects();
    const restored = await provision(env.ACCOUNTS.get(stub.id));
    expect(restored).toMatchObject({
      scope: cloudAgentScope(config),
      appUserId: "user-1",
      workspaceId: "workspace-1",
      configured: 1,
    });
    expect(network.users.size).toBe(1);
    expect(network.calls).toHaveLength(4);
  });

  it.each([
    { tenantId: "other-tenant" },
    { name: "other-account-workspace" },
    { accessMode: "tenant" },
  ])(
    "does not persist an invalid workspace or configure its profile and retries safely (%j)",
    async (change) => {
      const network = fakeAgt({ workspace: change });
      const stub = account();
      await inStore(stub, async (store) => {
        await expect(
          ensureCloudAgentProvision(
            config,
            store,
            stub.id.toString(),
            `test-${stub.id.toString().slice(0, 32)}`,
          ),
        ).rejects.toMatchObject({ code: "cloud_agent_identity" });
        expect(store.provision()).toMatchObject({
          scope: cloudAgentScope(config),
          appUserId: "user-1",
          workspaceId: "",
          configured: 0,
        });
      });
      expect(network.calls).toHaveLength(2);
      expect(network.profiles.size).toBe(0);
      network.options.workspace = undefined;
      await abortAllDurableObjects();
      expect((await provision(env.ACCOUNTS.get(stub.id))).configured).toBe(1);
      expect(network.users.size).toBe(1);
      expect(network.workspaces.size).toBe(1);
      expect(network.calls).toHaveLength(4);
    },
  );

  it("keeps the workspace across key rotation and adds a new profile without overwriting the old one", async () => {
    const network = fakeAgt();
    const stub = account();
    const saved = await provision(stub);
    const rotated = { ...config, appKey: "test-only-rotated-key" };
    expect(await provision(stub, rotated)).toEqual(saved);
    expect(network.calls).toHaveLength(3);
    const upgraded = await provision(stub, {
      ...rotated,
      agentId: "wechatai-v2",
      model: "new-model",
    });
    expect(upgraded).toMatchObject({
      externalId: saved.externalId,
      appUserId: saved.appUserId,
      workspaceId: saved.workspaceId,
      profiles: ["wechatai-v1", "wechatai-v2"],
    });
    expect(network.calls).toHaveLength(4);
    expect(network.calls[3].authorization).toBe(`Bearer ${rotated.appKey}`);
    expect([...network.profiles.values()]).toEqual(["test-model", "new-model"]);
  });

  it.each([
    { origin: "https://other-agt.example.com" },
    { appId: "app-two" },
    { tenantId: "tenant-two" },
  ])("rejects a changed service scope before making any request (%j)", async (change) => {
    const network = fakeAgt();
    const stub = account();
    const saved = await provision(stub);
    await inStore(stub, async (store) => {
      await expect(
        ensureCloudAgentProvision(
          { ...config, ...change },
          store,
          stub.id.toString(),
          "different-name",
        ),
      ).rejects.toMatchObject({ code: "cloud_scope_changed", status: 503 });
      expect(store.provision()).toEqual(saved);
    });
    expect(network.calls).toHaveLength(3);
  });

  it("assigns different application users and restricted workspaces to different accounts", async () => {
    const network = fakeAgt();
    const first = await provision(account());
    const second = await provision(account());
    expect(first.externalId).not.toBe(second.externalId);
    expect(first.appUserId).not.toBe(second.appUserId);
    expect(first.workspaceId).not.toBe(second.workspaceId);
    expect(network.users.size).toBe(2);
    expect(network.workspaces.size).toBe(2);
  });
});
