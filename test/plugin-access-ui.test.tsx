import { OpenClawEditor } from "../src/client/pages/openclaw-editor";
import { RoleplayEditor } from "../src/client/pages/roleplay-editor";
import { PersonalAssistantEditor } from "../src/client/pages/personal-assistant-editor";
import { ImagePluginEditor } from "../src/client/pages/image-plugin-editor";
import { roleplayInputSchema } from "../src/shared/roleplay";
import { personalAssistantInputSchema } from "../src/shared/personal-assistant";
import { imageGenerationInputSchema } from "../src/shared/image-generation";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemo } from "../src/client/demo";
import { useApp } from "../src/client/context";
import { PluginLibrary, PluginConfiguration } from "../src/client/pages/plugin-library";
import { Channels } from "../src/client/pages/channels";
import { openClawInputSchema, type OpenClawPlugin } from "../src/shared/openclaw";
import type { Snapshot } from "../src/shared/types";

vi.mock("../src/client/context", () => ({ useApp: vi.fn() }));
let data: Snapshot;
const noop = () => {};
const plugin = (id: string): OpenClawPlugin => ({
  ...openClawInputSchema.parse({ name: `Agent ${id}`, shortcut: id }),
  id,
  pluginId: "wechatai/openclaw",
  version: "1.0.0",
  createdAt: 1,
  hasKey: true,
  lastSeen: Date.now(),
});
const library = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <PluginLibrary onConfigure={noop} onView={noop} onResume={noop} />
    </MemoryRouter>,
  );
const configuration = (id: string) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <PluginConfiguration
        kind="wechatai/openclaw"
        selectedId={id}
        onSelect={noop}
        busy={false}
        onClose={noop}
        onAdd={noop}
        onEdit={noop}
        onTest={noop}
        onDelete={noop}
        onAction={noop}
        onManage={noop}
        onRecords={noop}
      />
    </MemoryRouter>,
  );
const channels = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <Channels />
    </MemoryRouter>,
  );
const editButton = (html: string) =>
  html
    .match(/<button\b[^>]*>[\s\S]*?修改配置<\/button>/)?.[0]
    .split("<button")
    .at(-1);

beforeEach(async () => {
  data = await createDemo()<Snapshot>("/dashboard");
  data.plan = "free";
  data.plugins = [];
  vi.mocked(useApp).mockReturnValue({
    data,
    base: "/app",
    demo: false,
    isAdmin: false,
    refresh: async () => {},
    request: createDemo(),
    user: { name: "测试", email: "test@example.test" },
    notify: noop,
  });
});

