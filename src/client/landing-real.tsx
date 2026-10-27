import { Link } from "react-router-dom";
import "./landing-real.css";

// 真实使用截图（桌面版微信 / 真实工作台），不是示意图。
// 尺寸必须与 public/images/real/ 下文件一致：写了宽高，浏览器才能在图加载前留好位置，避免 CLS。
// 卡片按"同排两张比例接近"配对，避免同一行图片高度差太多显得歪。
type Shot = {
  src: string;
  width: number;
  height: number;
  alt: string;
  tag: string;
  title: string;
  body: string;
  /** 首张占满整行：桌面版微信截图缩小到半宽后，气泡里的字会看不清。 */
  wide?: boolean;
};

const SHOTS: Shot[] = [
  {
    src: "/images/real/wechat-reminder.jpg",
    width: 1382,
    height: 880,
    alt: "微信对话：发送「@助手 10 分钟之后提醒我去看火」，助手回复提醒已设置；16:50 到点后，个人助理插件主动发来提醒消息。",
    tag: "在微信里 · 个人助理",
    title: "说一句，到点它自己来找你",
    body: "「@助手 10 分钟之后提醒我去看火」——不用打开别的 App，微信里说一句就行；到点它主动发消息，你继续忙自己的。",
    wide: true,
  },
  {
    src: "/images/real/channel-add.jpg",
    width: 1260,
    height: 1118,
    alt: "工作台「添加渠道」弹窗：渠道名称填 DeepSeek，接口协议 OpenAI Chat Completions，Base URL 为 https://api.deepseek.com，API Key 一栏留空待填。",
    tag: "第一步 · 配置",
    title: "选服务商，粘贴 API Key",
    body: "选好服务商后，协议和请求地址会自动填好，你只用自己的 Key；保存完就能添加想用的模型。",
  },
  {
    src: "/images/real/wechat-connect.jpg",
    width: 1360,
    height: 1207,
    alt: "工作台「微信连接」页：一张待扫码的二维码卡片，右侧列出配置渠道、扫码确认、发送 /help 三步说明。",
    tag: "第二步 · 连接",
    title: "扫一扫，连上你的微信",
    body: "在微信「设置 → 功能 → 插件 → 微信 ClawBot → 扫一扫」扫这张码，确认后这个微信就归你自己用了。",
  },
  {
    src: "/images/real/wechat-search.jpg",
    width: 1235,
    height: 672,
    alt: "微信对话：发送「@DS 今天上海天气如何」，回答给出气温与出行建议，并列出 1、4、5 三条来源引用。",
    tag: "还能 · 联网搜索",
    title: "问到实时信息，会带来源",
    body: "「今天上海天气如何」这类问题会去查网，回答后面标出来源编号，对不对可以自己核对。",
  },
  {
    src: "/images/real/wechat-notes.jpg",
    width: 1360,
    height: 734,
    alt: "微信对话：发送「@助手 帮我记一下，寄件码是 3758」后回复已保存笔记；再说「帮我清理一下已经提醒完的项目」后回复已删除提醒。",
    tag: "还能 · 记事与提醒",
    title: "记下来的事，问一句就回来",
    body: "寄件码、待办、提醒都记在对话里；过期的提醒也可以直接让它清理，不用自己去翻。",
  },
];

export function LandingReal() {
  return (
    <section className="landing-real" id="real" aria-labelledby="landing-real-title">
      <div className="landing-real-head">
        <p className="eyebrow">REAL SCREENSHOTS</p>
        <h2 id="landing-real-title">从配置到聊天，都是真实界面</h2>
        <p>
          下面是真实使用截图（桌面版微信与真实工作台），没有摆拍的示意图。模型走你自己的
          API Key，对话只发生在你绑定的那个微信里。
        </p>
      </div>
      <div className="landing-real-grid">
        {SHOTS.map((shot) => (
          <figure key={shot.src} className={`landing-real-card${shot.wide ? " is-wide" : ""}`}>
            <img
              src={shot.src}
              width={shot.width}
              height={shot.height}
              loading="lazy"
              decoding="async"
              alt={shot.alt}
            />
            <figcaption>
              <span className="landing-real-tag">{shot.tag}</span>
              <strong>{shot.title}</strong>
              <p>{shot.body}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="landing-real-note">
        完整配置步骤见<Link to="/docs/getting-started">新手入门</Link>；
        想让微信回得更顺手，可以看
        <Link to="/docs/commands">微信命令速查</Link>；
        工作台长什么样，往下看<Link to="/#workspace">工作台预览</Link>。
      </p>
    </section>
  );
}
