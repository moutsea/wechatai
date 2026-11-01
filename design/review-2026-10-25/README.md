# 微伴 Wechatai · 站点设计 Review

审阅对象：https://wechatai.app（线上）／`src/client`（源码）
审阅日期：2026-10-25
角度：SEO · 交互 · 用户增长 · 用户体验 · 美观

---

## 一句话结论

**工程与文档质量高于设计与转化质量。** 视觉上已经有一套成立的品牌语言（深绿 / 薄荷绿 / 宣纸白 + 短句主张 + 手绘嫩芽），但缺一套真正落地、被所有页面共享的设计系统：声明了却没加载的字体、塌到 8px 的字号阶梯、靠 1.2:1 边框和 2.4% 阴影硬撑的层级、6 套各自为政的 header。转化侧则是「能力远好于说服」——定价与计费状态机做得比同类细，但落地页不给价格、注册被邮箱验证拦一刀、唯一「先看效果」的 `/demo` 是白屏。

---

## 一、做对了的三件事

1. **品牌语言成立且不廉价。** 深绿 `#08783e` + 薄荷绿 `#59f294` + 宣纸白 `#f6f7f6`，配大写小字距 eyebrow（`A LITTLE CLOSER, EVERY DAY` / `THREE SMALL STEPS`）和手绘嫩芽插画，气质统一、不像模板站。登录页左右分栏、`/docs` 索引页和 `/demo` 工作台是同品类里少见的完成度。
2. **文案有主张，不写废话。**「把你的 AI 接入微信」「价格：我们不卖 token」「好用的 AI，就在你的聊天框里」「你好，好奇的朋友」——都是能记住的句子，且语气一致。`/pricing` 里「两笔账：一笔给服务商，一笔给我们」把最容易被误解的计费模型讲清楚了。
3. **产品内页完成度最高。** `/demo` 的侧边栏、4 张统计卡、渠道卡、状态徽标、绿色通知条，信息密度和留白控制都在线；`/docs` 的「第一次使用？从这里开始」大卡片 + 2×2 功能卡 + 品牌图标教程行，是整个站最像成品的地方。

---

## 二、美观：6 个系统级问题

### 1. 字体是死的：`DM Sans` 声明了，但从来没加载

`src/client/styles.css:1-13` 把 `"DM Sans"` 排在 font-family 第一位，但全仓 **没有任何 `@font-face`、没有 fonts.googleapis 链接、没有 `.woff2` 文件**（`find public src -iname '*.woff*'` 为空，`index.html` 里只有 favicon）。

后果：所有英文实际渲染成 `-apple-system`（macOS）/ `Segoe UI`（Windows）。品牌字体等于装饰性死代码，且 macOS 与 Windows 用户看到的拉丁字形完全不同。要么真正引入（自托管 woff2 + `font-display: swap` + preload），要么从 font-family 里删掉，别让设计稿和实现悄悄漂移。

### 2. 字号阶梯崩塌：8–12px 有 317 处声明

`styles.css` 里的 font-size 分布：

| 字号 | 8px | 9px | 10px | 11px | 12px | 13px | 14px | 15px | 16px+ |
|---|---|---|---|---|---|---|---|---|---|
| 处数 | 32 | 48 | 71 | 81 | 85 | 20 | 14 | 3 | 5 |

`:root` 基准是 **14px**（不是 16px），而 10px 及以下集中在信息密度最高的地方：`.stat-card > div`、`.recent-row time`、`.tag`、`.plan-label`、`.brand small`、`.workspace-footer`。

中文在 10px 以下基本失去辨识度（笔画粘连），11px 也偏小。这不是「精致的小字排版」，是**把可读性让给了信息密度**。建议：基准字号回 16px，正文最低 14px，仅 Latin 大写 eyebrow 允许 12px，彻底取消 8–10px。

### 3. 层级靠边距硬撑：边框 1.2:1、阴影 2.4%

```css
--line:   #dfe4e0;   /* 边框 */
--page:   #f6f7f6;   /* 页面底色 */
--shadow: 0 3px 14px #101a1206;  /* alpha = 0x06/255 ≈ 2.4% */
```

