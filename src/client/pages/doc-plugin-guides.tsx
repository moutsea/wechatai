import { ArrowRight, BookOpen, Check, FileText } from "lucide-react";
import { pluginIconSource } from "../../shared/plugin-visuals";

const examples = {
  cloud: {
    pluginId: "wechatai/cloud-agent",
    name: "小薇",
    fields: [
      ["使用模型", "跟随微信当前文本模型"],
      ["微信快捷名称", "小薇"],
    ],
    command: "/use 小薇",
    request: "把刚才暂存的 Markdown 转成 Word，保留标题层级。",
    reply: "任务完成，可在微信接收文件，也可前往云端任务页下载。",
    caption: "先发附件，等暂存成功后再发送完整要求；任务页可查看进度。",
  },
  search: {
    pluginId: "wechatai/web-research",
    name: "DS Chat",
    fields: [
      ["回答模型", "已配置的文本模型"],
      ["搜索 API", "DeepSeek 原生搜索 + 自备密钥"],
      ["微信快捷名称", "ds"],
    ],
    command: "/use ds",
    request: "查一下今天上海的天气，并附上来源。",
    reply: "搜索结果 → 阅读相关网页 → 整理回答与来源",
    caption: "联网问答流程示意。实际是否搜索、能否读取网页，取决于模型和接口。",
  },
  roleplay: {
    pluginId: "wechatai/roleplay",
    name: "角色扮演",
    fields: [
      ["回答模型", "已配置的文本模型"],
      ["内置角色", "陆星野 · 自信冒险家"],
      ["微信快捷名称", "星野"],
    ],
    command: "/use 星野",
    request: "今天的天台咖啡摊，有什么新故事？",
    reply: "风把菜单翻了个面，倒替我起好了新品名。先坐，你的故事也算今天的特别供应。",
    caption: "角色对话示意。选择内置角色后，还可以修改人设、场景和开场白。",
  },
  assistant: {
    pluginId: "wechatai/personal-assistant",
    name: "个人助理",
    fields: [
      ["回答模型", "支持工具调用的文本模型"],
      ["默认记账币种", "CNY"],
      ["微信快捷名称", "助理"],
    ],
    command: "/use 助理",
    request: "今天午饭花了 32 元，帮我记一笔。",
    reply: "已记录：午饭 · 支出 ¥32.00。可继续在微信查询，也可在「我的记录」中查看。",
    caption: "记账流程示意。实际保存的金额、日期和分类请以记录为准。",
  },
  notification: {
    pluginId: "wechatai/notification",
    name: "消息提醒",
    fields: [
      ["通知来源名称", "订单通知"],
      ["接收微信", "我的微信（已连接）"],
    ],
    command: "/wx help",
    request: "订单已支付，金额 ¥9.90",
    reply: "收款成功",
    caption: "配置与使用流程示意。无需模型，也不需要通过 /use 进入插件。",
  },
} as const;

export function DocPluginGuide({ kind }: { kind: keyof typeof examples }) {
  const example = examples[kind];
  return (
    <figure className="docs-plugin-example" aria-label={`${example.name}配置与使用示意`}>
      <div className="docs-plugin-guide-grid">
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <div className="docs-plugin-heading">
              <img
                src={pluginIconSource(example.pluginId)}
                alt=""
                width="30"
                height="30"
                loading="lazy"
              />
              <strong>{example.name}</strong>
            </div>
            <span>配置示意</span>
          </div>
          <dl className="docs-plugin-guide-fields">
            {example.fields.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="docs-plugin-guide-footer">
            <Check size={16} aria-hidden="true" />
            {kind === "notification" ? "保存后生成专属 Token" : "保存配置并启用"}
            <ArrowRight size={16} aria-hidden="true" />
          </div>
        </div>
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>微信 ClawBot</strong>
            <span>使用示意</span>
          </div>
          <div className="docs-plugin-messages">
            <div className="docs-plugin-bubble docs-plugin-bubble-user docs-plugin-command">
              {example.command}
            </div>
            {kind === "cloud" && <div className="docs-attachment-stage">已暂存附件 · 原稿.md</div>}
            {kind === "notification" ? (
              <>
                <div className="docs-attachment-stage">服务端提交后，微信接收通知</div>
                <div className="docs-plugin-bubble">
                  <strong>{example.reply}</strong>
                  <div>{example.request}</div>
                </div>
              </>
            ) : (
              <>
                <div className="docs-plugin-bubble docs-plugin-bubble-user">{example.request}</div>
                <div className="docs-plugin-bubble">{example.reply}</div>
              </>
            )}
            {kind === "cloud" && (
              <div className="docs-plugin-guide-file">
                <FileText size={26} aria-hidden="true" />
                <div>
                  <strong>整理后的文档.docx</strong>
                  <span>生成文件示例 · 保留 30 天</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <figcaption>{example.caption}</figcaption>
    </figure>
  );
}

export function DocNotificationDelivery() {
  const steps = [
    ["01", "服务端提交", "携带专属 Token 发送请求"],
    ["202", "已进入队列", "pending：等待发送"],
    ["sent", "接口确认发送", "查询投递结果，非用户已读"],
  ];
  return (
    <figure className="docs-plugin-example" aria-label="消息提醒从提交到确认发送的流程示意">
      <div className="docs-notification-flow">
        {steps.map(([mark, title, description]) => (
          <div key={mark}>
            <span className="docs-attachment-stage">{mark}</span>
            <strong>{title}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>
      <figcaption>HTTP 202 只表示受理成功。请在「最近投递」或查询接口中确认最终状态。</figcaption>
    </figure>
  );
}

export function DocRoleplayLore() {
  return (
    <figure className="docs-plugin-example" aria-label="世界书关键词触发及角色回应的示意">
      <div className="docs-plugin-guide-grid">
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <div className="docs-plugin-heading">
              <BookOpen size={24} aria-hidden="true" />
              <strong>世界书</strong>
            </div>
            <span>条目示意</span>
          </div>
          <dl className="docs-plugin-guide-fields">
            <div>
              <dt>名称</dt>
              <dd>咖啡摊营业规则</dd>
            </div>
            <div>
              <dt>触发关键词</dt>
              <dd>天台,咖啡摊</dd>
            </div>
            <div>
              <dt>设定内容</dt>
              <dd>陆星野的天台咖啡摊只在晴天营业，雨天收摊。</dd>
            </div>
          </dl>
          <div className="docs-plugin-guide-footer">
            <Check size={16} aria-hidden="true" /> 启用条目，保存角色
            <ArrowRight size={16} aria-hidden="true" />
          </div>
        </div>
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>与星野聊天</strong>
            <span>对话示意</span>
          </div>
          <div className="docs-plugin-messages">
            <div className="docs-plugin-bubble docs-plugin-bubble-user">
              今天下雨，天台的咖啡摊还开吗？
            </div>
            <div className="docs-attachment-stage">命中关键词 → 把营业规则加入上下文</div>
            <div className="docs-plugin-bubble">
              今天收摊，风太大，纸杯先投降了。等放晴我再支摊，给你留个靠栏杆的位置。
            </div>
          </div>
        </div>
      </div>
      <figcaption>
        只补充这次相关的背景，不必每次重发整份设定。示例假设条目已启用且输入预算充足，实际回复由模型生成。
      </figcaption>
    </figure>
  );
}
