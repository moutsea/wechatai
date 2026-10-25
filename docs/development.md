# 本地开发

[返回 README](../README.md)

## 环境与启动

Node.js 22.19+、pnpm 10、Git。打包连接器还使用系统 `tar`；Windows 建议在 WSL 中开发。

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

本地访问 `http://localhost:5173`，前端和 API 使用同一地址。`setup:local` 创建权限为 600 的 `.dev.vars`，生成 `BETTER_AUTH_SECRET` 和 `ENCRYPTION_KEY`，再生成 `env.d.ts` 并迁移本地数据库。不要将生产密钥复制到本地。

数据保存在 `.wrangler/state`；删除该目录会丢失本地账户和聊天等数据。`.dev.vars`、数据库、日志、构建产物和 `*.local` 文件均不进入 Git。

本地支持 `localhost`、`127.0.0.1` 和 `[::1]` 的同端口访问，但 Cookie 不在它们之间共享。OAuth 请固定使用 `APP_URL`，并在供应商后台登记相同的回调地址。

## 命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 本地应用 |
| `pnpm cf-typegen` | Wrangler 配置变更后重新生成类型 |
| `pnpm db:migrate:local` | 执行本地 D1 迁移 |
| `pnpm check` | lint、类型、Vitest、构建和 SEO |
| `pnpm exec vitest run test/billing.test.ts` | 运行指定测试文件 |
| `pnpm build` | 本地配置构建；不会部署 |
| `pnpm build:production` | 使用生产配置构建；不会部署 |
| `pnpm check:public` | 扫描 Git 索引；发布前先暂存修改 |

`env.d.ts` 为生成文件，不提交。全新克隆后先运行 `setup:local`，再执行类型检查。

## 测试边界

浏览器布局回归使用独立的 Chromium headless shell，加载真实组件和 CSS，登录态与 API 使用测试数据。检查窄屏账号菜单边界、滚动和短视口行为，CI 也会执行：

```sh
pnpm exec playwright install --only-shell chromium  # 首次运行时安装独立浏览器
pnpm test:browser
```

应用测试运行于 Cloudflare workerd，使用实际的 D1 / SQLite Durable Object 存储模拟，外部模型、微信和 Stripe 返回由测试替身提供，不发送真实微信消息、不扣真实款。支付和通知测试覆盖重试、幂等、账户隔离与失败恢复。

```sh
pnpm test:openclaw           # 不需要 OpenClaw 实例
pnpm test:openclaw:runtime   # 需要本机 OpenClaw SDK
pnpm test:hermes             # 需要官方 Hermes CLI 和其运行环境
```

可用 `OPENCLAW_PACKAGE_ROOT` 和 `HERMES_CLI` 指定本机路径。核心 CI 不安装或启动用户的 Agent。真实扫码、供应商兼容性和 OAuth 登录还需在自己的测试账户中联调。

## 文件改动建议

- 新 API 校验放在 `src/shared` 的 Schema 中，服务端仍须检查所有权和套餐。
- D1 变更新增迁移；已发布数据库不通过改写旧迁移来升级。`0005_admin.sql` 的历史站点专属管理员初始化已在开源前移除，现有站点角色不受影响。
- 账户的 SQLite 表和兼容升级在 `PersonalAccount` 中管理；不要读取其他账户对象的数据来处理普通消息。
- `public/downloads` 中当前连接器和安装器由 `prebuild` 生成；修改 `integrations` 源码后重新构建。历史下载包保留以兼容旧安装器，已发布版本不要随意替换。
- 生成素材的高分辨率原稿不提交；运行时图片、来源说明和示例截图保留。

## 常见问题

**Invalid origin**：核对 `.dev.vars` / Wrangler 的 `APP_URL`、浏览器地址和 OAuth 回调，修改后重启。

**OAuth 按钮不可点**：对应平台的 Client ID 和 Client Secret 必须同时配置。

**本地能跑但不能部署**：公共 Wrangler 文件里的生产域名与 D1 ID 是占位值，先按[部署文档](deployment.md)创建自己的资源。

**模型请求失败**：检查用户配置的协议、地址、模型 ID、余额以及输入输出上限。平台 credits 和供应商余额是两套独立计费。
