# 改进实施记录（2026-10-25）

对应 review：`design/review-2026-10-25/README.md`。全部改动在本地 dev（`http://127.0.0.1:5199`）逐项截图核对，最后跑通 `lint / typecheck / test / build`。

**刻意未改**：邀请奖励门槛（好友需完成首次微信 AI 对话才发双方 500 credits）——这是为了防脚本刷奖励而设计的风控，只补了分享埋点（`invite_share_click`），奖励判定逻辑一字未动。

## P0

| 问题 | 改法 | 证据 |
| --- | --- | --- |
| `/demo` 冷加载白屏，fallback 只有一行字 | 新增 `src/client/workspace-skeleton.tsx`（顶栏 + 4 张统计卡 + 5 行列表的骨架屏，`role="status"`），`src/client/main.tsx` 的 `/app/*`、`/demo/*` Suspense fallback 都换成它 | `12-after-demo-workspace.png` |
| 免费用户首页就是付费墙，真空状态反而是死代码 | `src/client/pages/dashboard.tsx` 分支重排：**没有会话 → 空状态（引导连接微信）→ 非 Plus → 付费墙**。判定改用服务端统计 `data.stats.sessions`，因为 `/sessions` 只对 Plus 请求，`sessions.length` 永远是 0 | — |
| 静态资源零缓存（`max-age=0, must-revalidate`，831KB 单包每次重下） | `public/_headers` 新增 `/assets/*` → `max-age=31536000, immutable`；`/sitemap.xml` → `max-age=3600` | 部署后 `curl -I` 复核 |
| 8–11px 字号成片出现（10px 71 处、9px 48 处） | 全站字号下限提到 12px，输入框 16px（iOS 不缩放）；`:root` 14px→15px，新增 `--text-*` 阶梯与 `--container/--gutter` | 各页截图 |
| 营销站手机上没有任何导航入口 | 新增统一页头 `src/client/site-header.tsx`，窄屏折叠成抽屉（44px 汉堡、`aria-expanded/controls`、Escape 关闭、路由变化自动收起），含「价格 / 文档 / 如何使用 / 登录 / 免费开始」 | `11-after-mobile-menu.png` |
| 首屏看不到价格，也看不到常见问题 | 首页新增价格锚（免费 ¥0 / Plus ¥9.9 起，两档三条要点，全部数字从 `BILLING_OFFERS`、`DAILY_CREDIT_DEFAULTS`、`WECHAT_LINK_LIMITS`、`PLUGIN_LIMITS` 取）+ 6 条折叠 FAQ（`src/shared/landing-faq.ts` 单一事实源，同时生成 `FAQPage` 结构化数据） | `06-after-home-pricing-faq.png` |

## P1

