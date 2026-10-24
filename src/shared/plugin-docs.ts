import source from "../../design/plugin-protocol-v1.md?raw";
import {
  PLUGIN_PROTOCOL_VERSION,
  llmChatManifest,
  pluginInvocationSchema,
  pluginResultSchema,
  pluginEventSchema,
} from "./plugins";
import { SITE_URL } from "./seo";
import { DOC_ARTICLES, docPath } from "./docs";

export const PLUGIN_DOCS_PATH = "/developers/plugins";
export const PLUGIN_MARKDOWN_PATH = "/developers/plugins.md";
export const PLUGIN_API_PATH = "/api/plugins/protocol";
export const PLUGIN_VERSION_PATH = `${PLUGIN_API_PATH}/${PLUGIN_PROTOCOL_VERSION}`;
export const PLUGIN_SCHEMA_PATH = `${PLUGIN_VERSION_PATH}/schema.json`;
export const protocolLinks = {
  documentation: `${SITE_URL}${PLUGIN_DOCS_PATH}`,
  markdown: `${SITE_URL}${PLUGIN_MARKDOWN_PATH}`,
  api: `${SITE_URL}${PLUGIN_API_PATH}`,
  versionedApi: `${SITE_URL}${PLUGIN_VERSION_PATH}`,
  schema: `${SITE_URL}${PLUGIN_SCHEMA_PATH}`,
  discovery: `${SITE_URL}/llms.txt`,
};

// Examples are checked by the same contracts used for real invocations.
export const protocolExamples = {
  manifest: llmChatManifest,
  invocation: pluginInvocationSchema.parse({
    protocolVersion: PLUGIN_PROTOCOL_VERSION,
    runId: "run_example_001",
    instanceId: "instance_example_001",
    pluginId: llmChatManifest.id,
    pluginVersion: llmChatManifest.version,
    sessionId: "session_example_001",
    messages: [
      { role: "system", content: [{ type: "text", text: "请用简洁的中文回答。" }] },
      { role: "user", content: [{ type: "text", text: "给我三个早餐搭配建议。" }] },
    ],
    limits: { inputTokens: 128000, outputTokens: 1024, outputImages: 0, creditUnits: 5000 },
  }),
  result: pluginResultSchema.parse({
    protocolVersion: PLUGIN_PROTOCOL_VERSION,
    runId: "run_example_001",
    status: "completed",
    content: [
      { type: "text", text: "1. 鸡蛋、全麦面包和牛奶\n2. 燕麦、酸奶和香蕉\n3. 豆浆、玉米和鸡蛋" },
    ],
  }),
  event: pluginEventSchema.parse({
    protocolVersion: PLUGIN_PROTOCOL_VERSION,
    runId: "run_example_001",
    eventId: "event_example_001",
    sequence: 0,
    type: "accepted",
    payload: {},
  }),
};

export const agentDevelopmentPrompt = `请先读取 Wechatai 插件协议：
${protocolLinks.markdown}

再读取协议索引、示例和 JSON Schema：
${protocolLinks.api}
${protocolLinks.schema}

按 protocolVersion ${PLUGIN_PROTOCOL_VERSION} 为我开发插件适配器，先确认我的插件功能和运行环境，再生成 manifest、适配器代码和契约测试。
保留平台传入的 runId；尊重 limits；只返回协议允许的最终结果字段；不要上报 usage、credits 或 imageCount。
用 JSON Schema 校验输入和输出，同时测试 runId 匹配、预算、重试幂等及附件所属任务等语义约束。
内置 AI 生图已支持图片交付；第三方注册、执行 API、代码上传与第三方媒体接入尚未开放。先实现可在本地验证的适配逻辑，标明待接入部分，不要编造平台接口或认证方式。`;

