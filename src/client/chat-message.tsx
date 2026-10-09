import { ChevronDown, MessageCircle, RotateCcw } from "lucide-react";
import { formatCredits, type ChatMessage } from "../shared/types";
import { ChatMarkdown, CopyMessage } from "./chat-markdown";

export function ModelAvatar() {
  return (
    <span className="message-avatar assistant" aria-hidden="true">
      <MessageCircle size={18} strokeWidth={1.7} />
    </span>
  );
}

export function ChatMessageBubble({
  message,
  modelName,
}: {
  message: ChatMessage;
  modelName?: string;
}) {
  if (message.role === "system")
    return (
      <div className="context-divider">
        <RotateCcw size={13} />
        {message.content}
      </div>
    );
  const isUser = message.role === "user";
  return (
    <article
      className={`chat-message ${message.role}`}
      aria-label={isUser ? "我的消息" : "模型回复"}
    >
      {isUser ? (
        <span className="message-avatar user" aria-hidden="true">
          我
        </span>
      ) : (
        <ModelAvatar />
      )}
      <div className="message-body">
        <div className="message-label">
          <span title={isUser ? undefined : message.model}>
            {isUser ? "我" : modelName || message.model || "AI"}
          </span>
          <time
            dateTime={new Date(message.createdAt).toISOString()}
            title={new Date(message.createdAt).toLocaleString("zh-CN")}
          >
            {new Date(message.createdAt).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        <div className="message-content">
          {isUser ? (
            message.content
          ) : (
            <ChatMarkdown content={message.content} id={`${message.sessionId}-${message.id}`} />
          )}
        </div>
        {!isUser && (
          <div className="message-tools">
            <CopyMessage text={message.content} />
            <details className="message-usage">
              <summary>
                {formatCredits(message.cost)} credits
                <ChevronDown size={12} />
              </summary>
              <span>
                {message.inputTokens.toLocaleString()} 输入 ·{" "}
                {message.outputTokens.toLocaleString()} 输出{message.estimated && "（估算）"}
              </span>
            </details>
          </div>
        )}
      </div>
    </article>
  );
}
