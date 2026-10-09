# 微伴 Wechatai

面向个人用户的微信 AI SaaS MVP。用户配置自己的模型服务，在微信 OpenClaw 插件入口与 AI 聊天。仅支持个人绑定，不开放分享。

「渠道与模型」页面分两层管理：渠道保存接口协议、Base URL 和 API Key；每个渠道下可添加多个模型 ID，分别设置提示词和生成参数。切换渠道时恢复它上次使用的模型，切换模型时继续该模型最近的活动会话，不混用其他模型的上下文。MVP 不提供 Agent 编排或工具执行能力。

旧模型配置会在账户启动时自动迁移为一个渠道和一个模型，保留模型 ID、会话、消息、微信连接及原密钥加密绑定。密钥只存于渠道，API 不返回密钥明文或密文。现有 `FREE_ASSISTANTS` / `PLUS_ASSISTANTS` 配置兼容作为渠道数量上限（默认 3 / 20），每个渠道最多 50 个模型。模型 ID 与所属渠道创建后固定，切换其他 ID 请添加新模型；删除渠道会删除它的模型及对应记录，删除单个模型保留渠道和其他模型。

界面使用黑绿配色和独立 W 标识；产品名「微伴」暂定，与微信、腾讯及模型供应商无官方关联。

## 规划文档

- [云端 OpenClaw 方案备忘录](design/cloud-openclaw-plan.md)：R2 文件存储、按需运行、二次开发与多用户托管方向。**暂缓开发，仅记录方案。**

## 本地启动

需要 Node.js 22+、pnpm 10。

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

`setup:local` 自动创建独立的本地认证和加密密钥、生成运行时类型、迁移本地 D1。已有 `.dev.vars` 不会被覆盖。数据位于 `.wrangler/state`，重新启动仍保留。无需 Cloudflare 账号即可运行本地版本。

- 首页：<http://localhost:5173/>
- 交互预览：<http://localhost:5173/demo>
- 注册后使用真实本地后端：<http://localhost:5173/register>

本地邮箱登录支持 `localhost`、`127.0.0.1` 和 `[::1]`，仅允许 `APP_URL` 对应的协议与端口；切换地址后需要重新登录，因为浏览器不会共享这些地址的 Cookie。OAuth 登录请使用与 `APP_URL` 一致的地址，以匹配平台回调配置。生产环境只信任配置的应用源地址。预览使用内存中的示例数据，刷新会恢复，不会调用模型、连接微信或执行支付。真实账户的模型测试会请求用户配置的供应商并扣除实际 credits。

## Google / GitHub 登录

登录和注册页支持 Google、GitHub 与邮箱密码。Google 和 GitHub 按钮始终显示；未配置时标注“暂未开放”且不可点击，只有 Client ID 和 Client Secret 都配置完整后才启用。两者可独立配置。公开的 `/api/auth/providers` 只返回已启用的平台名称，不暴露凭据。

在本地 `.dev.vars` 中加入以下变量；线上放入 Cloudflare Secrets，不能使用 `VITE_` 前缀：

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

| 平台   | 应用配置                                               | 本地回调地址                                     |
| ------ | ------------------------------------------------------ | ------------------------------------------------ |
| Google | Google Cloud Console 创建 Web application OAuth 客户端 | `http://localhost:5173/api/auth/callback/google` |
| GitHub | Developer settings 创建 OAuth App                      | `http://localhost:5173/api/auth/callback/github` |