- **字体**：`"DM Sans"` 全站从未加载（无 `@font-face`、无外链、无字体文件），删掉，改系统栈（`PingFang SC` 等）。理由写明：大陆网络与微信内置浏览器不应依赖 Google Fonts。
- **页头收敛**：原来 6 套页头（landing / seo / docs / info / guide / workspace）合并成 1 套 `SiteHeader`，导航项与 CTA 文案统一；各页旧 CSS（`.landing-nav`、`.seopage-header`、`.docs-header`、`.info-header`、`.guide-header`）全部删除。
- **容器收敛**：7 种内容宽度（820/880/1050/1120/1180/1220/1280）统一为 `--container-w`（1160 + 28 gutter），`/`、`/pricing`、`/docs`、`/contact` 的左边缘现在都是 140（1440 视口）。
- **中文标题字距**：`h1..h3` 的 `-0.035em` 是给拉丁文配的，中文每字被压 2px；改为 `-0.02em` 并加 `:lang(zh)` 覆盖到 `-0.005em`。
- **层级感**：`--shadow` 的 alpha 从 6/255（≈2.4%）提到可见水平，`.panel`/`.stat-card` 自动受益；卡片与页面底的对比不再只靠 1px 边线。
- **`/pricing` 从「文章」变回「定价页」**：新增 `src/client/pages/pricing-plans.tsx`——两档卡片 + 月/年切换（`role="group"` + `aria-pressed`）+ 真实结账按钮（已登录走 `/billing/checkout`，未登录去 `/register`）；价格、额度、上限全部从 `BILLING_OFFERS` 等常量推导，没有一处硬编码。原「直接回答」段落降到卡片下方并弱化，避免三段文字念同一组数字。
- **数字格式歧义**：「1,996.272」这类千分位+小数混排在大字号下会被读成 199 万；`formatCredits` 改为 ≥100 只显示整数（小额仍保留三位小数）。
- **移动端通知条 reflow**：`notices.css` 700px 断点里把「重要通知 / 标题 / 查看详情」拆成三行，不再出现「查看详情」挤在标题前。
- **触控与安全区**：`@media (pointer: coarse)` 把按钮、tab、抽屉行、图标按钮抬到 44px；`env(safe-area-inset-bottom)` 补到各页容器；`.modal` 的 `90vh` 改 `min(90dvh, 90vh)`。
- **漏斗埋点**：新增 `src/shared/funnel.ts`（15 个事件 + zod schema）、`migrations/0016_funnel_events.sql`、`recordFunnelEvent`（bot 过滤、按天加盐 visitor hash、`event_id` 幂等）、`POST /api/analytics/event`、客户端 `trackFunnel()`（尊重 DNT/GPC）。已接线：注册提交/验证信发出/验证完成/引导各步与跳过/渠道保存与测活失败/微信连接/付费墙曝光与点击/结账开始与成功/邀请分享/预览页访问。**关键设计**：漏斗事件不按路径过滤，因为最有价值的节点都在 `/app` 里，而 `/app` 在 PV 统计里是刻意排除的。
- **SEO**：3 个开发者页 title 后缀统一为「微伴 Wechatai」、补 BreadcrumbList 与 sitemap lastmod；`Organization` 补 logo/url/sameAs；`SoftwareApplication` 的 `offers` 从 `BILLING_OFFERS` 推导；全站 35 页 title ≤60、description 70–152 且无重复。
- **文档搜索**：`/docs` 侧栏新增本地过滤（匹配标题/分类/摘要），无结果时给提示；之前文档页是全站唯一没有检索入口的栏目。|`10-after-docs-search.png`|

## 验证

```
pnpm lint      → 0 warnings / 0 errors（246 files）
pnpm typecheck → 通过
pnpm test      → 59 files / 1101 tests 全通过（新增 4 条漏斗事件测试）
pnpm build     → Prerendered 35 public pages + SEO checks passed
```

`scripts/verify-seo.mjs` 里「首页导航包含文档链接」的断言原来写死旧标记 `<nav class="landing-nav">`，已改为检查 `index.html` 同时含 `href="/docs"` 与 `href="/pricing"`。

## 仍待处理（不在本次范围）

1. `www.wechatai.app` 仍是 NXDOMAIN——需要 DNS 侧加 CNAME，代码里改不了。
2. `favicon.svg` 只有 64px，建议补 512 PNG 与 `apple-touch-icon`、`manifest`。
3. 单包 831KB（br 265KB）里塞了全部 16 篇文档与 11 个落地页正文；拆分需要重构 `seo-content` 的加载方式，风险比视觉改动大，建议单独一轮。
4. 埋点落地了，但管理后台还没有漏斗报表；表结构已按 `(day, name)` 建好索引，接一个图表页即可。

## 第二轮：把首屏瘦下来，把撞墙的人接住，把数据看见

### 1. zod 离开首屏关键路径

`src/shared/analytics.ts` 原本 `import { z } from "zod"`，只是为了让服务端校验请求体；但浏览器端的 `public-pages.tsx` 为了 `ANALYTICS_SESSION_HEADER` 引了这个模块，于是整个 zod（打包后 103KB gzip）被拖进首屏。

- 新增 `src/shared/analytics-schema.ts`：`pageViewPayloadSchema`、`signupConversionSchema`、`analyticsSessionIdSchema` 及对应类型。
- `src/shared/analytics.ts` 只留常量、纯函数与类型（183 → 146 行），服务端改从这里之外的 schema 模块校验。
- 结果：首屏 JS 里 `invalid_union`/`ZodError` 特征串为 0；入口 chunk 从 260KB（基线，zod 打在里面）降到 175KB。

