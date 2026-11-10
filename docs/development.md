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
pnpm build                  # 公开页回归读取实际分包与预渲染产物
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
- 公开文档的内容日期在 `src/shared/docs.ts` 每篇的 `updatedAt` 中维护；`DOCS_INDEX_UPDATED_AT` 仅用于文档索引，不得用它刷新所有文章。首次发布日期缺少可核实记录时省略 `datePublished`，不要用修改日或构建时间代替。
- 品牌统一使用「微伴 Wechatai」；维护者公开资料在 `src/shared/site-info.ts` 的 `SITE_MAINTAINER` 中维护，页面、结构化数据与 AI 文本入口共用。不要把个人账号当成产品的 `sameAs`，也不要编造运营主体、审计或供应商实测。
- 公开页面按路由懒加载，`public-pages.tsx` 只保留首页，登录注册表单位于 `pages/auth-page.tsx`。初次打开预渲染页面时，先加载当前路由模块再挂载 React；失败时保留正文并提供重新加载入口。等待期间已可见的静态页通过同一个 reporter 记录首次访问，React 接管时去重并接替监听；仍遵守 DNT/GPC、后台标签页延迟上报规则。首页入口同样记录静态首访并交接预渲染状态：在 DOMContentLoaded 时捕获阅读状态，下一帧挂载，让浏览器完成初始锚点定位后再恢复；尚未交互的页面采用原生锚点位置，避免延迟脚本在 React 接管后再次抢走焦点和滚动。接管前保存原生 details 的展开状态、焦点和滚动位置，在首次布局时恢复（包括带锚点的页面）。公开页受控输入使用稳定 ID：接管前采集值，由 DocumentInputProvider 提供给组件的首次状态初始化，保证搜索过滤与估算结果同步；文本输入同时恢复光标选区，后续挂载不得重放旧快照。可过滤导航的链接也须使用稳定 ID（桌面与移动端各自唯一），不要按 DOM 位置恢复焦点；导航用 `data-handoff-focus-fallback` 指向对应搜索框，原链接被过滤时退回搜索框。接管同时恢复侧栏、表格等容器的滚动位置；只有原焦点仍可见时，才在恢复后将移出视野的目标带回可见区域，避免打断用户已移开的阅读位置。后续导航的锚点定位统一由路由层处理，文章组件不要重复滚动。生产初次访问沿用预渲染 head，客户端导航再加载共享 SEO 生成器，并丢弃过时导航结果；不要重新把整套文档或专题内容导入首页入口。各页 CSS（包括开发者指南和价格卡）仍进入首屏样式以保留无 JavaScript 的预渲染阅读。

## 常见问题

**Invalid origin**：核对 `.dev.vars` / Wrangler 的 `APP_URL`、浏览器地址和 OAuth 回调，修改后重启。

**OAuth 按钮不可点**：对应平台的 Client ID 和 Client Secret 必须同时配置。

**本地能跑但不能部署**：公共 Wrangler 文件里的生产域名与 D1 ID 是占位值，先按[部署文档](deployment.md)创建自己的资源。

**模型请求失败**：检查用户配置的协议、地址、模型 ID、余额以及输入输出上限。平台 credits 和供应商余额是两套独立计费。
