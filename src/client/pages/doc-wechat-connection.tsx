import { ArrowRight, ChevronLeft, ChevronRight, ScanLine } from "lucide-react";

function ClawbotIcon() {
  return (
    <span className="docs-wechat-clawbot-icon" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

export function DocWechatConnection() {
  return (
    <figure className="docs-wechat-example" aria-label="微信 ClawBot 连接操作示意">
      <div className="docs-wechat-flow">
        <div className="docs-wechat-step">
          <div className="docs-wechat-step-title">
            <span>1</span>
            <strong>打开微信设置</strong>
          </div>
          <div className="docs-wechat-screen">
            <div className="docs-wechat-screen-header">
              <ChevronLeft size={19} aria-hidden="true" />
              <strong>设置</strong>
            </div>
            <div className="docs-wechat-settings">
              <span className="docs-wechat-group-label">功能</span>
              <div className="docs-wechat-menu-row">
                <span>聊天</span>
                <ChevronRight size={17} aria-hidden="true" />
              </div>
              <div className="docs-wechat-menu-row">
                <span>其他功能</span>
                <ChevronRight size={17} aria-hidden="true" />
              </div>
              <div className="docs-wechat-menu-row docs-wechat-target">
                <strong>插件</strong>
                <ChevronRight size={17} aria-hidden="true" />
              </div>
              <span className="docs-wechat-group-label">帮助与关于</span>
              <div className="docs-wechat-menu-row">
                <span>关于微信</span>
                <ChevronRight size={17} aria-hidden="true" />
              </div>
            </div>
          </div>
          <p>微信「我 → 设置」，找到「插件」。</p>
        </div>

        <ArrowRight className="docs-wechat-flow-arrow" size={24} aria-hidden="true" />

        <div className="docs-wechat-step">
          <div className="docs-wechat-step-title">
            <span>2</span>
            <strong>进入 ClawBot 详情</strong>
          </div>
          <div className="docs-wechat-screen docs-wechat-plugin-screen">
            <div className="docs-wechat-screen-header">
              <ChevronLeft size={19} aria-hidden="true" />
              <strong>插件</strong>
            </div>
            <div className="docs-wechat-plugin-card">
              <div className="docs-wechat-plugin-identity">
                <ClawbotIcon />
                <strong>微信 ClawBot</strong>
              </div>
              <span className="docs-wechat-details-target">详情</span>
              <div className="docs-wechat-chat-preview" aria-hidden="true">
                <span />
                <span />
              </div>
              <strong className="docs-wechat-plugin-caption">发送指令</strong>
              <span className="docs-wechat-plugin-subtitle">随时随地控制 OpenClaw</span>
            </div>
          </div>
          <p>找到「微信 ClawBot」，点击「详情」。</p>
        </div>

        <ArrowRight className="docs-wechat-flow-arrow" size={24} aria-hidden="true" />

        <div className="docs-wechat-step">
          <div className="docs-wechat-step-title">
            <span>3</span>
            <strong>扫码确认连接</strong>
          </div>
          <div className="docs-wechat-screen">
            <div className="docs-wechat-screen-header">
              <ChevronLeft size={19} aria-hidden="true" />
              <strong>微信 ClawBot</strong>
            </div>
            <div className="docs-wechat-clawbot-profile">
              <ClawbotIcon />
              <strong>微信 ClawBot</strong>
              <span>在微信中与 OpenClaw 收发消息</span>
            </div>
            <div className="docs-wechat-menu-row">
              <span>我的 ClawBot</span>
              <ChevronRight size={17} aria-hidden="true" />
            </div>
            <div className="docs-wechat-menu-row docs-wechat-target">
              <strong>连接新的 OpenClaw</strong>
              <ScanLine size={19} aria-hidden="true" />
            </div>
          </div>
          <p>点击「连接新的 OpenClaw」，扫描微伴的二维码并确认。</p>
        </div>
      </div>
      <figcaption>操作示意，绿色标注为需要点击的入口。不同微信版本的界面可能略有差异。</figcaption>
    </figure>
  );
}