### 2. 价格常量与账单模块解耦

落地页要展示 ¥9.9，但 `import { BILLING_OFFERS }` 会让构建器把账单相关模块合并成共享 chunk 并预加载。新增 `src/shared/pricing-copy.ts`（`PLUS_MONTHLY_YUAN`、`PLUS_YEARLY_YUAN` 两个字面量 + 注释说明原因），`landing-faq.ts` 与 `public-pages.tsx` 改用它；一致性由 `test/seo.test.ts` 的一条断言兜底（改 `BILLING_OFFERS` 忘了改文案会红）。

实测（`git worktree` 对照 HEAD）：基线 `index.html` 关键路径 **281KB gzip**（单个 260KB chunk 内含 zod）；现在 **273KB**，而且期间还新增了 P0/P1 全部功能 + 5 个落地页 + 首页产品图段落。剩余待优化项：`index.html` 还预加载了一个 74KB 的共享 chunk，里面是 markdown 渲染栈（`chat-markdown.tsx`，被 `pages/seo-page.tsx` 的正文渲染与 `notices.tsx` 引入）。要再省这 70KB，得把落地页正文改成构建期渲染成 HTML（或换更小的渲染器），属于结构性改动，建议单独一轮。

### 3. 撞到限额时给出口

原来 Free 用户撞到「1 个渠道 / 1 个插件」时，只有一行红字 toast，且服务端 `plugin_limit` 文案里带着 markdown 链接 `[管理插件](https://…)`，在 toast 里原样显示。

- `src/client/api.ts`：`ApiError` 增加 `code`，新增 `limitErrorCode()` 识别 `plugin_limit` / `channel_limit` / `wechat_link_limit`。
- 新增 `src/client/limit-hint.tsx`：一句「差多少」+ 两个可点去处（看 Plus 额度 / 去会员页），数字全部从常量推导。
- 已接到 `channels.tsx`、`plugins.tsx` 的表单错误区；服务端那条 markdown 文案改为纯文本。

### 4. 后台漏斗报表

`funnel_events` 表已经在写，但后台只有 PV / 来源 / 热门页，看不见「哪一步掉人」。

- 新增 `src/shared/funnel-report.ts`：10 步主路径 + 4 个旁路事件的报表口径，`summarizeFunnel()` 负责去重人数、相对首步占比、相对上一步留存。**刻意只 type-import** `funnel.ts`，避免 zod 跟着进 admin chunk。
- `src/server/analytics.ts` 新增 `getFunnelSummary()`（按 `day` 区间聚合，去重 `day|visitor_hash`），并入 `getAdminAnalytics` 的返回；`AdminAnalytics` 类型加 `funnel`。
- `src/client/pages/admin-analytics.tsx` 新增「转化漏斗」面板：条形按人数归一、每步显示留存率、底部给整体转化与旁路计数；720px 以下折成两行。空区间显示「还没有漏斗事件」而不是一排 0。
- 测试：`test/admin-analytics-ui.test.tsx` 新增一条渲染断言（含留存率与空态）。

### 5. 首页放真实产品图

hero 手绘图保留（移动端版面更稳），在「三步」之后新增 `.landing-preview` 段落：左侧一句价值主张 + 「打开演示工作台」，右侧 `/demo` 的真实截图（`public/images/workspace-overview.jpg`，1440×900，`loading="lazy"`，alt 写了界面上有什么）。

### 6. 围绕新 query 的 5 个落地页

新增 `src/shared/seo-content/` 下 5 个页面（正文各含表格/步骤/FAQ，事实逐条对照源码）：

| 页面 | 主打 query |
|---|---|
| `/wechat-ai-partner` | 微信 ai 搭档 / 搭子 |
| `/wechat-character-card` | 微信聊天人物卡 |
| `/wechat-bot` | 微信机器人 |
| `/wechat-ai-image` | 微信 AI 生图 |
| `/wechat-ai-privacy` | 微信 AI 隐私 |

