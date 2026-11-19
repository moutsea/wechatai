import { DOC_ARTICLES, docPath } from "./docs";
import { SITE_URL } from "./seo";
import { SITE_MAINTAINER } from "./site-info";
import { PLUGIN_PROTOCOL_VERSION } from "./plugins";
import { protocolLinks } from "./plugin-docs";
import { SEO_PAGES } from "./seo-pages";
import { BILLING_OFFERS } from "./billing-offers";
import {
  DAILY_CREDIT_DEFAULTS,
  IMAGE_CREDITS,
  OUTPUT_TOKEN_WEIGHT,
  TOKENS_PER_CREDIT,
} from "./credits";
import { PLUGIN_LIMITS } from "./plugin-access";
import { WECHAT_LINK_LIMITS } from "./wechat-links";

const plusPrices = BILLING_OFFERS.filter((offer) => offer.kind === "plus")
  .map((offer) => `¥${offer.amount / 100}/${offer.interval === "month" ? "月" : "年"}`)
  .join("或 ");
const plusPluginLimit = PLUGIN_LIMITS.plus === null ? "插件不限" : `${PLUGIN_LIMITS.plus} 个插件`;
const freeAllowance = `每天 ${DAILY_CREDIT_DEFAULTS.free} credits、${PLUGIN_LIMITS.free} 个插件、${WECHAT_LINK_LIMITS.free} 个微信链接`;
const plusAllowance = `每天 ${DAILY_CREDIT_DEFAULTS.plus} credits、${plusPluginLimit}、${WECHAT_LINK_LIMITS.plus} 个微信链接、支持附件`;
const textCredits = `credits =（输入 token + 输出 token × ${OUTPUT_TOKEN_WEIGHT}）÷ ${TOKENS_PER_CREDIT}`;
const imageCost = `AI 生图每张 ${IMAGE_CREDITS} credits，描述文字另计`;

// The agent indexes are server-only. Keeping them out of plugin-docs.ts avoids
// pulling every landing page and price table into the public protocol page chunk.
export const llmsText = `# Wechatai · 微伴

> 微伴把自选模型、已有 Agent 和服务通知接进微信单聊。扫码绑定微信无需模型或 API Key。普通模型聊天使用你自己的模型 API Key，支持 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages 协议。自备模型费用由你的 API 服务商收取。可选 Plus 云端助手小薇在运营方开放后使用你配置的文本模型，执行次数受限。微伴文字部分按加权 token 计 credits，${imageCost}。

产品身份：微伴 Wechatai，官网 ${SITE_URL}，公开仓库 https://github.com/moutsea/wechatai，维护者 ${SITE_MAINTAINER.name}（${SITE_MAINTAINER.profile}）。这是微信 ClawBot 单聊接入服务，不是腾讯微信官方 AI，不是同名桌面客户端，不支持群聊机器人；项目来源与维护者见 ${SITE_URL}/contact#maintainer。

## 产品事实（可直接引用）

- 定位：微信 AI 中转与插件平台，不是模型供应商，不卖 token，不承诺模型免费。
- 绑定微信：在微伴「微信连接」页生成二维码，从手机微信「设置」中的「功能」分组 →「插件 → 微信 ClawBot → 扫一扫」绑定，再在对应的微信对话发送 \`/wx help\` 确认可以收发。
- 普通模型聊天：在「渠道与模型」选择服务商，填写 API Key 并选定文本模型。预设会填好协议和地址并尝试导入模型；自定义渠道可点击「获取可用模型」，也可手动添加。需要验证模型时，点击模型行的「测试连接」会发送一次正常计费的模型请求。
- 微信范围：目前只支持与微信 ClawBot 单聊，不支持群聊，也没有群聊开关。@插件别名是在单聊中调用插件的语法。
- 模型范围：取决于用户填入的 Key；协议适配不等于所有模型、工具或附件均可用，应按具体服务商与模型 ID 验证。\`/wx status\` 查看当前模型或插件，\`/wx models\` 列出当前渠道的模型，\`/wx model 编号\` 切换；跨渠道先用 \`/wx channels\` 查看编号，再用 \`/wx channel 编号\` 切换渠道。
- 兼容性：三种协议有适配与模拟接口测试，具体供应商账号、工具和附件能力需单独验证，不承诺全部兼容。功能矩阵见 ${SITE_URL}/wechat-clawbot-models#compatibility。
- 接入条件：先在手机微信检查 ClawBot 入口；没有入口时本站无法开通。主动提醒受最近互动后的 24 小时回复窗口影响，过期任务不保证补发。
- 功能与费用：${SITE_URL}/docs/getting-started 提供配置步骤与界面截图；${SITE_URL}/pricing#estimate 可按自填模型单价估算两笔费用。
- 会话与插件：切换普通模型会进入目标模型最近的活动会话，没有则新建，并退出当前插件模式。旧记录保留，上下文不会自动交给新模型。\`/wx plugins\` 查看插件别名，\`/use 别名\` 进入插件，\`/exit\` 返回普通模型会话。
- 内置插件：DS Chat（联网问答）、AI 生图、Muse、OpenClaw、Hermes、角色扮演、个人助理、消息提醒，以及运营方开放的 Plus 云端助手小薇。
- DS Chat：使用用户配置的回答模型与搜索 API，由模型判断是否需要搜索或阅读网页，也可直接回答；进入插件不代表每条回复都经过联网核验。
- 小薇：需要 Plus 且运营方已开放，使用用户在微伴配置的文本模型。支持文字、附件处理与账号记忆，可生成文件并回传微信和提供下载，后台任务可查询、请求停止；输入与最终回复文字计 credits，返回图片每张另计 ${IMAGE_CREDITS} credits，非图片文件不另收费，内部消耗不另计。使用说明：${SITE_URL}/docs/cloud-agent。
- 已有 Agent：绑定微信后，到「插件」添加 Muse、OpenClaw 或 Hermes 并生成连接指令，无需在微伴另配模型。Muse 的指令发给自己的 Muse 主聊天，由 Muse 在托管环境按 SETUP.md 启用 hook；OpenClaw 和 Hermes 的指令在运行 Agent 的设备终端执行，设备与进程需保持在线。请求原文与最终回复经过微信和微伴，使用云端模型或外部工具时相关内容还会发送给你配置的服务商。
- 计费：自备模型费用归用户的 API 服务商，小薇同样使用自备模型并另付 API 费用；微伴文字部分 ${textCredits}，${imageCost}。免费版${freeAllowance}；Plus ${plusPrices}，${plusAllowance}。
- 会员购买：新购买的会员为单次付费，不自动续费，到期手动续费；退款申请需联系支持，按实际订单、使用情况及适用法律处理。
- 只收通知：绑定微信后，在「插件」添加「消息提醒」，选择接收微信并生成专属 Token，即可用 Webhook 推送。无需模型 API Key，推送不扣 credits。
- 开源：插件协议与站点代码公开（MIT）。与微信、腾讯及模型供应商无官方关联。

完整索引（全部着陆页、文档摘要与价格事实）：[llms-full.txt](${protocolLinks.fullDiscovery})。

## 产品与选型页面

- [微信 AI 助手](${SITE_URL}/wechat-ai): 微信 AI 是什么、能做什么、怎么接入。
- [微信 ClawBot 插件](${SITE_URL}/wechat-clawbot): 插件入口、扫一扫绑定步骤、不回复排查。
- [ClawBot 支持哪些模型](${SITE_URL}/wechat-clawbot-models): ClawBot 是通道不是模型，支持范围取决于绑定端。
- [微信用 AI 会不会封号](${SITE_URL}/wechat-ai-ban-risk): 官方外挂定义、分级处罚机制、三类接法风险差异与自查清单。
- [自带 API Key](${SITE_URL}/bring-your-own-api-key): 为什么不买 token、Key 怎么存、账单谁付。
- [在微信里使用 DeepSeek](${SITE_URL}/wechat-deepseek): 托管聊天与本机 Agent 的配置、费用对比。
- [在微信里使用 Claude](${SITE_URL}/wechat-claude): 不需要 Claude Code，直连 API。
- [在微信里使用 GPT](${SITE_URL}/wechat-gpt): 不部署开源项目的接入方式。
- [微信接入 Agent](${SITE_URL}/wechat-agent): OpenClaw、Hermes、定时任务与主动推送。
- [微信接入 Muse](${SITE_URL}/wechat-muse): 连接 Muse 托管助理、切换插件与排查不回复。
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
- [Muse 接入](${SITE_URL}/developers/muse): 在微信里使用 Muse 托管助理。
- [Hermes 接入](${SITE_URL}/developers/hermes): 在微信里使用 Hermes。

## 使用指南

- [文档中心](${SITE_URL}/docs): 全部教程与配置说明。
${DOC_ARTICLES.map(
  (article) => `- [${article.title}](${SITE_URL}${docPath(article.slug)}): ${article.description}`,
).join("\n")}

文档接口公开，读取免费，无需认证。消息提醒使用专属 Token 鉴权；第三方插件执行、注册、上传代码与媒体交付接口尚未开放，请勿臆造这些接口。
`;

