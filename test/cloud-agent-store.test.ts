import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CloudAgentStore, type CloudTask } from "../src/server/cloud-agent-store";

const now = 1_800_000_000_000;
const account = () => env.ACCOUNTS.getByName(crypto.randomUUID());
function inStore<T>(
  stub: ReturnType<typeof account>,
  run: (store: CloudAgentStore, storage: DurableObjectStorage) => T,
) {
  return runInDurableObject(stub, (_, state) => {
    const store = new CloudAgentStore(state.storage);
    store.init();
    return run(store, state.storage);
  });
}

function task(overrides: Partial<CloudTask> = {}): CloudTask {
  return {
    id: crypto.randomUUID(),
    sourceId: crypto.randomUUID(),
    origin: "https://agt.example.com",
    appId: "app-1",
    tenantId: "tenant-1",
    profileId: "profile-v1",
    model: "test-model",
    workspaceName: "account-workspace",
    callbackVersion: "v1",
    callbackOrigin: "https://wechatai.example.com",
    invocation: null,
    request: "encrypted-submit-body",
    submittedAt: 0,
    outcome: null,
    reconcileCursor: "",
    reconcileCandidates: [],
    hidden: 0,
    deliveryStatus: "pending",
    pluginContext: "plugin-1",
    currentSessionId: "session-1",
    pluginId: "plugin-1",
    pluginName: "云端 Agent",
    sessionId: "session-1",
    connectionId: "link-1",
    generation: "generation-1",
    contextStart: now,
    resetAt: 0,
    conversationId: "conversation-1",
    prompt: "测试问题",
    idempotencyKey: crypto.randomUUID(),
    state: "submitting",
    upstreamStatus: "",
    jobId: "",
    createdAt: now,
    updatedAt: now,
    deadline: now + 60_000,
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
    ...overrides,
  };
}

describe("cloud task persistence", () => {
  it("restores provisioning, frozen requests, completion evidence and callback hints after restart", async () => {
    const stub = account();
    const saved = task({
      state: "accepted",
      jobId: "job-1",
      outcome: {
        id: "job-1",
        workspaceId: "workspace-1",
        status: "completed",
        text: "部分结果",
        finishReason: "length",
        refusal: "拒答原因",
      },
      frozen: "frozen-metered-result",
      settled: 1,
      units: 1200,
    });
    const provision = {
      scope: "application-scope",
      profiles: ["profile-v1"],
      externalId: "external-1",
      appUserId: "user-1",
      workspaceId: "workspace-1",
      configured: 1,
      updatedAt: now,
    };
    await inStore(stub, (store) => {
      store.saveProvision(provision);
      store.save(saved);
      store.delivery("delivery-1", saved.id, "payload-hash", "job-1", now);
    });
    await abortAllDurableObjects();
    await inStore(env.ACCOUNTS.get(stub.id), (store) => {
      expect(store.provision()).toEqual(provision);
      expect(store.get(saved.id)).toEqual(saved);
      expect(store.source(saved.sourceId)).toEqual(saved);
      expect(store.byJobId("job-1")).toEqual(saved);
      expect(store.callbackJobs(saved.id)).toEqual(["job-1"]);
      expect(store.delivery("delivery-1", saved.id, "payload-hash", "job-1", now + 1000)).toBe(
        "duplicate",
      );
    });
  });

  it("prevents two tasks from sharing a source message or upstream job, without partial writes", async () => {
    await inStore(account(), (store) => {
      const first = task({ jobId: "job-1", state: "accepted" });
      const second = task();
      store.save(first);
      store.save(second);
      store.save(first);
      const duplicate = task({ sourceId: first.sourceId });
      expect(() => store.save(duplicate)).toThrow();
      expect(store.get(duplicate.id)).toBeUndefined();
      expect(() => store.patch(second, { jobId: first.jobId, state: "accepted" })).toThrow();
      expect(store.get(second.id)).toEqual(second);
      expect(store.source(first.sourceId)?.id).toBe(first.id);
      expect(store.byJobId(first.jobId)?.id).toBe(first.id);
      expect(store.byJobId("")).toBeUndefined();
    });
  });

  it("merges a late response with current stop and settlement state", async () => {
    await inStore(account(), (store) => {
      const snapshot = task();
      store.save(snapshot);
      store.patch(snapshot, { stopRequested: 1, settled: 1, frozen: "frozen-price" });
      const updated = store.patch(snapshot, { jobId: "job-1", state: "accepted" });
      expect(updated).toMatchObject({
        stopRequested: 1,
        settled: 1,
        frozen: "frozen-price",
        jobId: "job-1",
      });
      expect(store.byJobId("job-1")).toEqual(updated);
    });
  });
});