const json = (value: unknown) => "```json\n" + JSON.stringify(value, null, 2) + "\n```";
const agentSection = `
## 给 AI agent 的起点

下面的地址无需登录或 API Key，直接 GET 即可读取。文档读取免费，不触发模型调用，不消耗 credits。网页与 Markdown 使用同一份内容；JSON Schema 从平台的实际校验规则生成。

| 格式 | 地址 | 用途 |
| --- | --- | --- |
| 网页 | [插件协议](${protocolLinks.documentation}) | 阅读协议与示例 |
| Markdown | [完整协议原文](${protocolLinks.markdown}) | 提供给 AI agent 的首选入口 |
| JSON API | [协议索引](${protocolLinks.api}) | 版本、开放状态、计费政策、示例与 Schema 链接 |
| 固定版本 | [协议 ${PLUGIN_PROTOCOL_VERSION}](${protocolLinks.versionedApi}) | 读取指定版本，不自动切到下一版 |
| JSON Schema | [校验规则](${protocolLinks.schema}) | Draft 2020-12，包含五种协议对象的定义 |
| 发现入口 | [llms.txt](${protocolLinks.discovery}) | 找到所有开发资料 |

可把这段指令交给你的 AI 编程工具：

\`\`\`text
${agentDevelopmentPrompt}
\`\`\`

也可以直接下载文档和 Schema：

\`\`\`sh
curl -fsSL ${protocolLinks.markdown} -o wechatai-plugin-protocol.md
curl -fsSL ${protocolLinks.api} -o wechatai-plugin-protocol.json
curl -fsSL ${protocolLinks.schema} -o wechatai-plugin-schema.json
\`\`\`

所有文档接口只支持 GET、HEAD 和 OPTIONS，允许跨域匿名读取，不设置登录 cookie。不存在公开的插件执行、注册或回调接口；此处的 Invocation 是数据契约，不是一个可 POST 的 HTTP 地址。

## 最小适配示例

建议先实现纯文本适配器：接收 Invocation，转换为目标工具的输入，再将最终回复转换为 Result。供应商或 Agent 的内部消息、工具调用和计费信息不要加入最终输出。

### 1. 声明插件

下面是实际运行的内置 LLM 插件声明。第三方可以参考它编写自己的声明，但不能仅将 runtime 改为 remote 或 sandbox 就在本站执行。

${json(protocolExamples.manifest)}

### 2. 接收平台调用

本例的 creditUnits 为 5000，即本站服务费用上限为 5 credits。模型连接与密钥由宿主另行注入，不能添加到 Invocation 的顶层字段中。

${json(protocolExamples.invocation)}

### 3. 返回最终结果

runId 必须原样返回。status=partial 用于有可用内容但未完整完成的结果；它与完整结果使用同一计量规则。

${json(protocolExamples.result)}

### 4. 实现转换函数

以下 JavaScript 仅演示本地转换，不是远程传输协议。callYourTool 和持久化由你自己的适配器实现；接入平台的认证、传输、取消与超时规范尚未开放。

\`\`\`js
export async function execute(invocation, callYourTool) {
  // 先用 Invocation Schema 验证输入；此最小示例仅处理纯文本。
  const messages = invocation.messages.map((message) => ({
    role: message.role,
    content: message.content.map((block) => {
      if (block.type !== "text") throw new Error("Unsupported input block");
      return block.text;
    }).join(""),
  }));
  const text = await callYourTool({
    messages,
    maxOutputTokens: invocation.limits.outputTokens,
  });
  if (typeof text !== "string" || !text.trim()) throw new Error("Empty result");
  return {
    protocolVersion: invocation.protocolVersion,
    runId: invocation.runId,
    status: "completed",
    content: [{ type: "text", text }],
  };
}
\`\`\`

适配器还应在执行前处理输入限制，并实现超时、失败与幂等策略；上述函数不包含这些生产要求。平台会独立执行最终的输入/输出与费用限制，不信任插件返回的计量字段。

## Schema 与校验

下载的 JSON Schema 是一个定义集合。请按对象类型选择对应定义进行验证，不要只用不含根类型约束的集合本身验证数据。

| 对象 | JSON Pointer | 当前状态 |
| --- | --- | --- |
| Manifest | #/$defs/Manifest | 内置声明已使用 |
| Invocation | #/$defs/Invocation | 内置同步调用已使用 |
| Result | #/$defs/Result | 内置最终结果已使用 |
| Block | #/$defs/Block | 文本与附件引用结构；结果附件交付未开放 |
| Event | #/$defs/Event | 仅预留信封；payload 的事件专用结构及传输未开放 |

例如，在支持 Draft 2020-12 的 JSON Schema 校验器中，注册下载的 Schema（包括其 $id），再以如下 $ref 校验 Invocation：

${json({ $ref: `${protocolLinks.schema}#/$defs/Invocation` })}