同时给 `/wechat-deepseek`、`/wechat-gpt` 补了 `secondaryKeywords`；首页在「按你的问题找入口」下方加了一排主题胶囊链接（不增加卡片高度，移动端不额外占屏）；`scripts/verify-seo.mjs` 的落地页清单也补上这 5 页，保证预渲染的 H1、FAQ、面包屑、站内链都会被验证。

### 验证（第二轮）

```
pnpm lint      → 0 warnings / 0 errors
pnpm typecheck → 通过
pnpm test      → 60 files / 1106 passed（+4 漏斗事件、+1 漏斗面板、+1 价格一致性、+3 限额提示）
pnpm build     → Prerendered 40 public pages + SEO checks passed
```

新增证据图：`13-after-home-workspace-preview.png`、`14-after-seo-character-card.png`、`15-after-mobile-preview.png`。

### 上线前需要你做的两件事

1. `pnpm db:migrate:remote`——本轮新增 `migrations/0016_funnel_events.sql`，不跑迁移后台「转化漏斗」会空、事件写入会静默失败。
2. 观察一周后看漏斗：`/app/admin?tab=analytics`，先看「提交注册 → 邮箱已验证」与「模型渠道可用 → 微信已连接」两段，这两段是当前最可能的断点。

## 第三轮：首页注册率优化（2026-10-26）

背景：后台「落地页注册转化」偏低。判断是首屏把最贵的一步（自备 API Key）放在最前面，并把零门槛的 `/demo` 降级成小字链接；同时缺 4 个关键埋点，无法区分「没人感兴趣」和「点了但卡住」。

### 1. 补 4 个漏斗事件（先有仪器再谈优化）

`src/shared/funnel.ts` 新增：

| 事件 | props | 回答什么问题 |
|---|---|---|
| `hero_cta_click` | `cta: primary \| demo` | 首屏有没有人想继续 |
| `register_view` | — | 到了注册页却没提交的劝退率 |
| `oauth_click` | `provider` | 有多少人走捷径（OAuth 不经邮箱验证） |
| `verify_send` | `first: y \| n` | 首发送出与重发的比例：重发多＝送达/找信有问题，首发送出多而验证完成少＝根本没打开邮件 |

四个都进了 `src/shared/funnel-report.ts` 的 `FUNNEL_SIDE_EVENTS`，后台「关键事件触达」面板底部会展示。**没有**把它们塞进主流程步骤，是因为该面板明确标注口径为「访客日，非跨天独立人数」，相邻相减算留存是不成立的；要看单日转化，请在同一天的数据里比。

接线点：`src/client/public-pages.tsx`（首屏两个 CTA 的 `onClick`、`AuthPage` 的 `register_view`、`startSocial` 的 `oauth_click`）、`src/client/pages/auth-recovery.tsx`（发送成功后 `verify_send`，用 `first` 区分首次与重发）。

### 2. 首屏文案与 CTA

| 位置 | 改前 | 改后 |
|---|---|---|
| H1 | 把你的 AI 接入微信 | 在微信里，用上你的大模型 |
| 副标题 | 用自己的 API Key 和服务地址，开启微信 AI 对话。连接喜欢的大模型，随时切换，继续你的话题。 | 3 分钟配好，之后就在微信里说话。自备 API Key，DeepSeek / Claude / GPT 随时切换。 |
| 主按钮 | 连接我的大模型 | 免费开始，3 分钟上手 |
| 次按钮 | 「先看看工作台」纯文本链接 | 「不注册，先点开看看」与主按钮同尺寸的次按钮 |
| 微文案 | 无 | 每天 100 credits 免费 · 不绑卡 · 聊天记录可随时删除 |
| 信任三条 | 自定义渠道与模型 / 微信内随时切换 / 每日免费额度 | 自带 API Key，我们不卖 token / 三种协议一次配通 / 开源仓库可查 |

额度文案读的是 `DAILY_CREDIT_DEFAULTS.free`，改发放值文案会跟着变。排版上加了 `text-wrap: balance` 并把 H1 收到 48px，避免「型」被挤到第三行；移动端两个按钮改为通栏堆叠。

### 3. 验证页兜底

`/verify-email` 未验证分支新增：

