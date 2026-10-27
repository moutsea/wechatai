import type { DocScreenshot } from "./docs-content";

// Captured from the real workspace UI. Values are illustrative, never account credentials.
export const DOC_SCREENSHOTS = {
  channelConfig: {
    src: "/images/docs/deepseek-channel.png",
    alt: "添加渠道：选择 DeepSeek，填写 API Key，查看自动补全的协议与请求地址",
    caption: "选择服务商后填写自己的 API Key；协议和请求地址会自动填好。",
    width: 1265,
    height: 712,
  },
  channelModels: {
    src: "/images/docs/channels-overview.jpg",
    alt: "渠道卡片中的模型列表、测试连接闪电按钮，以及获取可用模型和添加模型入口",
    caption: "模型在所属渠道内显示；行末闪电图标用于测试连接。图中模型为示例数据，请以服务商提供的实际模型 ID 为准。",
    width: 1265,
    height: 712,
  },
  modelLimits: {
    src: "/images/docs/model-limits.jpg",
    alt: "模型更多设置：输入 Token 上限、输出 Token 上限、上下文窗口、单轮 credits 上限与有效输入空间",
    caption: "编辑模型后展开「更多设置」。图中数值是示例设置，不代表默认值；请按模型实际能力和自己的预算填写。",
    width: 425,
    height: 699,
  },
  sessionHistory: {
    src: "/images/docs/session-history.jpg",
    alt: "会话记录中的微信样式聊天气泡、模型回答、复制回答和 credits 消耗入口",
    caption: "在网页回看对话，右上角「…」可管理当前记录；查看记录不会切换微信会话。（示例数据）",
    width: 425,
    height: 699,
  },
  dsSearch: {
    src: "/images/docs/ds-chat-search.jpg",
    alt: "DS Chat 的回答模型、DeepSeek 原生搜索类型、搜索地址、可选模型 ID 和搜索 API Key 输入框",
    caption: "回答模型和搜索服务分别配置，搜索密钥填在「搜索 API Key」中。图中未填写密钥。",
    width: 425,
    height: 699,
  },
  imageGeneration: {
    src: "/images/docs/image-generation-config.jpg",
    alt: "AI 生图配置中的微信快捷名称、生图模型、启用状态和等待提示文案",
    caption: "选择自己的生图模型，设置快捷名称与等待提示。图中模型仅用于示例，请以服务商的可用模型为准。",
    width: 425,
    height: 699,
  },
  roleplay: {
    src: "/images/docs/roleplay-characters.jpg",
    alt: "角色扮演插件的六个原创角色选择卡片与使用这个角色按钮",
    caption: "选择角色后可以预览开场白，再点击「使用这个角色」继续配置。",
    width: 425,
    height: 699,
  },
  personalAssistant: {
    src: "/images/docs/personal-assistant-config.jpg",
    alt: "个人助理设置：名称、快捷名称、回答模型、记账币种与接收提醒的微信链接",
    caption: "先选回答模型，再选择接收提醒的微信链接；快捷名称用于 /use 和 @ 调用。（示例数据）",
    width: 425,
    height: 699,
  },
  personalTodos: {
    src: "/images/docs/personal-assistant-todos.jpg",
    alt: "助理记录管理中的笔记、提醒、账本标签，待办清单、每日待办提醒与今日待办入口",
    caption: "在「笔记 → 待办清单」设置每日提醒时间；用「今日待办」查看当天安排。",
    width: 425,
    height: 699,
  },
  notificationToken: {
    src: "/images/docs/notification-token.jpg",
    alt: "消息提醒保存后的配置页，包含生成专属 Token 按钮和 HTTP 推送接口",
    caption: "保存后从这里生成 Token、复制调用示例；Token 只在自己的账号下生成。",
    width: 425,
    height: 699,
  },
  creditsHistory: {
    src: "/images/docs/credits-history.jpg",
    alt: "额度明细：实际输入输出 Token、消耗 credits、充值与每日赠送记录",
    caption: "每笔变动分别显示消耗或入账，模型调用同时显示输入输出 Token。（示例数据）",
    width: 425,
    height: 699,
  },
  // 微信侧的真实对话截图：说明「时间没说清楚会追问」，比后台截图更能说明提醒怎么用。
  reminderClarify: {
    src: "/images/real/wechat-reminder-followup.jpg",
    alt: "微信对话：只说「每周一提醒我更新 cs61b 项目」，助理先追问具体时间，补充「上午 8 点」后创建了每周重复提醒",
    caption:
      "只说「每周一提醒我」时会先追问几点，补一句就建好每周重复提醒，不用删掉重设。（真实对话截图）",
    width: 1348,
    height: 734,
  },
} satisfies Record<string, DocScreenshot>;
