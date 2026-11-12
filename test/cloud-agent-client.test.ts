import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CloudAgentClient,
  cloudJobBody,
  hasCompleteCloudAnswer,
  parseJob,
  type CloudAgentClientConfig,
} from "../src/server/cloud-agent-client";

const config: CloudAgentClientConfig & { model: string } = {
  origin: "https://agt.example.com",
  appId: "app-one",
  appKey: "test-app-key",
  tenantId: "tenant-one",
  agentId: "wechatai-v1",
  model: "test-model",
};
const queued = { id: "job-one", workspaceId: "workspace-one", status: "queued" };
const appUser = {
  id: "internal-user",
  appId: config.appId,
  tenantId: config.tenantId,
  externalId: "account-external-id",
};
const workspace = {
  id: "workspace-one",
  tenantId: config.tenantId,
  name: "stable-account-workspace",
  accessMode: "restricted",
};

function network(reply: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return reply(request);
    }),
  );
  return requests;
}
afterEach(() => vi.unstubAllGlobals());

describe("AGT client protocol", () => {
  it("registers an application user and restricted workspace, then configures the bounded profile", async () => {
    const requests = network((request) => {
      if (request.url.endsWith("/users")) return Response.json({ appUser }, { status: 201 });
      if (request.url.endsWith("/ensure")) return Response.json({ workspace });
      return Response.json({ ok: true });
    });
    const client = new CloudAgentClient(config);
    expect(await client.ensureAppUser("account-external-id")).toBe("internal-user");
    expect(await client.ensureWorkspace("stable-account-workspace")).toBe("workspace-one");
    await client.configureAgent("workspace-one");
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/apps/app-one/users",
      "/api/workspaces/ensure",
      "/api/workspaces/workspace-one/agents/wechatai-v1",
    ]);
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(request.headers.get("authorization")).toBe(`Bearer ${config.appKey}`);
      expect(request.redirect).toBe("manual");
    }
    expect(await requests[0].json()).toEqual({ externalId: "account-external-id" });
    expect(await requests[1].json()).toEqual({
      name: "stable-account-workspace",
      accessMode: "restricted",
    });
    expect(await requests[2].json()).toMatchObject({
      id: "wechatai-v1",
      model: "test-model",
      policy: {
        maxConcurrentJobs: 1,
        maxSteps: 12,
        allowTools: ["memory_search", "remember_memory"],
      },
      delegation: { visibility: "private", allowFrom: [] },
      sessionAccess: { visibility: "self", sendTo: [] },
    });
  });

  it("maps only known safe failures to actionable codes", () => {
    const failed = { ...queued, status: "failed" };
    expect(
      parseJob({
        ...failed,
        error: "Model context window exceeded; enable context compaction or reduce the request",
      }),
    ).toMatchObject({ failureCode: "model_context_limit" });
    const unknown = parseJob({ ...failed, error: "Provider error with secret=private" });
    expect(unknown).not.toHaveProperty("failureCode");
    expect(JSON.stringify(unknown)).not.toContain("private");
  });

  it.each([
    [400, "model_request_invalid"],
    [401, "model_auth"],
    [402, "model_payment"],
    [403, "model_permission"],
    [404, "model_not_found"],
    [408, "model_unavailable"],
    [409, "model_unavailable"],
    [422, "model_request_invalid"],
    [429, "model_rate_limit"],
    [503, "model_unavailable"],
  ])("recognizes structured and exact legacy model failures (%s)", (status, code) => {
    for (const diagnosis of [
      { failureCode: code, error: "private-upstream-text" },
      { error: `Model provider request failed (${status})` },
    ]) {
      const job = parseJob({ ...queued, status: "failed", ...diagnosis });
      expect(job.failureCode).toBe(code);
      expect(job).not.toHaveProperty("error");
      expect(JSON.stringify(job)).not.toContain("private-upstream-text");
    }
  });

  it("rejects untrusted diagnoses and does not attach model failures to other statuses", () => {
    for (const diagnosis of [
      { failureCode: "private-text" },
      { failureCode: "constructor" },
      { failureCode: {} },
      { error: "Model provider request failed (401) private-secret" },
      { error: "Tool failed: Model provider request failed (401)" },
    ]) {
      const job = parseJob({ ...queued, status: "failed", ...diagnosis });
      expect(job).not.toHaveProperty("failureCode");
      expect(job).not.toHaveProperty("error");
    }
    for (const status of ["queued", "running", "completed", "cancelled"]) {
      expect(parseJob({ ...queued, status, failureCode: "model_auth" })).not.toHaveProperty(
        "failureCode",
      );
    }
  });

  it.each([
    { appId: "other-app" },
    { tenantId: "other-tenant" },
    { externalId: "other-account" },
    { appId: undefined },
    { tenantId: undefined },
    { externalId: undefined },
  ])("rejects an unverified application user identity (%j)", async (change) => {
    network(() => Response.json({ appUser: { ...appUser, ...change } }));
    await expect(
      new CloudAgentClient(config).ensureAppUser(appUser.externalId),
    ).rejects.toMatchObject({ code: "cloud_agent_identity", status: 502 });
  });

  it.each([
    { tenantId: "other-tenant" },
    { name: "other-account-workspace" },
    { accessMode: "tenant" },
    { tenantId: undefined },
    { name: undefined },
    { accessMode: undefined },
  ])("rejects an unverified workspace identity or isolation mode (%j)", async (change) => {
    network(() => Response.json({ workspace: { ...workspace, ...change } }));
    await expect(
      new CloudAgentClient(config).ensureWorkspace(workspace.name),
    ).rejects.toMatchObject({ code: "cloud_agent_identity", status: 502 });
  });

  it("preserves frozen request bytes and idempotency keys across explicit retries without retrying on its own", async () => {
    const requests = network(() => Response.json(queued, { status: 202 }));
    const client = new CloudAgentClient(config);
    const body = '{ "message": "你好", "workspaceId": "workspace-one" }';
    for (let attempt = 0; attempt < 2; attempt++)
      expect(await client.submit(body, "account-external-id", "stable-key")).toEqual(queued);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).toBe("https://agt.example.com/api/agent/jobs");
      expect(request.headers.get("x-app-user")).toBe("account-external-id");
      expect(request.headers.get("idempotency-key")).toBe("stable-key");
      expect(await request.text()).toBe(body);
    }
    const failed = network(() => Response.json({ error: "busy" }, { status: 503 }));
    await expect(client.submit(body, "account-external-id", "stable-key")).rejects.toMatchObject({
      code: "cloud_agent_failed",
      upstreamStatus: 503,
    });
    expect(failed).toHaveLength(1);
  });

  it("scopes query, cancellation and paginated reconciliation to the mapped user and workspace", async () => {
    const requests = network((request) => {
      if (request.url.endsWith("/cancel")) return Response.json({ cancelled: true });
      if (request.url.includes("?page=1"))
        return Response.json({ jobs: [queued], hasMore: true, nextCursor: "next/cursor+1" });
      return Response.json(queued);
    });
    const client = new CloudAgentClient(config);
    expect(await client.getJob("workspace-one", "job-one", "external-user")).toEqual(queued);
    expect(await client.cancelJob("workspace-one", "job-one", "external-user")).toBe(true);
    expect(await client.listJobs("workspace-one", "external-user", "previous/cursor+1")).toEqual({
      jobs: [queued],
      hasMore: true,
      nextCursor: "next/cursor+1",
    });
    expect(requests.map((request) => request.url)).toEqual([
      "https://agt.example.com/api/agent/workspace-one/jobs/job-one",
      "https://agt.example.com/api/agent/workspace-one/jobs/job-one/cancel",
      "https://agt.example.com/api/agent/workspace-one/jobs?page=1&after=previous%2Fcursor%2B1",
    ]);
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST", "GET"]);
    for (const request of requests) expect(request.headers.get("x-app-user")).toBe("external-user");
    network(() => Response.json({ jobs: [], hasMore: false }));
    expect(await client.listJobs("workspace-one", "external-user")).toEqual({
      jobs: [],
      hasMore: false,
    });
  });

  it("freezes the bounded policy in job requests without requesting result-bearing callbacks", () => {
    const body = cloudJobBody({
      workspaceId: "workspace-one",
      agentId: config.agentId,
      model: config.model,
      conversationId: "conversation-one",
      message: "你好",
      callback: { url: "https://wechatai.example/callback", secret: "per-task-secret" },
    });
    expect(body).toMatchObject({
      workspaceId: "workspace-one",
      conversationId: "conversation-one",
      message: "你好",
      skillLearningMode: "off",
      policy: { maxConcurrentJobs: 1, maxSteps: 12, maxToolCalls: 24, skillLearningMode: "off" },
      callback: { includeResult: false },
    });
  });
});

