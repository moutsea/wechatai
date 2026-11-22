import { ArrowLeftRight, Bot } from "lucide-react";
import { useLocale } from "../locale";

export function DocBridgeDiagram() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-bridge"
      aria-label={
        en ? "Diagram of Wechatai connecting WeChat and AI" : "微伴连接微信与 AI 的工作示意图"
      }
    >
      <div className="docs-bridge-flow">
        <div className="docs-bridge-node">
          <img src="/images/landing/wechat-logo.svg" alt="" width="44" height="36" loading="lazy" />
          <div>
            <strong>{en ? "WeChat" : "微信"}</strong>
            <span>{en ? "Send messages · receive results" : "发消息 · 收结果"}</span>
          </div>
        </div>
        <div className="docs-bridge-connector">
          <span>{en ? "ClawBot protocol" : "ClawBot 协议"}</span>
          <ArrowLeftRight size={28} aria-hidden="true" />
        </div>
        <div className="docs-bridge-node docs-bridge-center">
          <img src="/favicon.svg" alt="" width="44" height="44" loading="lazy" />
          <div>
            <strong>{en ? "Wechatai" : "微伴"}</strong>
            <span>{en ? "Connection and relay" : "连接与消息转发"}</span>
          </div>
        </div>
        <div className="docs-bridge-connector">
          <span>API / {en ? "plugins" : "插件"}</span>
          <ArrowLeftRight size={28} aria-hidden="true" />
        </div>
        <div className="docs-bridge-node">
          <Bot size={44} aria-hidden="true" />
          <div>
            <strong>{en ? "Models and Agents" : "模型与 Agent"}</strong>
            <span>{en ? "Understand · process tasks" : "理解需求 · 处理任务"}</span>
          </div>
        </div>
      </div>
      <figcaption>
        {en
          ? "WeChat sends the request, AI processes it, and Wechatai relays messages and results between them."
          : "微信发出需求，AI 完成处理，微伴在两端传递消息与结果。"}
      </figcaption>
    </figure>
  );
}