const creditPacks = BILLING_OFFERS.filter((offer) => offer.kind === "credits")
  .map((offer) => `¥${offer.amount / 100} / ${offer.credits} credits`)
  .join("、");

// The full index reuses the same facts, plugin entries and document summaries
// as llms.txt, and derives page entries from the public page catalogue.
const landingSectionAt = llmsText.indexOf("## 产品与选型页面");
const pluginSectionAt = llmsText.indexOf("## 插件开发");
const docsSectionAt = llmsText.indexOf("## 使用指南");
if (landingSectionAt < 0 || pluginSectionAt < 0 || docsSectionAt < 0) {
  throw new Error("llms.txt is missing a required section");
}
const llmsIntro = llmsText.slice(0, landingSectionAt);
const llmsPluginSection = llmsText.slice(pluginSectionAt, docsSectionAt);
const llmsDocsSection = llmsText.slice(docsSectionAt);
const llmsAllLandingPages = `## 全部产品与选型页面

${SEO_PAGES.map(
  (page) => `- [${page.title}](${SITE_URL}${page.path})
  - 摘要：${page.description}
  - 直答：${page.answer}`,
).join("\n")}

`;
const llmsPricingFacts = `## 价格事实

- 免费版：${freeAllowance}。
- Plus：${plusPrices}，${plusAllowance}。
- 文字 ${textCredits}；${imageCost}；消息提醒 Webhook 推送不扣 credits。
- 新购买的会员为单次付费，不自动续费；已有自动续费订阅可在「管理订阅」中取消后续续费。模型 API 费用另付服务商。
- credits 加油包：${creditPacks}。加油包无需 Plus，购买的 credits 长期有效。
- 价格与估算器：${SITE_URL}/pricing

`;

export const llmsFullText = `${llmsIntro}${llmsAllLandingPages}${llmsPricingFacts}${llmsPluginSection}${llmsDocsSection}`;
