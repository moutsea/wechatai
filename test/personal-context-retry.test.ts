import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { PersonalRecordsStore } from "../src/server/personal-records";
import { SUMMARY_PROMPT } from "../src/server/context";
import type { Protocol } from "../src/shared/types";
import {
  setup,
  savePlugin,
  send,
  response,
  systemText,
  list,
  note,
} from "./personal-assistant-helpers";

const overflow = () =>
  Response.json(
    {
      error: {
        code: "context_length_exceeded",
        message: "Maximum context length is 16000 tokens",
      },
    },
    { status: 400 },
  );

describe("personal assistant context retries", () => {
  it.each<Protocol>(["chat-completions", "responses", "anthropic"])(
    "compacts and retries %s with a clean draft and journal, committing and charging only once",
    async (protocol) => {
      const { stub, model } = await setup(protocol);
      const plugin = await savePlugin(stub, model.id);
      await send(stub, "/use 助理");
      const sessionId = (await stub.snapshot()).currentSession!.id;
      const runId = crypto.randomUUID();
      await runInDurableObject(stub, (_, state) => {
        for (let i = 0; i < 6; i++)
          for (const role of ["user", "assistant"])
            state.storage.sql.exec(
              "INSERT INTO messages (sessionId,role,content,createdAt) VALUES (?,?,?,?)",
              sessionId,
              role,
              `历史第${i}轮 ${"周末旅行".repeat(30)}`,
              Date.now(),
            );
        // Exercise the durable tool journal used by real WeChat requests.
        state.storage.sql.exec(
          "INSERT INTO inbox(id,payload,state,createdAt,connectionId) VALUES (?,'{}','pending',?,'default')",
          runId,
          Date.now(),
        );
      });
      const requests: Record<string, unknown>[] = [];
      let summaries = 0;
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (String(url).includes("cloudflare-dns.com"))
          return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
        expect(String(url)).toContain("llm.example.com");
        const body = JSON.parse(String(init?.body));
        if (systemText(body) === SUMMARY_PROMPT) {
          summaries++;
          return Response.json(response(protocol, "用户计划周末旅行。"));
        }
        requests.push(body);
        if (requests.length === 2) return overflow();
        if (requests.length === 1 || requests.length === 3)
          return Response.json(
            response(protocol, "", [
              {
                id: requests.length === 1 ? "discarded-call" : "retried-call",
                name: "personal_create",
                args: {
                  ...note,
                  title: requests.length === 1 ? "失败尝试的草稿" : "周末旅行计划",
                },
              },
            ]),
          );
        return Response.json(response(protocol, "已保存"));
      });

      const reply = await send(stub, "记一下周末旅行计划", runId);
      expect(reply).toContain("周末旅行计划");
      expect(reply).not.toContain("失败尝试的草稿");
      expect(requests).toHaveLength(4);
      expect(summaries).toBe(1);
      const retried = JSON.stringify(requests[2]);
      expect(retried).toContain("用户计划周末旅行。");
      expect(retried).not.toContain("历史第0轮");
      expect(retried).not.toContain("discarded-call");
      expect(retried).not.toContain("失败尝试的草稿");
      const records = (await list(stub, plugin.id)).data;
      expect(records.total).toBe(1);
      expect(records.records[0].title).toBe("周末旅行计划");
      expect((await stub.snapshot()).ledger.filter((e) => e.kind === "usage")).toHaveLength(1);
      await runInDurableObject(stub, (_, state) => {
        expect(
          state.storage.sql.exec("SELECT * FROM usage WHERE id=?", runId).toArray(),
        ).toHaveLength(1);
        expect(
          state.storage.sql.exec("SELECT * FROM personal_run_data WHERE id=?", runId).toArray(),
        ).toHaveLength(0);
      });
    },
  );

  it("stops after a second overflow without saving staged records or charging", async () => {
    const { stub, model } = await setup();
    const plugin = await savePlugin(stub, model.id);
    let calls = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes("cloudflare-dns.com"))
        return Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] });
      expect(String(url)).toContain("llm.example.com");
      calls++;
      return calls === 1
        ? Response.json(
            response("chat-completions", "", [
              { id: "draft", name: "personal_create", args: note },
            ]),
          )
        : overflow();
    });
    await expect(send(stub, "@助理 记一下摄影展")).rejects.toThrow("上下文已超限");
    expect(calls).toBe(3);
    expect((await list(stub, plugin.id)).data.total).toBe(0);
    expect((await stub.snapshot()).ledger.filter((e) => e.kind === "usage")).toHaveLength(0);
  });

  it("requires a fresh lookup after reset and still rejects stale revisions and old drafts", async () => {
    const { stub } = await setup();
    await runInDurableObject(stub, (_, state) => {
      const store = new PersonalRecordsStore(state.storage.sql);
      const initial = store.draft("retry");
      const record = initial.save(note);
      state.storage.transactionSync(() => store.commit("retry", initial.changes, null));
      const draft = store.draft("retry");
      draft.query({});
      draft.save({ ...note, title: "尚未提交" });
      const before = draft.snapshot();
      draft.resetForRetry();
      expect(draft.snapshot()).toEqual({ ...before, changes: [], seen: [] });
      expect(() => draft.save({ title: "不能直接更新" }, record.id, record.revision, true)).toThrow(
        "修改前请先查询",
      );

      const concurrent = store.draft("retry");
      concurrent.save({ title: "网页修改后的标题" }, record.id, record.revision);
      state.storage.transactionSync(() => store.commit("retry", concurrent.changes, null, "web"));
      expect(() => draft.resetForRetry()).toThrow("记录已修改或删除");
      expect(draft.snapshot().recordsRevision).toBe(before.recordsRevision);
      expect(() => draft.restore({ changes: [], seen: [] })).toThrow("记录分类已更新");
      expect(store.get("retry", record.id).title).toBe("网页修改后的标题");
    });
  });
});