describe("AGT client response boundaries", () => {
  it.each([
    [409, "cloud_agent_conflict", 502],
    [429, "cloud_agent_failed", 429],
    [500, "cloud_agent_failed", 502],
    [302, "cloud_agent_failed", 502],
  ])(
    "handles HTTP %s without leaking the provider body or making billing claims",
    async (status, code, expectedStatus) => {
      const requests = network(() => new Response("provider-secret: test-app-key", { status }));
      const error = await new CloudAgentClient(config)
        .submit("{}", "external", "key")
        .catch((e) => e);
      expect(error).toMatchObject({ code, status: expectedStatus, upstreamStatus: status });
      expect(error.message).not.toMatch(/provider-secret|test-app-key|未扣|重新发送/);
      expect(requests).toHaveLength(1);
    },
  );

  it("rejects an unexpected successful status and cancels its unread body", async () => {
    const cancel = vi.fn();
    network(() => new Response(new ReadableStream({ cancel }), { status: 201 }));
    await expect(
      new CloudAgentClient(config).submit("{}", "external", "key"),
    ).rejects.toMatchObject({
      code: "cloud_agent_response",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds response size and rejects non-JSON responses", async () => {
    const client = new CloudAgentClient(config);
    network(() => new Response("not-json"));
    await expect(client.getJob("workspace-one", "job-one", "external")).rejects.toMatchObject({
      code: "upstream_format",
    });
    network(() => new Response("x".repeat(2_000_001)));
    await expect(client.getJob("workspace-one", "job-one", "external")).rejects.toMatchObject({
      code: "upstream_too_large",
    });
  });

  it("reports a timeout as uncertain transport failure without resubmitting", async () => {
    const fetch = vi.fn(async () => {
      throw new DOMException("internal provider host", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetch);
    const error = await new CloudAgentClient(config)
      .submit("{}", "external", "key")
      .catch((e) => e);
    expect(error).toMatchObject({ code: "cloud_agent_unreachable", status: 504 });
    expect(error.message).not.toMatch(/internal provider host|未扣|重新发送/);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    {},
    { jobs: [] },
    { jobs: null, hasMore: false },
    { jobs: [], hasMore: true },
    { jobs: [], hasMore: true, nextCursor: "" },
  ])("does not treat a malformed reconciliation page as proof of no jobs (%j)", async (payload) => {
    network(() => Response.json(payload));
    await expect(
      new CloudAgentClient(config).listJobs("workspace-one", "external"),
    ).rejects.toMatchObject({
      code: "cloud_agent_response",
    });
  });

  it("reads result.text and identity fields while ignoring unknown fields", () => {
    expect(
      parseJob({
        ...queued,
        status: "completed",
        tenantId: "tenant-one",
        appId: "app-one",
        appUserId: "internal-user",
        conversationId: "conversation-one",
        unknown: "private",
        result: { text: "已完成", usage: { inputTokens: 10 }, task: { state: "done" } },
      }),
    ).toEqual({
      ...queued,
      status: "completed",
      tenantId: "tenant-one",
      appId: "app-one",
      appUserId: "internal-user",
      conversationId: "conversation-one",
      text: "已完成",
      usage: { inputTokens: 10 },
      task: { state: "done" },
    });
    expect(parseJob({ ...queued, status: "awaiting_approval" }).status).toBe("awaiting_approval");
  });

  it.each([
    { result: { text: "完整回答", finishReason: "stop" }, complete: true },
    { result: { text: "兼容旧版回答" }, complete: true },
    { result: { text: "部分回答", finishReason: "length" }, complete: false },
    {
      result: { text: "部分回答", finishReason: "content_filter", refusal: "无法提供该内容" },
      complete: false,
    },
    {
      result: { text: "拒答说明", finishReason: "stop", refusal: "无法提供该内容" },
      complete: false,
    },
    { result: { text: "未完成的工具调用", finishReason: "tool_calls" }, complete: false },
    { result: { text: "调用异常", finishReason: "error" }, complete: false },
    { result: { text: "未知状态", finishReason: "unknown" }, complete: false },
    { result: { text: "未来协议状态", finishReason: "future_reason" }, complete: false },
    { result: { text: "   ", finishReason: "stop" }, complete: false },
    {
      result: { text: "部分工作", finishReason: "stop", task: { outcome: "partial" } },
      complete: false,
    },
    {
      result: { text: "请补充信息", finishReason: "stop", task: { question: "哪个文件？" } },
      complete: false,
    },
    {
      result: {
        text: "请补充信息",
        finishReason: "stop",
        task: { outcome: "clarification_required" },
      },
      complete: false,
    },
  ])(
    "preserves completion evidence across submit, query and reconciliation (%j)",
    async ({ result, complete }) => {
      const payload = { ...queued, status: "completed", result };
      network((request) =>
        request.url.includes("?page=1")
          ? Response.json({ jobs: [payload], hasMore: false })
          : Response.json(payload, { status: request.method === "POST" ? 202 : 200 }),
      );
      const client = new CloudAgentClient(config);
      const [submitted, queried, page] = await Promise.all([
        client.submit("{}", "external-user", "stable-key"),
        client.getJob("workspace-one", "job-one", "external-user"),
        client.listJobs("workspace-one", "external-user"),
      ]);
      for (const job of [submitted, queried, page.jobs[0]]) {
        expect(job.text).toBe(result.text);
        expect(job.finishReason).toBe(
          result.finishReason === "future_reason" ? "unknown" : result.finishReason,
        );
        expect(job.refusal).toBe("refusal" in result ? result.refusal : undefined);
        expect(hasCompleteCloudAnswer(job)).toBe(complete);
        // Completion evidence must also survive persistence and restart.
        expect(hasCompleteCloudAnswer(JSON.parse(JSON.stringify(job)))).toBe(complete);
      }
    },
  );

  it.each(["queued", "running", "awaiting_approval", "failed", "cancelled"])(
    "does not classify a %s job with text as a complete answer",
    (status) => {
      expect(
        hasCompleteCloudAnswer(
          parseJob({
            ...queued,
            status,
            result: { text: "已有文本", finishReason: "stop" },
          }),
        ),
      ).toBe(false);
    },
  );

  it.each([null, [], {}, { ...queued, status: "unknown" }, { ...queued, workspaceId: "" }])(
    "rejects malformed jobs (%j)",
    (payload) => {
      expect(() => parseJob(payload)).toThrow("任务格式无效");
    },
  );
});

describe("AGT configured origin", () => {
  it.each([
    "http://agt.example.com",
    "https://agt.example.com/path",
    "https://user:pass@agt.example.com",
    "https://agt.example.com?redirect=1",
    "not-a-url",
  ])("rejects an unsafe service address before sending credentials (%s)", (origin) => {
    const requests = network(() => Response.json(queued));
    expect(() => new CloudAgentClient({ ...config, origin })).toThrow("服务地址无效");
    expect(requests).toHaveLength(0);
  });

  it("accepts a local test service and snapshots the configuration", async () => {
    const requests = network(() => Response.json(queued));
    const settings = { ...config, origin: "http://127.0.0.1:8787/" };
    const client = new CloudAgentClient(settings);
    settings.origin = "https://other.example.com";
    await client.getJob("workspace-one", "job-one", "external");
    expect(requests[0].url).toBe("http://127.0.0.1:8787/api/agent/workspace-one/jobs/job-one");
  });
});
