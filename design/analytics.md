# 访问统计：PV、去重访客与来源深度

> 状态（2026-10-25）：第一版已实现并通过测试，**尚未执行线上迁移、尚未上线**。本文记录设计决定、隐私边界、怎么查数据和已知取舍。

## 为什么要自己做

GSC / Bing WMT 只回答「搜索引擎里的词带来了多少点击」，回答不了另外三类问题：

1. **微信里转发出去的链接有多少人看**。这类访问没有 referrer，在第三方统计里只能算成「直接访问」，在自家表里至少能和站内跳转分开。
2. **看完落地页的人后来有没有注册、有没有付费**。通过服务端账户创建钩子关联注册；统计表不保存账户 ID。付费归因暂未实现。
3. **AI 搜索的引用**。ChatGPT、Perplexity、豆包这类来源的 referrer 是 `chatgpt.com` 之类，落在自家表里能直接数出来。

同时不引入第三方脚本，对首屏和隐私都更省事。

## 采集链路

```
浏览器 PageViewTracker
  → POST /api/analytics/page-view   （同源校验、限流、zod 校验）
  → recordPageView()                （UA 过滤、哈希 IP+UA+日+盐）
  → D1 page_views                   （ON CONFLICT(event_id) DO NOTHING）
  → getTrafficSummary() / scripts/analytics-report.mjs

浏览器随邮箱注册请求头 / OAuth additionalData 传递会话号（DNT/GPC 时不传）
  → Better Auth databaseHooks.user.create.after（仅真实创建新账户）
  → recordSignupConversion()        （服务端生成 eventId，按 session_id 反查落地页）
  → D1 signup_attributions          （ON CONFLICT(event_id) DO NOTHING）
  → getSignupConversions() / pnpm analytics 的「落地页转化」
```

| 环节 | 文件 | 关键行为 |
| --- | --- | --- |
| 上报 | `src/client/page-view-tracker.tsx` | 路由变化时上报；`location.key` 去重防 StrictMode 双跑；标准 UUID `eventId` 防重复投递；`keepalive` 保证跳出前的最后一次也能送达；`credentials: "omit"`、`referrerPolicy: "no-referrer"` |
| 过滤规则 | `src/shared/analytics.ts` | 浏览器与服务端共用同一套 `isTrackedPath` / `normalizePath` / `referrerHost` / `classifyDevice` / `isBotUserAgent` |
| 采集 | `src/server/analytics.ts` | 写入与汇总；越权、爬虫、非法载荷都在写库前挡掉 |
| 路由 | `src/server/index.ts` | `POST /api/analytics/page-view`：跨站 403、非 JSON 415、超限 429、异常 503；旧 `/signup` 上报返回 410，不写库 |
| 注册 | `src/server/auth.ts` | 邮箱和 Google/GitHub 共用账户创建钩子；重复注册、已有用户登录和账户关联不计为注册 |
| 表 | `migrations/0014_page_views.sql`、`0015_signup_attributions.sql` | 唯一索引 `event_id` 保证幂等；`page_views` 按 `(day)`、`(day,path)`、`(day,visitor_hash)`、`(day,session_id)`、`(session_id,created_at)` 建索引 |
| 查询 | `scripts/analytics-report.mjs`（`pnpm analytics`） | `--days`（默认 7，上限 90）、`--local` |

## 三个指标的口径

这三个词在日常对话里经常被混用，落到 SQL 上差别很大，所以界面上按下面的口径显示：

- **PV**：一行的数量。同一个人刷新两次就是 2。
- **去重访客（visitorDays）**：`COUNT(DISTINCT day || ':' || visitor_hash)`。因为 `visitor_hash` 里带了日期，同一个人隔天会算成两个，所以这个数**不是**「独立用户数」，只是「每天的去重人数之和」。界面上直接标成「按天加总」，不写「UV」以免误读。要算真正的独立用户需要长期标识，那和隐私选择冲突，本项目不做。
- **会话数与人均浏览页数**：`session_id` 存在 `sessionStorage`，关标签页即失效。**人均页数 = PV / 会话数**，这是回答「某个来源带来的人看了几页」的正确算法；除以访客数会把「一个人来三次」算成深度 3，是错的。

来源侧同理：`sources` 给每个来源的 PV 占比，`sourceDepth` 给每个来源的 `PV / 会话`。

## 注册归因：哪个页面真的带来了注册

PV 高不等于有用。要回答「写哪个页面值得」，需要把注册连回到落地页：

