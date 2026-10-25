import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Eye, RefreshCw, UserCheck, Users } from "lucide-react";
import { api, ApiError } from "../api";
import type { AdminAnalytics as AnalyticsData, TrafficSummary } from "../../shared/analytics";
import "./admin-analytics.css";

const periods = [1, 7, 30, 90];
const number = (n: number) => n.toLocaleString("zh-CN");
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const sourceName = (label: string) =>
  label.startsWith("utm:") ? `UTM · ${label.slice(4)}` : label;

function TrafficTrend({ traffic }: { traffic: TrafficSummary }) {
  const [metric, setMetric] = useState<"pv" | "uv">("pv");
  const [selected, setSelected] = useState<string | null>(null);
  const byDay = new Map(traffic.daily.map((day) => [day.day, day]));
  const daily = Array.from({ length: traffic.range.days }, (_, i) => {
    const day = new Date(Date.parse(`${traffic.range.from}T00:00:00Z`) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return byDay.get(day) ?? { day, pv: 0, uv: 0, sessions: 0 };
  });
  const current = daily.find((day) => day.day === selected) ?? daily.at(-1)!;
  const max = Math.max(1, ...daily.map((day) => day[metric]));
  const title = metric === "pv" ? "访问量（PV）" : "当日访客数（UV）";
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>每日趋势</h2>
          <p>按北京时间划分自然日，今天的数据仍在累计</p>
        </div>
        <span className="admin-muted">{traffic.range.days} 天</span>
      </div>
      <div className="admin-metric-tabs" aria-label="流量趋势指标">
        <button
          type="button"
          className={metric === "pv" ? "active" : ""}
          aria-pressed={metric === "pv"}
          onClick={() => setMetric("pv")}
        >
          访问量（PV）
        </button>
        <button
          type="button"
          className={metric === "uv" ? "active" : ""}
          aria-pressed={metric === "uv"}
          onClick={() => setMetric("uv")}
        >
          当日访客数（UV）
        </button>
      </div>
      <div className="admin-chart-value">
        <strong>{number(current[metric])}</strong>
        <span>
          {current.day} · {title}
        </span>
      </div>
      <div className="admin-bars analytics-bars" aria-label={`${title}每日趋势`}>
        {daily.map((day) => (
          <button
            type="button"
            key={day.day}
            className={day.day === current.day ? "selected" : ""}
            aria-label={`${day.day}：${number(day[metric])}`}
            aria-pressed={day.day === current.day}
            onMouseEnter={() => setSelected(day.day)}
            onFocus={() => setSelected(day.day)}
            onClick={() => setSelected(day.day)}
          >
            <span style={{ height: `${(day[metric] / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="admin-chart-axis">
        <span>{traffic.range.from}</span>
        <span>{traffic.range.to}</span>
      </div>
      <details className="admin-daily-details">
        <summary>查看每日明细</summary>
        <div className="admin-table-scroll">
          <table aria-label="每日流量明细">
            <thead>
              <tr>
                <th>日期</th>
                <th>访问量</th>
                <th>访客数（当日去重）</th>
                <th>浏览会话</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((day) => (
                <tr key={day.day}>
                  <td>{day.day}</td>
                  <td>{number(day.pv)}</td>
                  <td>{number(day.uv)}</td>
                  <td>{number(day.sessions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function AnalyticsReport({ data }: { data: AnalyticsData }) {
  const { traffic, conversions } = data;
  const depth = new Map(traffic.sourceDepth.map((source) => [source.label, source]));
  return (
    <div className="analytics-report">
      <p className="analytics-range">
        {traffic.range.from} 至 {traffic.range.to} · 北京时间 · 含今天
      </p>
      <div className="admin-kpis">
        <article>
          <div>
            访问量（PV）
            <Eye size={17} />
          </div>
          <strong>{number(traffic.totals.pv)}</strong>
          <p>
            {number(traffic.totals.sessions)} 个浏览会话 · 每会话{" "}
            {number(traffic.totals.pagesPerSession)} 页
          </p>
        </article>
        <article>
          <div>
            访客数（按天去重）
            <Users size={17} />
          </div>
          <strong>{number(traffic.totals.visitorDays)}</strong>
          <p>区间内每日 UV 加总，非跨天独立人数</p>
        </article>
        <article>
          <div>
            注册会话
            <UserCheck size={17} />
          </div>
          <strong>{number(conversions.total)}</strong>
          <p>
            已归因 {number(conversions.total - conversions.unattributed)} · 未归因{" "}
            {number(conversions.unattributed)}
          </p>
        </article>
        <article>
          <div>
            会话注册转化率
            <BarChart3 size={17} />
          </div>
          <strong>{percent(conversions.rate)}</strong>
          <p>
            {number(conversions.total)} 个注册会话 / {number(conversions.sessions)} 个活跃会话
          </p>
        </article>
      </div>
      {traffic.totals.pv === 0 && conversions.total === 0 && (
        <div className="admin-panel analytics-empty" role="status">
          <h2>该时间范围暂无访问或注册记录</h2>
          <p>统计只包含开始采集后的数据，可切换更长时间范围查看。</p>
        </div>
      )}
      <TrafficTrend traffic={traffic} />
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>访问来源</h2>
            <p>按访问量显示前 15 项 · 优先采用 UTM 来源，其次为外部引荐网站</p>
          </div>
        </div>
        {traffic.sources.length ? (
          <div className="admin-table-scroll">
            <table aria-label="访问来源">
              <thead>
                <tr>
                  <th>来源</th>
                  <th>访问量</th>
                  <th>访客数（按天去重）</th>
                  <th>浏览会话</th>
                  <th>每会话页数</th>
                </tr>
              </thead>
              <tbody>
                {traffic.sources.map((source) => (
                  <tr key={source.label}>
                    <td className="analytics-label">{sourceName(source.label)}</td>
                    <td>{number(source.pv)}</td>
                    <td>{number(source.visitorDays)}</td>
                    <td>{number(depth.get(source.label)?.sessions ?? 0)}</td>
                    <td>{number(depth.get(source.label)?.pagesPerSession ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="analytics-empty">暂无来源记录</p>
        )}
        <p className="admin-footnote">
          直接访问表示未获得外部来源，也可能来自未传递来源的应用。各来源的访客数分别去重，同一访客可出现在多个来源中。
        </p>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>落地页注册转化</h2>
            <p>按注册会话数显示前 15 项 · 落地页取该会话首次访问的页面</p>
          </div>
        </div>
        {conversions.rows.length ? (
          <div className="admin-table-scroll">
            <table aria-label="落地页注册转化">
              <thead>
                <tr>
                  <th>落地页</th>
                  <th>活跃会话</th>
                  <th>注册会话</th>
                  <th>转化率</th>
                </tr>
              </thead>
              <tbody>
                {conversions.rows.map((row) => (
                  <tr key={row.label}>
                    <td className="analytics-label">{row.label}</td>
                    <td>{number(row.sessions)}</td>
                    <td>{number(row.signups)}</td>
                    <td>{percent(row.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="analytics-empty">暂无可归因的落地页数据</p>
        )}
        <p className="admin-footnote">
          未归因注册会话：{number(conversions.unattributed)}。汇总包含全部记录，不受前 15 项限制。
        </p>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>热门页面</h2>
            <p>按访问量显示前 20 项</p>
          </div>
        </div>
        {traffic.topPages.length ? (
          <div className="admin-table-scroll">
            <table aria-label="热门页面">
              <thead>
                <tr>
                  <th>页面</th>
                  <th>访问量</th>
                  <th>访客数（按天去重）</th>
                </tr>
              </thead>
              <tbody>
                {traffic.topPages.map((page) => (
                  <tr key={page.label}>
                    <td className="analytics-label">{page.label}</td>
                    <td>{number(page.pv)}</td>
                    <td>{number(page.visitorDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="analytics-empty">暂无页面记录</p>
        )}
      </section>
      <p className="admin-footnote">
        仅统计公开页面，过滤已知爬虫并尊重 DNT /
        GPC。注册以实际创建账户为准，同一会话在所选区间内仅计一次；拒绝统计或未携带会话号的注册不计入，因此不等于全部新增用户。活跃会话包含区间内有浏览或注册的会话，转化率为注册会话数
        ÷ 活跃会话数，未归因会话也计入汇总。
      </p>
    </div>
  );
}

export type AnalyticsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: AnalyticsData };

export function AnalyticsResult({ state, retry }: { state: AnalyticsState; retry: () => void }) {
  if (state.status === "loading")
    return (
      <div className="admin-loading" role="status">
        <span className="spinner" />
        正在加载流量统计…
      </div>
    );
  if (state.status === "error")
    return (
      <div className="admin-error" role="alert">
        {state.message}
        <button type="button" onClick={retry}>
          重新加载
        </button>
      </div>
    );
  return <AnalyticsReport data={state.data} />;
}

function AnalyticsPeriod({ days }: { days: number }) {
  const [state, setState] = useState<AnalyticsState>({ status: "loading" });
  const [refresh, setRefresh] = useState(0);
  const retry = () => {
    setState({ status: "loading" });
    setRefresh((value) => value + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setState({ status: "error", message: "流量统计加载超时，请重试。" });
    }, 15_000);
    void api<AnalyticsData>(`/admin/analytics?days=${days}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof ApiError && error.status === 403
                ? "当前账号没有管理权限。"
                : error instanceof ApiError && error.status === 401
                  ? "登录已失效，请重新登录后查看。"
                  : "流量统计加载失败，请重试。",
          });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [days, refresh]);
  return (
    <>
      <div className="analytics-refresh">
        <button
          type="button"
          className="button secondary small"
          disabled={state.status === "loading"}
          onClick={retry}
        >
          <RefreshCw size={15} />
          刷新统计
        </button>
      </div>
      <AnalyticsResult state={state} retry={retry} />
    </>
  );
}

export function AdminAnalytics() {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("analyticsDays"));
  const days = periods.includes(requested) ? requested : 7;
  return (
    <div className="admin-analytics">
      <div className="analytics-toolbar">
        <div>
          <h2>流量统计</h2>
          <p>了解访客从哪里来，以及哪些页面带来注册。</p>
        </div>
        <label>
          时间范围
          <select
            aria-label="统计时间范围"
            value={days}
            onChange={(event) => {
              const next = new URLSearchParams(params);
              next.set("analyticsDays", event.target.value);
              setParams(next);
            }}
          >
            {periods.map((value) => (
              <option key={value} value={value}>
                {value === 1 ? "今天" : `近 ${value} 天`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* 切换区间立即销毁旧状态，迟到响应不能覆盖新报表。 */}
      <AnalyticsPeriod key={days} days={days} />
    </div>
  );
}
