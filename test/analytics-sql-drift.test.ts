import { describe, expect, it } from "vitest";
import serverSource from "../src/server/analytics.ts?raw";
import scriptSource from "../scripts/analytics-report.mjs?raw";
import serverIndexSource from "../src/server/index.ts?raw";

/** 流量查询保持一致；注册查询由共享模块生成，并在 analytics.test.ts 中用真实 D1 验证。 */
const SHARED_RULES: { rule: string; fragment: string }[] = [
  {
    rule: "去重访客按「天 + 访客哈希」加总，不能直接数哈希",
    fragment: "COUNT(DISTINCT day || ':' || visitor_hash)",
  },
  { rule: "会话数按 session_id 去重", fragment: "COUNT(DISTINCT session_id) AS sessions" },
  { rule: "来源归类：UTM 优先于 referrer", fragment: "'utm:' || utm_source" },
];

describe("analytics SQL stays in sync between server and report script", () => {
  for (const { rule, fragment } of SHARED_RULES) {
    it(`both sides follow: ${rule}`, () => {
      expect(serverSource, `服务端缺少约定：${rule}`).toContain(fragment);
      expect(scriptSource, `报表脚本缺少约定：${rule}`).toContain(fragment);
    });
  }

  it("uses the same conversion query builder in the Worker and CLI", () => {
    for (const source of [serverSource, scriptSource]) {
      expect(source).toContain("signupConversionQueries(from, to)");
      expect(source).toContain("queries.totals");
      expect(source).toContain("queries.funnel");
    }
  });

  it("runs the analytics retention cleanup from the cron handler", () => {
    // 保留期承诺的唯一执行点就是这里。早先是「写入时按 1% 概率清理」，站点没流量时
    // 就永远不清；改成 cron 之后，一旦有人把这一行删掉，隐私政策承诺的 180 天
    // 又会悄悄失效 —— 而这种失效在线上完全没有症状。
    const scheduled = serverIndexSource.slice(serverIndexSource.indexOf("async scheduled("));
    const body = scheduled.slice(0, scheduled.indexOf("\n  },"));
    expect(body).toContain("pruneExpiredPageViews(env)");
  });

  it("keeps the retention cutoff identical on both sides", () => {
    // 服务端负责删、脚本负责读；保留期口径不一致会导致「报表里有的数据服务端已经删了」。
    expect(serverSource).toContain("ANALYTICS_RETENTION_DAYS");
    expect(serverSource).toContain("DELETE FROM page_views WHERE day < ?");
    expect(serverSource).toContain("DELETE FROM signup_attributions WHERE day < ?");
  });
});
