import type { ChannelInput } from "../src/shared/types";
import { CHANNEL_PROVIDERS, selectChannelProvider } from "../src/shared/channel-providers";
import { afterEach, expect, it } from "vitest";
import "../src/shared/i18n/load";
import { alternateLocales, hasRegisteredTranslation } from "../src/shared/i18n";
import koreanPages from "../src/shared/i18n/ko/dashboard";
import { getPageSeo, localizedDashboardPaths, renderSitemap } from "../src/shared/seo";
import { llmsFullText, llmsText } from "../src/shared/llms-docs";
import { authReturnPath } from "../src/shared/auth";
import { localizedHref } from "../src/client/locale";
import { ledgerNote, workspaceError, workspaceLabel } from "../src/client/workspace-copy";
import { pluginUpgradeReturnPath, rememberPluginUpgrade } from "../src/client/plugin-upgrade";
import { ApiError } from "../src/client/api";
import { modelImportMessage } from "../src/client/channel-setup";
import { remoteAgentConnection } from "../src/client/remote-agent-status";
import { characters, presetInstructions } from "../src/shared/i18n/ko/copy/roleplay-characters";
import { createRoleplayFromPreset, roleplayPresets } from "../src/shared/roleplay-presets";

const han = /\p{Script=Han}/u;
afterEach(() => sessionStorage.clear());

it.each(koreanPages)("registers private Korean metadata for $path", ({ path }) => {
  const localized = `/ko${path}`;
  expect(localizedDashboardPaths()).toContain(localized);
  expect(hasRegisteredTranslation("ko", path)).toBe(true);
  expect(alternateLocales(path)).toContain("ko");
  expect(getPageSeo(localized)).toMatchObject({ htmlLang: "ko-KR", indexable: false });
  expect(getPageSeo(localized).title).not.toMatch(han);
  expect(renderSitemap()).not.toContain(`https://wechatai.app${localized}`);
  expect(llmsText).not.toContain(localized);
  expect(llmsFullText).not.toContain(localized);
  expect(getPageSeo(path).indexable).toBe(false);
});

it("preserves dynamic task and public link suffixes using registered destinations", () => {
  const task = "/app/tasks/task-123?source=history#result";
  expect(localizedHref("ko", task)).toBe(`/ko${task}`);
  expect(getPageSeo(`/ko${task}`)).toMatchObject({ htmlLang: "ko-KR", indexable: false });
  expect(alternateLocales(task)).toEqual(["zh-CN", "ko"]);
  expect(localizedHref("ko", "/pricing?interval=year#plan-year")).toBe(
    "/ko/pricing?interval=year#plan-year",
  );
  expect(localizedHref("ko", "/docs/credits?source=workspace#metering")).toBe(
    "/docs/credits?source=workspace#metering",
  );
  expect(hasRegisteredTranslation("ko", "/app/unknown")).toBe(false);
  expect(hasRegisteredTranslation("ko", "/app/tasks/id/nested")).toBe(false);
  for (const locale of ["en", "ja", "es", "pt"] as const) {
    expect(hasRegisteredTranslation(locale, "/app")).toBe(true);
    expect(hasRegisteredTranslation(locale, "/app/channels")).toBe(false);
  }
});

it("keeps Korean return paths and rejects normalized escapes", () => {
  for (const path of [
    "/ko/app/billing?offer=plus_yearly#plans",
    "/ko/app/tasks/a?x=1#result",
    "/ko/app/channels/",
  ]) {
    expect(authReturnPath(path)).toBe(path);
  }
  for (const path of [
    "https://evil.test/ko/app",
    "//evil.test/ko/app",
    "/\\evil.test/ko/app",
    "/ko/app/../../login",
    "/ko/app/%2e%2e/%2e%2e/api/auth/sign-out",
    "/ko/application",
    "/ko/app-other",
  ]) {
    expect(authReturnPath(path)).toBe("/app");
  }
});