主要边界：

- 协议对象采用严格字段校验。未知顶层字段会被拒绝；configSchema 与 Event.payload 是明确声明的开放对象。
- runId、instanceId、sessionId、assetId 和 Invocation.pluginId 的长度为 1–200；Manifest.id 必须为小写 author/name（字母、数字、连字符）；插件版本形如 1.0.0。
- 每次最多 20,001 条消息，每条最多 100 个内容块；单个文本块最多 8,000,000 个 UTF-16 编码单元，实际还受输入和预算限制。
- inputTokens、outputTokens 是 1–2,000,000 的整数；outputImages 是 0–20 的整数；creditUnits 是 null 或 0–1,000,000,000 的整数。这是协议边界，产品和执行器可以设置更低的上限。
- JSON Schema 只验证结构。runId 一致、权限、去重、附件归属与 ready 状态、Token 和预算等业务约束仍必须由宿主检查。
- 契约测试至少覆盖：合法结果、未知字段与伪造 usage、runId 不匹配、空结果、超限结果、同一任务重试和未验证的图片引用。

不兼容的数据结构变更需要新的 protocolVersion；插件自身的功能迭代使用 pluginVersion。指定旧协议版本应继续使用其结构，不应静默接受新字段。新运行时开放前仍需补齐传输与能力协商规范。

