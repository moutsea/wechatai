import { isChatModel } from "../../shared/model-compatibility";
import { RoleSummary } from "./role-summary";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Archive,
  BookOpen,
  ArrowRight,
  Check,
  History,
  LockKeyhole,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  ArchiveRestore,
  ChevronLeft,
  MessageCircle,
} from "lucide-react";
import { useApp } from "../context";
import { Empty, Modal, PageHead, relativeTime } from "../ui";
import { json } from "../api";
import { type ChatMessage, type ChatSession } from "../../shared/types";
import { ChatMessageBubble, ModelAvatar } from "../chat-message";
import { pluginIconSource, roleAvatarSource } from "../../shared/plugin-visuals";
export function Sessions() {
  const { data, base, request, refresh, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selected, setSelected] = useState(params.get("id") || "");
  const [mobileDetail, setMobileDetail] = useState(Boolean(params.get("id")));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tab, setTab] = useState("active");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [summaryId, setSummaryId] = useState("");
  const [operation, setOperation] = useState("");
  const [title, setTitle] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [version, setVersion] = useState(0);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const selectedRef = useRef(selected);
  const messageRequest = useRef(0);
  const messageViewport = useRef<HTMLDivElement>(null);
  const scrollIntent = useRef<"latest" | { height: number; top: number } | null>(null);
  selectedRef.current = selected;
  const load = useCallback(async () => {
    if (data?.plan !== "plus") {
      setLoading(false);
      return;
    }
    try {
      const rows = await request<ChatSession[]>("/sessions");
      setSessions(rows);
      setSelected((prev) => (rows.some((s) => s.id === prev) ? prev : rows[0]?.id || ""));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [request, data?.plan, notify]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    messageRequest.current++;
    scrollIntent.current = null;
    setMessageError("");
    setMessages([]);
    if (!selected || data?.plan !== "plus") {
      return;
    }
    let canceled = false;
    setLoadingMessages(true);
    setHasOlder(false);
    setLoadingOlder(false);
    void request<ChatMessage[]>(`/sessions/${selected}/messages`)
      .then((rows) => {
        if (!canceled) {
          scrollIntent.current = "latest";
          setMessages(rows);
          setHasOlder(rows.length === 100);
        }
      })
      .catch((e) => {
        if (!canceled) setMessageError(e.message || "暂时无法读取消息");
      })
      .finally(() => {
        if (!canceled) setLoadingMessages(false);
      });
    return () => {
      canceled = true;
    };
  }, [selected, request, data?.plan, version, notify]);
  useLayoutEffect(() => {
    const viewport = messageViewport.current;
    const intent = scrollIntent.current;
    if (!viewport || !viewport.clientHeight || loadingMessages || !intent) return;
    viewport.scrollTop =
      intent === "latest"
        ? viewport.scrollHeight
        : intent.top + viewport.scrollHeight - intent.height;
    scrollIntent.current = null;
  }, [messages, loadingMessages, mobileDetail]);
  const loadOlder = async () => {
    if (!messages[0] || loadingOlder) return;
    const sessionId = selected;
    const requestVersion = messageRequest.current;
    setLoadingOlder(true);
    try {
      const older = await request<ChatMessage[]>(
        `/sessions/${sessionId}/messages?before=${messages[0].id}`,
      );
      if (selectedRef.current === sessionId && messageRequest.current === requestVersion) {
        const viewport = messageViewport.current;
        if (viewport)
          scrollIntent.current = { height: viewport.scrollHeight, top: viewport.scrollTop };
        setMessages((m) => [...older, ...m]);
        setHasOlder(older.length === 100);
      }
    } catch (error) {
      if (selectedRef.current === sessionId && messageRequest.current === requestVersion)
        notify((error as Error).message, true);
    } finally {
      if (selectedRef.current === sessionId && messageRequest.current === requestVersion)
        setLoadingOlder(false);
    }
  };
  if (!data) return null;
  const textModels = data.assistants.filter(isChatModel);
  const pluginName = (s: ChatSession) =>
    data.plugins?.find((p) => p.id === s.pluginInstanceId)?.name || s.pluginName;
  const sessionAvatar = (s: ChatSession) => {
    const plugin = data.plugins?.find((p) => p.id === s.pluginInstanceId);
    if (!plugin) return undefined;
    return (
      (plugin.pluginId === "wechatai/roleplay" && roleAvatarSource(plugin.avatar)) ||
      pluginIconSource(plugin.pluginId)
    );
  };
  const session = sessions.find((s) => s.id === selected);
  const role = data.plugins?.find(
    (p) => p.id === session?.pluginInstanceId && p.pluginId === "wechatai/roleplay",
  );
  const assistant = data.assistants.find((a) => a.id === session?.assistantId);
  const visible = sessions.filter(
    (s) =>
      s.archived === (tab === "archived") && s.title.toLowerCase().includes(query.toLowerCase()),
  );
  const act = async (action: string) => {
    if (!session && action !== "new") return;
    setBusy(true);
    try {
      if (action === "new" || action === "new-story") {
        const created = await request<ChatSession>(
          "/sessions",
          json({
            assistantId,
            ...(action === "new-story" ? { pluginInstanceId: role?.id } : {}),
            title: action === "new-story" ? "新的对话" : title || "新的对话",
            connectionId:
              action === "new-story"
                ? (session?.connectionId ?? "default")
                : data.selectedConnectionId,
          }),
        );
        setSelected(created.id);
        setTab("active");
        setMobileDetail(true);
      } else {
        await request(`/sessions/${selected}`, json({ action, title }));
      }
      await refresh();
      await load();
      setVersion((v) => v + 1);
      setOperation("");
      setMore(false);
      notify(
        (
          {
            switch: "已切换微信当前会话",
            rename: "会话已重命名",
            reset: "上下文已重置，原记录保留",
            archive: "会话已归档",
            restore: "会话已恢复",
            clear: "当前会话记录已清空",
            delete: "会话已删除",
            new: "新会话已创建，并设为微信当前会话",
            "new-story": "新故事已创建，原会话已保留",
          } as Record<string, string>
        )[action] || "操作完成",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  if (data.plan !== "plus")
    return (
      <div className="page-enter">
        <PageHead
          eyebrow="EVERY CONVERSATION MATTERS"
          title="会话记录"
          description="把聊过的灵感，留在触手可及的地方。"
        />
        <div className="premium-gate panel">
          <span className="premium-gate-icon">
            <LockKeyhole size={34} />
          </span>
          <span className="tag green">PLUS 专属</span>
          <h2>不止聊过，还可以回看。</h2>
          <p>
            升级 Plus，在网页查看微信聊天记录，
            <br />
            整理话题、切换会话，让每一个想法都有自己的位置。
          </p>
          <div className="gate-features">
            <span>
              <Check size={16} />
              完整会话记录
            </span>
            <span>
              <Check size={16} />
              归档与恢复
            </span>
            <span>
              <Check size={16} />
              网页切换会话
            </span>
          </div>
          <Link className="button" to={`${base}/billing`}>
            了解 Plus
            <ArrowRight size={17} />
          </Link>
          <small>Free 仍可在微信使用 /new、/sessions、/switch 等会话指令。</small>
        </div>
      </div>
    );
  return (
    <div className="sessions-page page-enter">
      {summaryId && (
        <RoleSummary key={summaryId} sessionId={summaryId} onClose={() => setSummaryId("")} />
      )}
      <PageHead
        eyebrow="EVERY CONVERSATION MATTERS"
        title="会话记录"
        description="一个话题，一个空间。随时回来，继续未完的对话。"
        action={
          <button
            className="button"
            disabled={!textModels.length}
            onClick={() => {
              setAssistantId(textModels[0]?.id || "");
              setTitle("");
              setOperation("new");
            }}
          >
            <Plus size={17} />
            新建会话
          </button>
        }
      />
      <div className={`sessions-workspace panel ${mobileDetail ? "is-detail" : ""}`}>
        <aside className="session-sidebar">
          <div className="session-tabs">
            <button
              className={tab === "active" ? "active" : ""}
              aria-pressed={tab === "active"}
              onClick={() => setTab("active")}
            >
              全部会话<span>{sessions.filter((s) => !s.archived).length}</span>
            </button>
            <button
              className={tab === "archived" ? "active" : ""}
              aria-pressed={tab === "archived"}
              onClick={() => setTab("archived")}
            >
              <Archive size={14} />
              已归档
            </button>
          </div>
          <div className="session-search">
            <Search size={16} />
            <input
              aria-label="搜索会话名称"
              placeholder="搜索会话名称…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="session-list">
            {loading ? (
              <div className="list-loading">正在加载会话…</div>
            ) : visible.length ? (
              visible.map((s) => {
                const a = data.assistants.find((a) => a.id === s.assistantId);
                return (
                  <button
                    key={s.id}
                    className={`session-item ${s.id === selected ? "selected" : ""}`}
                    aria-current={s.id === selected ? "true" : undefined}
                    onClick={() => {
                      setSelected(s.id);
                      setParams({ id: s.id }, { replace: true });
                      setMore(false);
                      setMobileDetail(true);
                    }}
                  >
                    <ModelAvatar src={sessionAvatar(s)} />
                    <div className="session-item-copy">
                      <div className="session-item-title">
                        <strong>{s.title}</strong>
                        <time>{relativeTime(s.updatedAt)}</time>
                      </div>
                      <p>
                        <span>
                          {data.connections.find((l) => l.id === (s.connectionId ?? "default"))
                            ?.name ?? "已删除链接"}{" "}
                          · {pluginName(s) || a?.name || "模型"}
                        </span>
                        {data.connections.some((l) => l.currentSessionId === s.id) && (
                          <span
                            className="session-current-dot"
                            title="微信当前会话"
                            aria-label="微信当前会话"
                          />
                        )}
                      </p>
                    </div>
                  </button>
                );
              })
            ) : (
              <Empty
                title={
                  query ? "没有匹配的会话" : tab === "archived" ? "还没有归档会话" : "还没有会话"
                }
                description={query ? "试试其他名称。" : "在微信开始聊天，或新建一个会话。"}
              />
            )}
          </div>
          <div className="session-sidebar-foot">
            <History size={14} />
            {sessions.length} / {data.limits.sessions} 个会话
          </div>
        </aside>
        <section className="session-detail">
          {session ? (
            <>
              <div className="session-detail-head">
                <button
                  type="button"
                  className="icon-button session-back"
                  aria-label="返回会话列表"
                  onClick={() => {
                    setMobileDetail(false);
                    setMore(false);
                    setParams({}, { replace: true });
                  }}
                >
                  <ChevronLeft size={21} />
                </button>
                <div className="session-heading">
                  <h2>
                    {session.title}
                    {session.archived && <span className="tag">已归档</span>}
                  </h2>
                  <p>
                    {data.connections.find((l) => l.id === (session.connectionId ?? "default"))
                      ?.name ?? "已删除链接"}{" "}
                    · {pluginName(session) ? `${pluginName(session)} · ` : ""}
                    {assistant ? (
                      <>
                        {assistant.channelName} / {assistant.name}
                        <span>·</span>
                        {assistant.model}
                      </>
                    ) : (
                      "远端 Agent 会话"
                    )}
                  </p>
                </div>
                <div className="session-head-actions">
                  {data.connections.some((l) => l.currentSessionId === session.id) ? (
                    <span className="tag green">
                      <span className="tiny-dot" />
                      微信当前会话
                    </span>
                  ) : (
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => void act(session.archived ? "restore" : "switch")}
                    >
                      {session.archived ? "恢复会话" : "切换到微信"}
                      <ArrowRight size={14} />
                    </button>
                  )}
                  <div className="dropdown-anchor">
                    <button
                      className="icon-button"
                      aria-label="会话操作"
                      aria-expanded={more}
                      onClick={() => setMore(!more)}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                    {more && (
                      <div className="dropdown-menu">
                        {role && (
                          <>
                            <button
                              onClick={() => {
                                setSummaryId(session.id);
                                setMore(false);
                              }}
                            >
                              <BookOpen size={15} />
                              剧情摘要
                            </button>
                            <button
                              disabled={busy || !role.enabled}
                              onClick={() => {
                                setMore(false);
                                void act("new-story");
                              }}
                            >
                              <Plus size={15} />
                              开始新故事
                            </button>
                          </>
                        )}
                        {[
                          ["rename", "重命名", Pencil],
                          ["reset", "重置上下文", RotateCcw],
                          [
                            session.archived ? "restore" : "archive",
                            session.archived ? "恢复会话" : "归档会话",
                            session.archived ? ArchiveRestore : Archive,
                          ],
                          ["clear", "清空消息", History],
                          ["delete", "删除会话", Trash2],
                        ].map(([action, label, Icon]) => {
                          const I = Icon as typeof Pencil;
                          return (
                            <button
                              key={String(action)}
                              className={
                                action === "delete" || action === "clear" ? "danger-text" : ""
                              }
                              onClick={() => {
                                setTitle(session.title);
                                setOperation(String(action));
                                setMore(false);
                              }}
                            >
                              <I size={15} />
                              {String(label)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div
                className="session-messages"
                ref={messageViewport}
                role="region"
                tabIndex={0}
                aria-label="聊天记录"
                aria-busy={loadingMessages}
              >
                {loadingMessages ? (
                  <div className="list-loading">正在读取消息…</div>
                ) : messageError ? (
                  <div className="session-message-error" role="alert">
                    <p>{messageError}</p>
                    <button
                      className="button secondary small"
                      onClick={() => setVersion((v) => v + 1)}
                    >
                      重新加载
                    </button>
                  </div>
                ) : (
                  <>
                    {hasOlder && (
                      <button
                        className="load-older"
                        disabled={loadingOlder}
                        onClick={() => void loadOlder()}
                      >
                        {loadingOlder ? "正在加载…" : "加载更早的消息"}
                      </button>
                    )}
                    {messages.length ? (
                      messages.map((m, index) => (
                        <Fragment key={m.id}>
                          {(index === 0 ||
                            new Date(m.createdAt).toDateString() !==
                              new Date(messages[index - 1].createdAt).toDateString()) && (
                            <div className="message-day">
                              <time dateTime={new Date(m.createdAt).toISOString()}>
                                {new Date(m.createdAt).toLocaleDateString("zh-CN", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </time>
                            </div>
                          )}
                          <ChatMessageBubble
                            message={m}
                            modelName={pluginName(session) || assistant?.name}
                            avatar={sessionAvatar(session)}
                          />
                        </Fragment>
                      ))
                    ) : (
                      <Empty
                        icon={<MessagesSquare size={26} />}
                        title="为新的想法，留一页空白"
                        description="在微信发送消息，就可以从这里回看对话。"
                      />
                    )}
                  </>
                )}
              </div>
              <div className="session-readonly">
                <MessageCircle size={17} />
                <div>
                  <strong>在微信继续对话</strong>
                  <p>这里用于回看与整理，查看记录不会切换当前会话。</p>
                </div>
                <span>仅查看</span>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="icon-button session-back"
                aria-label="返回会话列表"
                onClick={() => {
                  setMobileDetail(false);
                  setParams({}, { replace: true });
                }}
              >
                <ChevronLeft size={21} />
              </button>
              <Empty
                icon={<MessagesSquare size={30} />}
                title="每一段对话，都有自己的位置"
                description="从左侧选择一个会话，或创建新的话题。"
              />
            </>
          )}
        </section>
      </div>
      {operation && (
        <Modal
          title={
            (
              {
                new: "开启一段新对话",
                rename: "给会话起个名字",
                reset: "重置模型上下文？",
                archive: "归档这段对话？",
                restore: "恢复这段对话？",
                clear: "清空会话消息？",
                delete: "永久删除这个会话？",
              } as Record<string, string>
            )[operation]
          }
          description={
            (
              {
                new: `将为「${data.connections.find((l) => l.id === data.selectedConnectionId)?.name ?? "我的微信"}」创建并切换到新会话。`,
                rename: "用一个容易找到的名字，记住这个话题。",
                reset: "历史消息仍然保留，后续请求不再把它们发送给模型。",
                archive: "记录会移入归档。如这是当前会话，将自动开启新会话。",
                restore: "会话将回到常用列表，恢复后可以手动切换继续聊。",
                clear: "平台上的消息记录和模型上下文都会删除，无法恢复。",
                delete: "会话及其消息会从平台删除，无法恢复。微信里的消息不受影响。",
              } as Record<string, string>
            )[operation]
          }
          onClose={() => {
            if (!busy) setOperation("");
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(operation);
            }}
          >
            {["new", "rename"].includes(operation) && (
              <div className="form-body">
                {operation === "new" && data.connections.length > 1 && (
                  <label>
                    微信链接
                    <select
                      value={data.selectedConnectionId}
                      disabled={busy}
                      onChange={async (e) => {
                        setBusy(true);
                        try {
                          await request(`/wechat/links/${e.target.value}/select`, {
                            method: "POST",
                          });
                          await refresh();
                        } catch (error) {
                          notify((error as Error).message, true);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {data.connections
                        .filter((l) => !l.paused)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label>
                  会话名称
                  <input
                    autoFocus
                    required={operation === "rename"}
                    maxLength={80}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：新项目的灵感"
                  />
                </label>
                {operation === "new" && (
                  <label>
                    使用哪个模型
                    <select value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
                      {textModels.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.channelName} / {a.name} · {a.model}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setOperation("")}
                disabled={busy}
              >
                取消
              </button>
              <button
                className={`button ${["clear", "delete"].includes(operation) ? "danger" : ""}`}
                disabled={busy}
              >
                {busy ? "正在处理…" : "确认"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
