/**
 * `/docs/faq` 的问答正文。
 *
 * 这份数据同时供两处使用：文档页渲染（`src/client/pages/guide-content.ts`）
 * 与 `/docs/faq` 的 FAQPage 结构化数据（`src/shared/seo.ts`）。
 * 放在 shared 层是为了让 schema 和页面上显示的答案永远一致：
 * 改文案只改这里，页面与结构化数据不会各自漂移。
 */
export interface FaqDocSection {
  id: string;
  /** 章节标题，同时作为 FAQPage 里的 Question。 */
  title: string;
  /** Markdown 正文，同时是 FAQPage 里 acceptedAnswer 的来源。 */
  body: string;
}

export const FAQ_DOC_SECTIONS: FaqDocSection[] = [
  {
    id: "no-reply",
    title: "连上了，为什么没有回复？",
    body: `连接后的问候语要等你先发一条消息才会触发。先在微信主动发一句话，再查看工作台连接状态；授权过期时重新扫码。

模型没有回复时，到[渠道与模型](/app/channels)测试连接，依次核对协议、服务地址、API Key、实际模型 ID 和服务商余额。地址请使用最终的公开 HTTPS 接口，不要填会跳转的网页地址。

OpenClaw 或 Hermes 还需要运行设备在线、连接器正常工作。电脑休眠或关机后，Agent 无法处理消息。`,
  },
  {
    id: "model",
    title: "模型自称和我的配置不一样？",
    body: `模型对自己名称、版本的描述不一定准确。以工作台配置的实际模型 ID 和 \`/wx status\` 显示的信息为准。

微伴的默认系统提示词不要求模型隐藏身份，你可以在模型设置中查看、修改或清空。修改后可发送 \`/wx reset\`，排除旧上下文的影响。`,
  },
  {
    id: "limits",
    title: "问题很短，为什么还提示输入超限？",
    body: `输入不仅包含这一句话，还可能包含系统提示词、历史摘要、最近对话、角色设定和附件。先检查[模型的输入与上下文设置](/docs/channels-models#limits)，再尝试新建会话或重置上下文。

提高上限前，请确认上游模型实际支持的上下文长度。更多说明见[会话与上下文](/docs/sessions#context)。`,
  },
  {
    id: "privacy",
    title: "聊天记录会发给谁？",
    body: `你发送的内容和回答所需的上下文会交给所选模型或插件。微伴与微信、腾讯及各模型服务商没有官方关联。

在微伴删除记录，不会同时删除微信客户端或模型服务商保存的数据。断开微信连接也不会自动清空平台聊天记录。具体处理方式见[隐私政策](/privacy)。`,
  },
  {
    id: "membership",
    title: "会员到期后，配置和记录还在吗？",
    body: `会保留。到期后最早创建的 1 个插件仍可使用，其余插件配置、网页会话记录和其他 Plus 会员功能暂停；数据保留，续费后可恢复。多个微信链接的处理见[连接微信](/docs/wechat-connection#multiple)。

没有解决的问题，可以[联系我们](/contact)。描述问题时带上报错原文和发生时间，请勿发送 API Key、连接密钥或账号密码。`,
  },
];

/**
 * 把 FAQ 正文的 Markdown 还原成纯文本，用于结构化数据。
 * FAQPage 的 acceptedAnswer 需要纯文本，链接标记原样输出会被当成乱码。
 */
export function faqAnswerText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