生产回调把 `http://localhost:5173` 换成 `APP_URL` 的真实 HTTPS 域名。Google 的 Authorized JavaScript origins 填应用源地址；测试状态下需将试用账户加入 OAuth consent screen 的测试用户名单。GitHub 使用标准 OAuth App，默认只申请 `read:user` 和 `user:email`，不申请仓库权限。具体配置参考 [Better Auth Google 文档](https://better-auth.com/docs/authentication/google) 和 [GitHub 文档](https://better-auth.com/docs/authentication/github)。

保存变量后重启本地服务。授权成功自动进入 `/app`，首次授权可创建账户；用户取消、授权过期等失败返回登录页并显示中文提示。授权 token 在 D1 中加密保存，平台密钥仅在服务端使用。

同邮箱自动关联保留 Better Auth 的验证要求：供应商邮箱与已有本地邮箱都须已验证。已有未验证的邮箱密码账户不会自动与新 OAuth 身份合并，应继续使用原登录方式；邮箱验证和主动关联的账户设置页属于后续工作。策略参考 [Better Auth 账户文档](https://better-auth.com/docs/concepts/users-accounts)。

本地自动化测试已覆盖 Google/GitHub 授权地址、回调校验、取消授权，以及模拟 GitHub 完整登录和账户复用；**真实第三方授权还需配置自己的应用凭据后联调**。

## 已实现

| 功能                                                     | Free | Plus |
| -------------------------------------------------------- | ---- | ---- |
| 配置自备 API Key、Base URL、模型、系统提示词             | ✓    | ✓    |
| OpenAI Chat Completions / Responses / Anthropic Messages | ✓    | ✓    |
| 微信链接数量（支持扫码绑定、文字聊天）                   | 1    | 10   |
| 在微信新建、切换、归档、重置、清理会话                   | ✓    | ✓    |
| 网页模型配置、微信连接、额度明细                         | ✓    | ✓    |
| 网页历史记录、会话管理、名称搜索                         | —    | ✓    |
| 自定义 `@快捷名称` 单次调用模型                          | —    | ✓    |
| 图片问答与文件处理，图片需视觉模型                       | —    | ✓    |
| 独立购买 credits                                         | ✓    | ✓    |

微信链接在「微信连接」页面创建、命名、切换、断开与删除。每条链接独立保存凭据、轮询游标、欢迎消息、当前模型与会话，共用账户的渠道配置和 credits。断开或重连不释放或增加名额，删除链接释放名额并保留历史记录，新链接不会接续已删除链接的会话。Plus 到期后仅按创建顺序第一条链接可用，其余暂停；续费恢复处理，微信凭据过期的链接需重新扫码。旧账户的单连接与默认会话原位迁移，不需要重新绑定。

图片和文件（PDF、DOCX、常见 UTF-8/UTF-16 纯文本）先暂存，收到后续文字或带转写的语音后，与处理要求合并为一次调用；普通 LLM 和 DS Chat 共用此入口，均限 Plus。可连续发送最多 4 个附件，每个 5 MB、一批总计 8 MB，保留 15 分钟；暂存及 `/cancel` 取消不计费。切换会话、重置、归档或断开链接会清除暂存；调用失败可重新发要求重试。文件提取正文后作为用户资料输入，受模型输入预算和平台计量约束；PDF 最多 100 页，每份文档最多 10 万字符。扫描 PDF 暂无 OCR，旧版 `.doc` 需转 `.docx`。图片原始内容只用于当前请求，历史保留图片标记。

第一版没有网页聊天输入框，网页用于配置和管理。没有分享链接、团队、平台托管的 Agent 工具执行、知识库或自建语音识别。Plus 可通过自己的 OpenClaw 执行工具、设置定时任务并回传结果。微信语音仅在消息自带转写文本时可使用。

后端已接入三种模型协议、微信连接协议和 Stripe。本地已完成真实微信连接与 Stripe 沙盒 Checkout 的充值、年付开通和回调到账验证；自动化测试覆盖续费、失败、幂等及跨业务隔离。生产已部署至 https://wechatai.app；正式商品和专属 webhook 已启用。正式环境曾用旧年价验证创建 ¥179 年付订单并立即关闭、签名校验和跨业务忽略；Stripe 实际投递的订单过期回调返回 200。没有执行真实资金扣款。

## 长对话与上下文

- 每个模型独立设置上下文窗口，新建默认 128,000 tokens，允许 512–2,000,000；已有模型的窗口与预算保持原值。导入模型时只读取上游明确提供的 `context_length` / `context_window`，缺失时采用默认值，请按供应商能力确认。
- 每个模型独立设置 `maxInputTokens`（512–2,000,000，新建默认 128,000）和 `maxOutputTokens`（64–8,192，默认 1,024）。旧模型缺少输入上限时按原上下文窗口补齐，旧客户端更新时不覆盖已保存的输入上限。
- 有效输入上限 = min(用户输入上限, 窗口 − 输出上限 − 安全余量（窗口的 5%，至少 64 tokens）)。文本采用 UTF-8 字节数估算，当前图片额外预留 16,000 tokens；估算不等同供应商 tokenizer。窗口设置含输入与输出。
- 达到可用输入的 80% 时，旧对话按完整轮次生成滚动摘要，尽量保留最近四轮原文（占剩余预算不超过 35%）。摘要使用当前渠道、模型和 Key，目标输出不超过 min(用户输出上限, 1,500 tokens)，每轮请求最多四个摘要分块。
- `context_summaries` 按 session 保存摘要、最后覆盖的消息 ID 与更新时间。摘要文本与游标一起保存，内部整理不额外计费；增量摘要只读取游标后的历史，旧记录不删除。原先只读取 100 条消息的限制已移除，未整理历史另设内存保护（最多约 4M 估算 tokens / 20,000 条），超出则提示开启新会话。
- 明确的上下文超限错误才触发一次回答重试；已知上游窗口时按其缩减，未知时按首次输入估算量减半。鉴权、限流、网络与其他错误不自动重试。单条消息或系统提示词本身超限时明确提示拆分，微信文本不再静默截断至 20,000 字符。
- 摘要失败或极端长历史无法完整整理时，仅保留预算内的最近完整对话并告知用户，不推进未成功摘要的游标。摘要作为普通历史数据带入，不提升为系统指令。
- 回答、摘要、超限重试、连接测试统一执行输入上限与输出上限校验。平台 Token 限制使用固定分词规则，供应商窗口另用保守估算；UI 显示有效输入预算和单次回答的 credits 估算，摘要不额外扣本站额度。输出不仅传给上游，也在网关截取到用户设置和 credits 预算允许的长度。
- 新会话独立，归档保留摘要；重置、清空、删除会话、删除模型和清空账户记录会同步清除相应摘要。摘要和原文一样只属于当前账号与会话。

## 插件协议与平台计量

公开文档：[网页](https://wechatai.app/developers/plugins)、[Markdown](https://wechatai.app/developers/plugins.md)、[JSON API](https://wechatai.app/api/plugins/protocol)、[JSON Schema](https://wechatai.app/api/plugins/protocol/1.0/schema.json)。`/llms.txt` 提供 agent 发现入口；所有文档接口无需登录、只读且不消耗 credits。本地使用相同路径。

网页和 Markdown 共用 `src/shared/plugin-docs.ts` 组装的文档（基础说明来自 `design/plugin-protocol-v1.md`，示例由实际 Zod Schema 验证）。JSON Schema 从执行规则自动生成；JSON API 的 `availability` 明确区分可执行能力与预留协议。公开网页参与预渲染及 sitemap，文档读取不开放第三方执行或账户权限。

V1 类型和运行时校验见 `src/shared/plugins.ts`，协议说明见 [design/plugin-protocol-v1.md](design/plugin-protocol-v1.md)。官方 LLM 已通过 `src/server/plugins/llm-chat.ts` 使用统一的 `invokePlugin` 网关，平台负责分词、限额、结果验证；插件不接触钱包。内置 LLM 继续使用现有模型 ID 作为实例 ID，保留历史与快捷名称。Plus DS Chat 与 AI 生图插件支持独立配置和会话；OpenClaw 通过原生渠道和专用事件传输接入用户的 Agent。上传代码与插件市场仍是后续阶段，当前没有开放平台任意代码执行或通用第三方回调接口。

## Credits 与套餐参数

```text
消耗 credits = (平台输入 tokens + 平台输出 tokens × 8) / 5000 + 已验证结果图片数 × 5
```

内部使用整数单位记账，1 credit = 1000 单位，按 0.001 credit 向上取整。已有余额、欠额和历史账单不换算，仅新请求使用新费率。输入包含实际发送的提示词、摘要、历史与当前消息。平台独立使用 `cl100k_base`（固定 `gpt-tokenizer@4.0.0`）计数；完全忽略上游 `usage`，不包含隐藏推理、进度和工具日志。计费政策 `gateway-v1` 与分词器版本随账单持久化。旧账单保持不变；新请求的 `estimated=false` 表示平台确定计量，不代表供应商 Token 数。图片必须由平台在当前账号/任务内校验并保存后计数，不能相信插件报告的张数或远程 URL。普通 LLM 仅返回文字；AI 生图插件已接入图片校验、私有储存和微信交付。

模型请求（含连接测试）不再预扣额度：余额大于 0 即可发起，余额为 0 或负数时暂停新请求。成功得到可用插件结果后按平台计量扣费，摘要与内部重试不产生独立账单；失败且没有结果不扣费。已完成的内部摘要仍保存以供下次使用。每个账户同时只处理一条模型请求，重复消息和结算不会重复扣费。可选的模型单轮 credits 预算限制实际输入与最终结果，0 表示不限制；已有预算设置保留。启用预算时回复长度和扣费仍受预算约束，结算不会截断到当前余额：不足的部分写入持久欠额，余额可以为负数。北京时间跨日后的每日额度发放、充值或会员额度到账时先抵扣欠额，未抵完继续结转；重复刷新或支付回调不会重复发放、重复抵扣。到账明细记录原始发放量，并在说明中注明抵扣额，避免二次计费。欠额单独存储，不随赠送额度到期清零。旧版本的历史预留账目保持不变，未完成的旧预留仍可自动释放；过期赠送额度的退款不会变成永久额度，也不能偿还欠额。

Free 每日赠送 100 credits，Plus 在会员有效期内每日赠送 1,000 credits，均按北京时间 00:00 刷新，当日未用额度不累积，不补发未使用日期的额度。升级当天按已发放总额补足差额（Free 已领 100，则补发 900），不会因已消费、抵扣欠额、重复刷新或续费重复领取。会员到期后恢复 Free 日额度，当天已经发放的额度保留至零点。订阅付款仅开通或延长会员，不再发放整月额度；旧会员周期余额保留至原到期时间。另购额度不过期，优先消费即将到期的额度。管理会话的微信指令不扣 credits；实际模型调用才计费。

Credits 是平台服务额度，**自备 Key 的模型费用由用户另付给供应商**。

三种协议的模型调用（包括网页连接测试）单次最多等待 5 分钟，包含 DNS 验证、等待和读取完整回复；兼容参数回退共用这段时间。DNS 验证另有 8 秒的子限制。摘要与回答整个流程共用最多 14 分钟的总期限，微信同一轮后台处理的所有链接共用此期限，为后台任务收尾留出空间。每次模型调用前续期 6 分钟的账户保护锁，覆盖 DNS、慢模型与收尾处理，整个摘要和回答流程共用同一个运行标识；超时失败的调用不扣本站 credits。

会员价格为 ¥9.9 / 月、¥88 / 年。会员自动续费，可在「管理订阅」取消下次续费，权益保留至已付款周期结束。独立 credits 包为 ¥9.9 / 5,000、¥29 / 20,000、¥59 / 50,000，永久有效，不附带会员权益。

日赠和功能限额可配置：

| 参数（`wrangler.jsonc`）              | 默认值    |
| ------------------------------------- | --------- |
| `FREE_DAILY_CREDITS`                  | 100 / 天  |
| `PLUS_DAILY_CREDITS`                  | 1000 / 天 |
| `FREE_ASSISTANTS` / `PLUS_ASSISTANTS` | 3 / 20    |
| `FREE_SESSIONS` / `PLUS_SESSIONS`     | 10 / 200  |

`src/shared/billing.ts` 定义可售方案。服务端逐一校验 Stripe 的实际金额、币种、周期、产品归属与环境，再启用购买；价格未配置时按钮关闭。浏览器只提交 offerId，不能控制金额或到账额度。日赠额度按当前配置发放，同日上调只追加差额，下调不收回当天已领额度，不追溯改写账本。充值包额度在服务端创建订单时固定。

## 邀请好友

工作台 `/app/invite` 提供邀请链接、进度和奖励统计。新用户通过 `/invite/:code` 注册，并在微信收到首次完整的模型回复后，邀请双方各得 **500 credits，永久有效**；Free 与 Plus 均可参与。连接测试、命令回复、模型失败和未完整投递的回复不计入。

邀请归因使用有效期 30 天的签名 HttpOnly Cookie，首次有效链接优先，兼容邮箱及 Google/GitHub OAuth。认证创建钩子只读取服务端 Cookie；不可由请求体指定邀请人。`0003_referrals.sql` 在用户创建事务内写入邀请关系，并阻止后续修改归因，老用户不能补领新用户奖励。

微信身份仅保存不可逆哈希用于去重；同一微信不可在不同账户重复领取受邀奖励，不允许自己邀请自己。邀请记录只显示好友脱敏昵称。奖励使用独立 `referral` 额度桶及固定幂等键，过期时间与充值额度一致为永久；先消耗每日额度，已有欠额在奖励到账时优先抵扣。

首次成功投递后在个人 Durable Object 持久化奖励待办；双方发奖及 D1 状态更新失败时由 alarm 重试。断开微信仍保留待办；重放不会重复增加余额。测试覆盖注册归因、OAuth、新老用户、微信去重、投递失败、并发发奖、余额欠额和跨日持久性。

## 微信使用与会话语义

1. 注册后添加渠道，填写三种协议之一、API Key 和 Base URL，再点击「获取可用模型」从上游 `/v1/models` 一键导入，或手动添加模型 ID。自动导入兼容 OpenAI Bearer 与 Anthropic Key 鉴权及游标分页，跳过重复/无效 ID，保留已有模型设置和会话，不扣 credits。每渠道上限 50 个，超出时显示未导入数量；模型列表不代表已验证聊天协议兼容性。
2. Base URL 只填写服务地址，例如 `https://api.openai.com`，无需填写接口后缀。Chat Completions 自动补全 `/v1/chat/completions`，Responses 补全 `/v1/responses`，Anthropic Messages 补全 `/v1/messages`。已有带 `/v1` 或完整接口路径的地址不会重复拼接；自定义网关前缀会保留，例如 `https://api.example.com/gateway` 会补全为 `/gateway/v1/…`。
3. 点击测试验证模型配置，再到微信连接页扫码、在手机确认。
4. 在微信 OpenClaw 插件对应的会话中发送文字。每个账户仅处理已绑定微信本人的消息。

| 指令                      | 行为                                             |
| ------------------------- | ------------------------------------------------ |
| `/help`                   | 查看帮助                                         |
| `/status`                 | 查看当前微信链接使用的插件，或普通聊天的渠道与模型 |
| `/channels`、`/channel 2` | 查看渠道，切换到指定渠道上次使用的模型           |
| `/models`、`/model 2`     | 查看当前渠道的模型，切换到对应模型最近的活动会话 |
| `/new`                    | 新建空会话，原记录保留                           |
| `/sessions`、`/switch 2`  | 查看会话、切换到刚列出的编号；可恢复归档会话     |
| `/reset`                  | 清除模型上下文边界，保留网页历史记录             |
| `/archive`                | 归档当前会话并新建一个空会话                     |
| `/clear`                  | 获取确认码，再次确认后删除当前会话的消息         |
| `/delete`                 | 获取确认码，再次确认后删除当前会话并新建空会话   |
| `/balance`                | 查看可用 credits                                 |
| `@写作 帮我润色这段文字`  | Plus 单次调用模型并提问，不改变默认模式          |

网页仅查看记录不会切换微信当前会话，需明确点击切换。归档保留全部记录；重置上下文与永久清空不同。清空、删除会话或删除模型配置会清理平台消息及对应待发送回复；已发送到微信的消息和供应商记录不受影响。Free 可在微信管理会话，也可在网页清空全部平台历史。Plus 到期后停止网页历史访问，记录不自动删除。

### 使用教程与连接引导

`/guide` 是无需登录的完整使用教程，首页、工作台「使用指南」和微信连接页均有入口。微信 `/help` 使用同一份命令清单，并附上教程入口。

每次扫码确认成功时，系统按本次连接的 `generation` 持久化一条待发送的欢迎消息。微信要求先取得绑定用户入站消息的 `context_token`，因此用户需先发送一条消息（推荐免费命令 `/help`）；收到后自动发送招呼和命令速查链接，再继续处理原消息。欢迎消息不调用模型、不扣 credits，也不写入模型上下文。发送失败会退避重试且保留同一 `client_id`；同一次连接中的进程重启、轮询和发送重试不会重新创建欢迎消息。断开后重新扫码连接会创建新的发送状态与 `client_id`，不沿用上次连接的已发送标记或退避时间。模型配置和聊天记录仍保留。

教程链接优先使用 `PUBLIC_SITE_URL`，当前配置为 `https://wechatai.app`，欢迎消息会发送 `https://wechatai.app/guide#commands`。这个配置只控制微信教程链接，不影响 `APP_URL` 对应的登录、OAuth 回调和支付地址，因此本地开发可以保留 `APP_URL=http://localhost:5173` 并测试正式域名链接。未配置或留空 `PUBLIC_SITE_URL` 时回退到 `APP_URL`。正式域名需要部署 `/guide` 页面后才能访问；localhost 链接仅适用于运行服务的电脑。

欢迎消息只包含简短招呼和命令速查入口，不在微信里展开教程或命令列表；链接使用 `/guide#commands`，打开后直接定位到「微信命令速查」章节。完整教程和全部命令仍可随时通过 `/help` 查看。

微信中的教程入口使用显式 Markdown 链接 `[微信命令速查](https://wechatai.app/guide#commands)`，避免依赖客户端自动识别裸网址。链接的显示和点击行为仍需在实际微信客户端验证，发送成功不代表已验证可点击。

## 架构和代码位置

参考 AgentFlowing 的 React / Hono / Cloudflare / Better Auth / Stripe 组合，重做个人账户和前端。未引入模板的组织、团队、邀请和角色层。参考 OpeniLink 的微信协议与媒体格式，保留最小个人聊天闭环。

- `src/client/`：React 前端、响应式样式和明确标记的 `/demo`。
- `src/server/index.ts`：Hono API、身份验证、来源校验、限流。
- `src/server/auth.ts`、`migrations/`：Better Auth + Drizzle + D1。
- `src/server/personal-account.ts`：每个用户一个 SQLite Durable Object，保存渠道、模型、会话、消息、钱包与微信状态。
- `src/server/llm.ts`：三种协议请求及可见文字提取，不信任上游 usage；Chat Completions 仅在明确拒绝 `max_completion_tokens` 时回退 `max_tokens`。
- `src/server/wechat.ts`：二维码、长轮询、消息发送、附件解密。
- `src/server/attachments.ts`：持久化附件暂存、过期清理、PDF/DOCX/文本正文提取。
- `src/server/wallet.ts`：整数账本、实际扣费、欠额结转、到期、幂等及旧预留兼容。
- `src/server/billing.ts`：真实价格、Checkout、订阅管理、签名回调。

Durable Object 把一个用户的会话、扣费与微信收件箱放在同一处，便于事务处理和避免跨用户混用。Alarm 驱动后台长轮询，不依赖网页保持打开。收到消息与保存游标在一个事务中提交；完成推理后缓存结果，发送失败只重发缓存结果，使用稳定发送 ID，不再次调用模型。处理被中断时保守停止该模型请求，不自动重复推理。

每个连接持续长轮询会产生运行时间和请求成本。规模扩大前必须测量真实延迟与每连接成本，再决定是否迁移到集中式连接服务。当前并未完成真实多用户压力验证。`compatibility_date` 使用本地开发和测试运行时共同支持的 `2026-08-22`，升级运行时后再统一更新。

## 密钥和访问控制

- `.dev.vars` 已忽略，不提交；本地生成脚本不输出密钥。`ENCRYPTION_KEY` 与登录密钥分开，不能随意轮换，否则已保存凭据无法解密。
- 用户 API Key 与微信凭据使用 AES-GCM 加密，附加验证绑定账户/渠道（迁移的旧密钥保留原模型绑定）；API 响应不返回明文或密文。
- Free 网页历史权限在服务端强制检查，并非只隐藏按钮。
- 自定义模型仅允许公网 HTTPS 域名，禁用 IP、内网域名、非标准端口及重定向；检查 A/AAAA。`LLM_ALLOWED_HOSTS` 支持逗号分隔的精确域名白名单。
- DNS 预检与真实连接之间仍可能发生地址变化，不能把预检当成连接 IP 固定。公开运营建议启用域名白名单，或使用能验证最终连接地址的出站代理。
- 聊天正文存储于用户的 DO SQLite 中，未做应用层逐条加密；发送给用户选择的供应商。日志只记录错误类型，不记录完整消息或凭据。
- 首版尚未启用自动记录保留期，用户可以清理；消息去重标识与必要额度账本仍保留。正式开放前应确定保留期限与账户注销流程。

## Stripe 配置与联调

测试和正式环境各有独立的 Plus / Credits 产品、五个价格与 Customer Portal 配置。服务端 Secrets：

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PORTAL_CONFIG_ID
STRIPE_PLUS_MONTHLY_PRICE_ID
STRIPE_PLUS_YEARLY_PRICE_ID
STRIPE_CREDITS_5000_PRICE_ID
STRIPE_CREDITS_20000_PRICE_ID
STRIPE_CREDITS_50000_PRICE_ID
```

所有资源及 Checkout、PaymentIntent、Subscription 均使用 `metadata.service=wechatai` 和 `metadata.environment=test|live`。订单再绑定服务端 userId / orderId / offerId。Webhook 先验签和环境，再筛业务；其他项目事件直接忽略，不查询订单、不发放权益。客户按微伴用户和环境单独创建，不能按邮箱复用其他业务客户；门户使用本项目专属 configuration，不修改共享账户默认配置。

本地测试：安装官方 Stripe CLI，将测试配置存于忽略的 `.stripe-test.local`，然后运行 `pnpm stripe:listen` 和 `pnpm dev`。转发脚本只接受 test key，自动将本地签名密钥写入 `.dev.vars`，不输出密钥。监听进程须持续运行。使用 Stripe 官方测试卡，不能使用真实银行卡。

`pnpm stripe:setup` 读取忽略的 `.stripe.local` 中 test / live key，只创建或复用本业务产品、价格和门户；密钥和资源清单输出到权限为 600 的 `.stripe-*.local`。`scripts/setup-stripe-webhook.mjs` 创建本业务正式回调并保持禁用，部署检查通过后加 `--enable` 开启；不要在日常启动时重复运行。密钥不写入源码、客户端或构建产物。

正式回调 `https://wechatai.app/api/billing/webhook`，API 版本固定为 `2026-08-26.dahlia`，订阅事件：

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
invoice.paid
customer.subscription.updated
customer.subscription.deleted
```

D1 先记录订单，再创建 Checkout；未支付订单复用，会员订阅禁止重复开通。到账需校验已付款状态、订单归属、价格 ID、金额、币种、数量及付款周期。DO 用 Checkout / Invoice ID 幂等记账，D1 在权益到账后更新 paid，失败回调可以安全重试。浏览器返回的 success 参数不直接发放权益；状态接口只查询当前用户订单，并向 Stripe 验证后补偿延迟回调。每期正常已付发票延长会员，不重复赠送整月 credits；按比例调价发票不发放权益。门户暂不支持月付 / 年付中途切换，避免不明确的补差价。

支持 Stripe 托管银行卡收银台、订阅取消续费、更换付款方式和查看账单。此处并非微信支付接入。取消续费保留已付款权益；续费失败不延长会员。退款与争议需要人工审核处理，本版不会自动扣回已消耗的 credits，也不会擅自发起退款。

## 检查与构建

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec wrangler deploy --dry-run
```

`pnpm check` 串行执行 lint、类型、测试和构建。测试在真实 workerd / SQLite DO 环境中运行，外部模型、微信、Stripe 网络响应使用受控模拟，覆盖隔离、加密、协议、额度原子性、回调签名、重复消息、恢复与会话清理。Stripe 包自带的部分源码映射缺失可能产生测试警告，不影响测试结果。

构建产物分为 `dist/client` 静态文件和 `dist/wechatai` Worker。`postbuild` 会移除构建目录里的本地密钥文件。部署必须使用 `pnpm build` 完成这个步骤。

## 生产部署

`wrangler.jsonc` 顶层用于本地开发，`production` 环境绑定独立 D1 与 `wechatai.app`，不迁移本地账户、API Key 或微信连接。生产登录和加密密钥独立生成，Stripe 使用 live 产品与签名密钥。OAuth 需额外配置对应平台的生产 Client ID / Secret 和回调地址。

```sh
pnpm db:migrate:remote
pnpm check
pnpm build:production
pnpm exec wrangler deploy --dry-run
# 首次部署时，私密 JSON 文件只放服务端 Secrets；之后普通部署会保留已有 Secrets。
pnpm exec wrangler deploy --secrets-file .production-secrets.local
# 后续部署
pnpm deploy
```

生产构建通过 `CLOUDFLARE_ENV=production` 选择绑定；`postbuild` 清除所有复制出的 `.dev.vars*` / `.env*`。不要使用本地构建覆盖生产。构建目录不保存生产密钥，`.production-secrets.local` 权限为 600 且已忽略，切勿提交。

Stripe 正式回调应在 HTTPS 与服务端配置验证后启用。上线后分别验证真实微信和三种协议的连通性、连接恢复和平台用量；本地连接不会自动出现在生产。邮箱验证、密码找回、账户注销以及退款后台仍属于后续功能。

## 参考与授权

详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。保留 AgentFlowing、OpeniLink SDK 的 MIT 授权文本。项目没有复制 OpeniLink Hub 的完整 UI、Agent 系统或计费设计。

## SEO 与公开页面

主要搜索词为 `WeChat AI`、`微信 AI`、`AI in 微信` 和 `AI in WeChat`。首页面向自定义大模型聊天，`/guide` 面向接入教程和微信命令；保留真实产品能力和独立产品说明，不添加虚构评分或承诺。

- `src/shared/seo.ts` 统一维护页面标题、描述、canonical、Open Graph / Twitter 分享信息和 JSON-LD。正式搜索地址固定为 `https://wechatai.app`，不受本地 `APP_URL` 影响。
- `pnpm build` 先构建并清理复制出的本地 secrets，再预渲染首页与指南。`dist/client/index.html` 和 `guide.html` 含完整公开正文，不依赖搜索引擎执行 JavaScript。静态构建只使用匿名状态；加载页面后正常恢复用户登录状态。
- `sitemap.xml` 由公开路由生成，仅包含首页和指南；`robots.txt` 声明站点地图并排除 API。登录、注册、工作台和演示页使用 `noindex` HTML 与响应头，不在 robots 中阻止这些 HTML 路径，以便爬虫读取 noindex。
- 已知的私有路由生成无用户数据的 HTML 外壳，继续由客户端处理认证和权限。新增前端工作台路由时同步更新 `PRIVATE_PATHS`。生产静态资源采用真正的 404 页面及无末尾斜杠的规范路径；开发模式保留 SPA 回退。
- 分享图为 `public/og-image.png`（1200 × 630），可编辑源图在 `design/og-image.svg`；更新 SVG 后需重新导出 PNG。社交平台是否显示卡片由各平台决定。
- `pnpm build` 自动校验实际产物；运行 `pnpm exec vite preview --host 127.0.0.1 --port 5174` 后，可用 `pnpm test:seo http://127.0.0.1:5174` 检查路由状态、重定向、私有页 noindex 和公开资源。

上线时先将 `wechatai.app` 绑定到部署服务，确认首页、`/guide`、`/robots.txt`、`/sitemap.xml` 和分享图可公开访问，再在 Google Search Console 与 Bing Webmaster Tools 验证域名并提交 `https://wechatai.app/sitemap.xml`。如启用 www 域名，需在 Cloudflare 配置到 `https://wechatai.app` 的永久重定向。站长平台验证与站点地图提交属于部署后操作，目前未执行。搜索引擎会自行决定收录、排名及最终摘要。

## DS Chat 插件（Plus）

工作台 `/app/plugins` 创建 `wechatai/web-research@1.3.0` 实例，绑定已有模型，配置独立名称、`@快捷名`、搜索类型、完整 HTTPS 搜索接口地址及自己的密钥。新配置默认选择 DeepSeek 原生 Web Search，预填 `https://api.deepseek.com/anthropic/v1/messages`；搜索模型 ID 可省略或留空，调用时自动使用 `deepseek-flash`，也可填写其他支持原生搜索的模型 ID，与回答模型独立。还支持 Tavily、Exa、SearXNG；SearXNG 必须启用 JSON 输出，密钥可选。平台不提供搜索密钥或备用搜索源，预填地址仍使用用户自己的上游账户。

微信 `/plugins` 列出配置；`@DS 问题` 仅本次调用，问答保存在当前会话且不改变默认模式；`/use DS Chat` 进入独立插件会话，后续消息沿用插件。在任意插件模式中都可以 `@其他快捷名 内容` 临时调用其他插件，例如 DS Chat 中 `@画图 一只橘猫`，下一条普通消息仍使用 DS Chat；`/use 画图` 则直接切换默认插件，无需先退出。切回插件继续它最近的活动会话，`/exit` 始终返回进入插件前的普通会话，`/model 编号` 切换普通模型。命令在平台入口解析，模型返回的 `@` 文本不会触发递归执行；临时调用只结算实际目标插件。`/new`、`/reset`、归档、清空适用。Free 和已到期用户无法执行插件，配置与历史保留，可删除配置。更换绑定模型须新建实例；更换搜索地址/类型须重新输入密钥。

默认使用原生工具调用循环：把 `web_search` / `web_fetch` 提供给模型，模型可直接回答，或发起工具调用、接收结果后继续回答。适配 Chat Completions、Responses、Anthropic Messages；无需联网时只需一次模型请求。仅首次请求明确返回不支持工具调用时，回退到 search/read/answer JSON 兼容流程；鉴权、限流、超时、格式错误不触发回退。每次最多搜索 5 次、阅读 8 页，默认各 3 次；工具调用最多 45 秒，总任务最多 14 分钟。网页读取仅支持公开 HTTPS 文本/HTML，不执行 JS、不读取登录态、不解析 PDF 链接；可在微信直接发送 PDF 文件。DS Chat 支持多图及文件正文输入，图片需要回答模型支持视觉；Base64 内容不作为文字估算输入或计费。每次跳转校验地址与 DNS，搜索凭据不跟随重定向、也不发送给网页。资料按输入预算截断，模型生成失败，或选择联网但没有取得来源时不结算；无需联网的正常回答会结算。

平台在完整插件调用边界统一分词并结算一次，计入传入的上下文与最终文本/来源链接，忽略内部调用和供应商 usage。沿用模型输入/输出/单次 credits 上限，保留既有摘要机制。上游模型与搜索服务费用由用户承担。测试按钮会真实调用并计费；演示页仅返回明确标注的示例。

参考 DeepSeek Harness 的工具与供应商分离设计，由本站实现 Workers 适配；没有复制其完整代理运行时。`test/web-research.test.ts` 使用模拟接口验证四种搜索适配、三种模型协议、会员权限、密钥隔离、独立会话、失败不结算、重启与幂等计量。`test/llm-tools.test.ts` 另外验证调用编号、签名推理内容的保留、工具结果压缩和截断拒绝。尚未用真实搜索供应商密钥做端到端验收。

DS Chat 插件按需联网：日常聊天、写作等直接回答，需要最新资料、核实或读取网页时再调用工具。不是每轮必搜。它是微伴独立开发的插件；回答模型与搜索服务均由用户选择。默认模式分别持久化在各微信链接；`@` 单次调用不会污染模式，`/exit` 不要求 Plus，搜索失败不会静默伪装成直接回答。

## AI 生图插件（Plus）

添加生图模型后，在 `/app/plugins` 配置「AI 生图」，选择模型与快捷名称。使用用户已有渠道的 URL/API Key，以 `/v1/images/generations` 调用 OpenAI Images 兼容接口，支持 `data.url` 或 `data.b64_json`，一次 1 张。`@画图 描述` 单次使用，`/use 画图` 进入，`/exit` 退出。每轮只传当前描述，不带历史或 LLM 系统提示词；暂不支持参考图、改图。自动识别描述中的常见宽高比并转换为本次请求的 `size`（例如 `3:4` → `960x1280`、`16:9` → `1536x864`）；支持 1:1、3:4、4:3、2:3、3:2、9:16、16:9、4:5、5:4、21:9 和 9:21。建议在描述末尾写“城市街景，3:4”，或明确写“比例 3:4”。未指定比例时不发送尺寸参数，沿用上游默认值；模型和渠道需支持对应尺寸。原始提示词不改写，自动生成的尺寸参数不另计输入 tokens；旧配置的固定尺寸继续移除，无需重新保存。

每张 5 credits，加当前输入文字的 Token 费用；上游 usage 不参与计费。图片实际验证、保存后才结算；微信发送失败只重试交付，不重新生成或计费。图片保存在私有 `wechatai-media` R2，`MEDIA` binding，本地独立模拟；生产 `generated/` 生命周期 30 天，网页登录验证、账号隔离，清空或删除历史立即撤销对应图片访问。网页测试只显示结果，不主动发送微信。

`test/image-generation.test.ts` 覆盖计费、上下限与 Plus 权限、URL 下载安全、私有图片访问、模式切换和微信失败重试。

本地验收：2026-10-09 使用 kimiseek 渠道的 `qwen-image-3.0` 通过插件测试接口实际生成 PNG（约 1.1 MB），图片保存与本人授权读取成功，计费 5.013 credits（5 图片 + 0.013 输入）。微信原生图片上传、发送失败重试和重启恢复使用模拟微信接口验证；未主动向真实微信会话发送测试图片。

## OpenClaw 自动连接（本地待部署）

Plus 用户在「插件 → OpenClaw」点击连接，复制一条命令，在运行 OpenClaw 的电脑或服务器终端执行。安装程序校验渠道包、安装已编译的运行文件、读取默认助手，通过十分钟有效的一次性配对凭证换取渠道凭证，以 OpenClaw 原生配置合并命令写入自己的 account，保留其他渠道、模型和助手，再尝试重启 Gateway。

网页自动读取上线状态；有多个助手时按名称选择，无需手填 Agent ID、永久密钥或编辑 JSON。换助手会取消旧任务路由、开启新远端会话；旧本机历史保留。配对请求只上传助手的 ID、名称和默认标记。协议网页 `/developers/openclaw` 与 Markdown `/developers/openclaw.md` 共用内容。

`pnpm prebuild` 生成 `/downloads/wechatai-openclaw-1.0.1.tgz` 和带校验和的 `/downloads/wechatai-connect.mjs`。原生包需要 Node.js 22.19+ 和 OpenClaw 2026.6.10+；当前以 2026.6.10 验证。脚本支持 macOS、Linux、WSL；容器/手动运行的 Gateway 若无法自动重启，安装程序会明确提示按原方式重启。

验证：`pnpm test:openclaw` 检查本机投递日志与幂等；`node scripts/smoke-openclaw-connect.mjs` 在临时 profile 用真实 CLI 安装、配对并启动 Gateway，拦截服务重启以保护用户当前服务；`node scripts/smoke-openclaw.mjs` 验证非默认助手聊天、后台主动回复与定时 announce。测试不连接真实微信或模型服务。新接入仍需部署后才能在正式站点使用。