实测对比度：卡片白 vs 页面底 **1.07:1**，边框 vs 页面底 **1.20:1**。首页「按你的问题找入口」那 6 张入口卡片之所以看着像「表格」而不是「可点的卡片」，根因就在这里——用户看不出它是可交互的。且 `--shadow` 只有 2.4% 不透明度，几乎等于没有。

方向不是加重阴影，而是**给可点击面一个明确的 affordance**：hover 时边框转绿 / 箭头位移 / 底色转 `--sage`，把「可点」写进视觉语言。

### 4. 两套视觉身份，而更有力的那套没用在首页

- **深色**：`og-image.png`、登录页左栏、`/demo` 工作台、页脚 —— 黑绿底 + 白字 + 薄荷绿强调，气质强。
- **浅色**：首页、`/pricing`、`/docs` —— 宣纸白底 + 黑字。

`og-image.png` 的标题是「在微信里，与自选大模型对话。」（深底白色 + 绿色第二行），首页 H1 是「把你的 AI 接入微信」（浅底黑字 + 绿色短语）。**被分享到微信群时看到的第一眼，和点进来看到的第二眼，是两张不同气质的图。** 首页作为流量入口反而用了较弱的那套。

### 5. 网格与组件没有统一：6 套 header、5 种容器、3 个左边缘

| 页面 | header 类 | 导航项 | CTA 文案 |
|---|---|---|---|
| 首页 | `.landing-nav` (`public-pages.tsx:106`) | 如何使用 / 文档 / 登录 | 免费开始 |
| SEO 落地页 | `.seopage-header` (`seo-page.tsx:12`) | 价格 / 文档 / 登录 | 免费开始 |
| 文档 | `.docs-header` (`docs.tsx:37`) | 文档 | 开始使用 / 进入工作台 |
| 关于类 | `.info-header` (`site-info.tsx:333`) | — | — |
| 指南类 | `.guide-header` (`openclaw-guide.tsx:13`, `plugin-protocol.tsx:77`, `not-found.tsx:7`) | — | — |

容器宽度：**820 / 880 / 1050 / 1120 / 1180 / 1220 / 1280**（`seo-page.css:85,143`、`landing-steps.css:2`、`styles.css:2356,2745,1551`、`docs.css:42`）。左边缘实测 **118（docs）/ 148（首页）/ 180（pricing）** 三种。跨页跳转时 logo 和正文会横向跳一下。

`/docs` 的 header 还独有一个好设计——session 感知的「进入工作台 / 开始使用」（`docs.tsx:44`），但另外 5 套都没有复用。

**修法：抽出唯一一个 `<SiteHeader>`，用 `variant`（marketing / docs / info）控制导航项，容器统一到一个 `--container: 1120px` + 一个 padding token。**

### 6. 中文标题被套了拉丁负字距

`styles.css:93` `h1, h2, h3 { letter-spacing: -0.035em; }` 没有 `:lang(zh)` 覆盖。56px 的 H1 上等于每字收紧 **-1.96px**。拉丁负字距是为了收紧字母间空隙，中文方块字本就满格，负值会挤压字面、让「微信」「接入」这类词显得发闷。建议 `:lang(zh) h1,h2,h3 { letter-spacing: -0.01em }` 或直接归零，负字距只留给纯拉丁块。

---

## 三、移动端：整站最脆弱的一环