it("returns existing plugin upgrade intent to the current workspace language", () => {
  const email = "fixture@example.test";
  rememberPluginUpgrade(email, {
    kind: "wechatai/openclaw",
    action: "edit",
    id: "config?x=1#value",
  });
  const chinese = pluginUpgradeReturnPath(email)!;
  const korean = pluginUpgradeReturnPath(email, "/ko/app")!;
  expect(korean).toBe(`/ko${chinese}`);
  const target = new URL(korean, "https://wechatai.app");
  expect(target.pathname).toBe("/ko/app/plugins");
  expect(target.searchParams.get("config")).toBe("config?x=1#value");
  expect(pluginUpgradeReturnPath("another@example.test", "/ko/app")).toBeNull();
});

it("translates product labels, failures and ledger templates without changing arbitrary content", () => {
  expect(workspaceLabel("ko", "已连接")).toBe("연결됨");
  expect(workspaceLabel("zh-CN", "已连接")).toBe("已连接");
  expect(workspaceLabel("ko", "toString")).toBe("toString");
  expect(workspaceError(new ApiError("请先登录", 401), "ko")).toContain("로그인");
  expect(workspaceError({ code: "plugin_limit", message: "限制" }, "ko")).toContain("Free");
  expect(workspaceError(new Error("unknown failure"), "ko")).not.toMatch(han);
  expect(workspaceError(new Error("原来的错误"), "zh-CN")).toBe("原来的错误");
  expect(ledgerNote("ko", "实际消耗 1.25 credits；抵扣欠额 0.50 credits")).toBe(
    "실제 사용량 1.25 크레딧 · 미납 차감 0.50 크레딧",
  );
  for (const note of [
    "用户自定义中文",
    "用户内容；抵扣欠额 0.50 credits",
    "未知；抵扣欠额 用户内容",
    "toString",
  ]) {
    expect(ledgerNote("ko", note)).toBe(note);
  }
  expect(ledgerNote("zh-CN", "实际消耗 1.25 credits")).toBe("实际消耗 1.25 credits");
});

it("keeps imported model counts and remote agent states identical across languages", () => {
  const result = { total: 14, imported: 5, existing: 4, invalid: 3, incompatible: 2, limited: 1 };
  expect(modelImportMessage(result, 20, "ko").match(/\d+/g)).toEqual(
    modelImportMessage(result, 20).match(/\d+/g),
  );
  expect(modelImportMessage(result, 20, "ko")).not.toMatch(han);
  const connection = { hasKey: true, lastSeen: 1000 };
  expect(remoteAgentConnection(connection, 2000, "ko")).toMatchObject({
    state: "online",
    label: "연결됨",
    connectedBefore: true,
  });
  expect(remoteAgentConnection(connection, 2000)).toMatchObject({
    state: "online",
    label: "已连接",
    connectedBefore: true,
  });
});

it("creates Korean preset drafts while retaining the original preset source", () => {
  for (const preset of roleplayPresets) {
    expect(characters[preset.id]).toBeDefined();
    const source = JSON.stringify(preset);
    const localized = { ...preset, ...characters[preset.id] };
    const form = createRoleplayFromPreset(localized, {
      modelId: "model",
      enabled: true,
      occupiedShortcuts: [],
      instructions: presetInstructions,
    });
    expect(form.name).toBe(localized.character.name);
    expect(form.instructions).toContain(presetInstructions);
    expect(JSON.stringify(form)).not.toMatch(han);
    expect(JSON.stringify(preset)).toBe(source);
  }
});

it("localizes generated provider names while preserving custom channel names", () => {
  const initial: ChannelInput = {
    name: "",
    description: "",
    protocol: "chat-completions" as const,
    baseUrl: "",
    apiKey: "",
    color: "sage" as const,
  };
  const displayName = (name: string) => workspaceLabel("ko", name);
  let form = initial;
  for (const provider of CHANNEL_PROVIDERS) {
    const next = selectChannelProvider(form, provider.id, displayName);
    expect(next.name).toBe(displayName(provider.name));
    expect(next.name).not.toMatch(han);
    expect(next.protocol).toBe(provider.protocol);
    expect(next.baseUrl).toBe(provider.baseUrl);
    expect(selectChannelProvider(initial, provider.id).name).toBe(provider.name);
    expect(
      selectChannelProvider({ ...form, name: "用户自定义渠道" }, provider.id, displayName).name,
    ).toBe("用户自定义渠道");
    form = next;
  }
});
