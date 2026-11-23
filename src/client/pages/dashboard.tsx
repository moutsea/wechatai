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
import { Empty, relativeTime, renderCommandCopy, SectionTitle } from "../ui";
import { ChannelIcon } from "../channel-icon";
import { membershipExpiry } from "../membership";
import { formatCredits, type ChatSession } from "../../shared/types";
import { DashboardOnboarding } from "./dashboard-onboarding";
import { dashboardSetupProgress } from "../../shared/onboarding";
import { trackFunnel } from "../analytics-client";
import { useLocale } from "../locale";
import { dashboardCopy, formatCopy } from "../../shared/i18n/dashboard";
export function Dashboard() {
  const { data, user, base, request } = useApp();
  const { locale } = useLocale();
  const copy = dashboardCopy[locale].dashboard;
  const source = dashboardCopy["zh-CN"].dashboard;
  const credits = (amount: number) => formatCredits(amount, locale);
  const count = (amount: number) => amount.toLocaleString(locale);
  const models = (amount: number) =>
    formatCopy(amount === 1 ? copy.modelsOne : copy.models, { count: count(amount) });
  const shortDate = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "numeric",
    day: "numeric",
  });
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
  const { currentSession } = data;
  // The snapshot returns these built-in labels as display strings, including on older accounts.
  const entryName =
    currentSession?.channelName === source.executionModelUnavailable
      ? copy.executionModelUnavailable
      : currentSession?.channelName === source.remoteAgent
        ? copy.remoteAgent
        : currentSession?.channelName || copy.notSet;
  const assistantName =
    currentSession?.assistantName === source.deletedPlugin
      ? copy.deletedPlugin
      : currentSession?.assistantName === source.model
        ? copy.model
        : currentSession?.assistantName === source.cloudName
          ? copy.cloudName
          : currentSession?.assistantName || copy.notSet;
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
          <div className="eyebrow">{copy.eyebrow}</div>
          <h1>
            {formatCopy(copy.greeting, { name: user.name || copy.friend })}
            <span className="greeting-dot">.</span>
          </h1>
          <p>{copy.tagline}</p>
        </div>
        <div className="dashboard-actions">
          <DashboardOnboarding data={data} />
          <Link className="button secondary" to={`${base}/channels?new=1`}>
            <Plus size={16} />
            {copy.addChannel}
          </Link>
        </div>
      </div>
      <section className="welcome-banner">
        <div>
          <div className="banner-kicker">
            <span className="tiny-dot" />
            {copy.bannerKicker}
          </div>
          <h2>{copy.bannerTitle}</h2>
          <p>{connected ? copy.bannerConnected : copy.bannerWaiting}</p>
          <Link to={`${base}/wechat`}>
            {connected ? copy.viewMyConnection : copy.connectMyWechat}
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="banner-chat-message banner-chat-question">{copy.bannerQuestion}</div>
          <div className="banner-chat-answer">
            <span className="banner-chat-avatar">
              <MessageCircle size={17} strokeWidth={1.7} />
            </span>
            <div className="banner-chat-message banner-chat-response">{copy.bannerAnswer}</div>
          </div>
        </div>
      </section>
      <div className="stats-grid dashboard-stats">
        <article className={`stat-card membership-stat ${data.plan === "plus" ? "is-plus" : ""}`}>
          <div>
            <span>{copy.membership}</span>
            <Crown size={18} aria-hidden="true" />
          </div>
          <strong>
            {data.plan === "plus" ? "Plus" : "Free"}
            <small>{data.plan === "plus" ? copy.plusAccount : copy.freeAccount}</small>
          </strong>
          <p>
            <span>
              {data.plan === "plus" ? (
                <time
                  dateTime={new Date(data.planUntil).toISOString()}
                  title={formatCopy(copy.expiresBeijing, {
                    date: membershipExpiry(data.planUntil, true, locale),
                  })}
                >
                  {formatCopy(copy.expires, {
                    date: membershipExpiry(data.planUntil, false, locale),
                  })}
                </time>
              ) : data.planUntil > 0 ? (
                copy.expired
              ) : (
                formatCopy(copy.dailyGrant, { credits: credits(data.wallet.dailyGrant) })
              )}
            </span>
            <Link to={`${base}/billing`}>
              {data.plan === "plus" ? copy.renew : copy.upgrade}
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </p>
        </article>
        <article className="stat-card">
          <div>
            <span>{copy.availableCredits}</span>
            <Coins size={17} />
          </div>
          <strong>
            {credits(data.wallet.balance)}
            <small>{copy.creditUnit}</small>
          </strong>
          <p>
            {formatCopy(copy.spentToday, { credits: credits(data.wallet.spentToday) })}
            <Link to={`${base}/credits`}>
              {copy.creditDetails}
              <ArrowUpRight size={12} />
            </Link>
          </p>
        </article>
        <article className="stat-card">
          <div>
            <span>{copy.channels}</span>
            <Cpu size={18} />
          </div>
          <strong>
            {String(data.channels.length).padStart(2, "0")}
            <small>{formatCopy(copy.channelLimit, { count: count(data.limits.channels) })}</small>
          </strong>
          <p>
            {formatCopy(copy.configuredModels, { models: models(data.assistants.length) })}
            <Link to={`${base}/channels`}>
              {copy.manageChannels}
              <ArrowUpRight size={12} />
            </Link>
          </p>
        </article>
        <article className="stat-card">
          <div>
            <span>{copy.totalSessions}</span>
            <MessagesSquare size={17} />
          </div>
          <strong>
            {String(data.stats.sessions).padStart(2, "0")}
            <small>{data.stats.sessions === 1 ? copy.sessionUnitOne : copy.sessionUnit}</small>
          </strong>
          <p>
            {copy.sessionTagline}
            <Link to={`${base}/sessions`}>
              {copy.sessionHistory}
              <ArrowUpRight size={12} />
            </Link>
          </p>
        </article>
      </div>
      {(!setup.service || !setup.wechat || !setup.message) && (
        <div className="onboarding-strip">
          {[
            [
              setup.service,
              copy.setupService,
              data.plugins?.length
                ? "/plugins"
                : data.channels.length
                  ? "/channels"
                  : "/channels?new=1",
            ],
            [setup.wechat, copy.setupWechat, "/wechat"],
            [setup.message, copy.setupMessage, "/wechat"],
          ].map(([done, label, path], i) => (
            <Link key={i} to={base + path}>
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
          <SectionTitle title={copy.channels} link={copy.manageChannels} to={`${base}/channels`} />
          <div className="compact-assistant-grid">
            {data.channels.slice(0, 3).map((a) => (
              <Link
                className="compact-assistant"
                to={`${base}/channels?channel=${a.id}`}
                key={a.id}
              >
                <ChannelIcon channel={a} />
                <h3>{a.name}</h3>
                <p>
                  {a.integration === "kimiseek" &&
                  a.description === source.kimiseekChannelDescription
                    ? copy.kimiseekChannelDescription
                    : a.description || a.baseUrl}
                </p>
                <div>
                  <span className="model-dot" />
                  {models(data.assistants.filter((m) => m.channelId === a.id).length)}
                  <ArrowUpRight size={14} />
                </div>
              </Link>
            ))}
            {data.channels.length < 3 && (
              <Link className="add-assistant-card" to={`${base}/channels?new=1`}>
                <span>
                  <Plus size={22} />
                </span>
                <strong>{copy.addChannel}</strong>
                <p>{copy.addChannelHelp}</p>
              </Link>
            )}
          </div>
          <div className="recent-section">
            <SectionTitle title={copy.recent} link={copy.viewAll} to={`${base}/sessions`} />
            <div className="panel recent-panel">
              {!data.stats.sessions ? (
                // 一次对话都没有的人，先看到「下一步做什么」，而不是升级广告。
                <Empty
                  icon={<MessagesSquare />}
                  title={copy.firstSessionTitle}
                  description={copy.firstSessionDescription}
                  action={
                    <Link className="text-link" to={`${base}/wechat`}>
                      {copy.connectWechat}
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
                    <h3>{copy.lockedTitle}</h3>
                    <p>{copy.lockedDescription}</p>
                  </div>
                  <Link
                    className="button secondary small"
                    to={`${base}/billing`}
                    onClick={() => trackFunnel("paywall_click", { surface: "dashboard_recent" })}
                  >
                    {copy.learnPlus}
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              ) : sessionsError ? (
                <div className="recent-error" role="alert">
                  <p>{copy.sessionsError}</p>
                  <button className="text-link" onClick={() => setSessionsRetry((n) => n + 1)}>
                    {copy.reloadSessions}
                  </button>
                </div>
              ) : sessions === null ? (
                <p className="recent-error" role="status">
                  {copy.loadingSessions}
                </p>
              ) : !sessions.length ? (
                <Empty
                  icon={<MessagesSquare />}
                  title={copy.emptySessions}
                  description={copy.emptySessionsDescription}
                  action={
                    <Link className="text-link" to={`${base}/wechat`}>
                      {copy.viewConnection}
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
                        <strong>
                          {s.title === source.newConversation ? copy.newConversation : s.title}
                        </strong>
                        <small>
                          {a && `${a.name} · `}
                          {formatCopy(s.messageCount === 1 ? copy.messagesOne : copy.messages, {
                            count: count(s.messageCount),
                          })}
                        </small>
                      </span>
                      {data.currentSession?.id === s.id && (
                        <span className="tag green">{copy.currentSession}</span>
                      )}
                      <time>{relativeTime(s.updatedAt, locale)}</time>
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
            title={formatCopy(copy.connections, {
              count: count(data.connections.length),
              limit: count(data.limits.connections),
            })}
          />
          <div className="panel connection-summary">
            <div className="connection-summary-top">
              <span className="connection-icon">
                <Link2 size={23} />
              </span>
              <span className={`tag ${connected ? "green" : ""}`}>
                <span className="tiny-dot" />
                {selectedLink?.paused ? copy.paused : connected ? copy.operational : copy.waiting}
              </span>
            </div>
            <h3>
              {selectedLink?.name === source.myWechat
                ? copy.myWechat
                : (selectedLink?.name ?? copy.connectionTitle)}
            </h3>
            <p>{connected ? copy.connectionDescription : copy.connectionPrompt}</p>
            <div className="connection-detail">
              <span>
                {data.currentSession && !data.currentSession.assistantId
                  ? copy.currentEntry
                  : copy.currentChannel}
              </span>
              <strong>{entryName}</strong>
            </div>
            <div className="connection-detail">
              <span>
                {data.currentSession && !data.currentSession.assistantId
                  ? copy.currentAgent
                  : copy.currentModel}
              </span>
              <strong>{assistantName}</strong>
            </div>
            <div className="connection-detail">
              <span>{copy.lastMessage}</span>
              <strong>
                {data.connection.lastSeen
                  ? relativeTime(data.connection.lastSeen, locale)
                  : copy.waitingForMessage}
              </strong>
            </div>
            <Link to={`${base}/wechat`}>
              {copy.manageConnections}
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="panel usage-panel">
            <div>
              <h3>{copy.weeklyUsage}</h3>
              <span>{copy.creditLabel}</span>
            </div>
            <div className="mini-chart" aria-label={copy.chartLabel}>
              {activity.map((a, i) => (
                <div
                  key={a.day}
                  title={formatCopy(copy.chartPoint, { date: a.day, credits: credits(a.credits) })}
                >
                  <span
                    style={{ height: `${Math.max(5, (a.credits / maximum) * 74)}px` }}
                    className={i === 6 ? "today" : ""}
                  />
                  <small>
                    {i === 6
                      ? copy.today
                      : locale === "zh-CN"
                        ? a.day.slice(5).replace("-", "/")
                        : shortDate.format(new Date(a.day))}
                  </small>
                </div>
              ))}
            </div>
          </div>
          <div className="gentle-tip">
            <Sparkles size={18} />
            <div>
              <h3>{copy.tipTitle}</h3>
              <p>{renderCommandCopy(copy.tip, { command: "/new" })}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