- 「验证完成后，接下来只有三步」预告块（配置模型 → 扫码连微信 → 微信里说话）。
- 底部「一直收不到？联系我们」出口（`/contact`）。

**曾经加过、后来撤销的**：「用 Google 登录，跳过邮箱验证」次按钮。撤销原因见第四轮 Review 的 P0-1——它对目标用户必然失败，且失败后文案误导、可无限重试。

注册页副标题同步改为「创建账户，3 分钟连上微信。每天 100 credits 免费，不绑卡。」

### 验证（第三轮）

```
pnpm lint      → 0 warnings / 0 errors
pnpm typecheck → 通过
pnpm test      → 61 files / 1127 passed（client 配置 4 files / 37 passed）
pnpm build     → Prerendered 40 public pages + SEO checks passed
```

证据图：`16-after-hero-desktop.png`、`17-after-hero-mobile.png`、`18-after-verify-email.png`、`19-after-register-subhead.png`。

### 刻意没做

- 没有编造社会证明数字（用户数/评分）。要放就得是真实数据或可验证事实（开源仓库、协议清单、删除机制）。
- 没动邮箱验证门槛（`src/server/auth.ts:107` 的 `requireEmailVerification`）——这是产品决策，需要你拍板。**注意**：想给 OAuth 开旁路，光在页面上加按钮是无效的，得改 `accountLinking`（见第四轮 P0-1）。
- 没删注册表单的「确认密码」字段（会牵动 `passwordValidationError` 与相关测试）。
- 邀请奖励门槛（要求好友完成首次微信 AI 对话）保持原样。

### 上线后看什么

一周后 `/app/admin?tab=analytics`，按顺序看：

1. `首屏 CTA 点击` 与首页 PV 的比（现在有了分子）。
2. `到达注册页` / `首屏 CTA 点击`——低了说明注册页本身劝退。
3. `提交注册` / `到达注册页`——低了说明表单字段太多。
4. `邮箱已验证` / `提交注册`——低了说明验证墙是主要断点，那时再讨论放宽门槛。

## 第四轮：对第三轮改动的 Review 与修复（2026-10-26）

过程：两位只读审查员并行（`FINDINGS-round3.md` 审未提交的 6 个文件，`FINDINGS-legacy.md` 审 `0de73ee..ce69cfa` 的两轮改动），我逐条复核后自己动手修。**未改源码的审查员结论与我的复核结果不一致时，以实测为准**，下面每条都写了验证方式。

### 已修