1. 浏览器在邮箱注册请求头 `x-wechatai-analytics-session` 或 OAuth `additionalData.analyticsSessionId` 中传递会话号（尊重 DNT/GPC）；账户创建钩子记录注册，OAuth 回调从已校验的 state 中读取会话号；
2. 服务端按 `session_id` 在 `page_views` 里取**最早的一条**作为落地页，同时带上它的 `referrer_host` 与 `utm_source`；
3. Worker 和 CLI 共用 `src/shared/analytics-queries.ts`，按落地页聚合：`会话数`（区间内发生浏览或注册的会话）、`注册数`（其中在区间内注册的会话）、`转化率 = 注册 / 会话`。非注册会话的首访从完整保留期查询；注册会话使用保存的 `landing_path` 快照。查询 1 天或 7 天不会把同一会话改归到不同页面，浏览明细清理后也不会丢失仍在保留期内的注册归因。

三条口径约束，避免把数字讲过头：

- **分母是会话，不是人**。同一个人用两个标签页访问会被算成两个会话。
- **归因窗口是同一个会话**。用户当天关掉页面、第二天从搜索结果直接进 `/register` 注册，这条注册会算到 `/register` 的会话上，而不是他昨天看的落地页 —— 宁可少归因，也不虚构一条跨会话的链路。
- **找不到落地页就记空**，报表里单独一行「未归因」，绝不把未归因的注册摊到别的页面上。

两条计数规则专门防「越算越多」：

- **注册数按会话去重**（汇总和明细来自同一个去重集合）。同一会话重复点击提交、注册失败后重试，只会算一次注册，否则转化率会超过 100%。
- **会话数也按会话去重**（`COUNT(DISTINCT session_id)`）。这条不能写成 `COUNT(*)`：注册表与浏览表是 `LEFT JOIN`，一个会话有两条注册记录会让它的行数翻倍，把转化率压成一半。

报表里的「总注册数」和「已归因」是**同一条汇总查询分别按会话去重**算出来的，不是对展示用的明细行求和 —— 明细有 `LIMIT 15`，拿它求和会把排在第 16 位之后的落地页带来的注册误算成未归因，报表上就会凭空出现一个缺口。

这也是为什么表里存的是 `landing_path` 快照而不是外键：`page_views` 180 天后会清理，归因记录要能独立存活。清理同样覆盖两张表（cron 里的 `pruneExpiredPageViews` 做 `batch` 双删），否则隐私政策承诺的 180 天只对一半数据成立。

## 来源归因：按会话首次归因，不是逐页

推广参数（`utm_*`）只出现在落地那一次 URL 上。如果每页都读 `location.search`，第二页开始就丢失，于是「Google 来的用户平均看 1.0 页」这种毫无信息量的结论会成为常态。

所以 `page-view-tracker.tsx` 在会话第一次上报时把 `{referrer, utm_source, utm_medium, utm_campaign}` 存进 `sessionStorage`（`wechatai:attribution`），整个会话后续的浏览都复用这份归因。这样 `referrer_host` 与 `utm_*` 的含义是「**这次会话从哪来**」，而不是「这一页是从哪跳来的」。

来源的归类顺序（`SOURCE_EXPR`）：有 `utm_source` 用 `utm:<值>`，否则用 referrer 主机名，都没有算直接访问。本站自己的主机名会被剥掉（`siteHost` 由路由按请求 Host 传入），所以站内跳转不会被误记成来源。

## 隐私边界

`/privacy` 的第 6 节「访问与关键操作统计」说明实际采集范围：

- 原始 IP、User-Agent **不落库**：`visitorHash = sha256(ip|ua|day|salt)`，只存 32 位十六进制。盐取 `ANALYTICS_SALT`，没有则回退 `BETTER_AUTH_SECRET`。
- 日期参与访客哈希，同一人每天得到新值，因此只能统计当日去重数或访客日，不能据此计算跨天去重人数。验证与支付成功的业务去重标识另见下文。
- 查询串一律不接收：zod 只收 `pathname`，`isTrackedPath` 直接拒绝含 `?` 的路径。订单号、token 之类不会进库。
- 只记录下文列出的关键操作事件（包含部分按钮点击）与简短属性，不记表单输入、API Key、聊天或支付凭据内容，不录制操作过程；没有第三方统计脚本、没有广告画像。
- 180 天保留期，由已有的每分钟 cron（`wrangler.jsonc` 的 `triggers`）执行删除，到期即清，不依赖有没有流量。
- 尊重 DNT 与 Global Privacy Control：开启时浏览器不上报。

