import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_CALLBACK_PATH,
  cloudCallbackSecret,
  parseCloudCallbackToken,
} from "../src/server/cloud-agent-callback";
import { cloudAgentScope } from "../src/server/cloud-agent-provision";
import { prepareCloudAgentRequest } from "../src/server/cloud-agent-request";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";
import { decrypt, encrypt } from "../src/server/security";

function configuredEnv(values: Record<string, string>): Env {
  return new Proxy(env, {
    get(target, name) {
      return Reflect.has(values, name) ? Reflect.get(values, name) : Reflect.get(target, name);
    },
  });
}
const enabledEnv = configuredEnv({ CLOUD_AGENT_ENABLED: "true" });
const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
function inStore<T>(stub: ReturnType<typeof account>, run: (store: CloudAgentStore) => T) {
  return runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    store.init();
    return run(store);
  });
}
async function setup(change: Partial<CloudTask> = {}) {
  const now = Date.now();
  const stub = account();
  const saved: CloudTask = {
    id: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
    origin: "https://agt.example.com",
    appId: "app-one",
    tenantId: "tenant-one",
    profileId: "profile-v1",
    model: "frozen-model",
    workspaceName: "test-account",
    callbackVersion: "v1",
    callbackOrigin: "https://wechatai.example.com",
    invocation: null,
    request: "",
    submittedAt: 0,
    outcome: null,
    reconcileCursor: "",
    reconcileCandidates: [],
    hidden: 0,
    deliveryStatus: "pending",
    pluginContext: "plugin-one",
    currentSessionId: "session-one",
    pluginId: "plugin-one",
    pluginName: "云端 Agent",
    sessionId: "session-one",
    connectionId: "link-one",
    generation: "generation-one",
    contextStart: now,
    resetAt: 0,
    conversationId: "conversation-one",
    prompt: "请解释这个问题：\n保留原始换行和中文。",
    idempotencyKey: crypto.randomUUID(),
    state: "submitting",
    upstreamStatus: "",
    jobId: "",
    createdAt: now,
    updatedAt: now,
    deadline: now + 600_000,
    nextAt: now,
    attempts: 0,
    stopRequested: 0,
    settled: 0,
    stale: 0,
    delivered: 0,
    result: "",
    error: "",
    units: 0,
    frozen: "",
    unconfirmed: 0,
    ...change,
  };
  await inStore(stub, (store) => {
    store.save(saved);
    store.saveProvision({
      scope: cloudAgentScope(saved),
      profiles: [saved.profileId],
      externalId: `wechatai:${stub.id}`,
      appUserId: "user-one",
      workspaceId: "workspace-one",
      configured: 1,
      updatedAt: now,
    });
  });
  return { stub, saved };
}
const eligible = () => undefined;
afterEach(() => vi.restoreAllMocks());