| 编号 | 问题 | 修法 | 验证 |
|---|---|---|---|
| P0-1 | 验证页「用 Google 跳过邮箱验证」对目标用户必然失败：`src/server/auth.ts:227-231` 的 `accountLinking.requireLocalEmailVerified: true` + 无 `trustedProviders` ⇒ better-auth `link-account.mjs:23` 对「同邮箱、未验证」的本地账号直接返回 `account not linked` | **删掉该按钮**与 `/auth/providers` 拉取、`startGoogle`/`socialBusy` 状态，改留「一直收不到？联系我们」出口，并在代码里写明为何不能这样兜底 | `grep googleReady\|socialBusy\|startGoogle src/` 无结果 |
| P1-1 | H1 在 320–1024 折成「在微信里，用」/「上你的大模型」，动词被切开 | `.landing-copy h1 span` 加 `white-space: nowrap` | 逐宽实测：320/375/768/1024 两行且第二行起于 span，「在微信里，」/「用上你的大模型」；1440 一行 |
| P1-2 | `.hero-note` 的新样式被 `.landing-copy > p`（0,1,1）整条压掉，实测 14px/2.15/33px；375 宽出现单字「除」 | 选择器改 `.landing-copy > p.hero-note`（0,2,1），三句话拆成三个 `span` + `flex-wrap`，句间用 `·` 伪元素 | `getComputedStyle(.hero-note)` = 13px / 22.1px，390 宽三句完整不拆字 |
| P1-3 | 次按钮比主按钮重（15px/h52 vs 13px/h50），注释写的「同尺寸」没实现 | 字号与 `min-height: 52px` 提到 `.hero-actions .button` 共同规则 | 1440 实测两键均 15px / h52 |
| P1-4 | `hero_cta_click` 对已登录用户也发 `cta=primary`（实际跳 `/app/channels`），稀释「CTA → 注册页」换算 | props 增加 `auth: in \| out` | 抓包确认 postData 带 `auth` |
| P1-5 | 已登录用户访问 `/register` 也计 `register_view` | effect 增加 `!isPending && !session` 守卫 | `/login` 与登录态 `/register` 均 0 条 |
| P1-6 | 验证页发起的 OAuth 缺 `additionalData: signupAttribution()`，归因断链 | 随 P0-1 一起删除，问题消失 | — |
| 回归-1 | `/docs` 在 ≤820px 横向滚动 2px（`docs.css` 的 `.docs-mobile-navigation` 用 `margin: 0 -22px` 出血 > `--gutter: 20px`） | 出血量改用 `calc(-1 * var(--gutter))` / `padding: 0 var(--gutter)` | 390 宽 `scrollW === innerWidth === 390`，无溢出元素 |
| 回归-2 | 页脚双重 gutter：父级 `padding: 0 30px / 0 25px` 与子级 `--container-w` 叠加 | 两处父级横向 padding 归零，gutter 只由子级负责 | 768 宽：页头 L20 / 页脚上部 L20 / 页脚品牌 L20 对齐 |
| 回归-3 | 首页 hero ≤760px 遗留 `padding: 48px 27px 70px`，390 宽下 h1 比页头缩进 27px | 横向归零，交给 `--container-w` | 390 宽：h1 与页头同在 L20 |
| 回归-4 | 微信链接限额升级出口接错错误码：客户端等 `wechat_link_limit`，服务端 `personal-account.ts:1586` 抛 `connection_limit`；且 `wechat.tsx` 在 `atLimit` 时只把按钮置灰，不渲染任何出口 | `LIMIT_CODES`/`LIMIT_LABELS` 改用 `connection_limit`；`wechat.tsx` 增加 `limitCode` 状态，`atLimit` 或命中限额时渲染 `LimitHint`（仅 Free；Plus 撞 10 条上限时升级出口无意义，只保留服务端的「请先删除」文案） | 测试 `test/limit-hint.test.tsx` 同步改用真码 |
| 回归-5 | 页脚底栏 `max-width: 1180px` 与 `.landing-footer-main` 的容器不一致（1440 下分割线窄 20px） | 改用 `width: var(--container-w)` | 1440 实测两者 L140 对齐 |
| 回归-6 | `/pricing` 同页出现「约 ¥7.3/月」与「折合 ¥7.33/月」两种写法 | 新增 `approx()`（一位小数）用于折合价，正式价格仍两位 | 卡片与正文一致为 ¥7.3 |
| 回归-7 | `plugin-protocol.tsx` 传 `active="/docs"`，但页面在 `/developers/plugins`，页头会错亮「文档」 | 去掉 `active` | 页头无高亮项 |
| 回归-8 | `dashboard.tsx` 删掉 `sessions.length` 兜底后，Plus 用户请求失败时「最近的对话」变成空白面板 | 补回空态（「还没有可回看的对话」+ 去微信连接） | 分支：`stats.sessions` 为 0 → 空态 → 非 Plus → 付费墙 → 列表 |
| P2-3 | `verify_resend` 在首次发送时也发，语义与名字不符 | 改名 `verify_send`，加 `props.first`；后台标签「发送验证信」 | `test/funnel-entry.test.ts` 覆盖 `first` 两个取值 |
| P2-4 | 新增的 4 个事件零测试 | 新增 `test/funnel-entry.test.ts`（13 条）：载荷校验、拒绝未登记事件、props 上限、侧栏清单与主路径不重叠、`/demo` 策略 | `pnpm test` 61 files / 1127 passed |

### 未修，留给产品决策

