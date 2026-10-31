import { describe, expect, it } from "vitest";
import {
  api,
  connect,
  future,
  list,
  modelNetwork,
  note,
  response,
  save,
  savePlugin,
  send,
  setup,
  systemText,
} from "./personal-assistant-helpers";

async function setupPlugins() {
  const { stub, model } = await setup();
  await connect(stub);
  const personal = await savePlugin(stub, model.id, { reminderConnectionId: "default" });
  const ds = await api(stub, "plugin.save", {
    pluginId: "wechatai/web-research",
    name: "DS Chat",
    modelId: model.id,
    shortcut: "ds",
    searchProvider: "tavily",
    searchEndpoint: "https://search.example.com/search",
    apiKey: "test-search-key",
  });
  expect(ds.ok, JSON.stringify(ds)).toBe(true);
  const savedNote = await save(stub, personal.id, {
    ...note,
    title: "private-note-marker",
    content: "private-note-body-marker",
  });
  expect(savedNote.ok).toBe(true);
  const savedReminder = await save(stub, personal.id, {
    ...note,
    kind: "reminder",
    title: "private-reminder-marker",
    remindAt: future(),
  });
  expect(savedReminder.ok, JSON.stringify(savedReminder)).toBe(true);
  return {
    stub,
    personal,
    ds: ds.data,
    savedNote: savedNote.data,
    savedReminder: savedReminder.data,
  };
}

function expectWebToolsOnly(body: Record<string, unknown>) {
  const tools = body.tools as { function: { name: string } }[];
  expect(tools.map((tool) => tool.function.name).sort()).toEqual(["web_fetch", "web_search"]);
  expect(systemText(body)).not.toContain("【当前记录状态】");
}

describe("personal assistant and DS Chat isolation", () => {
  it("leaves the record unchanged even if DS Chat returns an unsupported deletion claim", async () => {
    const { stub, personal, savedReminder } = await setupPlugins();
    const claim = "已删除提醒\n\n- private-reminder-marker";
    const bodies = modelNetwork("chat-completions", [response("chat-completions", claim)]);
    const before = await list(stub, personal.id, { kind: "reminder" });
    expect(before.data.records).toContainEqual(expect.objectContaining(savedReminder));
    await send(stub, "/use ds");
    // A model's text is not evidence that an operation ran, even when it resembles a receipt.
    expect(await send(stub, "删除 private-reminder-marker 提醒")).toBe(claim);
    expectWebToolsOnly(bodies[0]);
    expect(systemText(bodies[0])).toContain("你没有个人助理的记录工具");
    expect(await list(stub, personal.id, { kind: "reminder" })).toEqual(before);
  });

  it("rejects a personal_delete tool call from DS Chat without changing the reminder", async () => {
    const { stub, personal, savedReminder } = await setupPlugins();
    const before = await list(stub, personal.id, { kind: "reminder" });
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "", [
        {
          id: "unauthorized-delete",
          name: "personal_delete",
          args: { id: savedReminder.id, revision: savedReminder.revision },
        },
      ]),
      response("chat-completions", "已删除提醒"),
    ]);
    await send(stub, "/use ds");
    await expect(send(stub, "删除 private-reminder-marker 提醒")).rejects.toMatchObject({
      code: "research_no_sources",
      message: "模型请求了无效工具或参数",
    });
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1])).toContain("工具名称或参数无效");
    expect(await list(stub, personal.id, { kind: "reminder" })).toEqual(before);
  });

  it("does not send personal records or the assistant conversation after switching to DS Chat", async () => {
    const { stub, personal, ds } = await setupPlugins();
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "private-note-marker / private-reminder-marker"),
      response("chat-completions", "你好"),
    ]);
    await send(stub, "/use 助理");
    const personalSession = (await stub.snapshot()).currentSession!.id;
    await send(stub, "assistant-conversation-marker");
    expect(systemText(bodies[0])).toContain("private-note-marker");
    expect(systemText(bodies[0])).toContain("private-reminder-marker");

    expect(await send(stub, "/use ds")).toContain("已切换到");
    expect((await stub.snapshot()).currentSession).toMatchObject({ pluginInstanceId: ds.id });
    expect((await stub.snapshot()).currentSession!.id).not.toBe(personalSession);
    await send(stub, "你好");
    expect(bodies).toHaveLength(2);
    expectWebToolsOnly(bodies[1]);
    expect(JSON.stringify(bodies[1])).not.toMatch(/private-(note|reminder)|assistant-conversation/);
    expect(await api(stub, "personal.list", { pluginId: ds.id })).toMatchObject({
      ok: false,
      error: "plugin_type",
    });
    await send(stub, "/use 助理");
    expect((await stub.snapshot()).currentSession).toMatchObject({
      id: personalSession,
      pluginInstanceId: personal.id,
    });
  });

  it("retains a one-off assistant reply in DS Chat history without exposing later record updates", async () => {
    const { stub, personal, savedNote } = await setupPlugins();
    const bodies = modelNetwork("chat-completions", [
      response("chat-completions", "private-note-marker / private-reminder-marker"),
      response("chat-completions", "你好"),
      response("chat-completions", "你好"),
    ]);
    await send(stub, "/use ds");
    const dsSession = (await stub.snapshot()).currentSession!.id;
    await send(stub, "@助理 查看记录");
    expect((await stub.snapshot()).currentSession!.id).toBe(dsSession);
    expect(systemText(bodies[0])).toContain("【当前记录状态】");
    expect((await save(stub, personal.id, { title: "updated-note-marker" }, savedNote)).ok).toBe(
      true,
    );

    await send(stub, "/use 助理");
    await send(stub, "/use ds");
    expect((await stub.snapshot()).currentSession!.id).toBe(dsSession);
    await send(stub, "你好");
    expectWebToolsOnly(bodies[1]);
    expect(JSON.stringify(bodies[1])).toContain("private-note-marker");
    expect(JSON.stringify(bodies[1])).toContain("private-reminder-marker");
    expect(JSON.stringify(bodies[1])).not.toMatch(/private-note-body-marker|updated-note-marker/);

    await send(stub, "/wx new");
    await send(stub, "你好");
    expect(bodies).toHaveLength(3);
    expectWebToolsOnly(bodies[2]);
    expect(JSON.stringify(bodies[2])).not.toMatch(/private-(note|reminder)|updated-note-marker/);
  });
});