describe("durable AGT submit request preparation", () => {
  it.each([
    [
      "chat-completions",
      "https://llm.example.com",
      "chat-completions",
      "https://llm.example.com/v1",
    ],
    [
      "responses",
      "https://llm.example.com/v1/responses",
      "responses",
      "https://llm.example.com/v1",
    ],
    [
      "anthropic",
      "https://llm.example.com/custom/v1/messages",
      "messages",
      "https://llm.example.com/custom/v1",
    ],
  ] as const)(
    "uses the user's %s connection and freezes it across restart",
    async (protocol, baseUrl, api, expectedRoot) => {
      const { stub, saved } = await setup();
      const settings = configuredEnv({
        CLOUD_AGENT_ENABLED: "true",
        AGT_ORIGIN: saved.origin,
        AGT_APP_ID: saved.appId,
        AGT_TENANT_ID: saved.tenantId,
        AGT_APP_KEY: "test-app-key",
        AGT_MODEL: "must-not-use-glm",
      });
      const channelId = `mch_${"a".repeat(32)}`;
      const network = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        expect(new URL(request.url).pathname).toBe(`/api/apps/${saved.appId}/model-channels`);
        if (request.method === "GET") return Response.json({ channels: [] });
        expect(await request.json()).toMatchObject({
          provider: protocol === "anthropic" ? "anthropic-compatible" : "openai-compatible",
          api,
          baseUrl: expectedRoot,
          apiKey: "user-provider-key",
          defaultModel: "chosen-model",
          isDefault: false,
          models: [
            {
              id: "chosen-model",
              contextWindowTokens: 32000,
              maxInputTokens: 5000,
              maxOutputTokens: 1024,
              defaultOutputTokens: 1024,
            },
          ],
        });
        return Response.json({ channel: { id: channelId } });
      });
      const first = await inStore(stub, async (store) => {
        store.patch(saved, {
          modelConnection: {
            id: "user-model",
            model: "chosen-model",
            protocol,
            baseUrl,
            encryptedKey: await encrypt(env, "user-provider-key", `${stub.id}:channel:user`),
            keyContext: "channel:user",
            systemPrompt: "用户设定",
            contextTokens: 32000,
            maxInputTokens: 5000,
            maxOutputTokens: 1024,
          },
        });
        return prepareCloudAgentRequest(settings, store, stub.id.toString(), saved.id, eligible);
      });
      expect(JSON.parse(first!)).toMatchObject({
        model: `channel:${channelId}:chosen-model`,
        systemPrompt: "用户设定",
      });
      expect(first).not.toContain("user-provider-key");
      expect(first).not.toContain("must-not-use-glm");
      await abortAllDurableObjects();
      const second = await inStore(env.ACCOUNTS.get(stub.id), (store) =>
        prepareCloudAgentRequest(settings, store, stub.id.toString(), saved.id, eligible),
      );
      expect(second).toBe(first);
      expect(network).toHaveBeenCalledTimes(2);
    },
  );

  it("recovers only its own model channel after a lost creation response", async () => {
    const { stub, saved } = await setup();
    const settings = configuredEnv({
      CLOUD_AGENT_ENABLED: "true",
      AGT_ORIGIN: saved.origin,
      AGT_APP_ID: saved.appId,
      AGT_TENANT_ID: saved.tenantId,
      AGT_APP_KEY: "test-app-key",
    });
    const owned = `mch_${"b".repeat(32)}`;
    const foreign = `mch_${"c".repeat(32)}`;
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      calls++;
      if (request.method === "GET")
        return Response.json({
          channels: [
            { id: foreign, name: "wechatai-other-account" },
            { id: owned, name: `wechatai-${stub.id}` },
          ],
        });
      expect(request.method).toBe("PATCH");
      expect(request.url).toBe(`${saved.origin}/api/apps/${saved.appId}/model-channels/${owned}`);
      return Response.json({ channel: { id: owned } });
    });
    const first = await inStore(stub, async (store) => {
      store.patch(saved, {
        modelConnection: {
          id: "selected",
          model: "selected-model",
          protocol: "responses",
          baseUrl: "https://llm.example.com",
          encryptedKey: await encrypt(env, "own-user-key", `${stub.id}:channel:own`),
          keyContext: "channel:own",
          systemPrompt: "",
          contextTokens: 32000,
          maxOutputTokens: 1024,
        },
      });
      return prepareCloudAgentRequest(settings, store, stub.id.toString(), saved.id, eligible);
    });
    expect(JSON.parse(first!).model).toBe(`channel:${owned}:selected-model`);
    expect(calls).toBe(2);
  });

  it("encrypts the complete frozen body and reuses the exact bytes after restart and config rotation", async () => {
    const { stub, saved } = await setup();
    const settings = configuredEnv({
      CLOUD_AGENT_ENABLED: "true",
      AGT_MODEL: "new-model",
      AGT_AGENT_ID: "new-profile",
      APP_URL: "https://new-site.example.com",
      AGT_CALLBACK_KEY_VERSION: "v2",
    });
    const first = await inStore(stub, (store) =>
      prepareCloudAgentRequest(settings, store, stub.id.toString(), saved.id, eligible),
    );
    expect(first).not.toBeNull();
    const body = JSON.parse(first!);
    expect(body).toMatchObject({
      workspaceId: "workspace-one",
      agentId: saved.profileId,
      model: saved.model,
      conversationId: saved.conversationId,
      message: saved.prompt,
      skillLearningMode: "off",
      policy: { allowTools: ["memory_search", "remember_memory"], compactionMode: "off" },
      callback: {
        includeResult: false,
        secret: cloudCallbackSecret(env, stub.id.toString(), saved.id, "v1"),
      },
    });
    const url = new URL(body.callback.url);
    expect(url.origin).toBe(saved.callbackOrigin);
    const token = url.pathname.slice(`${CLOUD_CALLBACK_PATH}/`.length);
    expect(parseCloudCallbackToken(env, token)).toEqual({
      accountId: stub.id.toString(),
      taskId: saved.id,
    });
    expect(Number(token.split(".")[4]) * 1000).toBe(
      Math.ceil((saved.deadline + 7 * 86_400_000) / 1000) * 1000,
    );
    const frozen = await inStore(stub, async (store) => {
      const task = store.get(saved.id)!;
      expect(task.request).not.toContain(saved.prompt);
      expect(task.request).not.toContain(body.callback.secret);
      expect(await decrypt(env, task.request, `${stub.id}:cloud:${saved.id}`)).toBe(first);
      // Simulate an ambiguous earlier attempt. Preparation must not mark another
      // attempt, clear its recovery state or change the idempotency key.
      store.patch(task, { submittedAt: 123, unconfirmed: 1 });
      return task.request;
    });
    await abortAllDurableObjects();
    const rotated = configuredEnv({
      CLOUD_AGENT_ENABLED: "true",
      AGT_CALLBACK_KEY_VERSION: "v2",
      AGT_CALLBACK_KEYS: JSON.stringify({ v2: "test-only-new-callback-key-of-32-characters" }),
    });
    await inStore(env.ACCOUNTS.get(stub.id), async (store) => {
      expect(
        await prepareCloudAgentRequest(rotated, store, stub.id.toString(), saved.id, eligible),
      ).toBe(first);
      expect(store.get(saved.id)).toMatchObject({
        request: frozen,
        idempotencyKey: saved.idempotencyKey,
        submittedAt: 123,
        unconfirmed: 1,
        state: "submitting",
        settled: 0,
        units: 0,
      });
    });
  });

  it.each<Partial<CloudTask>>([
    { stopRequested: 1 },
    { hidden: 1 },
    { deadline: 1 },
    { state: "completed" },
    { state: "accepted", jobId: "job-one" },
  ])("does not freeze a task that cannot be submitted: %j", async (change) => {
    const { stub, saved } = await setup(change);
    await inStore(stub, async (store) => {
      expect(
        await prepareCloudAgentRequest(enabledEnv, store, stub.id.toString(), saved.id, eligible),
      ).toBeNull();
      expect(store.get(saved.id)?.request).toBe("");
    });
  });

  for (const phase of ["encrypt", "decrypt"] as const) {
    it.each(["stop", "hide", "expire", "disable", "session changed"])(
      `rechecks %s after ${phase} without reviving the task`,
      async (reason) => {
        const { stub, saved } = await setup();
        const values = { CLOUD_AGENT_ENABLED: "true" };
        const settings = configuredEnv(values);
        let sessionChanged = false;
        await inStore(stub, async (store) => {
          const original = crypto.subtle[phase].bind(crypto.subtle);
          vi.spyOn(crypto.subtle, phase).mockImplementation(async (...args) => {
            if (reason === "stop") store.patch(saved, { stopRequested: 1 });
            if (reason === "hide") store.hideSession(saved.sessionId);
            if (reason === "expire") store.patch(saved, { deadline: 1 });
            if (reason === "disable") values.CLOUD_AGENT_ENABLED = "false";
            if (reason === "session changed") sessionChanged = true;
            return original(...args);
          });
          expect(
            await prepareCloudAgentRequest(settings, store, stub.id.toString(), saved.id, () =>
              sessionChanged ? "会话已重置" : undefined,
            ),
          ).toBeNull();
          const task = store.get(saved.id)!;
          if (phase === "encrypt" || reason === "hide") expect(task.request).toBe("");
          if (reason === "hide") expect(task.prompt).toBe("");
          expect(task.submittedAt).toBe(0);
          expect(task.units).toBe(0);
        });
      },
    );
  }

  it("checks the feature gate and host eligibility before reading callback keys", async () => {
    const { stub, saved } = await setup();
    await inStore(stub, async (store) => {
      for (const [enabled, reason] of [
        ["false", undefined],
        ["true", "插件已停用"],
      ] as const) {
        const settings = configuredEnv({ CLOUD_AGENT_ENABLED: enabled, AGT_CALLBACK_KEYS: "{}" });
        expect(
          await prepareCloudAgentRequest(
            settings,
            store,
            stub.id.toString(),
            saved.id,
            () => reason,
          ),
        ).toBeNull();
      }
      expect(store.get(saved.id)?.request).toBe("");
    });
  });

  it.each<Partial<CloudTask>>([{ submittedAt: 123 }, { unconfirmed: 1 }])(
    "never rebuilds a missing body after an earlier attempt: %j",
    async (change) => {
      const { stub, saved } = await setup(change);
      await inStore(stub, async (store) => {
        await expect(
          prepareCloudAgentRequest(enabledEnv, store, stub.id.toString(), saved.id, eligible),
        ).rejects.toMatchObject({ code: "cloud_request_missing" });
        expect(store.get(saved.id)?.request).toBe("");
      });
    },
  );

  it.each([
    { scope: "another-service" },
    { externalId: "wechatai:another-account" },
    { workspaceId: "" },
    { profiles: ["another-profile"] },
  ])("requires the persisted account mapping and frozen profile: %j", async (change) => {
    const { stub, saved } = await setup();
    await inStore(stub, async (store) => {
      store.saveProvision({ ...store.provision()!, ...change });
      await expect(
        prepareCloudAgentRequest(enabledEnv, store, stub.id.toString(), saved.id, eligible),
      ).rejects.toMatchObject({ code: "cloud_provision_missing" });
      expect(store.get(saved.id)?.request).toBe("");
    });
  });

  it("does not regenerate ciphertext that cannot be decrypted in this task's context", async () => {
    const { stub, saved } = await setup();
    await inStore(stub, async (store) => {
      await prepareCloudAgentRequest(enabledEnv, store, stub.id.toString(), saved.id, eligible);
      const request = store.get(saved.id)!.request;
      const other = { ...saved, id: crypto.randomUUID(), sourceId: crypto.randomUUID(), request };
      store.save(other);
      await expect(
        prepareCloudAgentRequest(enabledEnv, store, stub.id.toString(), other.id, eligible),
      ).rejects.toThrow();
      expect(store.get(other.id)).toMatchObject({ request, submittedAt: 0 });
    });
  });

  it.each(["invalid", "http://external.example.com", "https://example.com/path"])(
    "rejects an invalid or insecure callback origin: %s",
    async (callbackOrigin) => {
      const { stub, saved } = await setup({ callbackOrigin });
      await inStore(stub, async (store) => {
        await expect(
          prepareCloudAgentRequest(enabledEnv, store, stub.id.toString(), saved.id, eligible),
        ).rejects.toMatchObject({ code: "cloud_callback_origin" });
        expect(store.get(saved.id)?.request).toBe("");
      });
    },
  );
});