`;

// One document feeds the HTML page and the raw endpoint, including validated examples.
export const protocolMarkdown = source.replace("## 责任与身份", `${agentSection}## 责任与身份`);
const anchors: Record<string, string> = {
  "给 AI agent 的起点": "quickstart",
  最小适配示例: "examples",
  "Schema 与校验": "validation",
  责任与身份: "identity",
  声明: "manifest",
  命令路由: "commands",
  调用边界: "invocation",
  结果与事件: "results",
  平台计量: "metering",
  限额与原子结算: "limits",
  后续第三方发布的门槛: "publishing",
};
export const protocolSections = protocolMarkdown
  .split(/^## /m)
  .slice(1)
  .map((section) => {
    const split = section.indexOf("\n");
    const title = section.slice(0, split).trim();
    return { id: anchors[title] || title, title, markdown: section.slice(split + 1).trim() };
  });
export const llmsText = `# Wechatai · 微伴

> 把自选的大模型接进微信的独立产品。用户填入自己的模型 API Key（OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages 协议），绑定微信后即可在聊天窗口里对话、联网问答、生图、接 Agent。本站不提供模型额度，也不转售 token：模型费用由用户自己的 API 服务商收取，微伴文字部分按加权 token 计 credits，AI 生图每张 5 credits，描述文字另计。

## 产品事实（可直接引用）

- 定位：微信 AI 中转与插件平台，不是模型供应商，不卖 token，不承诺模型免费。
- 接入方式：添加渠道时选择服务商并填写 API Key，预设会填好协议和地址；第三方地址使用「自定义」入口。新建预设渠道会尝试自动导入模型，自定义渠道可点击「获取可用模型」；获取失败或缺少所需模型时可手动添加。确认文本模型后，点击模型行的「测试连接」，系统发送固定请求并正常计费。配置完整后生成二维码，从微信「设置」中的「功能」分组 →「插件 → 微信 ClawBot → 扫一扫」绑定。普通模型聊天无需安装额外客户端；微伴没有绕过 ClawBot 的独立绑定方式。
- 微信范围：目前只支持与微信 ClawBot 单聊，不支持群聊，也没有群聊开关。@插件别名是在单聊中调用插件的语法。
- 模型范围：取决于用户填入的 Key；兼容三种协议即可接入。\`/wx status\` 查看当前模型或插件，\`/wx models\` 列出当前渠道的模型，\`/wx model 编号\` 切换；跨渠道先用 \`/wx channels\` 查看编号，再用 \`/wx channel 编号\` 切换渠道。
- 会话与插件：切换普通模型会进入目标模型最近的活动会话，没有则新建，并退出当前插件模式。旧记录保留，上下文不会自动交给新模型。\`/wx plugins\` 查看插件别名，\`/use 别名\` 进入插件，\`/exit\` 返回普通模型会话。
- 内置插件：DS Chat（联网问答）、AI 生图、OpenClaw、Hermes、角色扮演、个人助理、消息提醒。
- DS Chat：使用用户配置的回答模型与搜索 API，由模型判断是否需要搜索或阅读网页，也可直接回答；进入插件不代表每条回复都经过联网核验。
- Agent 接入：OpenClaw 与 Hermes 由用户在自己的电脑或服务器上运行，设备和 Agent 进程需保持在线；微伴提供消息中转，不托管这两个 Agent。请求原文与最终回复经过微信和微伴，并非只转发摘要；使用云端模型或外部工具时，相关内容还会发送给用户配置的服务商。
- 计费：模型费用归用户的 API 服务商；微伴文字部分 credits =（输入 token + 输出 token × 8）÷ 5000，AI 生图每张 5 credits，描述文字另计。免费版每天 100 credits、1 个插件、1 个微信链接；Plus ¥9.9/月或 ¥88/年，每天 1000 credits、插件不限、10 个微信链接、支持附件。
- 会员购买：新购买的会员为单次付费，不自动续费，到期手动续费；退款申请需联系支持，按实际订单、使用情况及适用法律处理。
- 消息提醒 Webhook 推送不扣 credits。
- 开源：插件协议与站点代码公开（MIT）。与微信、腾讯及模型供应商无官方关联。

## 产品与选型页面

- [微信 AI 助手](${SITE_URL}/wechat-ai): 微信 AI 是什么、能做什么、怎么接入。
- [微信 ClawBot 插件](${SITE_URL}/wechat-clawbot): 插件入口、扫一扫绑定步骤、不回复排查。
- [ClawBot 支持哪些模型](${SITE_URL}/wechat-clawbot-models): ClawBot 是通道不是模型，支持范围取决于绑定端。
- [自带 API Key](${SITE_URL}/bring-your-own-api-key): 为什么不买 token、Key 怎么存、账单谁付。
- [在微信里使用 DeepSeek](${SITE_URL}/wechat-deepseek): 托管聊天与本机 Agent 的配置、费用对比。
- [在微信里使用 Claude](${SITE_URL}/wechat-claude): 不需要 Claude Code，直连 API。
- [在微信里使用 GPT](${SITE_URL}/wechat-gpt): 不部署开源项目的接入方式。
- [微信接入 Agent](${SITE_URL}/wechat-agent): OpenClaw、Hermes、定时任务与主动推送。
- [微信 AI 方案对比](${SITE_URL}/wechat-ai-options): 官方内置、商业平台、开源自建、自带 Key 中转。
- [价格与免费额度](${SITE_URL}/pricing): 套餐、credits 算法与免费版边界。

## 插件开发

- [完整插件协议 Markdown](${protocolLinks.markdown}): AI agent 从这里开始，包含开放状态、示例、计量与安全边界。
- [插件协议网页](${protocolLinks.documentation}): 适合人工阅读。
- [协议 JSON API](${protocolLinks.api}): 版本、Schema 地址与合法数据示例。
- [固定版本 ${PLUGIN_PROTOCOL_VERSION}](${protocolLinks.versionedApi}): 指定协议版本的索引。
- [JSON Schema](${protocolLinks.schema}): Draft 2020-12 的 Manifest、Invocation、Result、Event 和 Block 定义。
- [消息提醒 HTTP 接入](${SITE_URL}/developers/notifications.md): 不扣 credits 的 Webhook，专属 Token、文字推送与投递状态；这是独立的通知接口，不是通用插件执行接口。
- [OpenClaw 接入](${SITE_URL}/developers/openclaw): 把本机 Agent 接到微信。
- [Hermes 接入](${SITE_URL}/developers/hermes): 在微信里使用 Hermes。

## 使用指南

- [文档中心](${SITE_URL}/docs): 全部教程与配置说明。
${DOC_ARTICLES.map(
  (article) => `- [${article.title}](${SITE_URL}${docPath(article.slug)}): ${article.description}`,
).join("\n")}

文档接口公开，读取免费，无需认证。消息提醒使用专属 Token 鉴权；第三方插件执行、注册、上传代码与媒体交付接口尚未开放，请勿臆造这些接口。
`;
