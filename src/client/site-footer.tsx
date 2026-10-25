import { Link } from "react-router-dom";
import { Brand } from "./ui";
import { DOC_TUTORIALS, docPath } from "../shared/docs";

// 页脚五列并肩，长标题会换行把整列撑高；优先用文档自带的短标题（navTitle）。
const footerLabel = (article: { title: string; navTitle?: string }) =>
  article.navTitle ?? article.title;

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
          <p className="landing-footer-title">产品</p>
          <Link to="/wechat-ai">微信 AI 助手</Link>
          <Link to="/wechat-ai-options">方案对比</Link>
          <Link to="/pricing">价格与免费额度</Link>
          <Link to="/app">我的工作台</Link>
          <Link to="/docs/channels-models">渠道与模型</Link>
          <Link to="/docs/credits">会员与 credits</Link>
        </nav>
        <nav className="landing-footer-column" aria-label="使用帮助">
          <p className="landing-footer-title">使用帮助</p>
          <Link to="/docs">文档与教程</Link>
          <Link to="/wechat-clawbot">ClawBot 绑定与排查</Link>
          <Link to="/wechat-clawbot-models">ClawBot 支持哪些模型</Link>
          <Link to="/wechat-ai-ban-risk">用 AI 会不会封号</Link>
          <Link to="/wechat-deepseek">在微信里用 DeepSeek</Link>
          <Link to="/wechat-claude">在微信里用 Claude</Link>
          <Link to="/wechat-gpt">在微信里用 GPT</Link>
          <Link to="/docs/faq">常见问题</Link>
        </nav>
        <nav className="landing-footer-column" aria-label="开发者">
          <p className="landing-footer-title">开发者</p>
          <Link to="/developers/plugins">插件开发文档</Link>
          <Link to="/developers/openclaw">OpenClaw 接入</Link>
          <Link to="/developers/hermes">Hermes 接入</Link>
          <Link to="/wechat-agent">微信接入 Agent</Link>
          <Link to="/bring-your-own-api-key">自带 API Key</Link>
          <a href="/developers/plugins.md">协议 Markdown</a>
        </nav>
        <nav className="landing-footer-column" aria-label="实操教程">
          <p className="landing-footer-title">实操教程</p>
          {DOC_TUTORIALS.map((article) => (
            <Link key={article.slug} to={docPath(article.slug)}>
              {footerLabel(article)}
            </Link>
          ))}
        </nav>
        <nav className="landing-footer-column" aria-label="支持与条款">
          <p className="landing-footer-title">支持与条款</p>
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