1. **「自带 API Key，我们不卖 token」的口径**：我们确实不按 token 收费（Plus 是订阅），但额度本身是按 token 折算的（`src/shared/credits.ts` 的 `TOKENS_PER_CREDIT = 5000`、`OUTPUT_TOKEN_WEIGHT = 8`）。这句容易被读成「额度与 token 无关」。可选改法：「自带 API Key，模型费用不由我们代收」。这是对外话术，需要你拍板。
2. **`src/server/index.ts:129` 的 `analyticsPrecheck`**：page-view 与 event 共用同一个限流桶（`analytics-page-view:${ip}`，`API_LIMIT = 120/60s`）。新增 4 个事件后，单次访问会消耗更多配额，NAT/自查场景有被限流后静默 204 的风险。要彻底解决得给事件单独一个桶。
3. **`register_view` 在 dev 下双发**：`src/client/main.tsx:49` 的 `React.StrictMode` 让 effect 双调用，生产只发一次（`demo_view` 同现象，属既有模式）。若担心 preview 环境数据，可在 `trackFunnel` 侧做同 session 同 name 的短窗去重。
4. **markdown 栈仍在首屏**：`src/client/notices.tsx` 被 `shell.tsx` eager 引入，把 remark 全家桶带进预加载的 74KB chunk。要省得把落地页正文改成构建期渲染。
5. **`/pricing` 的 credits 包价格仍写死**在 `src/shared/seo-content/pricing.ts:47`（有 `test/seo.test.ts` 断言兜底，但断言的是文案不是常量推导）。

### 最终验证（本轮现跑）

```
pnpm lint      → 0 warnings / 0 errors（265 files）
pnpm typecheck → 通过
pnpm test      → 61 files / 1127 passed + client 4 files / 37 passed
pnpm build     → Prerendered 40 public pages, private route shells and a 404 page.
                 SEO checks passed: rendered pages, metadata, indexing boundaries and social image.
```

证据图：`20-after-hero-desktop-fixed.png`、`21-after-hero-mobile-fixed.png`、`22-after-verify-email-fixed.png`、`23-after-mobile-midpage.png`。

---

## 第五轮：第二次 review（2026-10-26 晚）

触发：用户「再 review 一下看看，还有没有问题」。做法与上一轮一致——我自己逐条读改动并实测，同时派一位独立审查员（`round4-auditor`，干净上下文）复查当前工作区，产出 `FINDINGS-round4.md`（0 P0 / 3 P1 / 6 P2，逐条带 `文件:行号` 或量测数字，且被要求不重复前三份报告）。两份结论交叉后共 12 条，**全部已修**。

### 已修