已知的可识别性残留：同一自然日内，同一 IP + 同一 UA 的多次访问会被算成同一个人。这是「当日去重」这个功能的必要代价，并在隐私政策里明确说明。

## 怎么用

```sh
pnpm analytics                 # 线上库，最近 7 天
pnpm analytics --days 30       # 线上库，最近 30 天
pnpm analytics --local         # 本地开发库
```

线上查询走 `wrangler.production.local.jsonc`（不存在时脚本会提示，避免把线上库地址写进仓库）。缺表时错误信息会直接提示先跑 `pnpm db:migrate:remote`。

输出包含：总览（PV / 去重访客 / 会话 / 人均页数）、按天趋势、热门页面 Top 20、来源 Top 15（含人均页数）、**落地页转化**（会话 / 注册 / 转化率，附未归因条数）、国家地区、设备。`signup_attributions` 表还没建时只有这一段会显示一行提示，其余照常输出。

## 上线步骤

1. `pnpm db:migrate:remote`（应用 `migrations/0014_page_views.sql` 与 `0015_signup_attributions.sql`；`db:migrate:local` 已验证可用）。
2. 正常部署 Worker。采集端与上报端同一版本上线，不需要额外开关。
3. 部署后打开任意页面，`pnpm analytics --days 1` 应能看到 1 条 PV。

## 注册事件的可信边界

注册只在 Better Auth 的 `databaseHooks.user.create.after` 中记录。邮箱重复注册即使返回防枚举的成功响应，也不会触发记账；第三方新账户会触发，已有用户登录和账户关联不会触发。旧 `POST /api/analytics/signup` 返回 410，浏览器不能凭一次独立请求制造注册事件。

邮箱注册通过请求头传递会话号，OAuth 通过框架已有的 state 传递，不新增持久 Cookie，不把统计会话号写进用户表。客户端会话号只用于来源关联，仍需校验，不能视为身份凭据。DNT/GPC 时客户端不传递；服务端也检查请求中的 DNT/GPC。统计写入失败会记录不含身份信息的错误日志，不影响账户创建。

## 边界情况怎么处理

- **存储不可用**（隐私模式禁用 `sessionStorage`）：会话号退化成内存里的一个随机值并缓存住；读取成功但写入失败时也沿用已经生成的同一个值。如果每次调用都新生成，一次访问里的每次浏览都会成为独立会话，会话数被撑成 PV、人均页数恒等于 1、漏斗全断。代价是刷新页面就算新会话，这是可以接受的退化。
- **同一毫秒的两条浏览**（同一会话回到上一页、连点）：谁算落地页由 `ORDER BY created_at, id` 兜底，保证同一份数据每次查出来的来源一致。
- **重复注册提交**（连点、重试）：`signup_attributions` 按 `eventId` 幂等写入，报表按会话去重，同一会话最多算 1 次注册，汇总和明细一致。
- **空路径 / 带查询串 / 带扩展名 / 一次性令牌页**：一律不接收，避免把垃圾请求记成首页浏览。
- **iPad 的 UA**：iPadOS 13 起 Safari 上报的 UA 与 macOS 完全一致，只看 UA 会把 iPad 记成桌面。浏览器上报 `touch`（`navigator.maxTouchPoints > 0`），服务端据此把「Macintosh UA + 有触摸」认回平板。踩过的坑：第一版判定写成「有触摸 + `mac os x`」，而 iPhone 的 UA 里也带 `like Mac OS X`，结果所有 iPhone 都被记成平板 —— 现在只认 `macintosh` 并排除 `iphone|ipod|mobile`。
- **空标签的含义**：来源为空才是「直接访问」，国家/设备为空只是没取到值，标成「（未知）」。两者曾统一标成直接访问，会让报表看着像所有未知地区的访问都来自直接访问。
- **保留期怎么真的被执行**：交给 Worker 已有的每分钟 cron（`src/server/index.ts` 的 `scheduled`，同一处还在清 `auth_email_limit`）跑 `pruneExpiredPageViews()`，两张表一起删。
  这里换过一次方案：一开始是「写入时按 1% 概率顺带清理」，省掉定时任务，但那样只能保证「有访问就会清」——站点一旦安静下来，旧数据就永远留着，与隐私政策承诺的 180 天不符。既然本来就有 cron，交给它更实在：到期即删，与流量无关。更早的一版概率写成万分之一，日访问 20 次时平均 250 天才清一次，同样对不上承诺。
