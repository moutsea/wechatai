export const hermesGuide = `# Hermes 接入指南

把自己的 Hermes Agent 接入微信。Hermes 主动连接微伴，不需要开放本机端口；模型、工具和记忆由你在 Hermes 中管理。Free 用户最多配置 1 个插件，Plus 会员插件配置数量不限。

## 1. 一键连接

1. 在电脑或服务器安装并初始化 [Hermes Agent](https://hermes-agent.nousresearch.com/docs/getting-started/installation)，先确认它能正常聊天。当前适配器已验证 Hermes v0.21.6（2026.9.24 系列）。支持 macOS、Linux 和 WSL，需要 Python 3。
2. 打开微伴「插件 → Hermes」，点击「连接 Hermes」。
3. 复制连接命令，在运行 Hermes 的那台设备的终端粘贴执行。程序安装微伴原生渠道、保存连接信息并重启 Hermes Gateway，请等待当前任务结束再操作。
4. 等待网页显示已连接并自动关闭弹窗，在微信发送 /use hermes 即可开始。

命令十分钟内有效，请勿转发给他人。中途断网可在同一设备重复执行；过期后重新生成。安装程序保留其他插件和模型设置。Hermes 使用当前 profile，无需填写 Agent ID。已有不同 profile 时，在对应 profile 环境中执行命令。

本地开发的 localhost 地址只能从同一台设备访问。服务器上的 Hermes 应使用正式站点生成的连接命令。自动启动失败时，在 Hermes 终端运行 hermes gateway run。

如果旧命令下载安装脚本时报 HTTP 403，请刷新微伴网页，重新生成并复制连接命令。连接器 1.1.1 起为安装和消息请求添加微伴客户端标识，解决默认 Python 请求被站点防护拦截的问题，无需重装 Python 或 Hermes。

## 2. 微信命令与配置

- @hermes 帮我整理今天的任务：仅本次使用 Hermes，不改变默认插件。
- /use hermes：进入 Hermes，之后直接发送文字或语音即可。
- /use 其他别名：直接切换插件。
- /exit：返回普通模型聊天。
- /wx new：开始独立的 Hermes 会话。
- /wx reset：关闭旧返回路由，下一条消息开启新的远端会话。

快捷名称可以自定义，命令中的 hermes 应替换为实际名称。更多设置中可调整本条输入和最终回复的上限、后台推送开关、等待提示文案。默认输入上限为 128K tokens，最高 2M；这不是 Hermes 内部的模型上下文上限。

第一版支持文字和微信已转写的语音。图片、文件和远端工具审批暂不支持；需要审批的操作请在 Hermes 中处理。微信中的原生命令由 Hermes 按自身权限处理。不同微伴会话使用独立 Hermes 会话，但同一个 Hermes profile 的长期记忆、文件和工具环境仍由该 profile 共享。

### 命令归属

进入插件后，/help、/new、/model、/status 等交给 Hermes；/wx help、/wx status、/wx new 始终由微伴处理。/use、/exit 保留为微伴的全局切换快捷命令。@hermes /new 只执行一次原生命令，不改变当前插件；@hermes /exit 也会原样发给 Agent，不会退出微伴插件模式。

Agent 的 /new、/reset 不删除微伴聊天记录，也不额外执行微伴重置。/wx new 建立新的平台会话与远端路由。/stop 使用独立控制通道，可以在任务执行期间送达当前远端会话，免 credits；其他原生命令按转入和最终返回文本计费。Agent 的命令开关、权限校验和自身支持范围仍然生效，工具审批仍需在 Agent 端处理。

原生命令要求连接器 1.1.0 或更新版本。旧连接器会提示升级，请在插件配置中重新生成并执行连接命令。

## 3. 定时任务与主动消息

先在微信发送一条消息建立返回路由。Hermes 的原生定时任务和后台投递可使用 wechatai 渠道；目标地址是当前会话的「配置 ID:路由 ID」，不是微信号。应从 Hermes 的当前会话上下文读取目标，不要猜测其他会话的地址。

适配器实现 Hermes 的原生 standalone sender，支持 Gateway 与定时任务进程共用持久发送队列。不需要额外添加模型可调用的发送工具。只转发最终回复，工具进度和内部思考不会转发或扣费。

主动推送，以及来自当前使用插件之外的回复，都会注明 Hermes、配置名称和对应的 /use、@ 回复指令，提示与正文之间有分隔线。当前 Hermes 配置的普通回复和失败提示不附带来源提示；在其他模式中使用 @hermes 临时调用，或等待回复期间切换了插件、退出了插件，则会附带提示。判断以首次向微信发送时该链接的当前插件配置为准；重试和分段发送沿用同一份提示。收到回复不会切换你正在使用的插件。本机必须在线且 Gateway 正在运行。微信凭证过期时，先从微信发送一条新消息。

待执行请求保留 24 小时。已经开始执行的任务在进程中断后不会自动重新执行，以免重复真实操作；已保存的回复会自动重试，重试不重复收费。归档、删除、重置会话、重新绑定微信或断开插件会关闭旧返回路由，但不会自动取消 Hermes 内部的任务或删除其记忆。

## 4. 计费

- 微伴自行计算本次发送的输入和最终返回的文字：5,000 输入 tokens = 1 credit，输出权重 ×8。
- Hermes 内部的历史、系统提示词、工具调用和模型调用不计入微伴 credits；模型服务费用由用户自行承担。
- 主动消息只计算输出，任务失败不收费。平台附加的来源提示不收费。
- 回复进入平台交付队列时结算，网络重试和重复回传不重复扣费。网页的已投递状态表示微信接口确认接收。

## 5. API 与连接协议

本页 Markdown：/developers/hermes.md。插件清单：GET /api/plugins/hermes。下载脚本：/downloads/wechatai-hermes-connect.py。

网页登录后 POST /api/plugins/{id}/hermes/pair 获取 { command, expiresAt }，GET /api/plugins/{id}/hermes/status 查看连接状态。一次性配对凭证不能收发消息；永久连接凭证只保存在 Hermes 当前 profile 的私有配置文件中。Hermes 与 OpenClaw 凭证不可混用。

Hermes 连接包使用专用 Channel Transport v1：POST /api/hermes/{action}，Authorization: Bearer <连接凭证>，Content-Type: application/json。仅允许 HTTPS（本机回环 HTTP 除外），拒绝重定向。

- pair：一次性凭证配对，{ proof, agents: [{ id: "main", name: "Hermes 当前配置", isDefault: true }] }，返回 { accountId, agentId, token }。proof 是本机持久保存的 32 字节随机 base64url 字符串，同一凭证仅允许同一 proof 重试。
- heartbeat：{ agents }，每 20 秒上报状态，仅包含助手名称与 ID。
- poll：{ runnerId, waitMs: 15000 }，长轮询返回 { jobs, retryAfterMs }，有任务立即唤醒。
- claim：{ id, runnerId }，claimed 为 true 才可执行。runnerId 是本机持久保存的 UUID。
- event：{ eventId, routeId, jobId?, runnerId?, status, text }。status 为 completed 或 failed；任务结果携带 jobId 和 runnerId，主动通知省略。稳定 eventId 用于去重，最多 30,000 字符，不接受自报 token 用量。
- 401 凭证失效；403 权限或会员失效；409 路由或任务失效；402 主动推送余额不足；429 应降低频率重试。

这是内置 Hermes 适配器专用传输，不是第三方插件公开调用入口。实现基于 [Hermes 原生平台适配器接口](https://hermes-agent.nousresearch.com/docs/developer-guide/adding-platform-adapters)。
`;
