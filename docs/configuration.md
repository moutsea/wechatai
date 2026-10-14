# 配置说明

[返回 README](../README.md)

## 服务端密钥

本地变量见 [`.dev.vars.example`](../.dev.vars.example)，真实值放 `.dev.vars`；生产使用 Cloudflare Secrets。不要给密钥加 `VITE_` 前缀，前端构建变量会公开。

| 配置                                        | 用途                                                |
| ------------------------------------------- | --------------------------------------------------- |
| `BETTER_AUTH_SECRET`                        | 登录会话与 OAuth 凭据加密                           |
| `ENCRYPTION_KEY`                            | 渠道密钥、连接凭据等加密；必须与登录密钥不同        |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 可选 Google OAuth                                   |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 可选 GitHub OAuth                                   |
| `STRIPE_*`                                  | 可选会员和 credits 支付，详见[支付文档](billing.md) |
| `KIMISEEK_CONNECT_SECRET`                   | 可选 KimiSeek 关联，须与对端共享配置一致            |
| `BILLING_NOTIFY_TOKEN`                      | 可选管理员付款通知；来自消息提醒插件                |
| `BILLING_NOTIFY_SCOPE`                      | `all`（默认）或 `first_payment`                     |

不要直接更换已有生产环境的加密密钥，否则旧凭据可能无法解密。迁移时同时保留数据库、文件和对应密钥备份。

## 公共运行参数

Wrangler 的 `vars` 管理非敏感参数：

| 配置                                        | 默认含义                                                  |
| ------------------------------------------- | --------------------------------------------------------- |
| `APP_URL`                                   | 当前站点源地址，用于登录、OAuth、支付和连接器             |
| `PUBLIC_SITE_URL`                           | 微信教程等公开链接的源地址；自部署改成自己的域名          |
| `FREE_DAILY_CREDITS` / `PLUS_DAILY_CREDITS` | 每日 100 / 1,000 credits                                  |
| `FREE_ASSISTANTS` / `PLUS_ASSISTANTS`       | 历史命名，实际为渠道上限 3 / 20                           |
| `FREE_SESSIONS` / `PLUS_SESSIONS`           | 会话上限 10 / 200                                         |
| `LLM_ALLOWED_HOSTS`                         | 可选上游域名限制，不能放 API Key                          |
| `KIMISEEK_URL` / `KIMISEEK_API_URL`         | 可选关联服务的网页与 API 地址                             |
| `AUTH_EMAIL_MODE`                           | 本地 `preview`，生产 `cloudflare`；生产不允许使用预览模式 |
| `AUTH_EMAIL_FROM`                           | 已启用 Cloudflare Email Sending 域名下的发件地址          |

Free 默认一条微信链接，Plus 最多十条。Free 最多配置 1 个插件，Plus 插件配置数量不限。会员到期保留最早创建的 1 个插件可用，其余配置保留但暂停；停用配置仍占名额。暂停配置仍可停用或修改别名，其余设置和调用受套餐限制。网页历史和附件处理等有 Plus 权益限制；具体规则由 `src/server` 校验，套餐文案和价格在 `src/shared/billing.ts`。自部署可以修改这些规则，不依赖微伴官方站点授权。改变套餐须同时更新服务端、网页、文档和测试；不要仅隐藏前端限制。

## OAuth

创建自己的 Google Web OAuth 客户端、GitHub OAuth App。回调地址分别为：

```text
https://你的域名/api/auth/callback/google
https://你的域名/api/auth/callback/github
```

本地用 `http://localhost:5173` 替换源地址。Google 的 Authorized JavaScript origins 填源地址。没有完整配置的平台保持不可用。同邮箱账户关联保留 Better Auth 的邮箱验证检查，不根据未经验证的邮箱自动合并身份。

## 邮箱注册与找回密码

邮箱注册要求 10–128 个字符的密码，网页再次输入确认。注册后发送验证邮件，未验证不能使用邮箱密码登录；验证链接 1 小时内有效，首次成功验证后建立登录会话。Google / GitHub 保留各自返回的邮箱验证状态，不把普通注册账号自动标为已验证。

