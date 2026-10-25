// 运营端访问统计报表：直接读 D1，输出 PV / 去重访客 / 会话 / 人均浏览页数与来源明细。
// 用法：pnpm analytics [--days 7] [--local]
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { signupConversionQueries } from "../src/shared/analytics-queries.ts";

const DAY_OFFSET_SECONDS = 8 * 60 * 60;

function parseArgs(argv) {
  const options = { days: 7, local: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--local") options.local = true;
    else if (arg === "--days") options.days = Number(argv[++i]);
    else if (arg.startsWith("--days=")) options.days = Number(arg.slice(7));
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (!Number.isFinite(options.days) || options.days < 1) throw new Error("--days 需要正整数");
  return options;
}

function shanghaiDay(at = new Date()) {
  return new Date(at.getTime() + DAY_OFFSET_SECONDS * 1000).toISOString().slice(0, 10);
}
function daysAgo(days) {
  return shanghaiDay(new Date(Date.now() - days * 86_400_000));
}

const SOURCE_EXPR = `CASE
  WHEN utm_source <> '' THEN 'utm:' || utm_source
  WHEN referrer_host <> '' THEN referrer_host
  ELSE '' END`;

function query(label, sql, { days, local }) {
  const args = ["exec", "wrangler", "d1", "execute", "wechatai-db", "--json", "--command", sql];
  if (local) args.push("--local");
  else {
    const config = process.env.WECHATAI_WRANGLER_CONFIG || "wrangler.production.local.jsonc";
    if (!existsSync(config))
      throw new Error(
        `找不到 ${config}，无法查询线上数据库。加 --local 查本地库，或先按 docs/deployment.md 创建该配置。`,
      );
    args.push("--remote", "--config", config, "--env", "production");
  }
  // 默认 maxBuffer 只有 1MB，90 天的明细足够把它撑爆；给足余量。
  const result = spawnSync("pnpm", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    // wrangler 有时会因为登录态/网络挂住；宁可报错也不要一直等下去。
    timeout: 180_000,
  });
  if (result.error) {
    if (result.error.code === "ETIMEDOUT")
      throw new Error(`${label} 查询超时（180 秒）。检查网络，或先 pnpm exec wrangler login。`);
    throw result.error;
  }
  const output = `${result.stdout ?? ""}`.trim();
  // wrangler 偶尔会在 JSON 前打印提示行，从第一个 [ 或 { 开始取。
  const start = output.search(/[[{]/);
  if (start < 0) throw new Error(`${label} 没有返回 JSON：\n${output || result.stderr}`);
  const parsed = JSON.parse(output.slice(start));
  if (result.status !== 0 || (parsed && !Array.isArray(parsed) && parsed.error))
    throw new Error(`${label} 查询失败：${describeError(parsed) || output || result.stderr}`);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return first?.results ?? [];
}

/** wrangler 的错误 JSON 里真正有用的说明在 error.notes[].text（例如缺表、缺迁移）。 */
function describeError(parsed) {
  const error = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
  if (!error) return typeof parsed === "string" ? parsed : "";
  const notes = (error.notes ?? []).map((note) => note?.text).filter(Boolean);
  // 「缺表」既可能出现在 notes 里，也可能只出现在 error.text 里，两处都看一眼。
  if ([...notes, error.text ?? ""].some((note) => /no such table/i.test(String(note))))
    return `${notes.join(" ")}\n表还没有创建：先执行 pnpm db:migrate:remote 应用 migrations/ 下的迁移（0014_page_views.sql、0015_signup_attributions.sql）。`;
  return notes.join(" ") || error.text || "";
}

const width = (text) =>
  [...String(text)].reduce(
    (sum, char) =>
      sum +
      (/[\u1100-\u115f\u2e80-\ua4cf\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(char)
        ? 2
        : 1),
    0,
  );
const pad = (text, size) => String(text) + " ".repeat(Math.max(0, size - width(text)));

function table(headers, rows) {
  const sizes = headers.map((header, index) =>
    Math.max(width(header), ...rows.map((row) => width(row[index]))),
  );
  const line = (cells) =>
    cells
      .map((cell, index) => pad(cell, sizes[index]))
      .join("  ")
      .trimEnd();
  const divider = sizes.map((size) => "─".repeat(size)).join("  ");
  return [line(headers), divider, ...rows.map(line)].join("\n");
}

const percent = (part, total) => (total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—");
const num = (value) => Number(value ?? 0);
const label = (value) => String(value ?? "") || "（直接访问）";

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("用法：pnpm analytics [--days 7] [--local]");
    return;
  }
  const days = Math.min(Math.trunc(options.days), 90);
  const to = shanghaiDay();
  const from = daysAgo(days - 1);
  const range = `day BETWEEN '${from}' AND '${to}'`;
  const scope = { days, local: options.local };

  const totals =
    query(
      "总计",
      `SELECT COUNT(*) AS pv, COUNT(DISTINCT day || ':' || visitor_hash) AS visitor_days,
       COUNT(DISTINCT session_id) AS sessions
     FROM page_views WHERE ${range}`,
      scope,
    )[0] ?? {};
  const daily = query(
    "每日",
    `SELECT day, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv,
       COUNT(DISTINCT session_id) AS sessions
     FROM page_views WHERE ${range} GROUP BY day ORDER BY day`,
    scope,
  );
  const pages = query(
    "热门页面",
    `SELECT path AS label, COUNT(*) AS pv, COUNT(DISTINCT day || ':' || visitor_hash) AS visitor_days
     FROM page_views WHERE ${range} GROUP BY label ORDER BY pv DESC, label LIMIT 20`,
    scope,
  );
  const sources = query(
    "来源",
    `SELECT ${SOURCE_EXPR} AS label, COUNT(*) AS pv, COUNT(DISTINCT session_id) AS sessions
     FROM page_views WHERE ${range} GROUP BY label ORDER BY pv DESC, label LIMIT 15`,
    scope,
  );
  const countries = query(
    "国家地区",
    `SELECT country AS label, COUNT(*) AS pv FROM page_views WHERE ${range}
     GROUP BY label ORDER BY pv DESC, label LIMIT 10`,
    scope,
  );
  const devices = query(
    "设备",
    `SELECT device AS label, COUNT(*) AS pv FROM page_views WHERE ${range}
     GROUP BY label ORDER BY pv DESC, label LIMIT 5`,
    scope,
  );
  // 注册归因：落地页按会话的第一次浏览算，注册数按同一会话的去重计数。
  // 这块依赖 0015 的迁移；没应用时只提示一句，不让整张报表失败。
  let signups = { total: 0 };
  let funnel = [];
  let funnelNote = "";
  try {
    const queries = signupConversionQueries(from, to);
    signups = query("注册汇总", queries.totals, scope)[0] ?? {};
    const funnelRows = query("落地页转化", queries.funnel, scope);
    funnel = funnelRows;
  } catch (error) {
    funnelNote = `注册归因暂时不可用：${String(error instanceof Error ? error.message : error).split("\n")[0]}`;
  }

  const pv = num(totals.pv);
  const sessions = num(totals.sessions);
  const perSession = sessions > 0 ? (pv / sessions).toFixed(2) : "0.00";
  const heading = `${from} ~ ${to}（${days} 天，${options.local ? "本地库" : "线上库"}）`;

  const sections = [
    `\n访问统计 ${heading}\n`,
    table(
      ["指标", "数值"],
      [
        ["页面浏览量 PV", String(pv)],
        ["去重访客（按天加总，非独立用户）", String(num(totals.visitor_days))],
        ["会话数", String(sessions)],
        ["人均浏览页数（PV / 会话）", perSession],
      ],
    ),
    pv === 0 ? "这段时间没有记录到访问。" : "",
    daily.length
      ? `\n按天\n${table(
          ["日期", "PV", "访客", "会话"],
          daily.map((row) => [
            String(row.day),
            String(num(row.pv)),
            String(num(row.uv)),
            String(num(row.sessions)),
          ]),
        )}`
      : "",
    pages.length
      ? `\n热门页面\n${table(
          ["页面", "PV", "占比", "访客日"],
          pages.map((row) => [
            String(row.label),
            String(num(row.pv)),
            percent(num(row.pv), pv),
            String(num(row.visitor_days)),
          ]),
        )}`
      : "",
    sources.length
      ? `\n来源\n${table(
          ["来源", "PV", "占比", "会话", "人均页数"],
          sources.map((row) => {
            const rowSessions = num(row.sessions);
            return [
              label(row.label),
              String(num(row.pv)),
              percent(num(row.pv), pv),
              String(rowSessions),
              rowSessions > 0 ? (num(row.pv) / rowSessions).toFixed(2) : "0.00",
            ];
          }),
        )}`
      : "",
    funnelNote ? `\n${funnelNote}` : "",
    funnel.length || num(signups.total) > 0
      ? `\n落地页转化（注册数 / 该落地页带来的会话）\n${table(
          ["落地页", "会话", "注册", "转化率"],
          funnel.map((row) => {
            const rowSessions = num(row.sessions);
            const rowSignups = num(row.signups);
            return [
              String(row.label ?? "") || "（未知）",
              String(rowSessions),
              String(rowSignups),
              percent(rowSignups, rowSessions),
            ];
          }),
        )}${(() => {
          const attributed = num(signups.attributed);
          const total = num(signups.total);
          const missing = Math.max(total - attributed, 0);
          return `\n注册 ${total} 次，其中 ${attributed} 次能归到落地页${missing > 0 ? `，${missing} 次未归因（注册时没有可用的落地页浏览记录）` : ""}。`;
        })()}`
      : "",
    countries.length
      ? `\n国家地区\n${table(
          ["地区", "PV", "占比"],
          countries.map((row) => [
            String(row.label ?? "") || "（未知）",
            String(num(row.pv)),
            percent(num(row.pv), pv),
          ]),
        )}`
      : "",
    devices.length
      ? `\n设备\n${table(
          ["设备", "PV", "占比"],
          devices.map((row) => [
            String(row.label ?? "") || "（未知）",
            String(num(row.pv)),
            percent(num(row.pv), pv),
          ]),
        )}`
      : "",
  ].filter(Boolean);

  console.log(sections.join("\n"));
}

try {
  main();
} catch (error) {
  console.error(error.message ?? error);
  process.exitCode = 1;
}
