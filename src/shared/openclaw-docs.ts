export const openClawGuide = `# OpenClaw 接入指南

微伴以原生 OpenClaw Channel 接入。OpenClaw 主动连接微伴，无需开放本机端口，也不需要把 OpenClaw Gateway 管理令牌交给微伴。

## 1. 一条命令，自动连接

需要 Plus 会员、已初始化的 OpenClaw 2026.6.10 或更新版本，以及 Node.js 22.19 或更新版本。支持 macOS、Linux 和 WSL；命令要在运行 OpenClaw 的电脑或服务器执行。

1. 打开微伴「插件 → OpenClaw」，点击「连接 OpenClaw」。
2. 点击「复制连接命令」，在 OpenClaw 所在设备的终端粘贴并执行。
3. 等待页面提示「OpenClaw 已连接」并自动关闭配置弹窗，然后在微信发送 /use claw。

命令会下载并校验微伴渠道包、安装渠道、自动识别默认助手、保存账号连接信息并重启 Gateway。请等待当前任务结束后再执行。它会保留其他渠道、模型和助手配置，无需手动编辑 JSON，也无需复制永久密钥。

连接命令十分钟内有效，只能配对一个安装实例。网络暂时中断时，可在同一设备重新执行同一命令；过期后回网页重新生成。不要把命令转发给他人。如果配置已保存但 Gateway 没能自动重启，按你原来的运行方式重启 OpenClaw 即可。

网页无法直接安装另一台电脑上的软件，因此第一次仍需执行这条命令。OpenClaw 在服务器上时，请在服务器终端运行；本地开发使用 localhost 的命令只能在本机连接，远端设备应使用正式站点生成的命令。

## 2. 选择助手与修改配置

Agent ID 是 OpenClaw 里某个助手的内部标识，例如 main。普通用户无需了解或填写它：默认选择该 OpenClaw 实例的默认助手，连接后页面显示助手名称。有多个助手时，可以在网页下拉选择并保存，括号中的 ID 用于区分同名助手。

切换助手后，下一条消息开启独立的远端会话；旧历史保留，旧会话和任务的微信推送路由关闭。已在 OpenClaw 执行的任务不会被强行终止，仍需在 OpenClaw 中管理。

「更多设置」中可修改插件名称、@ 快捷名称、输入与回复上限，以及是否接收定时任务和后台结果。新建配置的单条输入上限默认为 128K tokens，最高可设置 2M；已保存的配置保留原值，可按需修改。此额度只计算本条发送的文字，不包含 OpenClaw 的历史对话、系统提示词或内部工具输入；它不等同于模型的上下文窗口，实际消息还受微信传输和模型能力限制。助手的模型、上下文和工具仍在 OpenClaw 中配置。

「重新连接」生成新命令，不会立刻影响现有连接；执行新命令并配对成功后才替换旧连接。一个微伴配置对应一个 OpenClaw 实例。「断开连接」立即撤销连接凭证和待使用的连接命令。

「更多设置 → 发送等待提示」默认开启，文案为「已成功转发，等待回复...」。可以修改为自己的文案（最多 300 字）、恢复默认文案，或关闭提示；关闭后直接等待最终回复，任务失败仍会通知。每个插件配置独立保存，提示文字不会发送给 Agent，也不消耗 credits。

### 命令归属

进入插件后，/help、/new、/model、/status 等交给 OpenClaw；/wx help、/wx status、/wx new 始终由微伴处理。/use、/exit 保留为微伴的全局切换快捷命令。@claw /new 只执行一次原生命令，不改变当前插件；@claw /exit 也会原样发给 Agent，不会退出微伴插件模式。

Agent 的 /new、/reset 不删除微伴聊天记录，也不额外执行微伴重置。/wx new 建立新的平台会话与远端路由。/stop 使用独立控制通道，可以在任务执行期间送达当前远端会话，免 credits；其他原生命令按转入和最终返回文本计费。Agent 的命令开关、权限校验和自身支持范围仍然生效，工具审批仍需在 Agent 端处理。

原生命令要求连接器 1.1.0 或更新版本。旧连接器会提示升级，请在插件配置中重新生成并执行连接命令。

## 3. 在微信使用

- @claw 帮我整理今天的任务：仅本次使用 OpenClaw，不改变当前默认模式。
- /use claw：进入 OpenClaw，之后直接发消息即可。
- /use 其他插件：直接切换。
- /exit：回到普通模型。
- /wx new：开始独立的 OpenClaw 会话。
- /wx reset：下一条消息使用新的远端会话；本机旧记录仍保留。

如果未配置普通模型，/exit 后可用 @claw 单次调用或 /use claw 重新进入。带 /wx 前缀的命令由微伴处理；其余斜杠命令由 OpenClaw 处理。

## 4. 定时与后台推送

先从微信向该 OpenClaw 配置发送至少一条消息，建立返回路由，然后让 Agent 创建任务并把结果发回当前 wechatai 对话。定时任务的投递渠道为 wechatai，accountId 为配置 ID，to 为该会话的路由 ID；它是本插件收到的 OriginatingTo，不是微信号。

OpenClaw 的 message 工具、定时任务 announce 和后台完成通知，只要明确以此渠道和会话为投递目标，就会通过渠道回传。插件不会监听并转发所有 Agent 的任务结果。

定时任务、后台任务等主动推送，以及来自当前使用插件之外的回复，都会注明插件来源、你设置的配置名称，以及对应的 /use 和 @ 快捷指令。例如：「消息来自 OpenClaw（我的助手）插件。使用 /use claw 进入插件，或发送 @claw 回复内容。」提示与正文之间有分隔线。当前插件的普通回复和失败提示不附带来源提示；在其他模式中使用 @ 临时调用，或等待回复期间切换了插件、退出了插件，则会附带提示。判断以收到结果时该微信链接的当前插件配置为准。收到回复不会切换当前插件；/use 会进入来源插件，@ 只临时调用一次。提示中的快捷名称以你的实际配置为准。

本机必须在线且 Gateway 正在运行。待执行消息保留 24 小时；工具执行途中重启不会自动重跑，以免重复执行真实操作。后台输出先进入持久队列，再发送到微信。离线后会恢复转发；微信回复凭证过期时，先在微信发送新消息。网页「编辑配置 → 最近投递」可查看投递状态，连接状态会自动更新。

归档、删除或重置微伴会话、重新绑定微信、撤销连接后，旧路由停止接收推送。已在本机执行的任务不会因此被强行终止，请在 OpenClaw 中管理或取消其定时任务。微伴清除历史仅清除平台记录，不删除 OpenClaw 本机记忆。

## 5. 计费与范围

- 5,000 输入 tokens = 1 credit，输出 token 权重 ×8，由微伴自行计算。
- 只计算发送给插件的本次文字与最终回复；本机历史、系统提示词、工具及内部模型调用不计入微伴 credits。
- 主动推送没有新的用户输入，只按输出计费。任务失败不收费。
- 平台附加的插件来源和回复指引不计入 tokens 或 credits，也不会加入模型的对话历史。
- 重复回传、网络重试不重复扣费。结果进入平台交付队列时结算，微信投递失败重试不再次收费。
- 输入超限拒绝发送，回复超过插件上限会截短。上限不控制 OpenClaw 内部执行预算。
- 第一版支持文字和带微信转写的语音；图片、文件和远端工具审批暂不支持。需要审批的工具请在 OpenClaw 完成审批。

## 自动配对 API

网页登录后 POST /api/plugins/{id}/openclaw/pair，生成 { command, expiresAt }。配对有效期十分钟，重新生成会替换尚未使用的命令。

安装程序 POST /api/openclaw/pair，Authorization 使用命令中的一次性配对凭证，JSON 为 { proof, agents: [{ id, name, isDefault }] }。proof 为本地生成并保存的 32 字节随机数的 base64url 编码，agents 仅包含助手名称、ID 和默认标记。首次兑换返回 { accountId, agentId, token }；token 仅保存到本机渠道配置中。

同一配对凭证仅允许同一 proof 在有效期内重试，已被其他安装实例使用、已过期或已撤销时拒绝兑换。配对凭证不能用于收发消息，渠道凭证也不能用于配对。网页 GET /api/plugins/{id}/openclaw/status 可读取连接状态、可选助手和最近投递，不会返回永久凭证。只有渠道实际上报心跳后才显示在线。

安装脚本可在 /downloads/wechatai-connect.mjs 查看。机器可读完整文档位于 /developers/openclaw.md。

## 连接协议（专用 Channel Transport v1）

这是内置 OpenClaw 适配器的专用传输，不是任意第三方插件调用入口。单条回传文本最多 30,000 字符，过长的 Agent 回复会附带截断提示。所有请求为 POST /api/openclaw/{action}，Authorization: Bearer <连接凭证>，Content-Type: application/json。服务端按凭证隔离账号、配置和会话，不接受自报 token 用量。

- poll：{ runnerId, waitMs?: 15000 }，返回 jobs 和 retryAfterMs。waitMs 为 0–15000 毫秒，省略时立即返回；新连接包使用长轮询，有任务时立即唤醒，不必等待下一轮固定间隔。runnerId 是本机持久保存的 UUID。任务包含 id、routeId、agentId、text、state。
- claim：{ id, runnerId }，原子领取一次；claimed 为 false 时不得执行。
- heartbeat：{ agents?: [{ id, name, isDefault }] }，更新连接状态及可选助手；仅同步名称、ID 和默认标记。
- event：{ eventId, routeId, jobId?, runnerId?, status, text }。eventId 是稳定 UUID，网络重试必须复用。任务结果须携带 jobId 与领取者 runnerId；主动通知省略 jobId。
- event 响应 status: queued 仅表示平台已接收。平台界面的已投递状态才表示微信接口已确认发送。
- 401 凭证撤销；403 权限关闭或会员失效；409 任务或路由已失效；402 主动推送余额不足；429 降低频率重试。

仅支持 HTTPS（本机回环 HTTP 除外），禁止重定向携带凭证。连接包使用本机 SQLite 保存执行日志和待发送结果。领取后不转交其他实例；重启后不重复执行不确定的任务。

实现依据：[OpenClaw Channel SDK](https://docs.openclaw.ai/plugins/sdk-channel-plugins)、[Inbound API](https://docs.openclaw.ai/plugins/sdk-channel-inbound)、[Outbound API](https://docs.openclaw.ai/plugins/sdk-channel-outbound)。
`;
