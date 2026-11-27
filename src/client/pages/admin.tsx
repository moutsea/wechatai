import { useLocale, localizedHref } from "../locale";
import { useWorkspaceText, useWorkspaceError } from "../workspace-copy";
import { AdminNotices } from "./admin-notices";
import { AdminServer } from "./admin-server";
import { AdminAnalytics } from "./admin-analytics";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  BarChart3,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  Gift,
  LayoutDashboard,
  Link2,
  MessageCircle,
  Megaphone,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { api, ApiError, json } from "../api";
import { formatCredits } from "../../shared/types";
import { callFailureReason } from "../../shared/call-failures";
import {
  adminPluginNames,
  type AdminDay,
  type AdminOverview,
  type AdminSync,
  type AdminUsers,
  type AdminUser,
  type AdminMembership,
  type AdminGiftInput,
  type AdminGiftResult,
  adminGiftInputSchema,
} from "../../shared/admin";
import { extendMembership } from "../../shared/billing";
import { useAuth } from "../auth";
import { Modal } from "../ui";
import { pluginIconSource } from "../../shared/plugin-visuals";
import "./admin.css";

const number = (n: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(n);
const compact = (n: number, locale: string) =>
  new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
const money = (n: number) =>
  `¥${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n)}`;
const date = (n: number | null, time = true) =>
  n
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
      }).format(n)
    : "—";
const metrics = [
  { key: "requests", name: "成功调用", format: number },
  { key: "failedRequests", name: "失败调用", format: number },
  { key: "revenue", name: "收入", format: money },
  { key: "newUsers", name: "新增用户", format: number },
  { key: "credits", name: "Credits 消耗", format: formatCredits },
] as const;