describe("cloud callback inbox", () => {
  it("deduplicates full delivery IDs and rejects changed content, task or job", async () => {
    await inStore(account(), (store) => {
      expect(store.delivery("approval:one", "task-1", "hash", "job-1", now)).toBe("new");
      expect(store.delivery("approval:one", "task-1", "hash", "job-1", now + 1)).toBe("duplicate");
      for (const [taskId, hash, jobId] of [
        ["task-2", "hash", "job-1"],
        ["task-1", "other", "job-1"],
        ["task-1", "hash", "job-2"],
      ]) {
        expect(() => store.delivery("approval:one", taskId, hash, jobId)).toThrow(
          "回调标识与内容不一致",
        );
      }
      expect(store.delivery("approval:two", "task-1", "another-hash", "job-1", now + 100)).toBe(
        "new",
      );
      expect(store.callbackJobs("task-1")).toEqual(["job-1"]);
      store.prune(now + 50);
      expect(store.delivery("approval:two", "task-1", "another-hash", "job-1")).toBe("duplicate");
      store.prune(now + 101);
      expect(store.callbackJobs("task-1")).toEqual([]);
    });
  });

  it("rolls back the callback and wakeup together when its owning transaction fails", async () => {
    await inStore(account(), (store, storage) => {
      const saved = task({ nextAt: now + 30_000 });
      store.save(saved);
      expect(() =>
        storage.transactionSync(() => {
          store.delivery("delivery-1", saved.id, "hash", "job-1", now);
          store.patch(saved, { nextAt: now });
          throw new Error("persistence failure");
        }),
      ).toThrow("persistence failure");
      expect(store.callbackJobs(saved.id)).toEqual([]);
      expect(store.get(saved.id)).toEqual(saved);
      expect(store.delivery("delivery-1", saved.id, "hash", "job-1", now)).toBe("new");
    });
  });
});

describe("cloud task scheduling and quota", () => {
  it("selects work at its deadline even during backoff, then respects cancellation backoff", async () => {
    await inStore(account(), (store) => {
      expect(store.nextAt(now)).toBeNull();
      const saved = task({ nextAt: now + 30_000, deadline: now + 10_000 });
      store.save(saved);
      expect(store.nextAt(now)).toBe(saved.deadline);
      expect(store.due(now + 9999)).toEqual([]);
      expect(store.due(saved.deadline).map((value) => value.id)).toEqual([saved.id]);
      store.patch(saved, { stopRequested: 1 });
      expect(store.nextAt(now + 10_000)).toBe(saved.nextAt);
      expect(store.due(now + 10_000)).toEqual([]);
      expect(store.active().map((value) => value.id)).toEqual([saved.id]);
    });
  });

  it.each(["completed", "failed", "cancelled"] as const)(
    "respects settlement backoff for a frozen %s outcome while prioritizing live deadlines",
    async (status) => {
      await inStore(account(), (store) => {
        const retryAt = now + 60_000;
        const saved = task({
          state: "accepted",
          jobId: "finished-job",
          outcome: { id: "finished-job", workspaceId: "workspace-1", status },
          deadline: now - 1,
          nextAt: retryAt,
        });
        store.save(saved);
        expect(store.nextAt(now)).toBe(retryAt);
        expect(store.due(now)).toEqual([]);
        expect(store.due(retryAt - 1)).toEqual([]);
        expect(store.due(retryAt)).toEqual([saved]);
        expect(store.active()).toEqual([saved]);
        expect(store.countSince(now)).toBe(1);

        const live = task({ deadline: now + 1000, nextAt: retryAt + 1000 });
        store.save(live);
        expect(store.nextAt(now)).toBe(live.deadline);
        expect(store.due(live.deadline, 1)).toEqual([live]);
        expect(store.due(retryAt).map((value) => value.id)).toEqual([live.id, saved.id]);
      });
    },
  );

  it("retries undelivered terminal results and counts executions independently of history visibility", async () => {
    await inStore(account(), (store) => {
      const pending = task({ state: "completed", nextAt: now + 100 });
      const sent = task({ state: "failed", delivered: 1 });
      const hidden = task({ state: "cancelled", hidden: 1, delivered: 1 });
      const rejected = task({ state: "rejected", delivered: 1 });
      for (const value of [pending, sent, hidden, rejected]) store.save(value);
      expect(store.active()).toEqual([]);
      expect(store.countSince(now)).toBe(3);
      expect(store.countSince(now + 1)).toBe(0);
      expect(store.nextAt(now)).toBe(now + 100);
      expect(store.due(now + 100).map((value) => value.id)).toEqual([pending.id]);
      store.patch(pending, { delivered: 1, deliveryStatus: "sent" });
      expect(store.nextAt(now)).toBeNull();
    });
  });

  it.each([
    ["stopSession", "sessionId"],
    ["stopPlugin", "pluginId"],
    ["stopConnection", "connectionId"],
  ] as const)("%s stops matching work and discards queued results", async (method, column) => {
    await inStore(account(), (store) => {
      const active = task({ state: "accepted", jobId: "job-1", nextAt: now + 1000 });
      const pending = task({ state: "completed" });
      const sent = task({ state: "completed", delivered: 1, deliveryStatus: "sent" });
      const other = task({ [column]: "unrelated" });
      for (const value of [active, pending, sent, other]) store.save(value);
      store[method](active[column], now);
      expect(store.get(active.id)).toMatchObject({
        state: "accepted",
        stopRequested: 1,
        stale: 1,
        nextAt: now,
      });
      expect(store.get(pending.id)).toMatchObject({
        stale: 1,
        delivered: 1,
        deliveryStatus: "stale",
      });
      expect(store.get(sent.id)).toEqual(sent);
      expect(store.get(other.id)).toEqual(other);
    });
  });
});

