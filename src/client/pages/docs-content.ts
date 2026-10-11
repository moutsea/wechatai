import type { DocSlug } from "../../shared/docs";
import { GUIDE_CONTENT } from "./guide-content";

export interface DocSection {
  id: string;
  title: string;
  body: string;
  screenshot?: {
    src: string;
    alt: string;
    caption: string;
    width: number;
    height: number;
  };
}
export interface DocContent {
  intro: string;
  sections: DocSection[];
}

export const DOC_CONTENT: Record<DocSlug, DocContent> = {
  ...GUIDE_CONTENT,
  "deepseek-in-wechat": {
    intro:
      "想在微信里直接问 DeepSeek、修改文案，或继续昨天没聊完的话题？微伴可以连接你自己的模型 API，把微信作为聊天入口。本篇从一个普通模型渠道开始，不需要安装本地 Agent。",
    sections: [
      {
        id: "prepare",
        title: "开始前，准备好什么？",
        body: `你需要在微伴[注册账号](/register)并[登录](/login)，同时准备好 DeepSeek 模型官方或第三方 API 服务。

**API 模型服务不等同于网页版会话，可能产生费用**。模型价格请参考模型服务提供商。

本文以 [DeepSeek 官方 API](https://api-docs.deepseek.com/) 为例。如果使用第三方渠道，请填写该服务商提供的地址（base_url）与密钥（apikey）。`,
      },
      {
        id: "channel",
        title: "第一步：添加 DeepSeek 渠道和模型",
        screenshot: {
          src: "/images/docs/deepseek-channel.jpg",
          alt: "添加 DeepSeek 渠道：选择 OpenAI Chat Completions 协议，填写 Base URL 和 API Key",
          caption: "DeepSeek 官方 API 填写示例。API Key 请填入你自己的密钥。",
          width: 666,
          height: 664,
        },
        body: `打开[渠道与模型](/app/channels)，添加一个渠道，按下面的方式填写：

| 配置项 | DeepSeek 官方 API 的填写方式 |
| --- | --- |
| 渠道名称 | DeepSeek，或你容易辨认的名称 |
| 协议 | OpenAI Chat Completions |
| API 根地址 | \`https://api.deepseek.com\` |
| API Key | 你在服务商处创建的 API 密钥 |

保存后测试连接。测试会发起真实模型请求，请确认该 API Key 有可用额度。你还可以为模型设置输入、输出上限，控制长上下文和长回复的消耗。`,
      },
      {
        id: "connect",
        title: "第二步：连接微信，发出第一条消息",
        body: `1. 打开[微信连接](/app/wechat)，创建自己的微信链接。
2. 打开微信「设置」，在「功能」分组中进入「插件」，选择「微信 ClawBot → 扫一扫」，扫描微伴页面上的二维码并确认连接。
3. 确认页面显示的当前渠道与模型是你刚添加的 DeepSeek；需要调整时，点击「切换渠道与模型」。
4. 进入连接对应的微信对话，先发一句简单的问题，例如「帮我把这句话写得更自然：明天上午开会」。
5. 收到回答后，继续发送文字即可延续当前对话。

如果账号里有多个渠道或模型，可以先发送 \`/wx channels\` 查看渠道编号，用 \`/wx channel 2\` 切换渠道；再发送 \`/wx models\` 查看当前渠道下的模型，使用 \`/wx model 2\` 切换。这里的 2 只是示例，请按实际列表选择。

想确认现在用的是哪个模型，发送 \`/wx status\`。直接问 AI「你是什么模型」可能得到不准确的自述，工作台和状态命令显示的配置更适合用来核对。`,
      },
      {
        id: "search",
        title: "配置 DS Chat 插件，获得逼近 DeepSeek 网页版体验",
        screenshot: {
          src: "/images/docs/ds-chat-settings.jpg",
          alt: "DS Chat 配置：回答模型、搜索 API 类型、搜索地址与密钥的填写位置",
          caption: "先选择回答模型，再填写自己的搜索 API。图中模型为演示数据。",
          width: 496,
          height: 953,
        },
        body: `普通 DeepSeek 模型聊天不会因为接入微信就自动获得搜索能力。如果希望它能处理最新信息，可以在[插件](/app/plugins)中配置 **DS Chat**：

1. 选择刚才添加的文本模型作为回答模型。
2. 配置你自己的搜索服务。默认提供 DeepSeek 原生搜索类型和地址，也可以选择其他已支持的搜索接口。
3. 填入对应搜索服务的密钥，保存一个容易记住的快捷名称，例如 \`ds\`。
4. 在微信发送 \`/use ds\`，之后直接提问，例如「查一下今天上海的天气，并给出来源」。

DS Chat 基于 DeepSeek Harness 开源项目开发。实际是否使用工具取决于问题、模型判断和接口是否可用。**模型和搜索 API 都由你提供。**

只想临时问一次，可以发送 \`@ds 查一下今天上海天气\`，这不会改变当前默认模型或插件。发送 \`/exit\` 可退出插件，返回进入前的普通模型会话。`,
      },
      {
        id: "sessions",
        title: "第三步：管理话题与使用额度",
        body: `不同话题可以分开聊：发送 \`/wx new\` 新建会话，原来的记录会保留；发送 \`/wx sessions\` 查看会话，再用 \`/wx switch 编号\` 切换。

如果只是希望模型忘记当前上下文，使用 \`/wx reset\`。它会重置上下文和历史摘要，**不会删除聊天记录**。长期对话还会使用自动摘要与最近对话来管理上下文，具体输入仍受你的模型设置限制。

模型服务商的 API 费用与微伴 credits 分开计算。普通模型请求会带上实际需要的上下文，历史越长，输入消耗可能越高。可通过 \`/wx balance\` 查看额度，详细规则见 [Credits 与会员](/docs/credits)。`,
      },
      {
        id: "faq",
        title: "常见问题",
        body: `### 连接成功，为什么还是不能聊天？

先在渠道中测试模型，检查 API Key、服务商余额和实际模型 ID；再用 \`/wx status\` 检查当前是否进入了其他插件。排查时，先发一条简短文字，便于区分模型问题和附件问题。

### 一个微信对话可以使用多个模型吗？

可以。添加多个渠道与模型后，通过 \`/wx channel\` 和 \`/wx model\` 切换，不需要每换一个模型就重新扫码。

### 能发送图片和语音吗？

图片与文件输入需要微伴 Plus 会员，且对应模型必须具备相应能力。可以先发附件，再发文字说明要求。语音依赖微信随消息提供的转写内容；没有转写时请改发文字。

### 这是 DeepSeek 或微信的官方功能吗？

微伴是独立产品，通过你配置的 API 连接模型服务，与微信、腾讯及 DeepSeek 无官方关联。完整操作可继续阅读[使用指南](/docs/getting-started)。`,
      },
    ],
  },
  "multiple-openclaw-in-wechat": {
    intro:
      "这篇用「工作助手」和「生活助手」两组配置，演示怎么在一个微信对话里切换多个 OpenClaw。你可以连接不同设备上的 OpenClaw，也可以连接同一个 OpenClaw 中的多个 Agent。",
    sections: [
      {
        id: "choose",
        title: "选好接入方式",
        body: `先看你的 OpenClaw 装在哪里：

| 你的情况 | 怎么连接 |
| --- | --- |
| 两台设备各运行一个 OpenClaw | 建两组插件配置，各自到对应设备执行连接命令 |
| 一个 OpenClaw 中有多个 Agent | 建两组插件配置，都连接这套 OpenClaw，再分别选择 Agent |

Agent 就是你在 OpenClaw 中设置的助手。连接后，微伴会显示可选助手，不用手填 Agent ID。还没创建多个 Agent，可以参考 [OpenClaw 官方文档](https://docs.openclaw.ai/concepts/multi-agent)。`,
      },
      {
        id: "prepare",
        title: "开始前",
        body: `你需要[注册微伴账号](/register)、开通微伴 Plus 会员，并在电脑或服务器上装好 OpenClaw。先确认 OpenClaw 本身能正常聊天，Gateway 已启动。

模型、API Key 和工具继续在 OpenClaw 中配置，不用在微伴重新添加。设备需要保持在线；电脑关机或休眠后，OpenClaw 就无法处理新消息。

安装环境要求和版本说明见 [OpenClaw 接入指南](/developers/openclaw)。`,
      },
      {
        id: "first",
        title: "第一步：连接工作助手",
        screenshot: {
          src: "/images/docs/openclaw-connect.jpg",
          alt: "OpenClaw 连接弹窗中的连接命令和复制按钮",
          caption: "连接命令的位置（演示界面）。请复制自己账号生成的命令，不要使用截图内容。",
          width: 496,
          height: 746,
        },
        body: `1. 打开[插件](/app/plugins)，找到 OpenClaw，点击「配置插件」。
2. 在弹窗中点击「连接 OpenClaw」，复制生成的命令。
3. 到安装 OpenClaw 的设备上打开终端，粘贴并执行。如果装在服务器上，就在登录服务器后的终端执行。
4. 等网页显示已连接，弹窗会自动关闭。
5. 打开「查看配置 → 修改配置」，选择工作 Agent。在「更多设置」里把插件名称改为「工作助手」、快捷名称改为 \`work\`，保存。

连接命令十分钟内有效，过期后重新生成。安装会重启 Gateway，建议等手头的任务结束后再操作。命令只给自己的设备使用，不要转发。`,
      },
      {
        id: "second",
        title: "第二步：添加生活助手，保留原连接",
        screenshot: {
          src: "/images/docs/openclaw-configs.jpg",
          alt: "OpenClaw 配置管理：顶部选择配置，底部添加另一组配置",
          caption: "顶部选择要修改的配置，底部「添加另一组配置」新增助手。图中使用演示数据。",
          width: 496,
          height: 748,
        },
        body: `打开 OpenClaw 的「查看配置」，点击下方「添加另一组配置」，再生成一条连接命令。

- 如果生活助手装在另一台设备，就去那台设备执行。
- 如果是同一 OpenClaw 里的另一个 Agent，就在同一设备执行，连接后选择生活 Agent。

把这组配置命名为「生活助手」，快捷名称填 \`life\`。以后打开「查看配置」，就能在两组配置之间选择和修改。

**添加新助手要用「添加另一组配置」。**「重新连接」会替换当前这组配置的连接，不会多出一个助手。`,
      },
      {
        id: "switch",
        title: "第三步：在微信里切换助手",
        body: `在微伴的[微信连接](/app/wechat)页面创建链接，获取二维码。然后打开微信「设置」，在「功能」分组中进入「插件」，选择「微信 ClawBot → 扫一扫」，扫描二维码并确认连接。分步说明见[连接微信](/docs/wechat-connection#connect)。已有微信连接可以直接用，不必再建一个。

连接后，向对应微信对话发送下面的命令：

| 发送内容 | 会发生什么 |
| --- | --- |
| \`/wx plugins\` | 查看插件名称和快捷名 |
| \`/use work\` | 进入工作助手，之后直接发消息 |
| \`/use life\` | 切换到生活助手，不用先退出 |
| \`@work 帮我整理项目进度\` | 只把这一条交给工作助手，之后仍用原来的助手 |
| \`/wx status\` | 查看当前用的是哪组配置 |
| \`/exit\` | 返回普通模型聊天 |

\`work\` 和 \`life\` 是本文示例，请换成你保存的快捷名称。

进入 OpenClaw 后，\`/help\`、\`/new\` 等命令由 OpenClaw 处理。要操作微伴的会话，用 \`/wx help\`、\`/wx new\`。\`/use\` 和 \`/exit\` 始终用来切换微伴插件。`,
      },
      {
        id: "notifications",
        title: "接收定时提醒和后台结果",
        body: `先在微信里给对应助手发一条消息，再让它创建任务，并说明「把结果发回当前 wechatai 对话」。插件设置中的「接收定时任务和后台结果推送」也要开启。

比如，你正在和生活助手聊天，工作助手的任务完成了，微信消息会标明它来自工作助手。想追问时，发 \`@work 后续问题\` 即可；想继续和它聊，就发 \`/use work\`。

只会推送指定发往当前微信对话的结果。更详细的任务投递设置见 [OpenClaw 接入指南](/developers/openclaw)。`,
      },
      {
        id: "faq",
        title: "常见问题",
        body: `### 一直没有回复，先查哪里？

打开「查看配置 → 修改配置」，检查连接状态和最近投递，再确认设备在线、Gateway 正常运行。待执行消息最多保留 24 小时。如果任务执行中设备重启，中断任务不会自动重跑，以免重复操作文件或重复发送消息。

### 两个助手会共用记忆吗？

先检查两组配置是否选了同一个 Agent。微伴会分开聊天会话，但同一个 Agent 仍可能共用文件、长期记忆和工具。想把工作与生活分开，请在 OpenClaw 中分别配置 Agent 和工作目录，或者使用两套独立安装。

### 能发图片或文件吗？

目前支持文字和带微信转写的语音，暂不支持图片、文件。需要批准的工具操作，也要到 OpenClaw 端确认。

### 怎么计算费用？

微伴按本次发给插件的文字和最终回复扣除 credits，不统计 OpenClaw 内部的模型调用。主动推送只计输出。模型 API 的费用由你的服务商另行收取，详见[额度说明](/docs/credits)。`,
      },
    ],
  },
  "hermes-in-wechat": {
    intro:
      "把 Hermes 接入微伴后，就能在微信里给它发消息，接收处理结果。Hermes 仍运行在你的电脑或服务器上，模型、工具和记忆沿用原来的配置。",
    sections: [
      {
        id: "prepare",
        title: "第一步：准备好 Hermes",
        body: `你需要一个微伴账号、微伴 Plus 会员，以及一套能正常聊天的 Hermes。

还没安装的话，先按 [Hermes 官方安装文档](https://hermes-agent.nousresearch.com/docs/getting-started/installation)完成安装和模型配置。在本机发个问题、确认能收到回答，再继续下面的步骤。微伴的连接命令不会替你安装 Hermes 本体。

如果你用过多个 Hermes profile，就在要接入的那个 profile 环境中操作。微伴会沿用它的配置，不需要再填模型 API Key 或 Agent ID。支持的环境与版本见 [Hermes 接入指南](/developers/hermes)。`,
      },
      {
        id: "pair",
        title: "第二步：执行一键连接命令",
        screenshot: {
          src: "/images/docs/hermes-connect.jpg",
          alt: "Hermes 连接弹窗：复制连接命令，到安装 Hermes 的设备上执行",
          caption: "Hermes 连接界面（演示数据）。登录自己的账号后生成并复制连接命令。",
          width: 496,
          height: 746,
        },
        body: `1. 打开[插件](/app/plugins)，找到 Hermes，点击「配置插件」。
2. 在弹窗中点击「连接 Hermes」，复制连接命令。
3. 打开安装 Hermes 的电脑或服务器的**终端命令行**，粘贴并执行。不要发到微信或 Hermes 的聊天框里。
4. 回到网页，等状态变为已连接，弹窗会自动关闭。

命令会安装微伴渠道并重启 Hermes Gateway，建议等当前任务结束后再执行。命令十分钟内有效，过期后重新生成，不要分享给他人。

如果没有自动启动 Gateway，在同一终端运行：

\`\`\`sh
hermes gateway run
\`\`\`

连接后保持设备在线、Gateway 运行，就可以从微信发消息了。`,
      },
      {
        id: "chat",
        title: "第三步：在微信里发消息",
        body: `先在微伴的[微信连接](/app/wechat)页面创建链接，获取二维码。打开微信「设置」，在「功能」分组中进入「插件」，选择「微信 ClawBot → 扫一扫」，扫描二维码并确认连接。分步说明见[连接微信](/docs/wechat-connection#connect)。

进入对应微信对话后发送：

\`\`\`text
/use hermes
\`\`\`

接下来直接发问题，例如「帮我把今天的待办按优先级排一下」。\`hermes\` 是默认快捷名称，如果改过，用你保存的名称。

只想临时调用一次，可以发：

\`\`\`text
@hermes 帮我整理今天的任务
\`\`\`

临时调用不会切换当前插件。连续使用 Hermes 就用 \`/use hermes\`，换别的插件直接用 \`/use 其他快捷名\`，回普通模型聊天用 \`/exit\`。忘了自己在哪个插件里，可以发 \`/wx status\` 查看。`,
      },
      {
        id: "commands",
        title: "区分 Hermes 和微伴的命令",
        body: `进入 Hermes 后，\`/help\`、\`/new\` 等原生命令交给 Hermes。微伴自己的命令带 \`/wx\` 前缀：

| 想做什么 | 发送什么 |
| --- | --- |
| 查看 Hermes 帮助 | \`/help\` |
| 在 Hermes 中新建会话 | \`/new\` |
| 查看微伴帮助 | \`/wx help\` |
| 在微伴中新建会话 | \`/wx new\` |
| 查看当前插件 | \`/wx status\` |
| 查看 credits | \`/wx balance\` |

Hermes 支持哪些命令，以它自己的 \`/help\` 为准。如果旧连接器提示不支持原生命令，在微伴重新生成并执行连接命令即可升级；此功能需要连接器 1.1.0 或更新版本。

清理微伴聊天记录不会删除 Hermes 本机的文件和记忆。同一 profile 下的新会话，也可能读到已有的长期记忆。`,
      },
      {
        id: "notifications",
        title: "接收后台结果和定时提醒",
        body: `先在微信里给 Hermes 发一条消息，再让它创建任务，并说明「把结果发回当前 wechatai 对话」。同时确认插件设置中的「接收定时任务和后台结果推送」已开启。任务能做什么，由 Hermes 已配置的工具决定。

你切换到其他插件后，Hermes 仍可发回任务结果。消息会标明来源，并附上 \`/use\` 和 \`@\` 的回复方式，不会自动把当前插件切回 Hermes。

推送配置有问题时，可以查看 [Hermes 接入指南](/developers/hermes)里的详细说明。`,
      },
      {
        id: "faq",
        title: "常见问题",
        body: `### 电脑关机后还能用吗？

不能。Hermes 运行在你自己的设备上，关机或休眠后就无法处理消息。需要随时使用的话，可以放在持续在线的电脑或服务器上。

### 收到等待提示，却没有回复怎么办？

先在本机给 Hermes 发个问题。如果本机也无法回复，检查模型服务的余额和报错；本机正常时，再看 Gateway 日志、插件连接状态和最近投递。有些任务需要你在 Hermes 端批准工具操作。

### 能发图片、文件或语音吗？

目前支持文字和带微信转写的语音，暂不支持图片、文件。语音没有附带转写时，请改发文字。

### Hermes 内部调用多次模型，都要扣 credits 吗？

微伴只计算本次发给插件的文字和最终回复，主动推送只计输出。Hermes 内部模型调用的费用由你的模型服务商收取。

插件设置里的输入、输出上限控制微信这次传入和返回的文字量，不限制 Hermes 内部的模型用量。`,
      },
    ],
  },
};