- **同页内的锚点跳转不算浏览**：文档页和落地页都有目录（`<a href="#faq">`）。点锚点、或从锚点按后退回到同一页时，`pathname` 与 `search` 都没变、只有 `hash` 变了，这是同一次浏览里的定位移动。上报时带着 `search` 与 `hash`，这种情况直接跳过 —— 否则每个点目录的读者都会给自己的页面多加一次 PV，热门页排名被「目录好不好点」污染。
- **404 页面会被记进来**：`dist/client/404.html` 带着入口脚本，访问不存在的路径时会渲染 `NotFound`，于是那次访问以原样的路径（如 `/pricingg`）记一条 PV。这是**有意保留**的：错链和旧地址是最有价值的 SEO 线索。代价是热门页面里会混进少量不存在的路径，看到陌生路径先怀疑链接写错，而不是先怀疑统计出错。
- **`page_views` 上的索引**：保留 `(day)`、`(day, path)`、`(day, visitor_hash)`、`(day, session_id)`、`(session_id, created_at)` 和 `event_id` 唯一索引。没有单独的 `created_at` 索引——没有任何查询只按时间过滤，而每个页面浏览都要写一次插入，少一个索引就少一次维护。

## 口径与契约是怎么被守住的

统计最容易坏的地方不是 SQL 报错，而是**静默地少收数据**或**两边算法悄悄分叉**，所以关键约定都有测试盯着：

- **客户端与服务端的字段契约**（`test/analytics-client.test.ts`）：客户端上报的请求体会被喂进服务端的 `pageViewPayloadSchema` 做校验。这条测试抓到了一个真实事故 —— 浏览器原先直接把内部归因对象的键（`utm_source`）展开进请求体，而服务端 schema 是 `.strict()` + camelCase（`utmSource`），于是**线上每一条浏览都会被判成非法字段、静默丢弃**，整套统计一条数据也收不到。字段名现在逐项写出，并且两侧对 UTM 做同一套归一化（trim → 小写 → 截断 60）。测试还直接使用真实 ID 生成器，以及 `randomUUID` 不可用时的 `getRandomValues` UUID v4 分支，防止测试替身掩盖格式错误。
- **浏览器端的隐私判断**（同一文件）：DNT / GPC、一次性令牌页不上报、后台标签页延迟上报、同一 `location.key` 只记一次、往返缓存恢复算新浏览、会话号复用、首次归因 —— 核心逻辑被抽成 `src/client/analytics-client.ts` 的依赖注入工厂，测试里用假存储、假 navigator、假 fetch 跑，不需要 jsdom。
- **注册查询共用实现**：Worker 和 CLI 使用同一个 `signupConversionQueries`。`test/analytics.test.ts` 用真实 D1 验证跨日窗口、历史首访、快照保留、重复归因总数、未归因和超过 15 个落地页的汇总。
- **真实注册链路**（`test/analytics-auth.test.ts`）：从真实客户端 UUID 到 PV 接口、邮箱注册与重复注册、Google/GitHub 首次注册和回访、已有账户关联、DNT/GPC、统计表缺失不影响注册。
- **保留期真的会执行**：`pruneExpiredPageViews(env, now)` 独立成函数，`test/analytics.test.ts` 直接断言 200 天前的记录（两张表）被删、10 天前的还在；`test/analytics-sql-drift.test.ts` 再盯住 cron 里那一行调用 —— 有人把它删掉时线上没有任何症状，只有这条断言会红。

## 管理后台

`/app/admin?tab=analytics` 提供流量统计，支持今天、近 7 / 30 / 90 天和手动刷新。`GET /api/admin/analytics?days=7` 复用服务端汇总，仅管理员可读，禁止缓存；天数必须为 1–90 的整数。

页面展示 PV、每日去重访客加总、每日趋势、来源和浏览深度、热门页面、落地页注册转化。注册汇总按会话去重，分母是区间内有浏览或注册的全部会话（含未归因），不会用截断后的前 15 个落地页计算总转化率。访客数不代表跨天独立人数，注册会话也不等于全部新增用户。

切换区间会取消旧请求并清空旧结果；请求（含响应体读取）超过 15 秒会取消并显示可重试的超时提示。加载失败不展示为零或“暂无数据”，迟到响应不能覆盖当前结果。进入流量页不触发账户统计同步。

接口与统计回归见 `test/admin.test.ts`、`test/analytics.test.ts`，包含 17 个注册会话和 83 个未注册会话验证全量转化率为 17%。`test/admin-analytics-ui.test.tsx` 检查展示口径；`test/admin-analytics.client.test.tsx` 在 DOM 环境挂载真实 React 组件，覆盖超时、响应体挂起、日期切换、迟到响应、取消、失败重试及权限失效。交互测试可单独运行 `pnpm test:client`，也已包含在 `pnpm test` / CI 中。

