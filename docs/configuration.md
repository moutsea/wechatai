# 配置说明

[返回 README](../README.md)

## 服务端密钥

本地变量见 [`.dev.vars.example`](../.dev.vars.example)，真实值放 `.dev.vars`；生产使用 Cloudflare Secrets。不要给密钥加 `VITE_` 前缀，前端构建变量会公开。

| 配置 | 用途 |
| --- | --- |
| `BETTER_AUTH_SECRET` | 登录会话与 OAuth 凭据加密 |
| `ENCRYPTION_KEY` | 渠道密钥、连接凭据等加密；必须与登录密钥不同 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 可选 Google OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 可选 GitHub OAuth |
| `STRIPE_*` | 可选会员和 credits 支付，详见[支付文档](billing.md) |
| `KIMISEEK_CONNECT_SECRET` | 可选 KimiSeek 关联，须与对端共享配置一致 |
| `BILLING_NOTIFY_TOKEN` | 可选管理员付款通知；来自消息提醒插件 |
| `BILLING_NOTIFY_SCOPE` | `all`（默认）或 `first_payment` |

不要直接更换已有生产环境的加密密钥，否则旧凭据可能无法解密。迁移时同时保留数据库、文件和对应密钥备份。

## 公共运行参数

Wrangler 的 `vars` 管理非敏感参数：

| 配置 | 默认含义 |
| --- | --- |
| `APP_URL` | 当前站点源地址，用于登录、OAuth、支付和连接器 |
| `PUBLIC_SITE_URL` | 微信教程等公开链接的源地址；自部署改成自己的域名 |
| `FREE_DAILY_CREDITS` / `PLUS_DAILY_CREDITS` | 每日 100 / 1,000 credits |
| `FREE_ASSISTANTS` / `PLUS_ASSISTANTS` | 历史命名，实际为渠道上限 3 / 20 |
| `FREE_SESSIONS` / `PLUS_SESSIONS` | 会话上限 10 / 200 |
| `LLM_ALLOWED_HOSTS` | 可选上游域名限制，不能放 API Key |
| `KIMISEEK_URL` / `KIMISEEK_API_URL` | 可选关联服务的网页与 API 地址 |

Free 默认一条微信链接，Plus 最多十条。插件、网页历史和附件处理等有 Plus 权益限制；具体规则由 `src/server` 校验，套餐文案和价格在 `src/shared/billing.ts`。自部署可以修改这些规则，不依赖微伴官方站点授权。改变套餐须同时更新服务端、网页、文档和测试；不要仅隐藏前端限制。

## OAuth

创建自己的 Google Web OAuth 客户端、GitHub OAuth App。回调地址分别为：

```text
https://你的域名/api/auth/callback/google
https://你的域名/api/auth/callback/github
```

本地用 `http://localhost:5173` 替换源地址。Google 的 Authorized JavaScript origins 填源地址。没有完整配置的平台保持不可用。同邮箱账户关联保留 Better Auth 的邮箱验证检查，不根据未经验证的邮箱自动合并身份。

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
