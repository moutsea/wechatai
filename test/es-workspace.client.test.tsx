import { formatCopy } from "../src/shared/i18n/dashboard";
import { grokSetupPrompt, grokReopenPrompt } from "../src/shared/grok-bot";
import { afterEach, describe, expect, it } from "vitest";
import { clearRegisteredTranslations, registerTranslations } from "../src/shared/i18n";
import esDashboard from "../src/shared/i18n/es/dashboard";
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
import { workspaceCopy } from "../src/shared/i18n/es/copy/workspace";

afterEach(() => {
  clearRegisteredTranslations();
  sessionStorage.clear();
});

describe("Spanish workspace route boundaries", () => {
  it("prerenders every static workspace page while keeping private routes out of public indexes", () => {
    registerTranslations("es", esDashboard);
    expect(esDashboard).toHaveLength(12);
    for (const page of esDashboard) {
      const path = `/es${page.path}`;
      expect(localizedDashboardPaths()).toContain(path);
      expect(getPageSeo(path)).toMatchObject({
        htmlLang: "es",
        indexable: false,
        title: page.title,
      });
      expect(getPageSeo(path).canonical).toBeUndefined();
      expect(publishedLocalizedPaths()).not.toContain(path);
      expect(renderSitemap()).not.toContain(path);
    }
    expect(getPageSeo("/es/app/tasks/task-1?from=list#result")).toMatchObject({
      htmlLang: "es",
      indexable: false,
    });
  });

  it("preserves children and full suffixes, while untranslated tutorials keep their available address", () => {
    registerTranslations("es", esDashboard);
    for (const path of [
      "/app/billing?offer=plus#plans",
      "/app/tasks/task-1?query=a%23b#part#second",
      "/app/missing",
    ]) {
      expect(localizedHref("es", path)).toBe(`/es${path}`);
    }
    expect(localizedHref("es", "/docs/credits#metering")).toBe("/docs/credits#metering");
    expect(localizedHref("en", "/app/tasks/task-1")).toBe("/app/tasks/task-1");
  });

  it("keeps valid login return intent and rejects normalized escapes", () => {
    for (const path of [
      "/es/app/channels?channel=abc#settings",
      "/es/app/tasks/task-1?source=list#result",
      "/es/app/admin",
      "/app/billing?checkout=cancelled#plans",
    ])
      expect(authReturnPath(path)).toBe(path);
    for (const path of [
      "https://evil.example/es/app",
      "//evil.example/es/app",
      "/\\evil.example/es/app",
      "/es/app/../../login",
      "/es/app/%2e%2e/%2e%2e/api/auth/sign-out",
      "/es/application",
      "/es/app/..%5c..%5clogin",
      "/es/app/../pricing",
    ]) {
      expect(authReturnPath(path), path).toBe(
        path === "/es/app/../pricing" ? "/es/pricing" : "/app",
      );
    }
  });

  it("returns to the localized plugin configuration and supports existing saved upgrade intent", () => {
    rememberPluginUpgrade("fixture@example.test", {
      kind: "wechatai/openclaw",
      action: "edit",
      id: "config 1",
    });
    expect(pluginUpgradeReturnPath("fixture@example.test", "/es/app")).toBe(
      "/es/app/plugins?plugin=wechatai%2Fopenclaw&action=edit&config=config+1",
    );
    expect(pluginUpgradeReturnPath("fixture@example.test")).toBe(
      "/app/plugins?plugin=wechatai%2Fopenclaw&action=edit&config=config+1",
    );
  });

  it("provides Spanish values and retains every interpolation", () => {
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
  expect(workspaceLedgerNote("实际消耗 0.548 credits", "es")).toBe("Consumo real 0.548 credits");
  expect(workspaceLedgerNote("每日赠送；抵扣欠额 2.340 credits", "es")).toBe(
    "Créditos diarios. Compensación de deuda de 2.340 credits",
  );
  expect(workspaceLedgerNote("管理员自定义中文说明", "es")).toBe("管理员自定义中文说明");
  expect(workspaceLedgerNote("通知", "es")).toBe("通知");
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
  expect(prompt).toContain("«微伴»");
  expect(prompt).toContain("«微伴微信任务»");
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

it("restores this account's billing locale after checkout or portal and consumes the intent", async () => {
  const { rememberBillingReturn, takeBillingReturn } = await import("../src/client/billing-return");
  for (const result of ["?checkout=success&session_id=fixture", "?checkout=cancelled", ""]) {
    rememberBillingReturn("fixture@example.test", "/es/app/billing?source=plugin#plans");
    expect(takeBillingReturn("other@example.test", `/app/billing${result}`)).toBeNull();
    expect(takeBillingReturn("fixture@example.test", `/app/billing${result}`)).toBe(
      `/es/app/billing?source=plugin${result ? `&${result.slice(1)}` : ""}#plans`,
    );
    expect(takeBillingReturn("fixture@example.test", "/app/billing")).toBeNull();
  }
  rememberBillingReturn("fixture@example.test", "https://evil.test/es/app/billing");
  expect(takeBillingReturn("fixture@example.test", "/app/billing")).toBeNull();
  rememberBillingReturn("fixture@example.test", "/app/billing");
  expect(takeBillingReturn("fixture@example.test", "/app/billing")).toBeNull();
});

it("formats reminder dates in Spanish while retaining the Beijing time zone", async () => {
  const { beijingTime } = await import("../src/shared/personal-assistant");
  const time = Date.parse("2026-11-28T01:05:00Z");
  expect(beijingTime(time, "es")).not.toMatch(/\p{Script=Han}/u);
  expect(beijingTime(time, "es")).toContain("9:05");
  expect(beijingTime(time)).toContain("2026年");
});

it("localizes browser network and malformed-response errors", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MemoryRouter } = await import("react-router-dom");
  const { LocaleProvider } = await import("../src/client/locale");
  const { useWorkspaceError } = await import("../src/client/workspace-copy");
  function Probe() {
    const errorText = useWorkspaceError();
    return (
      <p>
        {errorText(new TypeError("Failed to fetch"))}{" "}
        {errorText(new SyntaxError("Unexpected token"))}
        {errorText({ code: "too_small", path: ["name"], message: "Too small" })}
        {errorText({ issues: [], message: "Invalid input" })}
      </p>
    );
  }
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/es/app"]}>
      <LocaleProvider>
        <Probe />
      </LocaleProvider>
    </MemoryRouter>,
  );
  expect(html).not.toContain("Failed to fetch");
  expect(html).not.toContain("Unexpected token");
  expect(html).not.toContain("Too small");
  expect(html).not.toContain("Invalid input");
  expect(html).toContain("Revisa los campos");
  expect(html).toContain("No se pudo completar la operación");
});
