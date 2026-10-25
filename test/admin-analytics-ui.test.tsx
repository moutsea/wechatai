import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Admin } from "../src/client/pages/admin";
import { AnalyticsReport, AnalyticsResult } from "../src/client/pages/admin-analytics";
import type { AdminAnalytics } from "../src/shared/analytics";

const report = (): AdminAnalytics => ({
  traffic: {
    range: { from: "2026-10-23", to: "2026-10-25", days: 3 },
    totals: { pv: 10, visitorDays: 6, sessions: 4, pagesPerSession: 2.5 },
    daily: [{ day: "2026-10-23", pv: 10, uv: 6, sessions: 4 }],
    sources: [{ label: "utm:newsletter", pv: 10, visitorDays: 6 }],
    sourceDepth: [{ label: "utm:newsletter", pv: 10, sessions: 4, pagesPerSession: 2.5 }],
    topPages: [{ label: "/pricing", pv: 10, visitorDays: 6 }],
    countries: [],
    devices: [],
  },
  conversions: {
    total: 2,
    unattributed: 1,
    sessions: 5,
    rate: 0.4,
    rows: [{ label: "/pricing", sessions: 4, signups: 1, rate: 0.25 }],
  },
});

describe("admin analytics presentation", () => {
  it("opens the traffic tab by URL with the requested period and no account sync controls", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/app/admin?tab=analytics&analyticsDays=30"]}>
        <Admin />
      </MemoryRouter>,
    );
    expect(html).toContain("流量统计");
    expect(html).toContain('value="30" selected=""');
    expect(html).toContain("正在加载流量统计");
    expect(html).not.toContain("同步最新数据");
    expect(html).not.toContain("账户统计已覆盖");
  });

  it("labels daily UV totals and renders full conversion totals rather than summing visible rows", () => {
    const html = renderToStaticMarkup(<AnalyticsReport data={report()} />);
    for (const text of [
      "访问量（PV）",
      "访客数（按天去重）",
      "非跨天独立人数",
      "40.0%",
      "25.0%",
      "2 个注册会话 / 5 个活跃会话",
      "未归因注册会话：1",
      "UTM · newsletter",
      "热门页面",
      "/pricing",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("暂无访问或注册记录");
  });

  it("keeps missing dates visible as zero and safely renders single-day or 90-day charts", () => {
    const data = report();
    const html = renderToStaticMarkup(<AnalyticsReport data={data} />);
    expect(html).toContain('aria-label="2026-10-23：10"');
    expect(html).toContain('aria-label="2026-10-24：0"');
    expect(html).toContain('aria-label="2026-10-25：0"');
    for (const days of [1, 90]) {
      const from = "2026-07-28";
      data.traffic.range = {
        from,
        to: new Date(Date.parse(from) + (days - 1) * 86400000).toISOString().slice(0, 10),
        days,
      };
      data.traffic.daily = [];
      const result = renderToStaticMarkup(<AnalyticsReport data={data} />);
      expect(result.match(/aria-label="\d{4}-\d{2}-\d{2}：0"/g)).toHaveLength(days);
      expect(result).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it("separates loading and failures from a successfully empty report", () => {
    const retry = () => {};
    for (const state of [
      { status: "loading" },
      { status: "error", message: "流量统计加载失败，请重试。" },
    ] as const) {
      const html = renderToStaticMarkup(<AnalyticsResult state={state} retry={retry} />);
      expect(html).not.toContain("暂无");
      expect(html).not.toContain("0.0%");
      if (state.status === "error") {
        expect(html).toContain('role="alert"');
        expect(html).toContain("重新加载");
      }
    }
    const data = report();
    data.traffic.totals = { pv: 0, visitorDays: 0, sessions: 0, pagesPerSession: 0 };
    data.traffic.daily = [];
    data.traffic.sources = [];
    data.traffic.topPages = [];
    data.traffic.sourceDepth = [];
    data.conversions = { total: 0, unattributed: 0, sessions: 0, rate: 0, rows: [] };
    const html = renderToStaticMarkup(
      <AnalyticsResult state={{ status: "success", data }} retry={retry} />,
    );
    expect(html).toContain("该时间范围暂无访问或注册记录");
    expect(html).toContain("0.0%");
    expect(html).not.toContain('role="alert"');
    data.conversions = { total: 1, unattributed: 1, sessions: 1, rate: 1, rows: [] };
    const orphan = renderToStaticMarkup(<AnalyticsReport data={data} />);
    expect(orphan).toContain("未归因注册会话：1");
    expect(orphan).not.toContain("暂无访问或注册记录");
  });

  it("escapes collected labels and never turns them into executable links", () => {
    const data = report();
    data.traffic.sources[0].label = '<img src=x onerror="alert(1)">';
    data.traffic.topPages[0].label = "javascript:alert(1)";
    data.conversions.rows[0].label = "<script>alert(1)</script>";
    const html = renderToStaticMarkup(<AnalyticsReport data={data} />);
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("href=");
  });
});
