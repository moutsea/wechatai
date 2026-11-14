import { ArrowLeftRight, Bot } from "lucide-react";

export function DocBridgeDiagram() {
  return (
    <figure className="docs-bridge" aria-label="微伴连接微信与 AI 的工作示意图">
      <div className="docs-bridge-flow">
        <div className="docs-bridge-node">
          <img src="/images/landing/wechat-logo.svg" alt="" width="44" height="36" loading="lazy" />
          <div>
            <strong>微信</strong>
            <span>发消息 · 收结果</span>
          </div>
        </div>
        <div className="docs-bridge-connector">
          <span>ClawBot 协议</span>
          <ArrowLeftRight size={28} aria-hidden="true" />
        </div>
        <div className="docs-bridge-node docs-bridge-center">
          <img src="/favicon.svg" alt="" width="44" height="44" loading="lazy" />
          <div>
            <strong>微伴</strong>
            <span>连接与消息转发</span>
          </div>
        </div>
        <div className="docs-bridge-connector">
          <span>API / 插件</span>
          <ArrowLeftRight size={28} aria-hidden="true" />
        </div>
        <div className="docs-bridge-node">
          <Bot size={44} aria-hidden="true" />
          <div>
            <strong>模型与 Agent</strong>
            <span>理解需求 · 处理任务</span>
          </div>
        </div>
      </div>
      <figcaption>微信发出需求，AI 完成处理，微伴在两端传递消息与结果。</figcaption>
    </figure>
  );
}
