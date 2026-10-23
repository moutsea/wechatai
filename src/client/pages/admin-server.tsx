import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Server,
  Wifi,
  Workflow,
} from "lucide-react";
import { api, ApiError } from "../api";
import { SERVER_STATUS_STALE_MS, type AdminServerStatus } from "../../shared/server-status";
import "./admin-server.css";

const number = (n: number | null) => (n === null ? "—" : n.toLocaleString("zh-CN"));
const bytes = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
const time = (n: number | null) =>
  n === null
    ? "—"
    : new Date(n).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });
const percent = (value: { total: number; available: number } | null) =>
  value ? (1 - value.available / value.total) * 100 : null;

function Metric({
  icon,
  title,
  value,
  detail,
  usage,
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  detail: string;
  usage?: number | null;
}) {
  return (
    <article className="server-metric">
      <div className="server-metric-label">
        {icon}
        <span>{title}</span>
      </div>
      <strong>{value}</strong>
      {usage !== undefined && (
        <div className="server-meter" aria-hidden="true">
          <span
            className={usage !== null && usage >= 85 ? "busy" : ""}
            style={{ width: `${usage ?? 0}%` }}
          />
        </div>
      )}
      <p>{detail}</p>
    </article>
  );
}
function Status({
  stale,
  reachable,
  ok,
  draining = false,
}: {
  stale: boolean;
  reachable: boolean;
  ok: boolean;
  draining?: boolean;
}) {
  const tone = stale ? "unknown" : !reachable || !ok ? "bad" : draining ? "warn" : "good";
  return (
    <span className={`server-status ${tone}`}>
      <span />
      {stale
        ? "状态待确认"
        : !reachable
          ? "无法连接"
          : !ok
            ? "服务异常"
            : draining
              ? "正在排空任务"
              : "运行正常"}
    </span>
  );
}

