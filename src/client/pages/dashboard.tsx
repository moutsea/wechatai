import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Sparkles,
  MessageCircle,
  MessagesSquare,
  Coins,
  Cpu,
  Link2,
  Check,
  LockKeyhole,
  Crown,
} from "lucide-react";
import { useApp } from "../context";
import { Empty, relativeTime, SectionTitle } from "../ui";
import { ChannelIcon } from "../channel-icon";
import { membershipExpiry } from "../membership";
import { formatCredits, type ChatSession } from "../../shared/types";
import { DashboardOnboarding } from "./dashboard-onboarding";
import { dashboardSetupProgress } from "../../shared/onboarding";
import { trackFunnel } from "../analytics-client";
export function Dashboard() {
  const { data, user, base, request } = useApp();
  // null = 还没拿到列表。不能拿空数组当初始值，否则「加载中」会被画成「一条都没有」。
  const [sessions, setSessions] = useState<ChatSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [sessionsRetry, setSessionsRetry] = useState(0);
  /** 付费墙曝光只报一次：这个面板在免费用户的工作台里长期存在。 */
  const paywallSeen = useRef(false);
  useEffect(() => {
    setSessions(null);
    setSessionsError(false);
    if (data?.plan !== "plus") return;
    const controller = new AbortController();
    void request<ChatSession[]>("/sessions", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setSessions(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionsError(true);
      });
    return () => controller.abort();
  }, [request, data?.plan, data?.stats.sessions, sessionsRetry]);
  useEffect(() => {
    if (!data || data.plan === "plus" || !data.stats.sessions) return;
    if (paywallSeen.current) return;
    paywallSeen.current = true;
    trackFunnel("paywall_view", { surface: "dashboard_recent" });
  }, [data]);
  if (!data) return null;
  const selectedLink = data.connections.find((l) => l.id === data.selectedConnectionId);
  const connected = data.connection.status === "connected" && !selectedLink?.paused;
  const setup = dashboardSetupProgress(data);
  const maximum = Math.max(...data.activity.map((a) => a.credits), 1);
  const activity = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() + 8 * 3600000 - (6 - i) * 86400000);
    const day = date.toISOString().slice(0, 10);
    return { day, credits: data.activity.find((a) => a.day === day)?.credits || 0 };
  });
  return (
    <div className="dashboard page-enter">
      <div className="dashboard-greeting">
        <div>
          <div className="eyebrow">A LITTLE CLOSER, EVERY DAY</div>
          <h1>
            你好，{user.name || "朋友"}
            <span className="greeting-dot">.</span>
          </h1>
          <p>让喜欢的 AI，陪你聊聊日常里的大小事。</p>
        </div>
        <div className="dashboard-actions">
          <DashboardOnboarding data={data} />
          <Link className="button secondary" to={`${base}/channels?new=1`}>
            <Plus size={16} />
            添加渠道
          </Link>
        </div>
      </div>
      <section className="welcome-banner">
        <div>
          <div className="banner-kicker">
            <span className="tiny-dot" />
            你的 AI，离你更近一点
          </div>
          <h2>
            灵感和答案，
            <br className="mobile-break" />
            都在熟悉的聊天框里。
          </h2>
          <p>
            {connected
              ? "微信已就绪。拿起手机，向你选择的模型提问吧。"
              : "添加渠道和模型，扫码连接微信，就可以开始自然地聊天。"}
          </p>
          <Link to={`${base}/wechat`}>
            {connected ? "查看我的微信连接" : "连接我的微信"}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="banner-chat-message banner-chat-question">帮我理理思路</div>
          <div className="banner-chat-answer">
            <span className="banner-chat-avatar">
              <MessageCircle size={17} strokeWidth={1.7} />
            </span>
            <div className="banner-chat-message banner-chat-response">好呀，我们一起想。</div>
          </div>
        </div>
      </section>
      <div className="stats-grid dashboard-stats">
        <article className={`stat-card membership-stat ${data.plan === "plus" ? "is-plus" : ""}`}>
          <div>
            <span>我的会员</span>
            <Crown size={18} aria-hidden="true" />
          </div>
          <strong>
            {data.plan === "plus" ? "Plus" : "Free"}
            <small>{data.plan === "plus" ? "会员" : "免费账户"}</small>
          </strong>
          <p>
            <span>
              {data.plan === "plus" ? (
                <>
                  <time
                    dateTime={new Date(data.planUntil).toISOString()}
                    title={`${membershipExpiry(data.planUntil, true)} 到期（北京时间）`}
                  >
                    {membershipExpiry(data.planUntil)}
                  </time>{" "}
                  到期
                </>
              ) : data.planUntil > 0 ? (
                "Plus 会员已到期"
              ) : (
                `每日赠送 ${formatCredits(data.wallet.dailyGrant)} credits`
              )}
            </span>
            <Link to={`${base}/billing`}>
              {data.plan === "plus" ? "续费会员" : "升级会员"}
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </p>
        </article>
        <article className="stat-card">
          <div>
            <span>可用 Credits</span>
            <Coins size={17} />
          </div>
          <strong>
            {formatCredits(data.wallet.balance)}
            <small>credits</small>
          </strong>
          <p>
            今日已使用 <b>{formatCredits(data.wallet.spentToday)}</b>
            <Link to={`${base}/credits`}>
              查看明细
              <ArrowUpRight size={12} />
            </Link>
          </p>
        </article>
        <article className="stat-card">
          <div>
            <span>我的渠道</span>
            <Cpu size={18} />
          </div>
          <strong>
            {String(data.channels.length).padStart(2, "0")}
            <small>/ {data.limits.channels} 个</small>
          </strong>
          <p>
            已配置 {data.assistants.length} 个模型
            <Link to={`${base}/channels`}>
              管理渠道
              <ArrowUpRight size={12} />
            </Link>
          </p>
        </article>
        <article className="stat-card">
          <div>
            <span>累积会话</span>
            <MessagesSquare size={17} />
          </div>
          <strong>
            {String(data.stats.sessions).padStart(2, "0")}
            <small>段对话</small>
          </strong>
          <p>
            每个话题，都有独立的空间
            <Link to={`${base}/sessions`}>
              会话记录
              <ArrowUpRight size={12} />
            </Link>
          </p>
        </article>
      </div>
      {(!setup.model || !setup.wechat || !setup.message) && (
        <div className="onboarding-strip">
          {[
            [setup.model, "添加渠道和模型", data.channels.length ? "/channels" : "/channels?new=1"],
            [setup.wechat, "扫码连接微信", "/wechat"],
            [setup.message, "发送第一条消息", "/wechat"],
          ].map(([done, label, path], i) => (
            <Link key={String(label)} to={base + path}>
              <span className={done ? "step-done" : ""}>
                {done ? <Check size={14} /> : `0${i + 1}`}
              </span>
              {label}
              <ArrowUpRight size={14} />
            </Link>
          ))}
        </div>
      )}
      <div className="dashboard-columns">
        <div>
          <SectionTitle title="我的渠道" link="管理渠道" to={`${base}/channels`} />
          <div className="compact-assistant-grid">
            {data.channels.slice(0, 3).map((a) => (
              <Link
                className="compact-assistant"
                to={`${base}/channels?channel=${a.id}`}
                key={a.id}
              >
                <ChannelIcon channel={a} />
                <h3>{a.name}</h3>
                <p>{a.description || a.baseUrl}</p>
                <div>
                  <span className="model-dot" />
                  {data.assistants.filter((m) => m.channelId === a.id).length} 个模型
                  <ArrowUpRight size={14} />
                </div>
              </Link>
            ))}
            {data.channels.length < 3 && (
              <Link className="add-assistant-card" to={`${base}/channels?new=1`}>
                <span>
                  <Plus size={22} />
                </span>
                <strong>添加渠道</strong>
                <p>填写服务地址与 API Key</p>
              </Link>
            )}
          </div>
          <div className="recent-section">
            <SectionTitle title="最近的对话" link="查看全部" to={`${base}/sessions`} />
            <div className="panel recent-panel">
              {!data.stats.sessions ? (
                // 一次对话都没有的人，先看到「下一步做什么」，而不是升级广告。
                <Empty
                  icon={<MessagesSquare />}
                  title="第一段对话，从微信开始"
                  description="连接微信后发送消息，历史记录会出现在这里。"
                  action={
                    <Link className="text-link" to={`${base}/wechat`}>
                      连接微信
                      <ArrowRight size={15} />
                    </Link>
                  }
                />
              ) : data.plan !== "plus" ? (
                <div className="history-locked">
                  <span className="lock-icon">
                    <LockKeyhole size={23} />
                  </span>
                  <div>
                    <h3>让聊过的灵感，有处可寻。</h3>
                    <p>升级 Plus，在网页回看和整理微信里的对话。</p>
                  </div>
                  <Link
                    className="button secondary small"
                    to={`${base}/billing`}
                    onClick={() => trackFunnel("paywall_click", { surface: "dashboard_recent" })}
                  >
                    了解 Plus
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              ) : sessionsError ? (
                <div className="recent-error" role="alert">
                  <p>暂时读不到对话记录，请重试。</p>
                  <button className="text-link" onClick={() => setSessionsRetry((n) => n + 1)}>
                    重新加载对话
                  </button>
                </div>
              ) : sessions === null ? (
                <p className="recent-error" role="status">
                  正在加载对话记录…
                </p>
              ) : !sessions.length ? (
                <Empty
                  icon={<MessagesSquare />}
                  title="还没有可回看的对话"
                  description="在微信里发一条消息，这里就会出现记录。"
                  action={
                    <Link className="text-link" to={`${base}/wechat`}>
                      查看微信连接
                      <ArrowRight size={15} />
                    </Link>
                  }
                />
              ) : (
                sessions.slice(0, 4).map((s) => {
                  const a = data.assistants.find((a) => a.id === s.assistantId);
                  return (
                    <Link key={s.id} to={`${base}/sessions?id=${s.id}`} className="recent-row">
                      <span className={`assistant-icon ${a?.color ?? "sage"} small`}>
                        <MessageCircle size={18} aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{s.title}</strong>
                        <small>
                          {a?.name} · {s.messageCount} 条消息
                        </small>
                      </span>
                      {data.currentSession?.id === s.id && (
                        <span className="tag green">当前会话</span>
                      )}
                      <time>{relativeTime(s.updatedAt)}</time>
                      <ArrowUpRight size={15} />
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <aside className="dashboard-right">
          <SectionTitle
            title={`微信链接 · ${data.connections.length} / ${data.limits.connections}`}
          />
          <div className="panel connection-summary">
            <div className="connection-summary-top">
              <span className="connection-icon">
                <Link2 size={23} />
              </span>
              <span className={`tag ${connected ? "green" : ""}`}>
                <span className="tiny-dot" />
                {selectedLink?.paused ? "会员到期，已暂停" : connected ? "运行正常" : "等待连接"}
              </span>
            </div>
            <h3>{selectedLink?.name ?? "给 AI 一个熟悉的入口"}</h3>
            <p>
              {connected ? "个人专属连接，只回应你的消息。" : "扫一扫，在微信里开启第一段对话。"}
            </p>
            <div className="connection-detail">
              <span>
                {data.currentSession && !data.currentSession.assistantId ? "当前入口" : "当前渠道"}
              </span>
              <strong>{data.currentSession?.channelName || "尚未设置"}</strong>
            </div>
            <div className="connection-detail">
              <span>
                {data.currentSession && !data.currentSession.assistantId
                  ? "当前 Agent"
                  : "当前模型"}
              </span>
              <strong>{data.currentSession?.assistantName || "尚未设置"}</strong>
            </div>
            <div className="connection-detail">
              <span>最近消息</span>
              <strong>
                {data.connection.lastSeen
                  ? relativeTime(data.connection.lastSeen)
                  : "等待第一条消息"}
              </strong>
            </div>
            <Link to={`${base}/wechat`}>
              管理连接
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="panel usage-panel">
            <div>
              <h3>这周的好奇心</h3>
              <span>Credits</span>
            </div>
            <div className="mini-chart" aria-label="最近七天 Credits 使用量">
              {activity.map((a, i) => (
                <div key={a.day} title={`${a.day}：${formatCredits(a.credits)} credits`}>
                  <span
                    style={{ height: `${Math.max(5, (a.credits / maximum) * 74)}px` }}
                    className={i === 6 ? "today" : ""}
                  />
                  <small>{i === 6 ? "今天" : a.day.slice(5).replace("-", "/")}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="gentle-tip">
            <Sparkles size={18} />
            <div>
              <h3>聊新话题，轻装上阵。</h3>
              <p>
                发送 <code>/new</code> 开始新会话。保留旧灵感，也让上下文更轻一点。
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