function Trends({ daily }: { daily: AdminDay[] }) {
  const copyText = useWorkspaceText();
  const [metric, setMetric] = useState<(typeof metrics)[number]>(metrics[0]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = daily.find((d) => d.day === selected) || daily.at(-1)!;
  const max = Math.max(1, ...daily.map((d) => d[metric.key]));
  return (
    <section className="admin-panel admin-trends">
      <div className="admin-panel-heading">
        <div>
          <h2>{copyText("近 30 天")}</h2>
          <p>{copyText("调用、收入与新增用户趋势")}</p>
        </div>
        <span className="admin-muted">{copyText("北京时间")}</span>
      </div>
      <div className="admin-metric-tabs" aria-label={copyText("趋势指标")}>
        {metrics.map((item) => (
          <button
            key={item.key}
            className={item.key === metric.key ? "active" : ""}
            aria-pressed={item.key === metric.key}
            onClick={() => setMetric(item)}
          >
            {copyText(item.name)}
          </button>
        ))}
      </div>
      <div className="admin-chart-value">
        <strong>{metric.format(current[metric.key])}</strong>
        <span>
          {current.day} · {copyText(metric.name)}
        </span>
      </div>
      <div
        className="admin-bars"
        aria-label={copyText("{value0}每日趋势", { value0: copyText(metric.name) })}
      >
        {daily.map((d) => (
          <button
            type="button"
            key={d.day}
            className={d.day === current.day ? "selected" : ""}
            onMouseEnter={() => setSelected(d.day)}
            onFocus={() => setSelected(d.day)}
            onClick={() => setSelected(d.day)}
            aria-label={`${d.day}：${metric.format(d[metric.key])}`}
            aria-pressed={d.day === current.day}
          >
            <span style={{ height: `${Math.max(2, (d[metric.key] / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="admin-chart-axis">
        <span>{daily[0].day.slice(5)}</span>
        <span>{daily[14].day.slice(5)}</span>
        <span>{daily.at(-1)!.day.slice(5)}</span>
      </div>
      <details className="admin-daily-details">
        <summary>{copyText("查看每日明细")}</summary>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{copyText("日期")}</th>
                <th>{copyText("新增用户")}</th>
                <th>{copyText("活跃用户")}</th>
                <th>{copyText("成功")}</th>
                <th>{copyText("失败")}</th>
                <th>Credits</th>
                <th>{copyText("收入")}</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{number(d.newUsers)}</td>
                  <td>{number(d.activeUsers)}</td>
                  <td>{number(d.requests)}</td>
                  <td>{number(d.failedRequests)}</td>
                  <td>{formatCredits(d.credits)}</td>
                  <td>{money(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Overview({ data }: { data: AdminOverview }) {
  const { locale } = useLocale();
  const copyText = useWorkspaceText();
  const s = data.summary;
  const today = data.daily.at(-1)!;
  const hasStats = data.coverage.synced > 0;
  const cards = [
    {
      label: copyText("注册用户"),
      value: number(s.users),
      detail: copyText("今日新增 {value0} 人", { value0: number(today.newUsers) }),
      icon: Users,
    },
    {
      label: copyText("Plus 会员"),
      value: hasStats ? number(s.plus) : "—",
      detail: copyText("当前会员有效期内"),
      icon: Crown,
    },
    {
      label: copyText("累计收入"),
      value: money(s.revenue),
      detail: copyText("{value0} 笔已付款订单", { value0: number(s.paidOrders) }),
      icon: Wallet,
    },
    {
      label: copyText("成功调用"),
      value: hasStats ? compact(s.requests, locale === "pt" ? "pt-BR" : "zh-CN") : "—",
      detail: copyText("累计失败 {value0} 次 · {value1} tokens 已结算", {
        value0: number(s.failedRequests),
        value1: compact(s.tokens, locale === "pt" ? "pt-BR" : "zh-CN"),
      }),
      icon: MessageCircle,
    },
  ];
  return (
    <>
      <div className="admin-kpis">
        {cards.map((c) => (
          <article key={c.label}>
            <div>
              <span>{c.label}</span>
              <c.icon size={18} />
            </div>
            <strong>{c.value}</strong>
            <p>{c.detail}</p>
          </article>
        ))}
      </div>
      <section className="admin-today" aria-label={copyText("今日数据")}>
        <div className="admin-today-title">
          <span className="tiny-dot" />
          <strong>{copyText("今天")}</strong>
          <small>{today.day.slice(5)}</small>
        </div>
        {[
          [copyText("活跃用户"), number(today.activeUsers)],
          [copyText("成功调用"), number(today.requests)],
          [copyText("失败调用"), number(today.failedRequests)],
          [copyText("Credits 消耗"), formatCredits(today.credits)],
          [copyText("收入"), money(today.revenue)],
        ].map(([label, val]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{hasStats || label === copyText("收入") ? val : "—"}</strong>
          </div>
        ))}
      </section>
      <div className="admin-overview-grid">
        <Trends daily={data.daily} />
        <section className="admin-panel admin-plugin-ranking">
          <div className="admin-panel-heading">
            <div>
              <h2>{copyText("大家在用什么")}</h2>
              <p>{copyText("近 30 天 · 按已结算调用排序")}</p>
            </div>
            <Activity size={19} />
          </div>
          {data.plugins.length ? (
            <div className="admin-ranking-list">
              {data.plugins.map((p) => {
                const icon = pluginIconSource(p.pluginId);
                return (
                  <div className="admin-ranking-item" key={p.pluginId}>
                    <span className="admin-plugin-icon">
                      {icon ? <img src={icon} alt="" /> : <MessageCircle size={20} />}
                    </span>
                    <div>
                      <div className="admin-ranking-title">
                        <strong>{copyText(adminPluginNames[p.pluginId] || p.pluginId)}</strong>
                        <b>
                          {number(p.requests)} <small>{copyText("次")}</small>
                        </b>
                      </div>
                      <div className="admin-ranking-track">
                        <span
                          style={{
                            width: `${(p.requests / Math.max(1, data.plugins[0].requests)) * 100}%`,
                          }}
                        />
                      </div>
                      <p>
                        {number(p.users)}
                        {copyText(" 位用户")}
                        <span>{formatCredits(p.credits)} credits</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="admin-empty">
              <MessageCircle />
              <p>{hasStats ? copyText("暂无近期调用") : copyText("同步后查看使用情况")}</p>
            </div>
          )}
        </section>
      </div>
      <div className="admin-overview-grid admin-secondary-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>{copyText("支付与 credits")}</h2>
              <p>{copyText("订单收入与平台用量分开统计")}</p>
            </div>
            <Coins size={19} />
          </div>
          <dl className="admin-facts">
            <div>
              <dt>
                <ArrowDownLeft size={15} />
                {copyText("会员收入")}
              </dt>
              <dd>{money(s.membershipRevenue)}</dd>
            </div>
            <div>
              <dt>{copyText("Credits 购买收入")}</dt>
              <dd>{money(s.creditsRevenue)}</dd>
            </div>
            <div>
              <dt>{copyText("付费用户")}</dt>
              <dd>
                {number(s.payingUsers)}
                {copyText(" 人")}
              </dd>
            </div>
            <div>
              <dt>{copyText("平均订单金额")}</dt>
              <dd>{money(s.paidOrders ? s.revenue / s.paidOrders : 0)}</dd>
            </div>
            <div>
              <dt>
                <ArrowUpRight size={15} />
                {copyText("累计 credits 消耗")}
              </dt>
              <dd>{hasStats ? formatCredits(s.credits) : "—"}</dd>
            </div>
            <div>
              <dt>{copyText("未使用的购买 credits")}</dt>
              <dd>{hasStats ? formatCredits(s.purchasedCredits) : "—"}</dd>
            </div>
            <div>
              <dt>{copyText("待抵扣 credits")}</dt>
              <dd>{hasStats ? formatCredits(s.debt) : "—"}</dd>
            </div>
          </dl>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>{copyText("连接与配置")}</h2>
              <p>{copyText("账户在微伴上的使用情况")}</p>
            </div>
            <Link2 size={19} />
          </div>
          <div className="admin-assets">
            {[
              [copyText("微信链接"), s.links],
              [copyText("已连接且可用"), s.connected],
              [copyText("渠道"), s.channels],
              [copyText("模型配置"), s.models],
              [copyText("插件配置"), s.plugins],
              [copyText("会话"), s.sessions],
            ].map(([label, val]) => (
              <div key={label}>
                <strong>{hasStats ? number(Number(val)) : "—"}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="admin-referrals">
            <Check size={16} />
            <span>{copyText("已发奖邀请")}</span>
            <strong>
              {number(s.rewardedReferrals)}
              {copyText(" 对")}
            </strong>
          </div>
        </section>
      </div>
      <p className="admin-footnote">
        {copyText(
          "收入为本站当前支付环境的人民币已付款订单金额，未扣支付手续费、未计退款调整，不包含上游模型或 KimiSeek 的充值。活跃用户指当天有成功结算调用的用户；调用包含模型测试和远程插件主动推送。 失败统计记录已开始处理但未完成的调用，不扣 credits；不含指令和发送前的校验拦截。 历史失败仅补录仍保留的记录，具体原因可能缺失。 打开管理后台会自动同步账户统计，页面可见时每分钟更新一次；也可点击「同步最新数据」手动更新。",
        )}
      </p>
    </>
  );
}

function GiftMembership({
  user,
  onClose,
  onGranted,
}: {
  user: AdminUser;
  onClose: () => void;
  onGranted: () => void;
}) {
  const errorText = useWorkspaceError();
  const copyText = useWorkspaceText();
  const { data } = useAuth();
  const storageKey = `wechatai:plus-gift:${data?.user.id}:${user.id}`;
  const [pending, setPending] = useState<AdminGiftInput | null>(() => {
    try {
      const saved = adminGiftInputSchema.safeParse(
        JSON.parse(sessionStorage.getItem(storageKey) || "null"),
      );
      return saved.success ? saved.data : null;
    } catch {
      return null;
    }
  });
  const [reason, setReason] = useState(pending?.reason || "");
  const [membership, setMembership] = useState<AdminMembership | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdminGiftResult | null>(null);
  const [reload, setReload] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void api<AdminMembership>(`/admin/users/${encodeURIComponent(user.id)}/membership`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setMembership(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, [user.id, reload]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !membership || result) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const input = pending || { id: crypto.randomUUID(), reason: reason.trim() };
    try {
      // Keep the same operation through timeouts, closing the dialog and page reloads.
      sessionStorage.setItem(storageKey, JSON.stringify(input));
      setPending(input);
      const receipt = await api<AdminGiftResult>(
        `/admin/users/${encodeURIComponent(user.id)}/gift-plus`,
        {
          ...json(input),
          signal: AbortSignal.timeout(20000),
        },
      );
      setResult(receipt);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* The successful receipt is still shown. */
      }
      onGranted();
    } catch (e) {
      setError(
        copyText("{value0}。可重试核对同一次赠送，不会重复发放。", { value0: errorText(e) }),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={copyText("赠送一个月 Plus")}
      description={user.email}
      onClose={() => {
        if (!submitting.current) onClose();
      }}
    >
      {result ? (
        <div className="admin-gift-result" role="status">
          <span className="admin-gift-symbol">
            <Check size={28} />
          </span>
          <h3>{copyText("已赠送一个月 Plus 会员")}</h3>
          <p>
            {copyText("本次赠送后的到期时间：")}
            {date(result.gift.planUntil)}
          </p>
          <div className="modal-actions">
            <button className="button" onClick={onClose}>
              {copyText("完成")}
            </button>
          </div>
        </div>
      ) : (
        <form className="admin-gift-form" onSubmit={(e) => void submit(e)}>
          {membership ? (
            <>
              <div className="admin-gift-summary">
                <Gift size={24} />
                <div>
                  <strong>{copyText("Plus 会员 · 1 个月")}</strong>
                  <p>{copyText("免费赠送，立即生效。已有会员从当前到期时间顺延。")}</p>
                </div>
              </div>
              <dl className="admin-facts">
                <div>
                  <dt>{copyText("当前会员")}</dt>
                  <dd>
                    {membership.planUntil > Date.now()
                      ? copyText("Plus · {value0} 到期", { value0: date(membership.planUntil) })
                      : "Free"}
                  </dd>
                </div>
                {!pending && (
                  <div>
                    <dt>{copyText("赠送后到期")}</dt>
                    <dd>{date(extendMembership(Math.max(Date.now(), membership.planUntil), 1))}</dd>
                  </div>
                )}
              </dl>
              {pending && (
                <p className="admin-gift-note">
                  {copyText("上次赠送结果尚未确认。点击重试会核对原操作，不会重复赠送。")}
                </p>
              )}
              <label className="field">
                {copyText("赠送原因（选填）")}
                <textarea
                  value={reason}
                  maxLength={200}
                  rows={2}
                  disabled={busy || Boolean(pending)}
                  placeholder={copyText("例如：注册问题补偿")}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {membership.gifts.length > 0 && (
                <details className="admin-gift-history">
                  <summary>
                    {copyText("最近赠送记录（")}
                    {membership.gifts.length}）
                  </summary>
                  <ul>
                    {membership.gifts.map((gift) => (
                      <li key={gift.id}>
                        <strong>
                          {date(gift.createdAt)}
                          {copyText(" · 赠送 1 个月")}
                        </strong>
                        <span>{gift.reason || copyText("未填写原因")}</span>
                        <small>
                          {copyText("赠送后到期：")}
                          {date(gift.planUntil)}
                        </small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            !error && <p role="status">{copyText("正在读取会员信息…")}</p>
          )}
          {error && (
            <div className="admin-error" role="alert">
              {error}
              {!membership && (
                <button type="button" onClick={() => setReload((v) => v + 1)}>
                  {copyText("重新加载")}
                </button>
              )}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
              {copyText("取消")}
            </button>
            <button className="button" disabled={busy || !membership}>
              <Gift size={16} />
              {busy ? copyText("正在处理…") : pending ? copyText("重试赠送") : copyText("确认赠送")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function Admin() {
  const errorText = useWorkspaceError();
  const { locale } = useLocale();
  const copyText = useWorkspaceText();
  const [params, setParams] = useSearchParams();
  const tab =
    params.get("tab") === "notices"
      ? "notices"
      : params.get("tab") === "users"
        ? "users"
        : params.get("tab") === "server"
          ? "server"
          : params.get("tab") === "analytics"
            ? "analytics"
            : "overview";
  const accountTab = tab === "overview" || tab === "users";
  const query = params.get("q") || "";
  const plan = params.get("plan") || "";
  const page = params.get("page") || "1";
  const [search, setSearch] = useState(query);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUsers | null>(null);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState("");
  const [giftTarget, setGiftTarget] = useState<AdminUser | null>(null);
  const syncController = useRef<AbortController | null>(null);
  const loadedView = useRef("");
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    if (tab === "notices" || tab === "server" || tab === "analytics") {
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const view = JSON.stringify([tab, query, page, plan]);
    if (loadedView.current !== view) {
      setLoading(true);
      if (tab === "users") setUsers(null);
    }
    setError("");
    void Promise.all([
      api<AdminOverview>("/admin/overview", { signal: controller.signal }),
      tab === "users"
        ? api<AdminUsers>(`/admin/users?${new URLSearchParams({ q: query, page, plan })}`, {
            signal: controller.signal,
          })
        : Promise.resolve(null),
    ])
      .then(([o, u]) => {
        if (!controller.signal.aborted) {
          setOverview(o);
          setUsers(u);
          loadedView.current = view;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorText(e));
          setForbidden(e instanceof ApiError && e.status === 403);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, query, page, plan, refresh]);
  const changeParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, val] of Object.entries(patch)) {
      if (val) next.set(key, val);
      else next.delete(key);
    }
    setParams(next);
  };
  const sync = useCallback(async () => {
    if (syncController.current) return;
    const controller = new AbortController();
    syncController.current = controller;
    setSyncing(true);
    setSyncError("");
    setProgress(copyText("正在同步账户统计…"));
    let processed = 0,
      failed = 0;
    let cursor: string | null = null;
    try {
      do {
        const result: AdminSync = await api("/admin/sync", {
          ...json({ cursor }),
          signal: controller.signal,
        });
        processed += result.processed;
        failed += result.failed;
        cursor = result.next;
        if (!controller.signal.aborted)
          setProgress(
            copyText("已检查 {value0} 个账户{value1}", {
              value0: processed,
              value1: failed ? copyText("，{count} 个暂未同步", { count: failed }) : "",
            }),
          );
      } while (cursor && !controller.signal.aborted);
      if (!controller.signal.aborted) {
        setRefresh((v) => v + 1);
        setProgress(
          failed
            ? copyText("{value0} 个账户未同步成功，保留上次数据。可稍后重试。", { value0: failed })
            : copyText("数据已更新"),
        );
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setSyncError(copyText("账户统计同步失败：{value0}", { value0: errorText(e) }));
        setProgress(copyText("同步未完成，保留已同步的数据"));
        // Earlier batches may already have succeeded before this request failed.
        setRefresh((v) => v + 1);
        if (e instanceof ApiError && [401, 403].includes(e.status)) setForbidden(true);
      }
    } finally {
      if (syncController.current === controller) syncController.current = null;
      if (!controller.signal.aborted) setSyncing(false);
    }
  }, []);
  // Start only after an authorized read succeeds. Re-renders, filters and batch
  // refreshes must not restart the loop or launch concurrent synchronizations.
  const canSync = accountTab && overview !== null && !forbidden;
  useEffect(() => {
    if (!canSync) return;
    void sync();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 60000);
    return () => {
      window.clearInterval(timer);
      syncController.current?.abort();
      syncController.current = null;
    };
  }, [canSync, sync]);
  const pendingStats = syncing ? copyText("同步中…") : copyText("待同步");
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    changeParams({ q: search.trim(), page: "" });
  };
  if (forbidden)
    return (
      <div className="full-state">
        <ShieldCheck size={34} />
        <h1>{copyText("仅管理员可访问")}</h1>
        <p>{copyText("当前账号没有管理权限。")}</p>
        <Link className="button secondary" to={localizedHref(locale, "/app")}>
          {copyText("回到工作台")}
        </Link>
      </div>
    );
  return (
    <div className="admin-page page-enter">
      <header className="admin-heading">
        <div>
          <div className="eyebrow">{copyText("OPERATIONS")}</div>
          <h1>
            {copyText("管理后台")}{" "}
            <span>
              <ShieldCheck size={13} />
              {copyText("管理员")}
            </span>
          </h1>
          <p>{copyText("查看流量、用户、收入、使用情况与服务器状态。")}</p>
        </div>
        {accountTab && (
          <button
            className="button secondary"
            onClick={() => void sync()}
            disabled={syncing || !overview}
          >
            <RefreshCw size={16} className={syncing ? "admin-spinning" : ""} />
            {syncing ? copyText("正在同步…") : copyText("同步最新数据")}
          </button>
        )}
      </header>
      <nav className="admin-tabs" aria-label={copyText("管理后台导航")}>
        <button
          className={tab === "overview" ? "active" : ""}
          aria-current={tab === "overview" ? "page" : undefined}
          onClick={() => changeParams({ tab: "", page: "", q: "", plan: "" })}
        >
          <LayoutDashboard size={16} />
          {copyText("数据概览")}
        </button>
        <button
          className={tab === "analytics" ? "active" : ""}
          aria-current={tab === "analytics" ? "page" : undefined}
          onClick={() => changeParams({ tab: "analytics", page: "", q: "", plan: "" })}
        >
          <BarChart3 size={16} />
          {copyText("流量统计")}
        </button>
        <button
          className={tab === "users" ? "active" : ""}
          aria-current={tab === "users" ? "page" : undefined}
          onClick={() => changeParams({ tab: "users" })}
        >
          <Users size={16} />
          {copyText("用户列表")}
        </button>
        <button
          className={tab === "notices" ? "active" : ""}
          aria-current={tab === "notices" ? "page" : undefined}
          onClick={() => changeParams({ tab: "notices", page: "", q: "", plan: "" })}
        >
          <Megaphone size={16} />
          {copyText("通知管理")}
        </button>
        <button
          className={tab === "server" ? "active" : ""}
          aria-current={tab === "server" ? "page" : undefined}
          onClick={() => changeParams({ tab: "server", page: "", q: "", plan: "" })}
        >
          <Server size={16} />
          {copyText("服务器")}
        </button>
        {overview?.mode === "test" && (
          <span className="admin-test-badge">{copyText("测试支付环境")}</span>
        )}
      </nav>
      {accountTab && error && (
        <div className="admin-error" role="alert">
          {error}
          <button onClick={() => setRefresh((v) => v + 1)}>{copyText("重新加载")}</button>
        </div>
      )}
      {accountTab && syncError && (
        <div className="admin-error" role="alert">
          {syncError}
          <button onClick={() => void sync()} disabled={syncing}>
            {copyText("重试同步")}
          </button>
        </div>
      )}
      {accountTab && overview && (
        <div
          className={`admin-sync-info ${overview.coverage.synced < overview.summary.users ? "incomplete" : ""}`}
        >
          <span>
            <span className="tiny-dot" />
            {copyText("账户统计已覆盖 ")}
            {overview.coverage.synced} / {overview.summary.users}
            {copyText(" 人 ·")}{" "}
            {overview.coverage.oldest
              ? copyText("最早快照 {value0}", { value0: date(overview.coverage.oldest) })
              : copyText("正在准备账户统计")}
          </span>
          <span role="status">
            {progress || copyText("账户统计自动更新 · 注册与订单数据实时读取")}
          </span>
        </div>
      )}
      {tab === "analytics" ? (
        <AdminAnalytics />
      ) : tab === "server" ? (
        <AdminServer />
      ) : tab === "notices" ? (
        <AdminNotices />
      ) : loading ? (
        <div className="admin-loading" role="status">
          <span className="spinner" />
          {copyText("正在加载数据…")}
        </div>
      ) : tab === "overview" && overview ? (
        <Overview data={overview} />
      ) : users ? (
        <section className="admin-panel admin-users-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>
                {copyText("用户列表 ")}
                <span className="admin-count">{users.total}</span>
              </h2>
              <p>{copyText("按注册时间倒序 · 每页 20 位")}</p>
            </div>
          </div>
          <div className="admin-user-toolbar">
            <form onSubmit={onSearch}>
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copyText("搜索邮箱或昵称")}
                maxLength={100}
                aria-label={copyText("搜索用户")}
              />
              <button className="button small secondary">{copyText("搜索")}</button>
            </form>
            <select
              aria-label={copyText("会员类型")}
              value={plan}
              onChange={(e) => changeParams({ plan: e.target.value, page: "" })}
            >
              <option value="">{copyText("全部会员类型")}</option>
              <option value="plus">{copyText("Plus 会员")}</option>
              <option value="free">{copyText("Free 用户")}</option>
            </select>
            {(query || plan) && (
              <button
                className="text-link"
                onClick={() => changeParams({ q: "", plan: "", page: "" })}
              >
                {copyText("清除筛选")}
              </button>
            )}
          </div>
          {users.items.length ? (
            <div className="admin-table-scroll">
              <table className="admin-user-table">
                <thead>
                  <tr>
                    <th>{copyText("用户")}</th>
                    <th>{copyText("会员")}</th>
                    <th>{copyText("微信链接")}</th>
                    <th>{copyText("调用统计")}</th>
                    <th>{copyText("最近失败")}</th>
                    <th>{copyText("Credits 消耗")}</th>
                    <th>{copyText("付款总额")}</th>
                    <th>{copyText("最近成功")}</th>
                    <th>{copyText("操作")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="admin-user-identity">
                          <span className="admin-avatar">{Array.from(u.name || u.email)[0]}</span>
                          <div>
                            <strong>
                              {u.name || copyText("未设置昵称")}
                              {Boolean(u.isAdmin) && (
                                <ShieldCheck size={13} aria-label={copyText("管理员")} />
                              )}
                            </strong>
                            <span>{u.email}</span>
                            <small>
                              {copyText("注册于 ")}
                              {date(u.createdAt, false)}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {u.syncedAt ? (
                          <>
                            <span
                              className={`admin-plan ${u.planUntil! > Date.now() ? "plus" : ""}`}
                            >
                              {u.planUntil! > Date.now() ? "Plus" : "Free"}
                            </span>
                            {Boolean(u.planUntil) && (
                              <small>
                                {date(u.planUntil, false)}
                                {copyText(" 到期")}
                              </small>
                            )}
                          </>
                        ) : (
                          <span className="admin-muted">{pendingStats}</span>
                        )}
                      </td>
                      <td>
                        {u.links === null ? (
                          pendingStats
                        ) : (
                          <>
                            {u.connected} / {u.links}
                            <small>{copyText("已连接 / 总数")}</small>
                          </>
                        )}
                      </td>
                      <td>
                        {u.requests === null
                          ? pendingStats
                          : copyText("成功 {value0}", { value0: number(u.requests) })}
                        <small className={u.failedRequests ? "admin-failure-count" : ""}>
                          {u.failedRequests == null
                            ? copyText("失败：{value0}", { value0: pendingStats })
                            : copyText("失败 {value0}", { value0: number(u.failedRequests) })}
                        </small>
                      </td>
                      <td className="admin-failure-cell">
                        {u.failedRequests == null ? (
                          pendingStats
                        ) : u.lastFailureAt ? (
                          <>
                            <span>
                              {callFailureReason(u.lastFailureCode, u.lastFailureStatus, copyText)}
                            </span>
                            <small>{date(u.lastFailureAt)}</small>
                          </>
                        ) : (
                          <span className="admin-muted">{copyText("暂无失败记录")}</span>
                        )}
                      </td>
                      <td>{u.credits === null ? pendingStats : formatCredits(u.credits)}</td>
                      <td>{money(u.paidAmount)}</td>
                      <td>
                        {u.syncedAt
                          ? u.lastActiveAt
                            ? date(u.lastActiveAt)
                            : copyText("暂无成功调用")
                          : pendingStats}
                        {u.syncedAt && (
                          <small
                            title={copyText("统计时间：{value0}", { value0: date(u.syncedAt) })}
                          >
                            {copyText("统计于 ")}
                            {date(u.syncedAt)}
                          </small>
                        )}
                      </td>
                      <td>
                        <button className="button small secondary" onClick={() => setGiftTarget(u)}>
                          <Gift size={14} />
                          {copyText("赠送会员")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty">
              <Users />
              <h3>{copyText("没有找到用户")}</h3>
              <p>{copyText("换个邮箱、昵称或会员类型试试。会员筛选仅包含已同步账户。")}</p>
            </div>
          )}
          <nav className="admin-pagination" aria-label={copyText("用户分页")}>
            <span>
              {copyText("共 ")}
              {number(users.total)}
              {copyText(" 位用户")}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label={copyText("上一页")}
                disabled={users.page <= 1}
                onClick={() => changeParams({ page: String(users.page - 1) })}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {users.page} / {users.totalPages}
              </span>
              <button
                className="icon-button"
                aria-label={copyText("下一页")}
                disabled={users.page >= users.totalPages}
                onClick={() => changeParams({ page: String(users.page + 1) })}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </nav>
        </section>
      ) : null}
      {giftTarget && (
        <GiftMembership
          key={giftTarget.id}
          user={giftTarget}
          onClose={() => setGiftTarget(null)}
          onGranted={() => setRefresh((v) => v + 1)}
        />
      )}
    </div>
  );
}
