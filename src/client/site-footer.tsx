import { Link } from "react-router-dom";
import { Brand } from "./ui";

export function SiteFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-main">
        <div className="landing-footer-brand">
          <Link to="/" aria-label="微伴首页">
            <Brand light />
          </Link>
          <p>
            在微信里，与自选的大模型对话。
            <br />
            连接你的模型与 Agent，让灵感随时有回应。
          </p>
        </div>
        <nav className="landing-footer-column" aria-label="产品">
          <h2>产品</h2>
          <Link to="/app">我的工作台</Link>
          <Link to="/app/channels">渠道与模型</Link>
          <Link to="/app/plugins">插件</Link>
          <Link to="/app/billing">会员与 credits</Link>
        </nav>
        <nav className="landing-footer-column" aria-label="使用帮助">
          <h2>使用帮助</h2>
          <Link to="/docs">文档与教程</Link>
          <Link to="/docs/getting-started">快速开始</Link>
          <Link to="/docs/commands">微信命令速查</Link>
          <Link to="/docs/sessions">会话与上下文</Link>
          <Link to="/docs/faq">常见问题</Link>
        </nav>
        <nav className="landing-footer-column" aria-label="开发者">
          <h2>开发者</h2>
          <Link to="/developers/plugins">插件开发文档</Link>
          <Link to="/developers/openclaw">OpenClaw 接入</Link>
          <Link to="/developers/hermes">Hermes 接入</Link>
          <a href="/developers/plugins.md">协议 Markdown</a>
        </nav>
        <nav className="landing-footer-column" aria-label="支持与条款">
          <h2>支持与条款</h2>
          <Link to="/terms">服务协议</Link>
          <Link to="/privacy">隐私政策</Link>
          <Link to="/contact">联系我们</Link>
        </nav>
      </div>
      <div className="landing-footer-bottom">
        <span>© {new Date().getFullYear()} Wechatai · 微伴</span>
        <p>独立开发产品，与微信、腾讯及模型供应商无官方关联。</p>
      </div>
    </footer>
  );
}
