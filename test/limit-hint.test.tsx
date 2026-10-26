import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LimitHint } from "../src/client/limit-hint";

const render = (code?: string) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <LimitHint code={code} />
    </MemoryRouter>,
  );

describe("LimitHint", () => {
  it("renders nothing without a limit code", () => {
    expect(render()).toBe("");
    expect(render("other_error")).toBe("");
  });

  it("names the limit and offers an upgrade path", () => {
    const html = render("plugin_limit");
    expect(html).toContain("插件数量");
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="/app/billing"');
  });

  it("mentions the plus quota derived from the shared constants", () => {
    // 文案里的额度必须来自常量，避免和 billing/plugin-access 漂移。
    const plugin = render("plugin_limit");
    expect(plugin).toContain("插件不限");
    const links = render("connection_limit");
    expect(links).toContain("10 个微信链接");
  });
});