1. **营销站没有移动端菜单。** `public-pages.tsx:106` 的 nav 只有链接，没有任何 toggle / hamburger；窄屏下链接被 CSS 隐藏，只剩 logo + 文档 + 登录 + CTA。「如何使用」「价格」在手机上无入口（价格只能滚到页脚）。
2. **工作台顶栏 6 个元素挤在 390px 内**：hamburger + 「概览」+ 橙色「预览」pill + 绿点「微信已连接」+ 带角标铃铛 + 「PLUS」标签。三种徽标样式在同一条 56px 的栏里互相抢注意力。建议合并为「微信已连接」进头像菜单，只留一个状态位。
3. **通知条的移动端 reflow 错乱**（见 `04-workspace-mobile.png`）：桌面是「重要通知 · 欢迎使用微伴 … 查看详情」，手机上变成第一行「重要通知 查看详情 →」、第二行才是标题「欢迎使用微伴」——**标题跑到自己的元信息下面**，阅读顺序反了。这是 flex-wrap 没有做顺序控制的典型症状。
4. **数字格式有歧义**：`1,996.272`（千分位逗号 + 小数点混排），在 28px 的统计卡上第一眼会被读成「199 万」。建议整数展示（`1,996`）或明确分隔（`1,996.27 credits`）。
5. **落地页 6 张入口卡在移动端变成 6 个 130px 高的大块**，白占约 800px 滚动距离。移动端应退化为带右箭头的紧凑列表行。
6. **无底部 tab 栏**：对一个「在微信里用 AI」的产品，用户大概率在手机上打开工作台，仅靠 hamburger 收纳 9 个一级入口偏重。

---

## 四、交互与用户体验

**高**
1. **`/demo` 冷加载是空白页**（`main.tsx:96` 的 Suspense fallback 只有一行「正在加载工作台…」）。而它正是首页次 CTA「先看看工作台」的落点、全站唯一的 value-before-signup 路径。必须给骨架屏（侧边栏 + 统计卡 + 列表占位）。
2. **免费用户首屏先吃付费墙**（`dashboard.tsx:233`：`plan !== "plus"` 直接渲染 `history-locked`，真正的空状态只在 `:270` 的 plus 分支可达）。一个还没聊过天的用户，第一眼看到的是「升级 Plus」。
3. **全站无骨架屏**，只有 spinner；列表/统计页跳转会闪。

**中**
4. 表单校验只在提交时触发（`onBlur` 全站仅 `user-menu.tsx:101` 一处）。
5. 零 `aria-invalid`，错误只进表单顶部 `role="alert"`，未与字段关联（缺 `aria-describedby`）。
6. 触控目标偏小：`.button` 42px、`.button.small` 35px、`.icon-button` ≈34px（`styles.css:160/178/202`），均低于 44px。
7. 无 `env(safe-area-inset-*)`，且 `.modal` 卡 `max-height: 90vh`（`styles.css:1318`）→ iPhone 底部按钮易被 home indicator 遮住。
8. 首屏两个同权重绿色按钮竞争（nav「免费开始」vs hero「连接我的大模型」），主次要拉开；末屏按钮只写「开始」(`public-pages.tsx:270`)，无信息量。

**做得好的（不建议动）**：billing 支付状态机（`billing.tsx:36-103`，pending → 轮询 10 次 → retry/cancelled）、6 处复制按钮均有 toast、获取上游模型有进度文案、「新手引导」可跳过且只对新账号触发、71 处 `aria-live`/`role`、Modal 用原生 `<dialog>` + `aria-labelledby`、表格组件键盘方向键/Home/End 齐全、全局 `prefers-reduced-motion`。

### 无障碍（如实结论）

- **对比度 12 组全部达标，无违规。** `--muted #59615c` on `#f6f7f6` = 5.94；`--green #08783e` on 白 = 5.58；`--on-lime #09170f` on `--lime #59f294` = 12.75；`--on-green-muted #b9c5be` on `--dark-surface` = 10.26（14 处用法的背景逐一核过，全是深色面）。
- **真正的硬伤只有一处**：`src/client/pages/admin.tsx:812` 的搜索框只有 `placeholder`，无 `<label>`、无 `aria-label`，且旁边的 `<Search size={17}/>` 未 `aria-hidden`。
- **风险项**：`--on-green-muted` 若被误用到白/绿底会掉到 1.78 / 3.13，建议改名 `--on-dark-muted` 防止未来误用。
- 键盘可达性：`focus-visible` 有 3px outline（`styles.css:70-74`），原生 dialog 自带焦点陷阱，未发现问题。

---