describe("cloud task history", () => {
  it("keeps pagination stable across tied timestamps, newly arriving tasks and a deleted cursor row", async () => {
    await inStore(account(), (store) => {
      const values = Array.from({ length: 65 }, () => task({ state: "completed", delivered: 1 }));
      for (const value of values) store.save(value);
      store.save(task({ hidden: 1, createdAt: now + 1 }));
      const expected = values
        .map((value) => value.id)
        .sort()
        .reverse();
      const first = store.page();
      expect(first.tasks.map((value) => value.id)).toEqual(expected.slice(0, 30));
      store.remove(first.tasks.at(-1)!.id);
      store.save(task({ createdAt: now + 1000 }));
      const second = store.page(undefined, first.nextCursor!);
      const third = store.page(undefined, second.nextCursor!);
      expect(second.tasks.map((value) => value.id)).toEqual(expected.slice(30, 60));
      expect(third.tasks.map((value) => value.id)).toEqual(expected.slice(60));
      expect(third.nextCursor).toBeNull();
    });
  });

  it("applies the plugin filter to every page", async () => {
    await inStore(account(), (store) => {
      for (let i = 0; i < 35; i++) {
        store.save(task({ pluginId: "selected" }));
        store.save(task({ pluginId: "other" }));
      }
      const first = store.page("selected");
      const second = store.page("selected", first.nextCursor!);
      expect(first.tasks).toHaveLength(30);
      expect(second.tasks).toHaveLength(5);
      expect(
        [...first.tasks, ...second.tasks].every((value) => value.pluginId === "selected"),
      ).toBe(true);
    });
  });

  it.each([
    "",
    "not-a-cursor",
    Buffer.from(JSON.stringify([now, "not-a-uuid"])).toString("base64url"),
  ])("rejects malformed pagination rather than repeating the first page: %s", async (cursor) => {
    await inStore(account(), (store) => {
      expect(() => store.page(undefined, cursor)).toThrow("任务分页信息无效");
    });
  });

  it("erases a cleared session's local content and cached runs, preserving billing and recovery identifiers", async () => {
    await inStore(account(), (store, storage) => {
      const active = task({ prompt: "sensitive-prompt", request: "sensitive-request" });
      const completed = task({
        state: "completed",
        settled: 1,
        units: 1200,
        result: "sensitive-result",
        frozen: "sensitive-metered-result",
      });
      const other = task({ sessionId: "session-2" });
      for (const value of [active, completed, other]) store.save(value);
      storage.sql.exec(
        "INSERT INTO runs (id, sessionId, status, response, createdAt) VALUES (?,NULL,'completed',?,?)",
        completed.id,
        "sensitive-cached-result",
        now,
      );
      storage.sql.exec(
        "INSERT INTO credit_ledger VALUES (?, 'usage', -1200, '云端任务', ?)",
        completed.id,
        now,
      );
      const ledger = storage.sql.exec("SELECT * FROM credit_ledger").toArray();
      store.hideSession(active.sessionId);
      expect(store.get(active.id)).toMatchObject({
        hidden: 1,
        stopRequested: 1,
        stale: 1,
        delivered: 1,
        request: "",
        prompt: "",
      });
      expect(store.get(completed.id)).toMatchObject({
        hidden: 1,
        settled: 1,
        units: 1200,
        result: "",
        frozen: "",
      });
      expect(store.get(other.id)).toEqual(other);
      expect(store.source(active.sourceId)?.id).toBe(active.id);
      const late = store.patch(active, {
        result: "sensitive-late-result",
        outcome: {
          id: "job-1",
          status: "completed",
          workspaceId: "workspace-1",
          text: "sensitive-text",
          refusal: "sensitive-refusal",
          task: { question: "sensitive-question" },
        },
      });
      expect(JSON.stringify(late)).not.toContain("sensitive");
      expect(storage.sql.exec("SELECT * FROM runs WHERE id=?", completed.id).toArray()).toEqual([]);
      expect(storage.sql.exec("SELECT * FROM credit_ledger").toArray()).toEqual(ledger);
      expect(store.page().tasks.map((value) => value.id)).toEqual([other.id]);
      store.hideSession();
      expect(store.page().tasks).toEqual([]);
    });
  });
});
