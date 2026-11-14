import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Link2,
  QrCode,
  ScanLine,
  Smartphone,
} from "lucide-react";

export function DocWechatCode() {
  return (
    <figure className="docs-channel-example" aria-label="在微伴获取微信连接二维码的界面示意">
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <strong>微信连接</strong>
          <span>工作台示意</span>
        </div>
        <div className="docs-channel-example-fields">
          <div>
            <div className="docs-channel-example-label">管理链接</div>
            <div className="docs-channel-example-control docs-channel-example-provider">
              <span>我的微信 · 待连接</span>
              <ChevronDown size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="docs-wechat-code-preview">
            <QrCode size={112} strokeWidth={1.2} aria-hidden="true" />
            <strong>生成你的专属连接二维码</strong>
            <span>示意图，不可扫码</span>
          </div>
          <div className="docs-channel-example-submit">
            获取二维码
            <ArrowRight size={17} aria-hidden="true" />
          </div>
        </div>
      </div>
      <figcaption>请在工作台获取自己的二维码，再用手机微信 ClawBot 扫码并确认。</figcaption>
    </figure>
  );
}

export function DocWechatStatus() {
  return (
    <figure className="docs-wechat-verification" aria-label="微信连接成功并发送帮助命令的示意">
      <div className="docs-wechat-verification-flow">
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>我的微信</strong>
            <span className="docs-wechat-connected-tag">
              <Check size={14} aria-hidden="true" /> 已连接
            </span>
          </div>
          <div className="docs-channel-example-fields">
            <div className="docs-wechat-connected-preview">
              <Link2 size={38} aria-hidden="true" />
              <strong>微伴 ↔ 你的微信</strong>
              <span>个人连接 · 独立会话</span>
            </div>
            <div className="docs-wechat-connection-meta">
              <div>
                <span>当前渠道</span>
                <strong>DeepSeek</strong>
              </div>
              <div>
                <span>当前模型</span>
                <strong>deepseek-chat</strong>
              </div>
            </div>
            <div className="docs-channel-example-control docs-wechat-switch-preview">
              切换渠道与模型
              <ArrowRight size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
        <ArrowRight className="docs-wechat-verification-arrow" size={24} aria-hidden="true" />
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>微信 ClawBot</strong>
            <Smartphone size={21} aria-hidden="true" />
          </div>
          <div className="docs-plugin-messages">
            <div className="docs-plugin-bubble docs-plugin-bubble-user docs-plugin-command">
              /wx help
            </div>
            <div className="docs-plugin-bubble">
              <strong>微信命令速查</strong>
              <div>/wx status · 查看当前配置</div>
              <div>/wx models · 查看模型</div>
              <div>/wx plugins · 查看插件</div>
            </div>
            <span className="docs-wechat-help-note">命令回复示意 · 不消耗 credits</span>
          </div>
        </div>
      </div>
      <figcaption>
        工作台状态与微信帮助回复示意。模型名称仅为示例，扫码成功不代表模型或插件已配置好。
      </figcaption>
    </figure>
  );
}

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
