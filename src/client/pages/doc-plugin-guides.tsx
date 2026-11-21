import { ArrowRight, BookOpen, Check, FileText } from "lucide-react";
import { CLOUD_AGENT_SHORTCUT } from "../../shared/cloud-agent";
import { pluginIconSource } from "../../shared/plugin-visuals";
import { useLocale } from "../locale";

type PluginExample = {
  pluginId: string;
  name: string;
  fields: [string, string][];
  command: string;
  request: string;
  reply: string;
  caption: string;
};

function pluginExamples(en: boolean): Record<string, PluginExample> {
  return {
    cloud: {
      pluginId: "wechatai/cloud-agent",
      name: en ? "Xiaowei" : "小薇",
      fields: en
        ? [
            ["Model", "Follows the current WeChat text model"],
            ["WeChat shortcut", CLOUD_AGENT_SHORTCUT],
          ]
        : [
            ["使用模型", "跟随微信当前文本模型"],
            ["微信快捷名称", CLOUD_AGENT_SHORTCUT],
          ],
      command: `/use ${CLOUD_AGENT_SHORTCUT}`,
      request: en
        ? "Convert the staged Markdown to Word and keep the heading levels."
        : "把刚才暂存的 Markdown 转成 Word，保留标题层级。",
      reply: en
        ? "Task complete. Receive the file in WeChat or download it from the cloud tasks page."
        : "任务完成，可在微信接收文件，也可前往云端任务页下载。",
      caption: en
        ? "Send the attachment first, wait for staging, then send the full instructions; track progress on the tasks page."
        : "先发附件，等暂存成功后再发送完整要求；任务页可查看进度。",
    },
    search: {
      pluginId: "wechatai/web-research",
      name: "DS Chat",
      fields: en
        ? [
            ["Answer model", "Configured text model"],
            ["Search API", "DeepSeek native search + your own key"],
            ["WeChat shortcut", "ds"],
          ]
        : [
            ["回答模型", "已配置的文本模型"],
            ["搜索 API", "DeepSeek 原生搜索 + 自备密钥"],
            ["微信快捷名称", "ds"],
          ],
      command: "/use ds",
      request: en
        ? "Look up today's weather in Shanghai and include sources."
        : "查一下今天上海的天气，并附上来源。",
      reply: en
        ? "Search results → read relevant pages → organize the answer and sources"
        : "搜索结果 → 阅读相关网页 → 整理回答与来源",
      caption: en
        ? "Web-answer flow example. Whether it searches and can read pages depends on the model and API."
        : "联网问答流程示意。实际是否搜索、能否读取网页，取决于模型和接口。",
    },
    roleplay: {
      pluginId: "wechatai/roleplay",
      name: en ? "Roleplay" : "角色扮演",
      fields: en
        ? [
            ["Answer model", "Configured text model"],
            ["Built-in character", "Lu Xingye · confident adventurer"],
            ["WeChat shortcut", "星野"],
          ]
        : [
            ["回答模型", "已配置的文本模型"],
            ["内置角色", "陆星野 · 自信冒险家"],
            ["微信快捷名称", "星野"],
          ],
      command: "/use 星野",
      request: en
        ? "What is new at the rooftop coffee stall today?"
        : "今天的天台咖啡摊，有什么新故事？",
      reply: en
        ? "The wind flipped the menu and named a new drink for me. Sit down; your story is today's special too."
        : "风把菜单翻了个面，倒替我起好了新品名。先坐，你的故事也算今天的特别供应。",
      caption: en
        ? "Character conversation example. After choosing a built-in character, you can edit the persona, scene and opening."
        : "角色对话示意。选择内置角色后，还可以修改人设、场景和开场白。",
    },
    assistant: {
      pluginId: "wechatai/personal-assistant",
      name: en ? "Personal assistant" : "个人助理",
      fields: en
        ? [
            ["Answer model", "Text model with tool calls"],
            ["Default currency", "CNY"],
            ["WeChat shortcut", "助理"],
          ]
        : [
            ["回答模型", "支持工具调用的文本模型"],
            ["默认记账币种", "CNY"],
            ["微信快捷名称", "助理"],
          ],
      command: "/use 助理",
      request: en ? "Lunch cost 32 yuan today; record it." : "今天午饭花了 32 元，帮我记一笔。",
      reply: en
        ? "Recorded: Lunch · expense ¥32.00. Query it in WeChat or view it under “My records”."
        : "已记录：午饭 · 支出 ¥32.00。可继续在微信查询，也可在「我的记录」中查看。",
      caption: en
        ? "Expense-tracking flow example. The saved amount, date and category in the record are authoritative."
        : "记账流程示意。实际保存的金额、日期和分类请以记录为准。",
    },
    notification: {
      pluginId: "wechatai/notification",
      name: en ? "Notifications" : "消息提醒",
      fields: en
        ? [
            ["Source name", "Order notifications"],
            ["Receiving WeChat", "My WeChat (connected)"],
          ]
        : [
            ["通知来源名称", "订单通知"],
            ["接收微信", "我的微信（已连接）"],
          ],
      command: "/wx help",
      request: en ? "Order paid, amount ¥9.90" : "订单已支付，金额 ¥9.90",
      reply: en ? "Payment received" : "收款成功",
      caption: en
        ? "Configuration and usage flow. No model is needed, and there is no need to enter the plugin with /use."
        : "配置与使用流程示意。无需模型，也不需要通过 /use 进入插件。",
    },
  };
}

