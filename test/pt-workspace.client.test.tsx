import { formatCopy } from "../src/shared/i18n/dashboard";
import { grokSetupPrompt, grokReopenPrompt } from "../src/shared/grok-bot";
import { afterEach, describe, expect, it } from "vitest";
import { clearRegisteredTranslations, registerTranslations } from "../src/shared/i18n";
import ptDashboard from "../src/shared/i18n/pt/dashboard";
import { localizedHref } from "../src/client/locale";
import { authReturnPath } from "../src/shared/auth";
import {
  getPageSeo,
  localizedDashboardPaths,
  publishedLocalizedPaths,
  renderSitemap,
} from "../src/shared/seo";
import { pluginUpgradeReturnPath, rememberPluginUpgrade } from "../src/client/plugin-upgrade";
import { workspaceLedgerNote } from "../src/client/workspace-copy";
import { workspaceCopy } from "../src/shared/i18n/pt/copy/workspace";

afterEach(() => {
  clearRegisteredTranslations();
  sessionStorage.clear();
});

describe("Portuguese workspace route boundaries", () => {
  it("prerenders every static workspace page while keeping private routes out of public indexes", () => {
    registerTranslations("pt", ptDashboard);
    expect(ptDashboard).toHaveLength(12);
    for (const page of ptDashboard) {
      const path = `/pt${page.path}`;
      expect(localizedDashboardPaths()).toContain(path);
      expect(getPageSeo(path)).toMatchObject({
        htmlLang: "pt-BR",
        indexable: false,
        title: page.title,
      });
      expect(getPageSeo(path).canonical).toBeUndefined();
      expect(publishedLocalizedPaths()).not.toContain(path);
      expect(renderSitemap()).not.toContain(path);
    }
    expect(getPageSeo("/pt/app/tasks/task-1?from=list#result")).toMatchObject({
      htmlLang: "pt-BR",
      indexable: false,
    });
  });

  it("preserves children and full suffixes, while untranslated tutorials keep their available address", () => {
    registerTranslations("pt", ptDashboard);
    for (const path of [
      "/app/billing?offer=plus#plans",
      "/app/tasks/task-1?query=a%23b#part#second",
      "/app/missing",
    ]) {
      expect(localizedHref("pt", path)).toBe(`/pt${path}`);
    }
    expect(localizedHref("pt", "/docs/credits#metering")).toBe("/docs/credits#metering");
    expect(localizedHref("en", "/app/tasks/task-1")).toBe("/app/tasks/task-1");
  });

  it("keeps valid login return intent and rejects normalized escapes", () => {
    for (const path of [
      "/pt/app/channels?channel=abc#settings",
      "/pt/app/tasks/task-1?source=list#result",
      "/pt/app/admin",
      "/app/billing?checkout=cancelled#plans",
    ])
      expect(authReturnPath(path)).toBe(path);
    for (const path of [
      "https://evil.example/pt/app",
      "//evil.example/pt/app",
      "/\\evil.example/pt/app",
      "/pt/app/../../login",
      "/pt/app/%2e%2e/%2e%2e/api/auth/sign-out",
      "/pt/application",
      "/pt/app/..%5c..%5clogin",
      "/pt/app/../pricing",
    ]) {
      expect(authReturnPath(path), path).toBe(
        path === "/pt/app/../pricing" ? "/pt/pricing" : "/app",
      );
    }
  });

  it("returns to the localized plugin configuration and supports existing saved upgrade intent", () => {
    rememberPluginUpgrade("fixture@example.test", {
      kind: "wechatai/openclaw",
      action: "edit",
      id: "config 1",
    });
    expect(pluginUpgradeReturnPath("fixture@example.test", "/pt/app")).toBe(
      "/pt/app/plugins?plugin=wechatai%2Fopenclaw&action=edit&config=config+1",
    );
    expect(pluginUpgradeReturnPath("fixture@example.test")).toBe(
      "/app/plugins?plugin=wechatai%2Fopenclaw&action=edit&config=config+1",
    );
  });

  it("provides Portuguese values and retains every interpolation", () => {
    for (const [source, translated] of Object.entries(workspaceCopy)) {
      expect(translated, source).not.toMatch(/\p{Script=Han}/u);
      expect(
        [...translated.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)].map((match) => match[1]).sort(),
        source,
      ).toEqual(
        source.startsWith("费用说明.")
          ? ["credits"]
          : [...source.matchAll(/(?<!\{)\{(\w+)\}(?!\})/g)].map((match) => match[1]).sort(),
      );
    }
  });
});

it("localizes generated ledger notes without changing amounts or custom notes", () => {
  expect(workspaceLedgerNote("实际消耗 0.548 credits", "pt")).toBe("Consumo efetivo 0.548 credits");
  expect(workspaceLedgerNote("每日赠送；抵扣欠额 2.340 credits", "pt")).toBe(
    "Créditos diários. Abatimento do saldo devedor de 2.340 credits",
  );
  expect(workspaceLedgerNote("管理员自定义中文说明", "pt")).toBe("管理员自定义中文说明");
  expect(workspaceLedgerNote("通知", "pt")).toBe("通知");
  expect(workspaceLedgerNote("每日赠送", "zh-CN")).toBe("每日赠送");
});

it("localizes connector instructions while retaining credentials, names and protocol fields", () => {
  const translate = (text: string, values: Record<string, string | number> = {}) =>
    formatCopy(workspaceCopy[text] ?? text, values);
  const prompt = grokSetupPrompt(
    { endpoint: "https://example.test/api/grok/mcp", token: "fixture-token", shortcut: "my-bot" },
    translate,
  );
  expect(prompt).toContain("https://example.test/api/grok/mcp");
  expect(prompt).toContain("Authorization: Bearer fixture-token");
  expect(prompt).toContain("@my-bot");
  expect(prompt).toContain("「微伴」");
  expect(prompt).toContain("「微伴微信任务」");
  expect(prompt).toContain("wechatai_register_webhook");
  expect(prompt.replaceAll("微伴微信任务", "").replaceAll("微伴", "")).not.toMatch(
    /\p{Script=Han}/u,
  );
  expect(
    grokReopenPrompt({ shortcut: "my-bot" }, translate)
      .replaceAll("微伴微信任务", "")
      .replaceAll("微伴", ""),
  ).not.toMatch(/\p{Script=Han}/u);
  expect(grokReopenPrompt({ shortcut: "my-bot" })).toContain(
    "微伴的 Webhook 登记已重新开放，30 分钟内有效",
  );
});