## 五、用户增长

1. **注册强制邮箱验证，是漏斗最大断点。** `src/server/auth.ts:107` `requireEmailVerification: true`，注册即跳 `/verify-email`。用户刚被 CTA 点燃就被推去开邮箱——国内邮箱到达率与垃圾箱会吃掉相当比例新注册。建议注册直接进工作台，把验证推迟到「首次配置模型 / 绑定微信」之前，或先给 5 条受限试聊。
2. **落地页不回答三个决定去留的问题。** `public-pages.tsx` 全文无用户数、无评价、无案例、无价格、无 FAQ。「要自备 API Key 吗 / 免费吗 / 安全吗」必须点到二级页，而 `/docs/faq` 也没回答「免费吗」。首屏下方加 3 条折叠 FAQ + 一条价格锚（「免费版每日 100 credits · Plus ¥9.9/月」）成本极低。
3. **产品实拍缺失。** 首页 hero 用的是插画式假聊天框（`public-pages.tsx:180`），而不是真实微信对话截图。这个产品的说服力全在「它真的长在微信里」，一张真实截图胜过三张插画。
4. **`/pricing` 是篇文章，不是定价页。** 4787px 长、正文 820px 宽、价格埋在 `src/shared/seo-content/pricing.ts` 的散文里；唯一的对比表 760px 宽、左对齐、**Plus 列只靠加粗区分，表内和表后都没有一个购买按钮**。建议：桌面双列方案卡（Plus 高亮 + 「立即升级」），表格只做补充对照；移动端表格改卡片。
5. **邀请闭环跑不通。** 双方各 500 credits，但奖励条件是好友「完成首次微信 AI 对话」——要求对方先配 API Key + 绑微信。受邀人绝大多数卡在配 Key，奖励基本发不出。建议奖励前置到「完成模型渠道配置」，首聊额外加码；并补微信场景的一键分享卡片。
6. **零站外回流。** 只有站内铃铛，无邮件/微信推送；每日 credits 重置没有唤醒钩子（「今日 100 credits 已到账」是天然的召回理由）。
7. **埋点几乎空缺（最系统性的问题）。** `src/shared/analytics.ts` 的 `UNTRACKED_PREFIXES` 直接把 `/app` 和 `/demo` 排除了，工作台与预览页零埋点；`design/analytics.md` 自陈付费转化未实现。注册四段、引导三步、渠道保存失败、微信连接、首条 message、`/pricing` → checkout 全部无事件——**上面所有关于流失的判断目前都无法被验证，也无法 A/B。**
   最小埋点集：`signup_submit / verify_sent / verify_done / onboarding_step(n) / onboarding_skip / channel_saved / channel_test_failed / wechat_connected / first_message / paywall_view / paywall_click / checkout_start / checkout_success / invite_share_click`

---

## 六、SEO

**抓取与索引层是健康的**：sitemap 35 条全部 200、无 JS 即有正文（最少 `/contact` 442 汉字）、私有路由 `X-Robots-Tag: noindex` 且不入 sitemap、`/x/` 与 `x.html` 均 301 归一、`lang="zh-CN"` 正确。

**需要修的：**

| 级别 | 问题 | 证据 |
|---|---|---|
| 高 | 静态资源零缓存，回访与 Googlebot 每次都重抓 | `/assets/index-ugg96ZnU.js` → `cache-control: public, max-age=0, must-revalidate`；修：`public/_headers` 给 `/assets/*` 加 `max-age=31536000, immutable` |
| 高 | 单包 831KB（br 265KB）全站共用，纯阅读页也下载整站 SPA，且包内含全部 16 篇文档 + 11 篇落地页正文 | `dist/client/assets/index-ugg96ZnU.js`；`src/shared/seo-content/*` 源码 202KB；`main.tsx:22,25` 只 lazy 了 2 个模块 |
| 高 | `www.wechatai.app` NXDOMAIN，外链与手输 www 全丢 | DoH 查询 Status 3 |
| 中 | 3 个开发者页缺 `BreadcrumbList`，且 title 品牌后缀异于全站（「… | Wechatai」vs「… | 微伴 Wechatai」） | `src/shared/seo.ts:249-260` |
| 中 | 同 3 页 sitemap 无 `lastmod` | `src/shared/seo.ts:411` |
| 中 | 无 Bing / IndexNow 通道，`/BingSiteAuth.xml` 404 | 只有 `index.html:7` 的 GSC 验证 |
| 中 | 结构化数据薄：Organization 无 `logo`/`sameAs`，SoftwareApplication 无 `offers`（¥9.9 明明写在页面上） | JSON-LD |
| 中 | title 超 60 全角宽 4 页 / description 过短 2 页、过长 2 页 | 见审计明细 |
| 低 | sitemap 也是 `max-age=0`、全站共用一张 OG 图、无 apple-touch-icon、首页 nav 无「价格」 | — |

