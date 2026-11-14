import type { DocSlug } from "../../shared/docs";
import { GUIDE_CONTENT } from "./guide-content";

export interface DocScreenshot {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

export interface DocSection {
  id: string;
  title: string;
  body: string;
  illustration?:
    | "channel-setup"
    | "channel-form"
    | "channel-models"
    | "model-settings"
    | "model-commands"
    | "wechat-ai-bridge"
    | "wechat-connection"
    | "wechat-code"
    | "wechat-status"
    | "plugin-setup"
    | "plugin-cloud"
    | "plugin-search"
    | "plugin-roleplay"
    | "roleplay-lore"
    | "plugin-assistant"
    | "plugin-notification"
    | "notification-delivery"
    | "agent-pairing-openclaw"
    | "agent-pairing-hermes"
    | "openclaw-configs"
    | "tutorial-deepseek-chat"
    | "tutorial-openclaw-chat"
    | "tutorial-hermes-chat"
    | "attachment-flow"
    | "voice-example"
    | "membership-plans"
    | "credit-example"
    | "model-providers"
    | "kimiseek-import";
  afterIllustration?: string;
  followUpIllustration?: "kimiseek-import" | "wechat-connection";
  /** Optional explanations stay collapsed so the main steps remain easy to follow. */
  details?: readonly {
    title: string;
    body: string;
    illustration?: "custom-channel";
  }[];
  /** Figures are rendered after the body, in order. */
  screenshots?: readonly DocScreenshot[];
}
export interface DocContent {
  intro?: string;
  sections: DocSection[];
}

export const DOC_CONTENT: Record<DocSlug, DocContent> = {
  ...GUIDE_CONTENT,
  "wechat-ai-assistant": {
    intro:
      "想用 AI 助手处理事情，又不想研究安装命令、租服务器、让电脑一直开机？小薇是运行在微伴云端的 AI Agent 助手。你在微信交代任务，它使用你配置的模型和云端工具处理，再把文字或文件发回来。",
    sections: [
      {
        id: "what-is-xiaowei",
        title: "微信里的 AI 助手，可以帮你做什么？",
        body: `除了回答问题，小薇还能生成可下载的文件。比如：

- **转换文档**：把 Markdown 或文字内容整理成 Word、PDF。
- **整理资料**：从会议记录中提取结论和待办，生成一份文档。
- **改写成稿**：把零散笔记整理成有标题、分章节的初稿，再导出文件。

你负责提供材料和说清要求，无需自行部署 OpenClaw，也不用维护一台运行 Agent 的设备。下面用「把 Markdown 转成 Word」走一遍完整流程。`,
      },
      {
        id: "prepare",
        title: "开始前：准备好会员、模型和微信",
        body: `小薇目前面向 **Plus 会员**，还需要以下准备：

1. **可用的模型 API Key**：先在[渠道与模型](/app/channels)接入服务商，导入一个支持工具调用的文本模型。[查看配置教程](/docs/channels-models)。
2. **微信 ClawBot 入口**：在手机微信「我 → 设置 → 插件」中找到微信 ClawBot，找不到时先更新微信。[查看扫码连接步骤](/docs/wechat-connection#connect)。

**Plus 不包含模型 API 费用**，服务商需要有可用余额或额度。开始付费前，先确认自己的微信能找到 ClawBot 入口，并在[插件页](/app/plugins)查看小薇的可用状态。[查看套餐](/pricing)。`,
      },
      {
        id: "setup",
        title: "第一步：启用小薇",
        body: `1. 打开[插件页](/app/plugins)，找到「小薇」，点击「配置插件」。
2. 「执行模型」保留「使用默认模型」，即可跟随当前微信选中的普通文本模型；也可以固定选择一个支持工具调用的模型。
3. 「微信快捷名称」保留「小薇」，状态选择「启用」，点击「保存配置」。

按[连接微信教程](/docs/wechat-connection)完成扫码，已连接的微信可直接用。用手机看本站时，请用电脑或另一台设备显示二维码，再用手机微信扫码。`,
      },
      {
        id: "first-task",
        title: "第二步：在微信把 Markdown 转成 Word",
        illustration: "plugin-cloud",
        body: `在微伴绑定的微信对话里，按这个顺序操作：

1. 发送 \`/use 小薇\`，确认已进入小薇。修改过快捷名时，请使用自己的名称。
2. 发送要转换的 \`.md\` 文件，**等收到「已暂存附件」提示后，再发送完整要求**。
3. 告诉它要生成什么文件，例如：

\`\`\`text
请把刚才暂存的 Markdown 转成 Word（.docx），保留标题层级和列表，按正文重新排版，并把生成的文件发给我。
\`\`\`

暂存附件本身不会提交任务或扣 credits；发送处理要求后，才会创建任务。小薇按提取的正文重新排版，**不保留原文件版式**。图片、扫描件等材料的处理方式见[附件教程](/docs/attachments)。`,
        afterIllustration: `上图为配置与对话示意，实际处理结果取决于文件内容和所选模型。你也可以把要求换成「把这份文字整理成 PDF」或「提取会议结论与待办，生成 Word 文档」。`,
      },
      {
        id: "results",
        title: "第三步：查看进度，接收结果",
        body: `收到任务受理提示后，小薇会在后台执行，完成后尝试把结果和文件发回原微信对话。等待时可以打开[云端任务](/app/tasks)查看状态、下载结果，不必一直守着聊天窗口。

**如果任务失败需要重试，请重新发送附件，等暂存成功，再发完整要求。** 暂存附件会在任务受理时清空，只补一句「再试一次」不会自动带上原文件。

想停止时，发送 \`/wx stop\`，或在任务页点击「停止」。停止需要云端确认；任务已先完成时，仍按有效结果结算。回到普通模型聊天可发 \`/exit\`，这不会停止已经受理的任务。`,
      },
      {
        id: "faq",
        title: "使用前，你可能还想知道",
        body: `小薇适合不想维护运行环境、希望从微信处理文件与文字任务的用户。完整的配额、文件限制和数据规则见[小薇插件说明](/docs/cloud-agent)。`,
        details: [
          {
            title: "小薇就是云端版 OpenClaw 吗？",
            body: `小薇是微伴提供的云端执行助手，与自行部署 OpenClaw 是两种方案。目前支持文字任务、文件处理和账号空间内的记忆；不支持浏览器操作、自主定时任务或直接访问你电脑上的文件，能力以[插件说明](/docs/cloud-agent#limits)为准。

需要使用自己设备上的工具、已有 OpenClaw 配置或定时任务时，可以选择[连接已有 OpenClaw](/developers/openclaw)。`,
          },
          {
            title: "除了 Plus，还会产生哪些费用？",
            body: `微伴按任务输入与最终有效回复计算 credits，返回 Word、PDF 等非图片文件不另收费；图片结果另计。所选模型的 API 费用由服务商另行收取。

失败或确认取消的任务不收成功结果的 credits，但已发生的模型 API 费用仍可能产生；任务受理后的失败或取消仍计入执行次数。每日次数与执行时限以插件页为准。[查看计费说明](/docs/cloud-agent#limits)。`,
          },
          {
            title: "微信没收到文件，或文件太大怎么办？",
            body: `先到[任务页](/app/tasks)看任务是否完成，并尝试下载结果。若提示微信回复窗口失效，向原微信对话发送 \`/wx status\`，按提示恢复投递。

输入一次最多 4 个附件，还受任务文字与模型输入上限限制；生成结果单个文件不超过 2 MiB，保留 30 天，请及时下载。账号默认提供 500 MiB 云端空间，总空间不等于单次文件上限。[查看完整文件限制](/docs/cloud-agent#limits)。`,
          },
          {
            title: "上传的材料会发到哪里？",
            body: `任务内容会发送至微伴云端执行服务和你选择的模型供应商，所选模型的渠道配置与密钥会加密同步至执行服务。新建或重置会话不会清除云端记忆，删除规则见[小薇数据说明](/docs/cloud-agent#data)与[隐私政策](/privacy)。`,
          },
        ],
      },
    ],
  },
  "deepseek-in-wechat": {
    intro:
      "把 DeepSeek 放进每天打开的微信，用来提问、改文案、整理思路。微伴连接你自己的模型 API，不需要安装或一直运行本地程序。",
    sections: [
      {
        id: "before-setup",
        title: "开始前，先确认两件事",
        body: `**基础文字聊天可用 Free，模型 API 费用另计。** 图片与文件输入需要 Plus，并受模型能力限制。

手机微信需有「我 → 设置 → 插件 → 微信 ClawBot」入口。找不到时先更新微信，界面示意见[连接微信教程](/docs/wechat-connection#connect)。`,
      },
      {
        id: "prepare",
        title: "准备 DeepSeek API Key",
        body: `进入[DeepSeek 开放平台](https://platform.deepseek.com/)创建 API Key，并确认有可用余额，再进入微伴[工作台](/app)。**API Key 不是聊天网站的登录密码，网页版会员也不等于 API 余额。**

已经购买第三方 DeepSeek API 的用户，使用对应服务商的地址和密钥即可，无需再申请官方 Key。`,
        details: [
          {
            title: "我需要安装 OpenClaw 吗？",
            body: `本篇的普通模型聊天不需要。模型由你选择的 API 服务商运行，微伴负责连接微信；已有 OpenClaw 想接入时，可看[DeepSeek 接入方式对比](/wechat-deepseek)。`,
          },
        ],
      },
      {
        id: "channel",
        title: "第一步：添加 DeepSeek 渠道和模型",
        illustration: "channel-form",
        body: `1. 打开[渠道与模型](/app/channels)，点击「添加渠道」。
2. 服务商选择 **DeepSeek**，填写 API Key，点击「保存并获取模型」。地址和协议会自动填好。`,
        afterIllustration: `看到已导入的文本模型后，点击模型行的 **闪电图标「测试连接」**。测试成功，再继续连接微信。

**测试会消耗少量 credits，并可能产生服务商 API 费用。**`,
        details: [
          {
            title: "模型没有同步出来，或测试失败？",
            body: `渠道通常已经保存，不必重复创建。点击「获取可用模型」重试；仍没有所需模型时，点击「添加模型」，填写服务商给出的模型 ID。

测试失败先检查 Key、余额和模型权限，再核对协议、地址与模型 ID，具体见[模型同步与测试](/docs/channels-models#import)。`,
          },
          {
            title: "第三方 DeepSeek API 怎么填写？",
            body: `选择服务商列表中的对应渠道；没有预设时，选择「自定义（第三方渠道 / 其他协议）」，按服务商说明填写协议、Base URL 和 API Key。不要把第三方 Key 填进 DeepSeek 官方预设地址。

保存后获取模型，或手动添加模型 ID，再测试。界面示意见[自定义渠道教程](/docs/channels-models#configure)。`,
            illustration: "custom-channel",
          },
        ],
      },
      {
        id: "connect",
        title: "第二步：连接微信，发出第一条消息",
        illustration: "tutorial-deepseek-chat",
        body: `1. 打开[微信连接](/app/wechat)，选择已有链接，或点击「创建链接」，再获取二维码。已连接时无需重新扫码。
2. 按[连接微信教程](/docs/wechat-connection#connect)，用手机微信 ClawBot 扫码并确认。手机浏览本站时，用电脑或另一台设备显示二维码。
3. 页面显示「已连接」后，通过「切换渠道与模型」选好 DeepSeek，再到对应微信对话发一句问题。`,
        afterIllustration: `想核对当前配置，发送免费命令 \`/wx status\`。不要只靠 AI 对自身名称的回答来判断模型。`,
      },
      {
        id: "sessions",
        title: "第三步：换话题，或切换模型",
        body: `- **另开话题：** 发送 \`/wx new\`，原来的聊天记录保留。
- **接着旧话题：** 发送 \`/wx sessions\`，再用 \`/wx switch 编号\` 切换。
- **换模型：** 在微信连接页切换渠道与模型，**无需重新扫码**。

只想让模型重新理解当前问题，可用 \`/wx reset\` 重置上下文，聊天记录不会删除。更多操作见[命令速查](/docs/commands)和[会话说明](/docs/sessions)。`,
      },
      {
        id: "search",
        title: "可选：为 DeepSeek 配置联网搜索",
        body: `普通模型接入微信后不会自动联网。需要查最新信息时，按[DS Chat 教程](/docs/ds-chat#configure)选择回答模型，并单独配置搜索服务。

保存快捷名 \`ds\` 后，发送 \`/use ds\`，再问「查一下今天上海的天气，并给出来源」。只问一次可用 \`@ds 问题\`，发送 \`/exit\` 回到普通模型。

模型和搜索服务由你提供，API 费用另计；是否搜索取决于问题、模型判断和接口是否可用。`,
      },
      {
        id: "faq",
        title: "费用与常见问题",
        body: `微伴按实际输入和回复计算 credits，模型服务商的 API 费用另计。历史对话也可能计入输入；发送 \`/wx balance\` 查余额，或查看[计费与用量估算](/docs/credits#metering)。`,
        details: [
          {
            title: "已连接，为什么没有回复？",
            body: `先发免费命令 \`/wx help\`：没有回复时查[微信连接](/docs/wechat-connection#reconnect)；命令能回复时，到渠道页测试模型，检查 Key、服务商余额和模型 ID。模型测试正常后，用 \`/wx status\` 确认没有进入其他插件。`,
          },
          {
            title: "能发图片、文件或语音吗？",
            body: `图片与文件输入需要 Plus。看图还需支持视觉的模型，DeepSeek 渠道中同步出的模型不一定具备此能力；按[附件教程](/docs/attachments)先发附件，再发要求。

语音不要求 Plus，但必须附带微信转写文本；没有转写时请改发文字。`,
          },
          {
            title: "这是 DeepSeek 或微信的官方产品吗？",
            body: `不是。微伴是独立产品，通过你配置的 API 接入 DeepSeek，与微信、腾讯及 DeepSeek 无官方关联。`,
          },
        ],
      },
    ],
  },
  "multiple-openclaw-in-wechat": {
    intro:
      "一个微信对话，切换工作和生活两位 OpenClaw 助手。微伴为每组配置设置独立快捷名，模型、工具和记忆继续由你自己的 OpenClaw 管理。",
    sections: [
      {
        id: "choose",
        title: "先选好两位助手从哪里来",
        body: `两种方式都支持：

- **两台设备各运行一个 OpenClaw：** 分别在对应设备执行连接命令。
- **同一 OpenClaw 中有多个 Agent：** 在同一设备执行两次各自生成的连接命令，再分别选择助手。

这里的 Agent 就是 OpenClaw 中的助手。微伴连接后会显示可选助手，无需手填 Agent ID；创建助手见 [OpenClaw 官方文档](https://docs.openclaw.ai/concepts/multi-agent)。`,
      },
      {
        id: "prepare",
        title: "开始前",
        body: `本篇要创建两组插件配置，**需要微伴 Plus**；Free 可先连接 1 个插件体验。

先确认 OpenClaw 在自己的电脑或服务器能正常聊天，Gateway 已启动。模型和 API Key 在 OpenClaw 中配置，无需在微伴重复添加。**运行设备需要保持在线，关机或休眠后无法处理消息。**

当前接入支持文字和带微信转写的语音，暂不支持图片、文件。

还没安装时，先看[OpenClaw 接入指南](/developers/openclaw)的环境要求和安装入口。`,
      },
      {
        id: "first",
        title: "第一步：连接工作助手",
        illustration: "agent-pairing-openclaw",
        body: `1. 打开[插件页](/app/plugins)的 OpenClaw，点击「配置插件」，再点「连接 OpenClaw」。
2. 复制连接命令，到 **运行 OpenClaw 的设备终端**粘贴执行。服务器上的安装，就在服务器终端操作。
3. 等网页显示「已连接」，弹窗自动关闭后，打开「查看配置 → 修改配置」。有多个 Agent 时选择工作助手，在「更多设置」把名称改为「工作助手」、快捷名设为 \`work\`，保存。`,
        afterIllustration: `**命令十分钟内有效，请勿转发给他人。** 安装会重启 Gateway，请等当前任务结束后再操作。连接失败时，先看终端提示，再回网页检查状态。`,
      },
      {
        id: "second",
        title: "第二步：添加生活助手，保留原连接",
        illustration: "openclaw-configs",
        body: `1. 打开 OpenClaw 的「查看配置」，点击底部 **「添加另一组配置」**，生成另一条连接命令。
2. 在生活助手所在设备执行；同一 OpenClaw 的另一个 Agent，就在同一设备执行。
3. 连接后，有多个 Agent 时选择生活助手；只有一个时会自动识别。名称设为「生活助手」、快捷名设为 \`life\`，保存。

**新增助手要用「添加另一组配置」。**「重新连接」会替换当前这组连接，不会多出一个助手。`,
      },
      {
        id: "switch",
        title: "第三步：在微信里切换助手",
        illustration: "tutorial-openclaw-chat",
        body: `先按[连接微信教程](/docs/wechat-connection#connect)完成扫码。已有微信连接直接用，**无需为每位助手重新扫码**。

发送 \`/use work\` 进入工作助手，发送 \`/use life\` 切换到生活助手，之后直接发消息即可。快捷名以你保存的配置为准。`,
        afterIllustration: `只想临时交给工作助手，发 \`@work 帮我整理项目进度\`；当前默认助手不变。\`/wx plugins\` 查看快捷名，\`/wx status\` 查看当前配置，\`/exit\` 回到普通模型。`,
        details: [
          {
            title: "OpenClaw 和微伴的命令怎么区分？",
            body: `进入 OpenClaw 后，\`/help\`、\`/new\` 等交给 OpenClaw；微伴命令使用 \`/wx help\`、\`/wx new\`。\`/use\` 和 \`/exit\` 始终用于微伴切换插件。

\`/wx new\` 新建微伴会话与远端对话，不删除 OpenClaw 的文件和长期记忆；详细区别见[命令速查](/docs/commands#agent-commands)。`,
          },
        ],
      },
      {
        id: "notifications",
        title: "可选：接收定时提醒和后台结果",
        body: `先在微信给对应助手发一条消息，建立返回通道；在插件「更多设置」开启「接收定时任务和后台结果推送」，再让它创建任务，并说明「把结果发回当前 wechatai 对话」。

切换到生活助手后，工作助手仍可发回结果，消息会注明来源。追问可用 \`@work 后续问题\`，连续聊则发 \`/use work\`。

**微信推送受最近互动后 24 小时的回复窗口限制。** 超时后在原对话发 \`/wx help\` 更新窗口，已过期结果不保证补发。投递设置见[OpenClaw 接入指南](/developers/openclaw)。`,
      },
      {
        id: "faq",
        title: "费用与常见问题",
        body: `微伴只按本次发给插件的文字和最终回复计算 credits，主动推送只计输出；OpenClaw 内部的模型费用由你的服务商收取。详见[计费说明](/docs/credits#metering)。`,
        details: [
          {
            title: "一直没有回复，先检查哪里？",
            body: `在「查看配置 → 修改配置」检查连接状态和最近投递，再确认设备在线、Gateway 正常运行。先在 OpenClaw 本机测试，区分模型问题与微伴连接问题。

待执行消息最多保留 24 小时。任务执行中设备重启，不会自动重跑中断任务，以免重复操作；查看本机任务状态后再决定是否重发。`,
          },
          {
            title: "两个助手会共用记忆吗？",
            body: `微伴会分开聊天会话，但同一个 OpenClaw Agent 仍可能共用文件、长期记忆和工具。想隔离工作与生活，请分别配置 Agent 和工作目录，或使用两套独立安装；仅修改快捷名不能隔离记忆。`,
          },
          {
            title: "能发送图片、文件或语音吗？",
            body: `目前支持文字和附带微信转写的语音，暂不支持图片、文件；语音没有转写时请改发文字。需要批准的工具操作，仍要到 OpenClaw 端确认。`,
          },
        ],
      },
    ],
  },
  "hermes-in-wechat": {
    intro:
      "把已有的 Hermes 接进微信，随时交代任务、接收结果。Hermes 继续运行在你的电脑或服务器，沿用原有模型、工具和记忆，无需在微伴重新配置模型。",
    sections: [
      {
        id: "prepare",
        title: "第一步：准备好 Hermes",
        body: `Free 可配置 1 个插件，Plus 不限插件数量。先确认你已经安装 Hermes，在本机发问题能收到回答；还没安装时，按[Hermes 官方安装文档](https://hermes-agent.nousresearch.com/docs/getting-started/installation)完成初始化。

**微伴的连接命令只安装接入渠道，不安装 Hermes 本体。** 支持 macOS、Linux、WSL，需要 Python 3；具体版本见[接入指南](/developers/hermes)。使用多个 profile 时，在要接入的那个 profile 环境执行。

当前接入支持文字和带微信转写的语音，暂不支持图片、文件。运行设备需保持在线、Gateway 持续运行，关机或休眠后无法处理消息。`,
      },
      {
        id: "pair",
        title: "第二步：执行一键连接命令",
        illustration: "agent-pairing-hermes",
        body: `1. 打开[插件页](/app/plugins)的 Hermes，点击「配置插件」，再点「连接 Hermes」。
2. 复制连接命令，到 **安装 Hermes 的电脑或服务器终端**粘贴执行。不要发到微信或 Hermes 聊天框。
3. 回到网页，等「已连接」后弹窗自动关闭。

**命令十分钟内有效，请勿转发给他人。** 它会安装微伴渠道并重启 Hermes Gateway，请等当前任务结束后再操作。`,
        details: [
          {
            title: "命令执行了，网页还在等待连接？",
            body: `先检查终端报错；命令过期就回网页重新生成。自动启动 Gateway 失败时，在同一 profile 的终端运行：

\`\`\`sh
hermes gateway run
\`\`\`

使用服务器时，从正式站点生成连接命令。本机 localhost 地址不能供另一台服务器连接。更多排查见[Hermes 接入指南](/developers/hermes)。`,
          },
        ],
      },
      {
        id: "chat",
        title: "第三步：在微信里发消息",
        illustration: "tutorial-hermes-chat",
        body: `先按[连接微信教程](/docs/wechat-connection#connect)扫码，已有微信连接直接用。

在对应微信对话发送 \`/use hermes\`，再直接交代任务，例如「帮我把今天的待办按优先级排一下」。\`hermes\` 是默认快捷名，修改过就用自己的名称。`,
        afterIllustration: `只问一次可发 \`@hermes 问题\`，不会切换当前插件；换插件直接发 \`/use 其他快捷名\`，回普通模型用 \`/exit\`。忘了当前模式时，发 \`/wx status\`。`,
      },
      {
        id: "commands",
        title: "区分 Hermes 和微伴的命令",
        body: `进入 Hermes 后，命令按前缀区分：

| 想做什么 | 发送什么 |
| --- | --- |
| 看 Hermes 的帮助 | \`/help\` |
| 在 Hermes 中另开话题 | \`/new\` |
| 看微伴帮助 | \`/wx help\` |
| 新建微伴会话与远端对话 | \`/wx new\` |

**清理微伴聊天，不会删除 Hermes 本机的文件和长期记忆。** 同一 profile 下的新会话仍可能使用共同记忆。更多操作见[命令速查](/docs/commands#agent-commands)。`,
        details: [
          {
            title: "提示不支持 Hermes 原生命令怎么办？",
            body: `原生命令需要连接器 1.1.0 或更新版本。在微伴重新生成并执行连接命令即可升级；Hermes 实际支持哪些命令，以它自己的 \`/help\` 为准。`,
          },
        ],
      },
      {
        id: "notifications",
        title: "可选：接收后台结果和定时提醒",
        body: `先在微信给 Hermes 发一条消息，再开启插件「更多设置」中的「接收定时任务和后台结果推送」，让它创建任务并说明「把结果发回当前 wechatai 对话」。任务能力取决于 Hermes 已配置的工具。

切换到其他插件后，Hermes 仍可发回结果，消息会注明来源，不会自动切换当前插件。

**微信推送受最近互动后 24 小时的回复窗口限制。** 超时后在原对话发送 \`/wx help\` 更新窗口，已过期结果不保证补发。详细投递设置见[Hermes 接入指南](/developers/hermes)。`,
      },
      {
        id: "faq",
        title: "费用与常见问题",
        body: `微伴按本次发送的文字和最终回复计算 credits，主动推送只计输出；Hermes 内部的模型调用不计入微伴额度，API 费用由你的服务商收取。\`/wx balance\` 查询余额，规则见[计费说明](/docs/credits#metering)。`,
        details: [
          {
            title: "收到等待提示，却迟迟没有回复？",
            body: `先在本机向 Hermes 发个问题。本机也不回复时，检查模型余额与报错；本机正常时，再看 Gateway 日志、网页连接状态和最近投递。有些工具操作需要你在 Hermes 端批准。

插件的输入、输出上限只控制微信本次传入和返回的文字，不限制 Hermes 内部模型用量。`,
          },
          {
            title: "能发图片、文件或语音吗？",
            body: `目前支持文字和附带微信转写的语音，暂不支持图片、文件。语音没有转写时，请在微信转文字后发送，或直接发文字要求。`,
          },
        ],
      },
    ],
  },
};
