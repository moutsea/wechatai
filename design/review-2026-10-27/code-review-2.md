# Code review：删除 /demo + 落地真实截图（12:0x-12:3x）

审查对象：工作区未提交的改动（`/demo` 演示页下线、首页/文档页改用真实截图、相关 CSS/SEO/文档同步）。
审查方式：Lead 通读 + 两个子代理并行勘察（夹具漂移、demo 残留与 SEO），结论逐条由 Lead 复核后才采纳。
门禁：`pnpm check`（lint / typecheck / 主测试套 / 客户端测试套 / build+prerender+SEO）全绿，见 `.code-review-gates.local.log`（最终一次跑在 13:09，包含 §7-§9 的全部修复）。

---

## 1. 结论

| 编号 | 严重度 | 问题 | 状态 |
| --- | --- | --- | --- |
| P0-1 | 阻塞 | 文档页引用了一张磁盘上不存在的图片 | 已修 |
| P1-1 | 应修 | FAQ 说「三步流程是真实截图」，实际是 HTML 拼的示意 | 已修 |
| P1-2 | 应修 | 停在 `/#how` 后再点「如何使用」页面不动 | 已修 |
| P2-1 | 建议 | `#workspace` 是死锚点，`scroll-margin-top` 白配 | 已修 |
| P2-2 | 建议 | `docs/deployment.md` 说「演示不计数」，实现已删该过滤 | 已修 |
| P2-3 | 建议 | 截图流水线配方与线上资产不一致（重跑会退回方形图） | 已修 |
| P2-4 | 建议 | `design/doc-screenshots.md` 的 caption 提案已过期 | 已修 |
| P2-5 | 建议 | 一条客户端测试是空跑（断言永不触发） | 已修（并反向验证有牙） |
| P2-6 | 建议 | 测试夹具无类型锁、模块级 `Date.now()` | 已修 |
| P3-1 | 记录 | 夹具里有真实服务端不存在的路由 `GET /plugins/:id` | 已修 |
| P3-2 | 记录 | 夹具 `paused` 恒 `false`，真实实现按连接数上限派生 | 已修 |
| P3-3 | 记录 | `test/support/demo-api.ts` 这个名字已经没有对应概念 | 已修 |
| P3-4 | 记录 | `/demo` 与 PV 边界没有直接断言 | 已修（§8） |
| P3-5 | 记录 | `index-*.js` 553 KB 超 500 KB 提示 | 已修（§9） |

无 P0 之外的功能性回归；`/demo` 下线链路干净（见 §10）。

---

## 2. P0-1：文档页的破图（已修）

- 现象：`src/client/pages/doc-screenshots.ts:84` 引用 `/images/real/wechat-reminder-followup.jpg`（文档页「定时提醒」一节的真实对话截图），而该文件在 11:47 被另一个动作删除了。
- 为什么门禁没拦住：tsc 不校验资源路径，单测不 stat `public/`，构建对缺失的 `public` 图片不报错，SEO 校验只看 meta。
- 根因：**并发写者**。上一轮"中断"的会话在 11:55 被恢复，11:59 给文档页加了这个引用；而 11:47 删除时 grep 到的引用数是 0 —— 两个动作各自都自洽，交叉后才产生破图。
- 修复：按原配方从 `design/review-2026-10-27/k2-assets/b2.png` 重新导出（crop `(0,0,1348,734)`、quality 85、optimize、progressive、subsampling 0），产物 75,441 bytes / 1348×734，与被删原件字节数一致。
- 防复发：新增 `scripts/verify-assets.mjs`，扫 `src/**/*.ts(x)` 里写死的 `/images/...` 路径并要求 `public/` 下存在，挂到 `prebuild`（`package.json:38`）。反向验证：临时改名该文件 → 构建前置检查直接失败并打印引用处；还原后通过（32 处引用全部存在）。

## 3. P1-1：FAQ 与事实相反（已修）

- 原文 `src/shared/landing-faq.ts:41-43` 的 answer：「首页的对话、三步流程和工作台配图都是真实使用截图」。
- 反证：`src/client/landing-steps.tsx:138` 的 `id="how"` 区块是 HTML 拼的模拟界面（:78 注释「连接示意」，外层 `aria-hidden="true"`）；hero 是插画（`src/client/public-pages.tsx:191-195`，alt 写「微信对话示意」）。
- 影响：这段答案经 `src/shared/seo.ts:443-445` 进 FAQPage JSON-LD，等于对搜索引擎陈述了不实描述。
- 修复：改成区分口径 —— 真实截图指微信对话/渠道配置/微信连接页（「图中数据为示例」），「三步」那块明说是界面示意。

## 4. P1-2 / P2-1：两处导航失效（已修）

