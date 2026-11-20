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
import { useLocale } from "../locale";

export function DocWechatCode() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-channel-example"
      aria-label={
        en
          ? "Interface example for getting a WeChat connection QR code in Wechatai"
          : "在微伴获取微信连接二维码的界面示意"
      }
    >
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <strong>{en ? "WeChat connection" : "微信连接"}</strong>
          <span>{en ? "Workspace example" : "工作台示意"}</span>
        </div>
        <div className="docs-channel-example-fields">
          <div>
            <div className="docs-channel-example-label">{en ? "Manage links" : "管理链接"}</div>
            <div className="docs-channel-example-control docs-channel-example-provider">
              <span>{en ? "My WeChat · awaiting connection" : "我的微信 · 待连接"}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="docs-wechat-code-preview">
            <QrCode size={112} strokeWidth={1.2} aria-hidden="true" />
            <strong>{en ? "Generate your connection QR code" : "生成你的专属连接二维码"}</strong>
            <span>{en ? "Illustration, not scannable" : "示意图，不可扫码"}</span>
          </div>
          <div className="docs-channel-example-submit">
            {en ? "Get QR code" : "获取二维码"}
            <ArrowRight size={17} aria-hidden="true" />
          </div>
        </div>
      </div>
      <figcaption>
        {en
          ? "Get your own QR code in the workspace, then scan and confirm it with WeChat ClawBot on your phone."
          : "请在工作台获取自己的二维码，再用手机微信 ClawBot 扫码并确认。"}
      </figcaption>
    </figure>
  );
}