**策略与实现的脱节（`design/seo-strategy.md`）**：周更 2 篇长尾的规划没有载体（内容硬编码在 TS 里，发稿＝改代码＋构建＋部署，无 `/blog`、无 RSS）；§6.3 的实体声明句在首页与 `/contact` 都没做；§8.2 要求 `/pricing` 接 `BILLING_OFFERS` 未做（价格写死在 `src/shared/seo-content/pricing.ts:6`，与 `billing.ts` 存在漂移风险）；§4 声称页脚覆盖 16 篇文档，实际 `site-footer.tsx:50` 只遍历 3 篇。

**关键词缺口**：「微信机器人 / 微信 AI 机器人 / chatgpt 接微信」无专页；无任何竞品对比页（`/vs/*` 不存在），而策略自己认定 clawbot.ai 是最大威胁；无 about/案例页，E-E-A-T 与 Organization 实体信号双缺。

---

## 七、行动优先级

### P0 — 一周内（影响转化或可读性，改动都不大）

1. `/demo` 加骨架屏，别再白屏（`main.tsx:96`）
2. 免费用户无会话时先渲染空状态引导，付费墙后置（`dashboard.tsx:233`）
3. `public/_headers` 给 `/assets/*` 加长缓存
4. `www` 加 CNAME + 301
5. 字号下限提到 12px（Latin eyebrow）/14px（中文正文），`:root` 回 16px
6. 营销站补移动端菜单（至少把「价格」「如何使用」放进抽屉）
7. 首屏下方加 3 条折叠 FAQ + 一条价格锚

### P1 — 一个月内（设计与系统）

8. 字体决策：自托管 DM Sans 并 preload，或从 font-family 删除
9. 抽唯一 `<SiteHeader>` + 统一容器宽度与左边缘
10. 统一 `h1-h3` 字距，` :lang(zh)` 归零
11. 卡片/可点面加明确 affordance（hover 边框转绿 + 箭头位移）
12. `/pricing` 改方案卡 + 卡内 CTA；移动端表格改卡片
13. 修通知条移动端 reflow 顺序、统计卡数字格式
14. 注册后不强制验证（或受限试聊），提高完成注册率
15. 补最小埋点集，先让漏斗可被观测

### P2 — 一个季度（结构）

16. 把 seo-content / guide-content 按路由 `import()` 切分，公共页不再下发整站 SPA
17. 建立内容载体（`/blog` 或 MDX 目录 + RSS + IndexNow），让「周更长尾」真正可执行
18. 真实微信对话截图替换插画；补 about / 案例 / 对比页
19. 邀请奖励门槛下调到「配好渠道」；补站外唤醒（每日 credits 到账提醒）
20. 移动端底部 tab 栏，工作台顶栏合并状态位

---

## 附：截图证据

- `01-home-hero.png` — 首页首屏（桌面）
- `02-home-cta-footer.png` — 首页末屏 CTA 与页脚
- `03-pricing-table.png` — 定价页对比表（Plus 列无 CTA）
- `04-workspace-mobile.png` — 工作台移动端（通知条 reflow、`1,996.272`）
- `05-docs-index.png` — 文档索引页（全站完成度最高的页面）