- P1-2：`src/client/main.tsx:29-44` 的 `ScrollReset` 只依赖 `[pathname, hash]`。停在 `/#how` 时再点页头「如何使用」（`src/client/site-header.tsx:22`）—— hash 不变，effect 不重跑，页面纹丝不动；次 CTA（`src/client/public-pages.tsx:151-152`）同理。修复：依赖加上 `useLocation().key`，同链接重复点击时 key 会变。
- P2-1：`src/client/public-pages.tsx:266` 的 `<section id="workspace">` 全仓没有任何入链，`src/client/styles.css:5469` 的注释（「真实截图区里链到 #workspace」）和 `scroll-margin-top: 88px` 都在等一个不存在的链接。修复：在真实截图区备注末尾加「工作台长什么样，往下看[工作台预览](/#workspace)」（`src/client/landing-real.tsx:98-102`）。

## 5. P2-2..P2-4：文档与流水线（已修）

- `docs/deployment.md:56` 原文「演示工作台的模拟操作不计入正式事件」与实现相反：`src/server/analytics.ts:428-431` 的 SQL 已无 demo 过滤，`src/client/analytics-client.ts` 的 `trackFunnel` 也无路径白名单。已改写为：报表只展示访客日与事件次数；`/demo` 下线后按路径过滤的口径一并删除；历史 `demo_view` 行不进报表（`summarizeFunnel` 只按已知事件名取值）。
- `scripts/shots-export.local.mjs`（gitignored）的 channel-add 配方仍是 `crop [14,14,1274,1274]` → 1260×1260 方形，而线上资产是 1260×1118。反解确认现存资产 = `crop (14,14,1274,1132)` + `subsampling: 2`。已同步配方并把 `quality`/`subsampling` 透传进 python 侧；重跑脚本后 7 张产物与改前备份**逐张字节一致**（channel-add 66,031 bytes / 1260×1118；合计 573.4 KB < 900 KB 预算），即流水线重新幂等于线上资产。
- `design/doc-screenshots.md:14/:108/:130` 的「（演示数据）/（演示界面）」已改为「拍摄于当时的预览环境 / （图中数据为示例）」。

## 6. P2-5：一条空跑的测试（已修，且反向验证过）

`test/app-provider.client.test.tsx` 原本把 `useAuth` mock 成 `data: null`，于是 `src/client/context.tsx` 里取 `/admin/access` 的 effect 直接 return，`expect(fetchSpy).not.toHaveBeenCalled()` 永远不会触发 —— 把注入换成写死 `api` 也不会变红。

修复：mock 改成带 `user.id` 的 session，断言改为「`requested` 同时包含 `/dashboard` 和 `/admin/access`」。反向验证：把 `context.tsx:57` 临时改回 `api` → 失败 `AssertionError: expected [ '/dashboard', '/dashboard' ] to include '/admin/access'`；还原后通过。

同时 `src/client/context.tsx:57` 的 `/admin/access` 请求从 `api` 改为注入的 `request`（否则「换数据源」这条缝只缝了一半）。

顺带记录：该用例里 `/dashboard` 被请求了两次，因为 mock 的 `useAuth` 每次渲染都新建 `refetch`，导致 `refresh` 引用变化、effect 重跑。生产侧安全 —— `node_modules/better-auth/dist/client/react/react-store.mjs:27-41` 的 `useStore` 直接返回 atom 的 value 对象，`session.refetch` 是稳定的；这是测试夹具的噪声，不是产品缺陷。

## 7. P2-6 / P3-1..P3-3：夹具（已全部修完）

- 与原 `src/client/demo.ts` 的比对：810 行函数体逐字节相同，只有文件头注释、import 路径、`createDemo`→`createFakeApi`、fallback 文案 3 处 hunk（62 行）。也就是说夹具忠实复制了旧产品代码 —— 包括旧产品代码里本就存在的问题，现在一并修掉：
  - **时钟注入**：删掉模块级 `const now = Date.now()`，改成 `createFakeApi({ now = Date.now() })`，函数体内 17 处 `Date.now()` 全部换成注入值。`defaults` 随之搬进函数体（原来只在函数内被引用）。现在 `vi.setSystemTime` 不再是唯一手段，`createFakeApi({ now })` 之后夹具对外表现完全确定。
  - **`paused` 派生**：按真实规则 `paused: index >= limits.connections`（对齐 `src/server/personal-account.ts:2101`）派生，`createFakeApi({ connections })` 可以造出被暂停的连接；默认 `connections = 1` 时与改动前的 snapshot 语义一致。
  - **幽灵路由**：删掉 `GET /plugins/:id`（真实 `src/server/index.ts:626` 只有列表 GET，`:700-706` 是 PATCH/DELETE）。判据写成 `path.startsWith("/plugins/") && 剩余部分不含 "/"`，只封「仅 id 一段」；`GET /plugins` 列表与子路由（如 `/plugins/:id/models`）行为不变。第一版写成 `path !== "/plugins"`，会让任何落到该分支的单段 GET 都报「不支持：GET /plugins/:id」，已改。
  - **改名**：`test/support/demo-api.ts` → `test/support/fake-api.ts`，`createDemoApi` → `createFakeApi`；6 个引用文件同步（`test/app-provider.client.test.tsx`、`test/plugin-access-ui.test.tsx`、`test/funnel-events.client.test.tsx`、`test/wechat-connection-tracker.client.test.tsx`、`test/dashboard.client.test.tsx`、`test/analytics-success.client.test.tsx`）。