已有未验证账号重复注册或重发验证邮件时，改为发送「确认邮箱并设置密码」邮件，由邮箱主人重新设置密码。此时原验证链接不能再激活原密码，注册请求本身也不会覆盖密码。已验证账号重复注册会收到登录指引，密码不变；接口仍返回通用结果。

登录页提供「忘记密码」。重置链接 30 分钟内有效，成功使用后失效；重置密码同时验证邮箱归属、撤销该账号的旧登录会话和所有未使用的重置链接。这些变更在同一个 D1 事务中完成，并发提交不同重置链接也只有一次成功。已经登录的旧账号不会因本次升级被强制退出；未验证的旧账号下次使用邮箱密码登录时，需要先完成验证。

发信使用 Workers 的 `AUTH_EMAIL` 原生绑定，无需在应用中配置邮件 API Token。生产须在 `env.production` 中配置：

```jsonc
"send_email": [{ "name": "AUTH_EMAIL", "allowed_sender_addresses": ["noreply@mail.example.com"] }],
"vars": {
  "AUTH_EMAIL_MODE": "cloudflare",
  "AUTH_EMAIL_FROM": "noreply@mail.example.com"
}
```

先在 Cloudflare Email Service 开通自己的发信域名并确认 SPF、DKIM、DMARC 已生效，再启用邮箱注册。只创建绑定或填写发件地址不能完成域名验证。缺少发信配置时，注册和发送邮件接口返回 503，不会跳过验证。

本地默认 `preview`：不向真实邮箱发送邮件，服务终端输出 `auth.email.preview`，其中 `url` 是可在本地打开的验证或重置链接。只有 `APP_URL` 为回环地址才允许此模式；不要将本地开发端口公开到互联网。测试捕获邮件内容而不实际发信。

注册、重发验证邮件和找回密码共用服务端限额：同一邮箱每 60 秒一次、每小时 5 次、每天 20 次，另有按 IP 的认证请求限制。D1 保存邮箱哈希和计数，后台清理两天前的限额记录。邮件发送通过 `waitUntil` 完成，失败记录为 `auth.email.delivery_failed`，日志不包含地址、密码或链接；用户可稍后重发。未知邮箱和已有邮箱返回通用提示，避免暴露账号是否存在。

这三个发信接口仅接受 `Content-Type: application/json`（可带 charset 参数）；表单或其他格式返回 415，避免不同解析方式绕过邮箱限额。此限制不适用于第三方登录回调。

## 模型与搜索

模型 API Key 由用户在网页配置，不是全站环境变量。普通 LLM 支持三种协议；输入根地址后自动补全相应接口路径。渠道与模型分层，模型维护独立提示词、上下文窗口及输入输出上限。

DS Chat 需要用户自行提供搜索 API；AI 生图也使用用户自己的上游。OpenClaw / Hermes 在用户自己的设备或服务器运行，微伴只承担消息传输和结果交付。

## 品牌与自部署域名

当前公开页面保留微伴品牌。换域名部署时，除 Wrangler 参数外，还需调整：

- `src/shared/seo.ts`：`SITE_URL`、站点名称和分享图。
- `src/shared/site-info.ts`：联系邮箱、政策更新时间；同步检查条款与隐私正文。
- `scripts/verify-seo.mjs` 与相关测试：校验目标域名和联系信息。
- `public/robots.txt`、`scripts/prerender.mjs` 生成的 sitemap 以及文档中的绝对链接。

公开页面在构建时预渲染，修改后重新执行 `pnpm build`。第三方图标只用于识别服务，不代表官方合作；更换产品品牌时请一并检查素材说明。

## KimiSeek（可选）

基础模型渠道无需 KimiSeek。一键关联需要同时控制 KimiSeek 服务端，部署其配套签名接口并配置相同的共享密钥。没有这一条件时不要开启；只填公开的 KimiSeek API Key 不能启用账户一键关联。跨服务凭据不接受浏览器提供的用户身份作为可信依据。