export function AdminServer() {
  const [data, setData] = useState<AdminServerStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [age, setAge] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false,
      denied = false,
      loadedAt = 0;
    const load = async () => {
      if (busy || denied || document.visibilityState === "hidden") return;
      busy = true;
      setLoading(true);
      try {
        const result = await api<AdminServerStatus>("/admin/server-status", {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
          loadedAt = performance.now();
          setAge(0);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          denied = e instanceof ApiError && [401, 403].includes(e.status);
          if (denied) setData(null);
          setError(e instanceof ApiError ? e.message : "暂时无法获取服务器状态，请稍后刷新。");
        }
      } finally {
        busy = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    const ageTimer = window.setInterval(() => {
      if (loadedAt) setAge(performance.now() - loadedAt);
    }, 1000);
    document.addEventListener("visibilitychange", load);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.clearInterval(ageTimer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [refresh]);
  const report = data?.report;
  const stale =
    !data ||
    data.stale ||
    !!error ||
    data.receivedAt === null ||
    data.generatedAt + age - data.receivedAt > SERVER_STATUS_STALE_MS;
  const healthy = report?.receiver.ok && report.executor.ok && !report.executor.draining;
  return (
    <div className="server-page">
      <div className="server-toolbar">
        <p>每 30 秒更新 · 仅管理员可见</p>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw size={15} className={loading ? "admin-spinning" : ""} />
          {loading ? "刷新中…" : "刷新状态"}
        </button>
      </div>
      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}
      {!report ? (
        <section className="admin-panel server-empty" role="status">
          <Server size={32} />
          <h2>
            {loading
              ? "正在获取服务器状态…"
              : error || !data
                ? "无法获取服务器状态"
                : data.configured
                  ? "等待服务器首次上报"
                  : "尚未配置服务器监控"}
          </h2>
          {!loading && !error && data && (
            <p>
              {data.configured
                ? "监控已启用，等待服务器首次上报。请确认采集服务正在运行。"
                : "部署服务器采集服务并配置独立监控密钥后，这里会显示实时状态。"}
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="server-summary">
            <div className="server-summary-main">
              <div className="server-symbol">
                <Server size={25} />
              </div>
              <div>
                <h2>{report.name}</h2>
                <p>
                  {report.cpu.cores} 核 · {report.memory ? bytes(report.memory.total) : "内存未知"}{" "}
                  内存 · 常驻消息服务
                </p>
              </div>
            </div>
            <div className="server-summary-state">
              <span className={`server-status ${stale ? "unknown" : healthy ? "good" : "warn"}`}>
                <span />
                {stale ? "数据已过期" : healthy ? "服务正常" : "需要关注"}
              </span>
              <small>最后上报 {time(data!.receivedAt)}（北京时间）</small>
            </div>
          </section>
          {stale && (
            <div className="server-warning" role="status">
              当前显示最后一次采集数据，不能据此判断服务器在线。请检查采集服务和网络连接。
            </div>
          )}
          <div className={`server-metrics ${stale ? "is-stale" : ""}`}>
            <Metric
              icon={<Cpu size={17} />}
              title="CPU 使用率"
              value={report.cpu.percent === null ? "—" : `${report.cpu.percent.toFixed(1)}%`}
              detail="最近采集区间 · 全部核心平均"
              usage={report.cpu.percent}
            />
            <Metric
              icon={<MemoryStick size={17} />}
              title="内存使用率"
              value={report.memory ? `${percent(report.memory)!.toFixed(1)}%` : "—"}
              detail={
                report.memory
                  ? `可用 ${bytes(report.memory.available)} / 总计 ${bytes(report.memory.total)}`
                  : "未能读取内存信息"
              }
              usage={percent(report.memory)}
            />
            <Metric
              icon={<HardDrive size={17} />}
              title="磁盘使用率"
              value={report.disk ? `${percent(report.disk)!.toFixed(1)}%` : "—"}
              detail={
                report.disk
                  ? `可用 ${bytes(report.disk.available)} / 总计 ${bytes(report.disk.total)}`
                  : "未能读取磁盘信息"
              }
              usage={percent(report.disk)}
            />
            <Metric
              icon={<Activity size={17} />}
              title="系统连续运行"
              value={
                <>
                  <span>{Math.floor(report.uptimeSeconds / 86400)} 天</span>{" "}
                  <span>{Math.floor((report.uptimeSeconds % 86400) / 3600)} 小时</span>
                </>
              }
              detail={`平均负载 ${report.cpu.load.map((n) => n.toFixed(2)).join(" / ")} · 1/5/15 分钟`}
            />
          </div>
          <div className="server-services">
            <section className="admin-panel server-service">
              <div className="server-service-heading">
                <h3>
                  <Wifi size={19} />
                  微信消息服务
                </h3>
                <Status stale={stale} {...report.receiver} />
              </div>
              <p>接收微信消息、维持连接与输入状态。</p>
              <dl>
                <div>
                  <dt>已连接账户 / 已发现账户</dt>
                  <dd>
                    {number(report.receiver.connected)} / {number(report.receiver.accounts)}
                  </dd>
                </div>
                <div>
                  <dt>微信连接数</dt>
                  <dd>{number(report.receiver.links)}</dd>
                </div>
                <div>
                  <dt>累计转发消息</dt>
                  <dd>{number(report.receiver.forwarded)}</dd>
                </div>
                <div>
                  <dt>输入状态发送 / 失败</dt>
                  <dd>
                    {number(report.receiver.typingSent)} / {number(report.receiver.typingFailed)}
                  </dd>
                </div>
                <div>
                  <dt>本机健康检查耗时</dt>
                  <dd>
                    {report.receiver.latencyMs === null ? "—" : `${report.receiver.latencyMs} ms`}
                  </dd>
                </div>
              </dl>
            </section>
            <section className="admin-panel server-service">
              <div className="server-service-heading">
                <h3>
                  <Workflow size={19} />
                  模型执行服务
                </h3>
                <Status
                  stale={stale}
                  {...report.executor}
                  draining={report.executor.draining === true}
                />
              </div>
              <p>调用上游模型、处理插件任务并返回结果。</p>
              <dl>
                <div>
                  <dt>正在执行</dt>
                  <dd>{number(report.executor.active)}</dd>
                </div>
                <div>
                  <dt>累计完成</dt>
                  <dd>{number(report.executor.completed)}</dd>
                </div>
                <div>
                  <dt>累计失败</dt>
                  <dd>{number(report.executor.failed)}</dd>
                </div>
                <div>
                  <dt>任务接收状态</dt>
                  <dd>
                    {stale || !report.executor.ok || report.executor.draining === null
                      ? "待确认"
                      : report.executor.draining
                        ? "已暂停，等待现有任务完成"
                        : "正常接收"}
                  </dd>
                </div>
                <div>
                  <dt>本机健康检查耗时</dt>
                  <dd>
                    {report.executor.latencyMs === null ? "—" : `${report.executor.latencyMs} ms`}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
          <p className="server-footnote">
            资源用量为整台服务器（含其他应用）；磁盘为根分区，包含保留空间。服务累计计数在各自进程重启后归零，与全站调用统计口径不同。采集时间：
            {time(report.sampledAt)}。
          </p>
        </>
      )}
    </div>
  );
}