- 新增 `test/fake-api.test.ts`（5 tests）：默认单连接 `paused=false`；`{connections:11}` → 11 条、前 10 条 false 第 11 条 true；`{now}` 钉住 `planUntil` 与 `activity` 日期；`GET /plugins/:id` 异步 reject、`GET /plugins` 与 `/plugins/:id/models` 仍返回 `[]`；类型锁。
- 保留的类型锁：`export const apiTypeLock: typeof import("../../src/client/api").api = createFakeApi();` —— 夹具漂移出 `api` 的形状时 `tsc` 会报错。新测试里再用 `expectTypeOf` 钉一次。

## 8. P3-4：`/demo` 与 PV 边界（已修，补正反两向断言）

`/demo` 下线后「那次访问算不算一次浏览」两侧共用一个 `isTrackedPath`，此前只有未知路径兜底，没有直接证据。现在补成对断言：

- `test/analytics-client.test.ts:294-302`：`reportPageView(view("/demo","k1"))` 返回 `true` 且上报 `pathname === "/demo"`；`/app/demo` 返回 `false`。
- `test/analytics.test.ts:180-194`：服务端 `recordPageView` 对 `/demo` 返回 `{ok:true, stored:true}` 并落库一行，对 `/app/demo` 返回未存；落库路径列表严格等于 `["/demo"]`。

## 9. P3-5：入口块 553 KB 超提示线（已修，vendor 分包）

- 原状：`index-*.js` 553 KB / gzip 185 KB，构建时触发「chunks are larger than 500 kB」提示。体积几乎全是 React + better-auth，与应用代码无关，却和业务代码挤在同一个块里 —— 每次发版回访者都要重下整个 553 KB。
- 修法：`vite.config.ts` 用 rolldown 的 `output.codeSplitting.groups` 拆出两个 vendor 组（`react` 含 react/react-dom/react-router/scheduler/nanostores；`auth` 含 better-auth）。注意 rolldown 1.2.12 里 `manualChunks` 已废弃，对象形式不再支持，只能写 `codeSplitting.groups` 的 `name`/`test`。
- 生效范围：配置挂在 `environments.client.build` 下，只影响浏览器侧。这一点验证过 —— worker 主文件 `dist/wechatai/index.js` 与不拆时逐字节相同（3,706,398 bytes），即 `wrangler deploy` 的打包输入没有任何变化。
- 结果：`index` 553 → 342.89 KB（gzip 117.71），`react` 261.45 KB（gzip 83.55）、`auth` 26.61 KB（gzip 9.97），最大块降到 500 KB 以下，构建不再有体积告警。

## 10. 已验证「不是问题」的点

- `/demo` 下线干净：assets-only 部署 + `not_found_handling: "404-page"`，`dist` 无 demo 产物，sitemap/redirects/路由表无残留，`src/shared/seo.ts` 的 `PRIVATE_PATHS` 去掉 `/demo*` 后走未知路径兜底（`noindex, follow`）。
- 历史 funnel 行污染 ≈ 0：`migrations/0016_funnel_events.sql` 与 `allowsFunnelEvent` 同属提交 `ce69cfa`；`summarizeFunnel` 只按已知名单取值，未知名字静默丢弃。`allowsFunnelEvent` 现已连定义一起删除，无死代码。
- 真实截图的比例配对成立：`src/client/landing-real.tsx` 声明的 width/height 与 7 张文件逐张一致（1382×880 / 1260×1118 / 1360×1207 / 1235×672 / 1360×734），`.landing-real-card img { width:100%; height:auto }` 下同排等高依赖比例一致（1260/1118 ≈ 1360/1207 ≈ 1.127）—— 这正是 P2-3 那条配方漂移会破坏的东西。
- `src/` 内只剩一处 `demo` 字样（`src/client/public-pages.tsx:701` 的注释，说明「注册页曾挂过 demo 入口」），是有效历史说明。

## 11. 留给下一批

1. `git commit` —— 工作区仍有大量未提交改动，提交范围待用户确认。
2. `test/support/fake-api.ts:25` 那行 type import 超过 oxfmt 默认行宽，`oxfmt --check` 会报该文件（改动前就存在，未顺手改以免混入无关 diff）。
3. 夹具仍是「永远成功、从不抛 `ApiError`」的理想化替身 —— 需要错误分支的用例还得自己 stub 真实服务端。
4. `scripts/shots-export.local.mjs` 是 gitignored 的本地脚本，配方漂移只能靠人守；若以后频繁改版，考虑把配方抽成受版本管理的 json。

---

## 附：本轮修复的验证

`pnpm check` 全绿（EXIT=0）：

- lint：`Found 0 warnings and 0 errors.`
- typecheck：无输出
- 主测试套（workerd）：`Test Files 62 passed (62)` / `Tests 1151 passed (1151)`
- 客户端测试套：`Test Files 7 passed (7)` / `Tests 48 passed (48)`
- build：40 个公开页 prerender + SEO 校验通过，**无 500 KB 体积告警**
