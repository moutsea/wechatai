# 部署到 Cloudflare

[返回 README](../README.md)

应用运行在 Workers，账户状态使用 SQLite Durable Objects，D1 保存认证和订单，R2 保存媒体。提醒服务单独部署，以免每次网站发布都替换它的调度代码。先在本地通过 `pnpm check`。

## 1. 建立自己的配置与资源

```sh
pnpm exec wrangler login
cp wrangler.jsonc wrangler.production.local.jsonc
cp wrangler.reminders.jsonc wrangler.reminders.local.jsonc
pnpm exec wrangler d1 create wechatai-db
pnpm exec wrangler r2 bucket create wechatai-media
```

两个 `*.local.jsonc` 文件已被 Git 忽略。公共配置不包含运营站点的 Cloudflare 账户、数据库 ID 和管理员账号。

编辑 `wrangler.production.local.jsonc` 的 `env.production`：

- 设置自己的 `account_id`（多账号时尤其需要），D1 的真实 `database_id`，以及 R2 桶名。
- 将 `routes`、`APP_URL`、`PUBLIC_SITE_URL` 改成自己的 HTTPS 域名。
- 保留账户对象的 `v1` 迁移；不要把顶层的本地 `v2-local-reminders` 迁移复制进生产环境。
- 确认 `REMINDERS.script_name` 对应提醒 Worker 名称。
- 配置 `AUTH_EMAIL` 发信绑定、`AUTH_EMAIL_MODE=cloudflare` 和 `AUTH_EMAIL_FROM`；先完成发信域名验证，见[邮箱注册配置](configuration.md#邮箱注册与找回密码)。不要将本地 `preview` 模式复制进生产。

编辑 `wrangler.reminders.local.jsonc`：使用相同 Cloudflare 账户，确认 `ACCOUNTS.script_name` 是主 Worker 名称。若改名，两个配置须成对修改。通常保留 `wechatai` / `wechatai-reminders` 即可。

`pnpm build:production` 优先读取私有主配置；没有私有配置时仅用公共模板构建，不表示模板可以直接上线。`pnpm cf:production`、远程迁移和提醒部署要求私有配置存在。CI 可通过 `WECHATAI_WRANGLER_CONFIG` / `WECHATAI_REMINDERS_CONFIG` 指定其他路径。

同时按[配置文档](configuration.md#品牌与自部署域名)更新公开页面的域名、联系信息和政策。

在 Cloudflare 域名的 **SSL/TLS → Edge Certificates** 中开启 **Always Use HTTPS**，让 HTTP 请求先跳转到相同路径的 HTTPS 地址。仅将 `APP_URL` 写成 HTTPS 不会自动开启跳转，静态注册页仍可能通过 HTTP 打开，提交时会因来源不匹配报 `Invalid origin`。不要为此把 HTTP 地址加入认证白名单或关闭来源校验。如果同一域名下还有必须使用 HTTP 的其他服务，请用仅匹配本站主机名的 HTTPS 重定向规则。

## 2. 密钥和数据库

准备 `.production-secrets.local` JSON，至少包含不同的随机 `BETTER_AUTH_SECRET`、`ENCRYPTION_KEY`，每个不少于 32 字符。需要 OAuth 或 Stripe 时再加入对应配置，参考 `.dev.vars.example`。不要把生成的密钥粘贴到 README 或提交到 Git。

以下命令用于全新数据库；已有站点的迁移顺序见第 4 节。

```sh
chmod 600 .production-secrets.local
pnpm db:migrate:remote
```

站内通知模块包含 `0008_site_notices.sql`、`0009_notice_publication_versions.sql` 和 `0010_notice_read_state.sql`。查看通知或关闭横幅都会标为已读；修改内容不会再次提醒，管理员明确选择重新发布时才会重新出现。

**已有站点升级时按 0008、0009 → 发布本版 Worker → 0010 的顺序执行。** 本版依赖 0009 新增的字段和版本表，兼容保留旧关闭字段的结构；0010 会把旧的关闭状态合并到已读状态，再删除旧字段。旧版通知接口仍依赖该字段，先执行 0010 会导致报错；迁移后也不要直接回滚到依赖旧字段的 Worker。

全新站点可以在首次部署前执行全部迁移。0008 和 0009 保留为独立迁移，不要重写已执行的迁移。

本地数据不会自动迁移到生产。D1 迁移和账户 SQLite 升级是两套机制，均需保持兼容。

邮箱验证升级包含 `0007_auth_email_limits.sql`，发布前先执行远程迁移。不要批量把已有用户的 `emailVerified` 改成已验证；原会话继续有效，未验证的邮箱账号在下次登录时完成验证。

## 3. 首次部署顺序

已有主 Worker 的站点直接进入下一节。全新 Cloudflare 账户需要先注册 `PersonalAccount` 类，才能部署引用它的独立提醒 Worker，最后部署完整网站。

可以使用临时 bootstrap 配置完成这个顺序：

1. 创建被忽略的 `bootstrap.local.mjs`，内容如下。

   ```js
   import { DurableObject } from "cloudflare:workers";
   export class PersonalAccount extends DurableObject {}
   export default { fetch: () => new Response("Setup in progress", { status: 503 }) };
   ```

2. 创建被忽略的 `wrangler.bootstrap.local.jsonc`。名称、账户 ID 必须与正式主 Worker 相同。它不绑定域名、不对外开放：

   ```json
   {
     "name": "wechatai",
     "main": "bootstrap.local.mjs",
     "account_id": "YOUR_CLOUDFLARE_ACCOUNT_ID",
     "compatibility_date": "2026-10-10",
     "workers_dev": false,
     "preview_urls": false,
     "durable_objects": { "bindings": [{ "name": "ACCOUNTS", "class_name": "PersonalAccount" }] },
     "migrations": [{ "tag": "v1", "new_sqlite_classes": ["PersonalAccount"] }]
   }
   ```

3. 依次执行：

   ```sh
   # 仅全新站点使用 bootstrap，不能覆盖已有运行中的网站。
   pnpm exec wrangler deploy --config wrangler.bootstrap.local.jsonc
   pnpm deploy:reminders
   pnpm build:production
   pnpm exec wrangler deploy --config dist/wechatai/wrangler.json --dry-run
   pnpm exec wrangler deploy --config dist/wechatai/wrangler.json --secrets-file .production-secrets.local
   ```

完整主 Worker 接替 bootstrap，使用相同类名和迁移标签。首次上线后不再使用 bootstrap 配置。

## 4. 后续发布

本次升级分为三步：

1. 确认 0008 和 0009 已执行；尚未执行时，只先应用截至 0009 的迁移。不要在这一步直接运行会应用所有待执行迁移的 `pnpm db:migrate:remote`，否则会提前执行 0010。
2. 检查并发布本版 Worker，确认新版已接管流量、旧版在途请求已结束。
3. 执行剩余的 0010 迁移，合并已读状态并删除旧字段。

完成第 1 步后：

```sh
pnpm check
pnpm deploy
pnpm db:migrate:remote
```

其他发布先查看待执行迁移的兼容要求；增加表或字段的迁移通常先执行，删除字段则需要先发布不再依赖它的代码。不要把迁移顺序固定为一律先迁移。

仅调度服务自身发生变化时运行 `pnpm deploy:reminders`。新增调度 RPC 时先发布调度器，再发布调用它的网站代码。普通部署保留已有 Secrets。

若要核对旧账户提醒是否登记成功：

```sh
pnpm reminders:reconcile
```

该工具需要 Cloudflare 操作权限，通过内部 service binding 逐批修复调度，不提供公开管理接口。

## 5. 管理员

新安装不自动授予任何邮箱管理权限。先正常注册并核实账户身份，查询用户 ID：

```sh
pnpm cf:production d1 execute wechatai-db --remote --command 'SELECT id,email,emailVerified FROM user ORDER BY createdAt DESC LIMIT 20'
```

确认目标 ID 后，在受信任的 Cloudflare 管理环境执行以下 SQL；示例中的 ID 必须替换，不能依据普通用户提交的字段自动授权：

```sql
INSERT OR IGNORE INTO admin_user(user_id,created_at)
SELECT id,unixepoch()*1000 FROM user WHERE id='VERIFIED_USER_ID';
```

可通过 `pnpm cf:production d1 execute wechatai-db --remote --file path/to/private.sql` 执行，临时 SQL 不要提交。管理员入口为 `/app/admin`。撤销对应 `admin_user` 行会立即阻止后续管理请求，Plus 会员不自动拥有管理员权限。

## 6. 验证与备份

每次上线后先检查 HTTP 入口是否跳转，并保留路径和查询参数：

```sh
node scripts/verify-https.mjs
```

此检查也已加入 `scripts/verify-production.mjs`，跳转缺失时会在登录和支付检查之前停止。

运行完整支付验收脚本前，先用自己持有的真实邮箱注册专用 Free 测试账号并完成验证，将 `email` 和 `password` 保存在被 Git 忽略的 `.production-smoke.local` JSON 文件中，权限设为 `600`。脚本会登录此账号，不会自动注册、发送邮件或跳过邮箱验证；不要使用管理员或已有付费权益的账号。

确认 `/api/health`、登录、模型连接测试、微信扫码和提醒交付都正常，再启用正式支付回调。支付检查脚本会查询真实 Stripe 配置，请阅读脚本和[支付说明](billing.md)后在自己的站点运行。

D1、Durable Object 数据、R2 文件和加密密钥需要分别规划备份。D1 导出不包含账户对象里的聊天或钱包。生产密钥丢失后，单独恢复数据库不能恢复加密凭据。

参考：[Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)、[Durable Object 迁移](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)。