export function DocWechatStatus() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-wechat-verification"
      aria-label={
        en
          ? "Example of a successful WeChat connection and help command"
          : "微信连接成功并发送帮助命令的示意"
      }
    >
      <div className="docs-wechat-verification-flow">
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>{en ? "My WeChat" : "我的微信"}</strong>
            <span className="docs-wechat-connected-tag">
              <Check size={14} aria-hidden="true" /> {en ? "Connected" : "已连接"}
            </span>
          </div>
          <div className="docs-channel-example-fields">
            <div className="docs-wechat-connected-preview">
              <Link2 size={38} aria-hidden="true" />
              <strong>{en ? "Wechatai ↔ your WeChat" : "微伴 ↔ 你的微信"}</strong>
              <span>{en ? "Personal link · separate session" : "个人连接 · 独立会话"}</span>
            </div>
            <div className="docs-wechat-connection-meta">
              <div>
                <span>{en ? "Current channel" : "当前渠道"}</span>
                <strong>DeepSeek</strong>
              </div>
              <div>
                <span>{en ? "Current model" : "当前模型"}</span>
                <strong>deepseek-chat</strong>
              </div>
            </div>
            <div className="docs-channel-example-control docs-wechat-switch-preview">
              {en ? "Switch channel and model" : "切换渠道与模型"}
              <ArrowRight size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
        <ArrowRight className="docs-wechat-verification-arrow" size={24} aria-hidden="true" />
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>{en ? "WeChat ClawBot" : "微信 ClawBot"}</strong>
            <Smartphone size={21} aria-hidden="true" />
          </div>
          <div className="docs-plugin-messages">
            <div className="docs-plugin-bubble docs-plugin-bubble-user docs-plugin-command">
              /wx help
            </div>
            <div className="docs-plugin-bubble">
              <strong>{en ? "WeChat command reference" : "微信命令速查"}</strong>
              <div>/wx status · {en ? "current configuration" : "查看当前配置"}</div>
              <div>/wx models · {en ? "models" : "查看模型"}</div>
              <div>/wx plugins · {en ? "plugins" : "查看插件"}</div>
            </div>
            <span className="docs-wechat-help-note">
              {en ? "Command reply example · costs no credits" : "命令回复示意 · 不消耗 credits"}
            </span>
          </div>
        </div>
      </div>
      <figcaption>
        {en
          ? "Workspace status and WeChat help reply example. Model names are examples; a successful scan does not mean the model or plugin is configured."
          : "工作台状态与微信帮助回复示意。模型名称仅为示例，扫码成功不代表模型或插件已配置好。"}
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
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-wechat-example"
      aria-label={en ? "WeChat ClawBot connection walkthrough" : "微信 ClawBot 连接操作示意"}
    >
      <div className="docs-wechat-flow">
        <div className="docs-wechat-step">
          <div className="docs-wechat-step-title">
            <span>1</span>
            <strong>{en ? "Open WeChat settings" : "打开微信设置"}</strong>
          </div>
          <div className="docs-wechat-screen">
            <div className="docs-wechat-screen-header">
              <ChevronLeft size={19} aria-hidden="true" />
              <strong>{en ? "Settings" : "设置"}</strong>
            </div>
            <div className="docs-wechat-settings">
              <span className="docs-wechat-group-label">{en ? "Features" : "功能"}</span>
              <div className="docs-wechat-menu-row">
                <span>{en ? "Chat" : "聊天"}</span>
                <ChevronRight size={17} aria-hidden="true" />
              </div>
              <div className="docs-wechat-menu-row">
                <span>{en ? "Other features" : "其他功能"}</span>
                <ChevronRight size={17} aria-hidden="true" />
              </div>
              <div className="docs-wechat-menu-row docs-wechat-target">
                <strong>{en ? "Plugins" : "插件"}</strong>
                <ChevronRight size={17} aria-hidden="true" />
              </div>
              <span className="docs-wechat-group-label">
                {en ? "Help and about" : "帮助与关于"}
              </span>
              <div className="docs-wechat-menu-row">
                <span>{en ? "About WeChat" : "关于微信"}</span>
                <ChevronRight size={17} aria-hidden="true" />
              </div>
            </div>
          </div>
          <p>
            {en
              ? "In WeChat, open “Me → Settings” (“我 → 设置”) and find “Plugins” (“插件”)."
              : "微信「我 → 设置」，找到「插件」。"}
          </p>
        </div>

        <ArrowRight className="docs-wechat-flow-arrow" size={24} aria-hidden="true" />

        <div className="docs-wechat-step">
          <div className="docs-wechat-step-title">
            <span>2</span>
            <strong>{en ? "Open ClawBot details" : "进入 ClawBot 详情"}</strong>
          </div>
          <div className="docs-wechat-screen docs-wechat-plugin-screen">
            <div className="docs-wechat-screen-header">
              <ChevronLeft size={19} aria-hidden="true" />
              <strong>{en ? "Plugins" : "插件"}</strong>
            </div>
            <div className="docs-wechat-plugin-card">
              <div className="docs-wechat-plugin-identity">
                <ClawbotIcon />
                <strong>{en ? "WeChat ClawBot" : "微信 ClawBot"}</strong>
              </div>
              <span className="docs-wechat-details-target">{en ? "Details" : "详情"}</span>
              <div className="docs-wechat-chat-preview" aria-hidden="true">
                <span />
                <span />
              </div>
              <strong className="docs-wechat-plugin-caption">
                {en ? "Send commands" : "发送指令"}
              </strong>
              <span className="docs-wechat-plugin-subtitle">
                {en ? "Control OpenClaw anywhere" : "随时随地控制 OpenClaw"}
              </span>
            </div>
          </div>
          <p>
            {en
              ? "Find “WeChat ClawBot” (“微信 ClawBot”) and click “Details” (“详情”)."
              : "找到「微信 ClawBot」，点击「详情」。"}
          </p>
        </div>

        <ArrowRight className="docs-wechat-flow-arrow" size={24} aria-hidden="true" />

        <div className="docs-wechat-step">
          <div className="docs-wechat-step-title">
            <span>3</span>
            <strong>{en ? "Scan and confirm" : "扫码确认连接"}</strong>
          </div>
          <div className="docs-wechat-screen">
            <div className="docs-wechat-screen-header">
              <ChevronLeft size={19} aria-hidden="true" />
              <strong>{en ? "WeChat ClawBot" : "微信 ClawBot"}</strong>
            </div>
            <div className="docs-wechat-clawbot-profile">
              <ClawbotIcon />
              <strong>{en ? "WeChat ClawBot" : "微信 ClawBot"}</strong>
              <span>
                {en ? "Exchange messages with OpenClaw in WeChat" : "在微信中与 OpenClaw 收发消息"}
              </span>
            </div>
            <div className="docs-wechat-menu-row">
              <span>{en ? "My ClawBot" : "我的 ClawBot"}</span>
              <ChevronRight size={17} aria-hidden="true" />
            </div>
            <div className="docs-wechat-menu-row docs-wechat-target">
              <strong>{en ? "Connect a new OpenClaw" : "连接新的 OpenClaw"}</strong>
              <ScanLine size={19} aria-hidden="true" />
            </div>
          </div>
          <p>
            {en
              ? "Click “Connect a new OpenClaw” (“连接新的 OpenClaw”), scan Wechatai's QR code and confirm."
              : "点击「连接新的 OpenClaw」，扫描微伴的二维码并确认。"}
          </p>
        </div>
      </div>
      <figcaption>
        {en
          ? "Walkthrough; green marks the entry to click. Different WeChat versions may look slightly different."
          : "操作示意，绿色标注为需要点击的入口。不同微信版本的界面可能略有差异。"}
      </figcaption>
    </figure>
  );
}
