import source from "../../design/plugin-protocol-v1.md?raw";
import {
  PLUGIN_PROTOCOL_VERSION,
  llmChatManifest,
  pluginInvocationSchema,
  pluginResultSchema,
  pluginEventSchema,
} from "./plugins";
import { SITE_URL } from "./seo";

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

> 在微信里使用自定义 AI 的独立产品。插件协议 ${PLUGIN_PROTOCOL_VERSION} 文档公开可读，当前支持内置 LLM，以及 DS Chat、AI 生图、OpenClaw、Hermes、角色扮演、个人助理和消息提醒插件；Free 用户最多配置 1 个插件，Plus 会员插件配置数量不限，模型和搜索 API 由用户自行配置。

## 插件开发

- [完整插件协议 Markdown](${protocolLinks.markdown}): AI agent 从这里开始，包含开放状态、示例、计量与安全边界。
- [插件协议网页](${protocolLinks.documentation}): 适合人工阅读。
- [协议 JSON API](${protocolLinks.api}): 版本、Schema 地址与合法数据示例。
- [固定版本 ${PLUGIN_PROTOCOL_VERSION}](${protocolLinks.versionedApi}): 指定协议版本的索引。
- [JSON Schema](${protocolLinks.schema}): Draft 2020-12 的 Manifest、Invocation、Result、Event 和 Block 定义。
- [消息提醒 HTTP 接入](${SITE_URL}/developers/notifications.md): 不扣 credits 的 Webhook，专属 Token、文字推送与投递状态；这是独立的通知接口，不是通用插件执行接口。

## 使用指南

- [微信使用指南](${SITE_URL}/docs): 配置渠道、微信命令、会话与 credits。

文档接口公开，读取免费，无需认证。消息提醒使用专属 Token 鉴权；第三方插件执行、注册、上传代码与媒体交付接口尚未开放，请勿臆造这些接口。
`;