## 关键事件触达

`funnel_events` 保存注册表单、验证、引导、渠道配置、微信连接和结账等事件。后台按事件展示**访客日**（每日去重访客之和）与事件次数；同一访客跨天会贡献多个访客日。各事件可能来自不同批用户，因此不将相邻计数相除，也不展示整体付费转化率。访问到注册的会话转化仍按上节的独立口径计算。

- 演示工作台已下线，但报表仍排除保留期内路径为 `/demo` 或其子路径的历史模拟操作（忽略大小写）。这不影响旧链接落到 404 页时的页面浏览统计，也不排除 `/demo-help`、`/app/demo` 等其他路径。
- `channel_saved` 只表示配置保存成功；`channel_models_imported` 要求真实导入结果里至少存在一个导入或已有模型，不代表模型调用已经测通。手动保存、重试获取模型和 KimiSeek 一键导入共用此口径；KimiSeek 充值不算渠道导入，空目录不计模型导入事件。
- `wechat_connected` 在工作台持续观察每条链接从 `waiting` / `scanned` 到 `connected` 的变化。首次读取、页面重访、选中链接切换和恢复已连接链接不计为新连接。浏览器未观察到扫码过程时不补猜事件，因此这仍是浏览器事件统计，不是服务端连接次数审计。
- `register_view` 只在实际展示注册表单时记录，排除登录状态加载、失败以及已登录跳转；同一次挂载的重复渲染不重复上报。
- `verify_done` 由服务端在真实邮箱验证完成后记录，覆盖首次验证链接与重发邮件后的密码恢复。已验证账户重设密码、无效链接和验证页面重访不产生事件；同一账户以带密钥的幂等标识去重，不保存账户 ID。
- `checkout_success` 是服务端确认属于当前用户的已支付订单后记录的成功回跳，每笔订单以带密钥的标识去重；重试、刷新和跨天重访不增加成功次数。只有浏览器允许统计并携带会话号时记录，超过 180 天的旧订单不补写。它仍不等于全部付款：未回到站点或拒绝统计的付款不计入。
- 公开事件接口忽略客户端提交的 `verify_done` 与 `checkout_success`（含旧版客户端）。服务端遵守 DNT/GPC，验证和支付成功统计由请求的 `waitUntil` 接管；写入失败或挂起均不阻塞业务响应。支付状态的已有付款与本次确认付款两个分支共用此行为，回归同时覆盖挂起后的成功、失败与真实 HTTP 路由。旧版本已经写入的成功事件没有业务幂等键，历史数据不追溯修正。
- 公开 `/privacy` 的「访问与关键操作统计」分别说明页面浏览范围、关键操作事件、业务成功去重标识及 DNT/GPC；工作台和一次性链接页面不计页面浏览量，但其上述关键操作可能被记录。
- 回归覆盖真实 D1 的跨天去重与区间边界、不同会话事件不产生转化率，以及真实 React 控件中的引导、渠道导入、KimiSeek 轮询和微信状态变化。

## 这一版没做的

- **服务端爬虫记账**：本站静态页由 Workers Assets 直接返回，只有 `run_worker_first` 列出的路径会进 Worker；为记爬虫要把大量路径塞进 Worker 首字节路径，性能代价大于收益。改用采集端按 UA 直接拒绝爬虫，代价是「爬虫抓了多少」这个数据拿不到。
- **付费转化**：注册之后的付费环节要 join 账户与订单表，而且支付回调里没有会话号，链路会断在注册这一步。要做的话得在订单上存注册时的会话号，等注册归因数据积累后再评估。
- **`ANALYTICS_SALT` 独立密钥**：当前回退到 `BETTER_AUTH_SECRET`，轮换站点密钥会同时改变哈希盐（历史数据不受影响，只是新旧不可比）。需要独立轮换时在 `.production-secrets.local` 里加这一项即可，代码已经支持。

## 与现有 SEO 工作的关系

`design/seo-strategy.md` 第 8 节把「接入分析工具」列为待办，这一版结掉了它。落地页设计时的假设——「ClawBot 长尾是真实需求」「BYOK 是结构性空位」——现在可以第一次用自家数据检验：看 `/wechat-clawbot-models`、`/bring-your-own-api-key` 的 PV 与来源构成，以及它们各自的会话深度，再决定下一批页面写什么。