export function DocPluginGuide({ kind }: { kind: string }) {
  const en = useLocale().locale === "en";
  const example = pluginExamples(en)[kind];
  return (
    <figure
      className="docs-plugin-example"
      aria-label={
        en ? `${example.name} configuration and usage example` : `${example.name}配置与使用示意`
      }
    >
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
            <span>{en ? "Configuration example" : "配置示意"}</span>
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
            {kind === "notification"
              ? en
                ? "Generate a dedicated token after saving"
                : "保存后生成专属 Token"
              : en
                ? "Save and enable"
                : "保存配置并启用"}
            <ArrowRight size={16} aria-hidden="true" />
          </div>
        </div>
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>{en ? "WeChat ClawBot" : "微信 ClawBot"}</strong>
            <span>{en ? "Usage example" : "使用示意"}</span>
          </div>
          <div className="docs-plugin-messages">
            <div className="docs-plugin-bubble docs-plugin-bubble-user docs-plugin-command">
              {example.command}
            </div>
            {kind === "cloud" && (
              <div className="docs-attachment-stage">
                {en ? "Attachment staged · manuscript.md" : "已暂存附件 · 原稿.md"}
              </div>
            )}
            {kind === "notification" ? (
              <>
                <div className="docs-attachment-stage">
                  {en
                    ? "After the server submits, WeChat receives the notification"
                    : "服务端提交后，微信接收通知"}
                </div>
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
                  <strong>{en ? "formatted-document.docx" : "整理后的文档.docx"}</strong>
                  <span>
                    {en ? "Generated file example · kept 30 days" : "生成文件示例 · 保留 30 天"}
                  </span>
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
  const en = useLocale().locale === "en";
  const steps = en
    ? [
        ["01", "Server submits", "Sends the request with the dedicated token"],
        ["202", "Queued", "pending: waiting to send"],
        ["sent", "API confirms sending", "Check delivery status, not whether the user read it"],
      ]
    : [
        ["01", "服务端提交", "携带专属 Token 发送请求"],
        ["202", "已进入队列", "pending：等待发送"],
        ["sent", "接口确认发送", "查询投递结果，非用户已读"],
      ];
  return (
    <figure
      className="docs-plugin-example"
      aria-label={
        en
          ? "Notification flow from submission to confirmed delivery"
          : "消息提醒从提交到确认发送的流程示意"
      }
    >
      <div className="docs-notification-flow">
        {steps.map(([mark, title, description]) => (
          <div key={mark}>
            <span className="docs-attachment-stage">{mark}</span>
            <strong>{title}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>
      <figcaption>
        {en
          ? "HTTP 202 only means accepted. Confirm the final state under “Recent deliveries” (“最近投递”) or through the query endpoint."
          : "HTTP 202 只表示受理成功。请在「最近投递」或查询接口中确认最终状态。"}
      </figcaption>
    </figure>
  );
}

export function DocRoleplayLore() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-plugin-example"
      aria-label={
        en
          ? "World book keyword trigger and character response example"
          : "世界书关键词触发及角色回应的示意"
      }
    >
      <div className="docs-plugin-guide-grid">
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <div className="docs-plugin-heading">
              <BookOpen size={24} aria-hidden="true" />
              <strong>{en ? "World book" : "世界书"}</strong>
            </div>
            <span>{en ? "Entry example" : "条目示意"}</span>
          </div>
          <dl className="docs-plugin-guide-fields">
            <div>
              <dt>{en ? "Name" : "名称"}</dt>
              <dd>{en ? "Coffee stall opening rules" : "咖啡摊营业规则"}</dd>
            </div>
            <div>
              <dt>{en ? "Trigger keywords" : "触发关键词"}</dt>
              <dd>{en ? "rooftop,coffee stall" : "天台,咖啡摊"}</dd>
            </div>
            <div>
              <dt>{en ? "Content" : "设定内容"}</dt>
              <dd>
                {en
                  ? "Lu Xingye's rooftop coffee stall opens only on sunny days and closes when it rains."
                  : "陆星野的天台咖啡摊只在晴天营业，雨天收摊。"}
              </dd>
            </div>
          </dl>
          <div className="docs-plugin-guide-footer">
            <Check size={16} aria-hidden="true" />{" "}
            {en ? "Enable the entry and save the character" : "启用条目，保存角色"}
            <ArrowRight size={16} aria-hidden="true" />
          </div>
        </div>
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>{en ? "Chat with Xingye" : "与星野聊天"}</strong>
            <span>{en ? "Conversation example" : "对话示意"}</span>
          </div>
          <div className="docs-plugin-messages">
            <div className="docs-plugin-bubble docs-plugin-bubble-user">
              {en
                ? "It is raining today. Is the rooftop coffee stall still open?"
                : "今天下雨，天台的咖啡摊还开吗？"}
            </div>
            <div className="docs-attachment-stage">
              {en
                ? "Keyword matched → opening rules added to context"
                : "命中关键词 → 把营业规则加入上下文"}
            </div>
            <div className="docs-plugin-bubble">
              {en
                ? "Closed today; the wind is too strong and the paper cups surrendered first. I will set up again when it clears and save you a spot by the railing."
                : "今天收摊，风太大，纸杯先投降了。等放晴我再支摊，给你留个靠栏杆的位置。"}
            </div>
          </div>
        </div>
      </div>
      <figcaption>
        {en
          ? "Only relevant background is added this time, so you do not resend the whole setting every turn. The example assumes the entry is enabled with enough input budget; the model generates the actual reply."
          : "只补充这次相关的背景，不必每次重发整份设定。示例假设条目已启用且输入预算充足，实际回复由模型生成。"}
      </figcaption>
    </figure>
  );
}