describe("plugin entitlement controls", () => {
  it("offers all seven plugins before the Free slot is used", () => {
    const html = library();
    expect(html.match(/aria-label="配置 /g)).toHaveLength(7);
    expect(html).not.toContain("升级以添加更多");
  });
  it("lets Free users edit their first plugin and offers an upgrade for more", () => {
    data.plugins = [plugin("first")];
    expect(library()).toContain("升级以添加更多");
    expect(editButton(configuration("first"))).toBeDefined();
    expect(editButton(configuration("first"))).not.toContain("disabled");
    expect(configuration("first")).not.toContain("添加另一组配置");
  });
  it("keeps excess configurations visible but disables their editing", () => {
    data.plugins = [plugin("first"), plugin("second")];
    expect(configuration("second")).toContain("已暂停");
    expect(editButton(configuration("second"))).toContain("disabled");
    expect(configuration("second")).toContain("删除配置");
    expect(configuration("second")).toContain("保存别名");
    expect(configuration("second")).toContain("停用插件");
    data.plan = "plus";
    expect(editButton(configuration("second"))).not.toContain("disabled");
    expect(configuration("second")).toContain("添加另一组配置");
  });
  it("keeps configuration and editing available for Plus beyond twenty plugins", () => {
    data.plan = "plus";
    data.plugins = Array.from({ length: 25 }, (_, i) => plugin(`agent${i}`));
    expect(library()).not.toContain("升级以添加更多");
    const html = configuration("agent24");
    expect(html).toContain("添加另一组配置");
    expect(html).not.toContain("已暂停");
    expect(editButton(html)).toBeDefined();
    expect(editButton(html)).not.toContain("disabled");
  });
});

describe("legacy shortcut conflict warnings", () => {
  it("identifies both colliding models and clears the warnings after one alias is changed", () => {
    data.assistants[0].shortcut = "GPT";
    data.assistants[1].shortcut = "gpt";
    const html = channels();
    expect(html).toContain(`修改模型 ${data.assistants[0].name} 的重复别名`);
    expect(html).toContain(`修改模型 ${data.assistants[1].name} 的重复别名`);
    data.assistants[1].shortcut = "writing";
    expect(channels()).not.toContain("重复别名");
  });

  it("allows a Free user to fix a cross-model conflict even on a suspended, disabled plugin", () => {
    data.assistants[0].shortcut = "GPT";
    data.plugins = [plugin("first"), { ...plugin("second"), shortcut: "gpt", enabled: false }];
    expect(library()).toContain("1 组配置的别名重复");
    const html = configuration("second");
    expect(html).toContain("大小写不能用于区分");
    expect(html).toContain("修改暂停配置的别名");
    expect(html).toContain("保存别名");
    expect(editButton(html)).toContain("disabled");
    expect(channels()).toContain("重复别名");
    data.plugins[1].shortcut = "writing";
    expect(library()).not.toContain("别名重复");
    expect(configuration("second")).not.toContain("大小写不能用于区分");
    expect(channels()).not.toContain("重复别名");
  });

  it("provides a direct alias editor for conflicting active plugins too", () => {
    data.plan = "plus";
    data.plugins = [plugin("first"), { ...plugin("second"), shortcut: "FIRST" }];
    expect(library()).toContain("2 组配置的别名重复");
    expect(configuration("second")).toContain("保存别名");
    expect(editButton(configuration("second"))).not.toContain("disabled");
  });
});

describe("legacy numeric plugin editors", () => {
  it.each(["openclaw", "hermes", "roleplay", "image-generation", "personal-assistant"])(
    "opens the full %s editor with the stored alias and permits only that exact number",
    (kind) => {
      const common = { name: "旧配置", shortcut: "valid", modelId: data.assistants[0].id };
      const metadata = {
        id: "legacy",
        shortcut: "１２３",
        version: "1.0.0" as const,
        createdAt: 1,
        hasKey: true,
      };
      const callbacks = { onClose: noop, onSaved: noop };
      const editor =
        kind === "roleplay" ? (
          <RoleplayEditor
            {...callbacks}
            plugin={{
              ...roleplayInputSchema.parse({ ...common, description: "测试角色" }),
              ...metadata,
              pluginId: "wechatai/roleplay",
            }}
          />
        ) : kind === "personal-assistant" ? (
          <PersonalAssistantEditor
            {...callbacks}
            plugin={{
              ...personalAssistantInputSchema.parse(common),
              ...metadata,
              pluginId: "wechatai/personal-assistant",
            }}
          />
        ) : kind === "image-generation" ? (
          <ImagePluginEditor
            {...callbacks}
            plugin={{
              ...imageGenerationInputSchema.parse(common),
              ...metadata,
              version: "1.2.0",
              pluginId: "wechatai/image-generation",
            }}
          />
        ) : (
          <OpenClawEditor
            {...callbacks}
            onComplete={noop}
            kind={kind === "hermes" ? "hermes" : "openclaw"}
            plugin={{
              ...plugin("legacy"),
              ...metadata,
              pluginId: kind === "hermes" ? "wechatai/hermes" : "wechatai/openclaw",
            }}
          />
        );
      const html = renderToStaticMarkup(<MemoryRouter>{editor}</MemoryRouter>);
      expect(html).toContain('value="１２３"');
      expect(html).toContain("可以保留并保存其他设置");
      expect(html).not.toContain("/use １２３");
      const input = html.match(/<input\b[^>]*pattern="[^"]+"[^>]*>/)?.[0];
      const pattern = input?.match(/pattern="([^"]+)"/)?.[1];
      expect(pattern).toBeDefined();
      const validity = new RegExp(pattern!, "v");
      expect(validity.test("１２３")).toBe(true);
      expect(validity.test("１２３4")).toBe(false);
      expect(validity.test("456")).toBe(false);
      expect(validity.test("助理2")).toBe(true);
    },
  );
});
