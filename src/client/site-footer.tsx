import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Brand } from "./ui";
import { DOC_TUTORIALS, docPath } from "../shared/docs";

const footerLabel = (article: { title: string; navTitle?: string }) =>
  article.navTitle ?? article.title;

const footerGroups = [
  {
    title: "产品",
    links: [
      ["/wechat-ai", "微信 AI 助手"],
      ["/wechat-ai-options", "方案对比"],
      ["/pricing", "价格与免费额度"],
      ["/app", "我的工作台"],
      ["/docs/channels-models", "渠道与模型"],
      ["/docs/credits", "会员与 credits"],
    ],
  },
  {
    title: "使用帮助",
    links: [
      ["/docs", "文档与教程"],
      ["/wechat-clawbot", "ClawBot 绑定与排查"],
      ["/wechat-clawbot-models", "ClawBot 支持哪些模型"],
      ["/wechat-ai-ban-risk", "用 AI 会不会封号"],
      ["/wechat-deepseek", "在微信里用 DeepSeek"],
      ["/wechat-claude", "在微信里用 Claude"],
      ["/wechat-gpt", "在微信里用 GPT"],
      ["/docs/faq", "常见问题"],
    ],
  },
  {
    title: "开发者",
    links: [
      ["/developers/plugins", "插件开发文档"],
      ["/developers/openclaw", "OpenClaw 接入"],
      ["/developers/hermes", "Hermes 接入"],
      ["/developers/muse", "Muse 接入"],
      ["/wechat-agent", "微信接入 Agent"],
      ["/bring-your-own-api-key", "自带 API Key"],
      ["/developers/plugins.md", "协议 Markdown"],
    ],
  },
  {
    title: "实操教程",
    links: DOC_TUTORIALS.map((article) => [
      docPath(article.slug),
      footerLabel(article),
    ]),
  },
  {
    title: "支持与条款",
    links: [
      ["/terms", "服务协议"],
      ["/privacy", "隐私政策"],
      ["/contact", "联系我们"],
      ["/contact#maintainer", "维护者与项目来源"],
      ["https://github.com/moutsea/wechatai", "项目源码与维护者"],
      ["https://github.com/moutsea/wechatai/commits/main/", "公开变更记录"],
    ],
  },
];

function FooterLinks({ links }: { links: string[][] }) {
  return links.map(([href, label]) =>
    href.startsWith("https://") || href.endsWith(".md") ? (
      <a key={href} href={href}>
        {label}
      </a>
    ) : (
      <Link key={href} to={href}>
        {label}
      </Link>
    ),
  );
}

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
            <span>连接你的模型与 Agent，让灵感随时有回应。</span>
          </p>
        </div>
        <div className="landing-footer-desktop">
          {footerGroups.map(({ title, links }) => (
            <nav className="landing-footer-column" aria-label={title} key={title}>
              <p className="landing-footer-title">{title}</p>
              <FooterLinks links={links} />
            </nav>
          ))}
        </div>
        <nav className="landing-footer-mobile" aria-label="页脚导航">
          <div className="landing-footer-quick">
            <FooterLinks
              links={[
                ["/app", "进入工作台"],
                ["/pricing", "价格与额度"],
                ["/docs/getting-started", "入门教程"],
                ["/contact", "联系我们"],
                ["/privacy", "隐私政策"],
                ["https://github.com/moutsea/wechatai", "GitHub 开源"],
              ]}
            />
          </div>
          {footerGroups.map(({ title, links }, index) => (
            <details id={`footer-group-${index}`} key={title}>
              <summary>
                <ChevronDown size={16} aria-hidden="true" />
                {title}
              </summary>
              <div className="landing-footer-column">
                <FooterLinks links={links} />
              </div>
            </details>
          ))}
        </nav>
      </div>
      <div className="landing-footer-bottom">
        <span>© {new Date().getFullYear()} 微伴 Wechatai</span>
        <p>独立开发产品，与微信、腾讯及模型供应商无官方关联。</p>
      </div>
    </footer>
  );
}