| 编号 | 问题 | 修法 | 验证 |
|---|---|---|---|
| P1-1 | 移动端 `.hero-note` 整块左对齐——第四轮为压过 `.landing-copy > p`（0,1,1）把自己提到 0,2,1，结果连 ≤760 的居中规则一起压掉了，`text-align: center` 对 flex 容器又是空转 | 基线规则删掉多余的 `justify-content`，移动端规则改写成 `.landing-copy > p.hero-note` | 320/375/414 实测 `justify-content: center`，320 下第二行起于 x=102（居中） |
| P1-2 | Plus 用户撞 10 条链接上限时按钮静默 `disabled`、页面零解释，而代码注释写的正是「只提示删掉不用的链接」——注释与实现相反，受害的是付费用户 | 升级出口改由单一派生值 `upgradeHint` 控制（仅 Free）；Plus 撞限改为 `.wechat-link-limit-note`：「已达 N 条链接上限：先删掉不用的链接再创建新的」 | 分支互斥，`role="status"` |
| P1-3 | `hero_cta_click` 的 demo 次按钮仍不带 `auth`（第三轮只修了主按钮），而新测试恰好断言了真实代码从不发送的载荷，把缺口伪装成「已验证」 | 两个按钮都发 `auth: in \| out` | 抓包 + 测试载荷与真实调用一致 |
| P2-1 | `·` 分隔符用 `var(--line)` 实测 1.29:1 几乎不可见；且伪元素 `content` 会进可访问性树（AX 树里两条 `name="·"` 的 StaticText） | 改成真实节点 `<span class="hero-note-dot" aria-hidden="true">`，颜色 `var(--muted)` + `opacity: .7`；仍画在非末项的句尾，避免 320 换行后行首出现「·」 | `aria-hidden="true"` ×2；320 换行行首无点；截图 `24-after-hero-mobile-final.png` |
| P2-2 | `wechat.tsx` 的 `atLimit` 与 `limitCode` 两个条件可同时成立，渲染两块完全相同的 `LimitHint`；`limitCode` 还可能跨操作残留（先撞限、之后成功创建提示仍挂着） | 合并成一个派生值；操作成功后 `setLimitCode(undefined)` | 分支只剩一处渲染 |
| P2-3 | `dashboard.tsx` 的 `sessions` 初值是 `[]`，加载中与「一条都没有」同形；请求静默失败时有对话的 Plus 用户会永久看到「还没有可回看的对话」 | 初值改 `null`（未加载不渲染）；加载完成但为空且 `data.stats.sessions > 0` 时改说「暂时读不到对话记录，刷新页面可重试。微信里的消息没有丢。」 | 三种状态分开：未加载 / 真的没有 / 读取失败 |
| P2-4 | **`billing.tsx` 年付按钮写死「省 ¥49」**，而 990×12−8800＝¥30.8；同处「约 ¥7.33 / 月」与 /pricing 的 ¥7.3 也不一致（四轮 review 都没抓到，这轮才挖出来） | 新增 `src/shared/pricing-copy.ts` 的 `approxYuan(cents)`；省下的钱、折合月价全部从 `BILLING_OFFERS` 推导 | 页面显示「年付 · 省 ¥30.8」「约 ¥7.3 / 月」；`/pricing` 三个价位点说法一致（`25-after-pricing-prices-consistent.png`） |
| P2-5 | `verify_sent` 与 `verify_send` 只差一个字母，后台标签又是「验证邮件发出」/「发送验证信」，报表里极易读混 | 标签改「注册信已自动发出」/「手动发送/重发验证信」 | — |
| P2-6 | `test/funnel-entry.test.ts` 有一条恒真断言（`FUNNEL_STEPS` 元素类型已是 `FunnelEvent`，写错名字 `tsc` 就拦，测试永远不会红） | 改成三条能真失败的断言：事件表无重复、「每个登记事件必须在报表里出现且只出现一次」（`onboarding_step` 显式白名单）、标签可读 | `pnpm vitest run test/funnel-entry.test.ts` 14 passed |
| P2-7 | 第四轮加的 `.auth-recovery > .social-login`、`.hero-actions .text-link` 死规则 | 已随 P0-1 一起清掉 | 全仓 grep 无结果 |
| — | 顺手复核：全仓 grep `wechat_link_limit`、`verify_resend`、`-22px`/`-20px` 出血、页脚 `max-width: 1180px` 均已无残留 | — | 只剩 `plugin-protocol.css:273` 的媒体查询断点用 1180，属正常 |

### 仍未修（要产品或规则拍板）

1. 沿用上一节 5 条（「不卖 token」口径、analytics 限流共桶、dev 下 StrictMode 双发、markdown 首屏 74KB、credits 包价格硬编码）。
2. 新增：**`/pricing` 对已订阅用户仍显示「开通 Plus」**，点击会拿到服务端 409 `already_subscribed`（文案是「请先通过管理订阅取消自动续费」）。建议后续按 `ApiError.code` 把这条错误换成「去会员页管理订阅」的按钮。
3. 纯打磨未动：`pricing-plans.tsx` 的 `!` 非空断言（已有 `test/seo.test.ts` 断言兜底）、`pricing-copy.ts` 注释里那句「避免账单模块进首屏」的理由实测不成立、`DOCS_UPDATED_AT` 未 bump。

### 最终验证（本轮现跑）

```
pnpm lint      → 0 warnings / 0 errors（265 files）
pnpm typecheck → 通过
pnpm test      → 61 files / 1128 passed + client 4 files / 37 passed
pnpm build     → Prerendered 40 public pages, private route shells and a 404 page.
                 SEO checks passed: rendered pages, metadata, indexing boundaries and social image.
```

证据图：`24-after-hero-mobile-final.png`（移动端首屏三句居中、分隔符可见）、`25-after-pricing-prices-consistent.png`（¥9.9 / ¥88 / 约 ¥7.3 三处一致）。
