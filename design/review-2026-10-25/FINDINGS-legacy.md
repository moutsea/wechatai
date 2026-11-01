# Legacy 审查：已提交改动集 `0de73ee..ce69cfa`

**一句话总结：0 条 P0、4 条 P1（1 条移动端横向滚动、2 条「容器统一」漏清横向内边距造成的错位、1 条限额升级出口接错错误码导致功能缺口）、8 条 P2；`tsc`/`oxlint`/`vitest`（60 文件）/`pnpm build`+预渲染+SEO 校验全绿，首屏 JS 没有变大。建议 P1-1 与 P1-4 修完再合，其余可随后续小提交处理。**

- 审查对象：`git diff 0de73ee..ce69cfa`（单提交 ce69cfa「feat: 完善站点体验与后台关键事件统计」，101 文件 +4628/−952）。
- **不含**工作区未提交改动（`auth-recovery.*`、`public-pages.tsx`、`styles.css`、`funnel*.ts` 等正被别人改，另一份 `FINDINGS-round3.md` 已覆盖）。因此本文件所有源码引用都是**提交版**（`git show ce69cfa:<path>`）。
- 每条结论都给 `文件:行号` 与依据。标「待确认」的给出确认方法。
- 布局结论不是读代码推断的：用 `git archive` 把两个提交各自导出到 `/tmp/wt-0de73ee`、`/tmp/wt-ce69cfa`，分别 `vite build`，再用静态服务器（5311 = ce69cfa，**5312 = 0de73ee 基线**）以 CDP 量 `getBoundingClientRect()` / `scrollWidth`，宽度取 1440/1024/768/390。两版对照是这些结论的关键证据。

---

## P0 — 真 bug：数据错误 / 白屏 / 支付异常

**无。** 重点怀疑的四处都实测/读码排除了（见文末「已核查通过」）：`pricing-plans.tsx` 结账流程、`api.ts` 错误解析、`dashboard.tsx` 分支顺序与 `data.stats.sessions` 的数据来源、`funnel-report.ts` 的 SQL 口径与时区边界。

---

## P1 — 明显问题：影响可用性或可见错位

### P1-1 `/docs` 在 ≤820px 出现横向滚动（2px 溢出），基线版本没有

**现象**：在 390px 宽度打开文档页，整页可以左右拖动（`scrollWidth` 大于视口），其它公开页都正常。

**文件:行号**
- `src/client/pages/docs.css:40-46`：`.docs-layout { width: var(--container-w); margin: 0 auto; ... }`（本次把 `max-width:1280px; padding: 0 36px` 换成了 `width: var(--container-w)` 并**删掉了横向 padding**）
- `src/client/pages/docs.css:553-556`：`@media (max-width:760px) { .docs-layout { display: block; } }` —— 基线里这里是 `display:block; padding: 0 22px`，padding 被删了
- `src/client/pages/docs.css:560-566`：`.docs-mobile-navigation { display:block; margin: 0 -22px; padding: 0 22px; ... }` —— **负边距出血还是按旧的 22px padding 校准的**
- `src/client/styles.css:35-37`、`:51-57`：`--container-w: min(var(--container), calc(100% - var(--gutter) * 2))`，`@media (max-width:820px){ :root { --gutter: 20px } }`

**依据（实测两版对照）**
| 构建 | 视口 | `scrollWidth` | 溢出元素 |
| --- | --- | --- | --- |
| ce69cfa | 390 | **392**（`clientWidth` 390） | `.docs-mobile-navigation` `right=392.0`、`width=394.0` |
| 0de73ee（基线） | 390 | 390 | 无 |
| 两版 | 768 | 768 / 768 | 无 |

算术对得上：容器宽 350（=390−2×20）起点 20；`margin: 0 -22px` 让该元素从 −2 起、宽 350+44=394 → 右边缘 392，正好溢出 2px。基线之所以不溢出，是因为父级 `padding: 0 22px` 与出血 22px 相互抵消。

**建议改法**：把出血量绑到 gutter，别写死 22px：
```css
/* src/client/pages/docs.css:563-564 */
margin-inline: calc(-1 * var(--gutter));
padding-inline: var(--gutter);
```
或退一步，在 `@media (max-width:760px)` 给 `.docs-layout` 恢复 `padding: 0 22px`。前一种更彻底（gutter 改到多少都不会再溢出）。

**如何验证**：`node /tmp/offender.mjs <url> 390`（我用的脚本）或浏览器 390px 下 `document.documentElement.scrollWidth === clientWidth`；改完再跑 768/390 两档。

---

### P1-2 ≤1000px 时页脚是「双重 gutter」：比页头多缩进 30px，且比自己的底栏多缩进 20px

**现象**：平板/手机宽度下，页脚内容明显比页头 logo 与正文更往中间挤；页脚上部的品牌/链接块与页脚底部的版权行左边缘也不一致（同一条页脚内部错位）。

**文件:行号**
- `src/client/styles.css:2921-2924`：`.landing-footer-main { width: var(--container-w); margin-inline: auto; padding: 64px 0 52px; }`（`--container-w` 内部已经减过一次 gutter）
- `src/client/styles.css:3368-3370`（`@media (max-width:1000px)`）：`.landing-footer { padding: 0 30px; }`
- `src/client/styles.css:3811-3813`（`@media (max-width:760px)`）：`.landing-footer { padding: 0 25px; }`
- `src/client/styles.css:2963-2966`：`.landing-footer-bottom { max-width: 1180px; margin: 0 auto; ... }`（底栏走的是另一套宽度口径，所以只有它没被多缩进）

**依据（实测，`/` 首页）**
| 元素 | 0de73ee @768 | ce69cfa @768 | 0de73ee @390 | ce69cfa @390 |
| --- | --- | --- | --- | --- |
| 页头 logo 文字 | L40 | L20 | L23 | L20 |
| hero `h1` | L40 | L20 | L27 | L47（见 P1-3） |
| `.landing-footer-main` 子元素 | L30 W708 | **L50 W668** | L25 W340 | **L45 W300** |
| `.landing-footer-bottom` | L30 W708 | L30 W708 | — | L25 W365 |

即：基线里页脚与页头只差 10px（既有小毛病），本次改成页头/正文 20 之后，页脚还是 50 → **差 30px**；而且页脚内部 `.landing-footer-main`(50) 与 `.landing-footer-bottom`(30) 之间新出现 20px 错位。1440px 下正常（页头与页脚都 L140 W1160），因为那时 `.landing-footer` 没有横向 padding。影响 `/`、`/pricing`、`/docs`、`/terms` 等所有用 `site-footer` 的公开页。

**建议改法**：删掉 `.landing-footer` 在 1000/760 两处的横向 padding（保留 `padding: 0`），让 `--container-w` 独立负责 gutter；同时把 `.landing-footer-bottom` 的 `max-width: 1180px` 换成 `width: var(--container-w); margin-inline: auto`（见 P2-1）。

**如何验证**：768/390 下比较 `.site-header-inner`、`.landing-footer-main`、`.landing-footer-bottom` 三者 `getBoundingClientRect().left` 是否相等。

---

### P1-3 首页 hero 在 ≤760px 遗留 27px 内边距，导致同页内 hero 文案比下方区块多缩进 27px

**现象**：390px 首页，标题/正文比页头 logo 和下方「价格」「常见问题」区块整体右移约 27px；1440/1024/768 都对齐。

**文件:行号**
- `src/client/styles.css:2539-2542`：`.landing-hero { width: var(--container-w); margin-inline: auto; padding: 48px 0 100px; }`（桌面端横向 padding 已经清成 0）
- `src/client/styles.css:3748-3750`（`@media (max-width:760px)`）：`.landing-hero { padding: 48px 27px 70px; }` —— **移动端覆盖里 27px 横向内边距没跟着清**
- 对照 `src/client/styles.css:5165-5168`（`.landing-pricing`）、`:5257-5260`（`.landing-faq`）都已是 `padding: … 0 …`

**依据（实测 390px）**：ce69cfa `.site-header-inner a` L20、`.landing-hero h1` **L47**、`.landing-pricing` L20；基线（`hero` 满宽 + `padding: 48px 40px` 体系）logo L23、`h1` L27，只差 4px。所以这是本次改动引入的 23px 新增错位。

**建议改法**：`@media (max-width:760px)` 里改成 `.landing-hero { padding: 48px 0 70px; }`（横向交给 `--container-w`）。

**如何验证**：390px 下比较 `.site-header-inner`、`.landing-hero h1`、`.landing-pricing` 的 `left`。

---

### P1-4 微信链接限额的「升级出口」接错错误码：客户端等的是 `wechat_link_limit`，服务端抛的是 `connection_limit`，而该入口按钮还是 disabled

**现象**：免费用户（限额 1 个微信链接）在 `/app/wechat` 想加第二个链接时，按钮直接是灰的、没有任何说明，也没有去 `/pricing` 的出口。本次改动声称给限额加了升级引导，这一档正好没接上。

**文件:行号**
- `src/client/api.ts:13`：`const LIMIT_CODES = new Set(["plugin_limit", "channel_limit", "wechat_link_limit"]);`
- `src/client/limit-hint.tsx:15`：`wechat_link_limit: "微信链接数量",`（label 也就成了死配置）
- 服务端真实抛的是 `src/server/personal-account.ts:1584-1591`：
  ```ts
  if (links.length >= this.limits().connections)
    throw new AppError("connection_limit", "Free 最多创建 1 个微信链接，升级 Plus 可创建最多 10 个链接", 403);
  ```
- `src/client/pages/wechat.tsx:32`：`const atLimit = data.connections.length >= data.limits.connections;`；`:77` `disabled={busy || atLimit}`（按钮直接禁用，用户看不到服务端那句「升级 Plus」）；`:51` `request("/wechat/links", ...)` 的 `catch`（`:60-63`）只有 `notify((e as Error).message, true)`，**没有 `limitErrorCode`、也没有渲染 `<LimitHint>`**
- `<LimitHint>` 只出现在 `src/client/pages/plugins.tsx:558`、`:620` 与 `src/client/pages/channels.tsx:590`、`:799`

**依据**：`grep -rn "wechat_link_limit" src/` 只有 `api.ts:13` 和 `limit-hint.tsx:15` 两处，服务端从未产生这个 code；`connection_limit` 也不在 `LIMIT_CODES` 里，所以即使把 catch 接上 `limitErrorCode(e)` 也拿不到值。双层断开。（`plugin_limit` / `channel_limit` 两条是真的：`personal-account.ts:923`、`:1386`/`:2594`/`:2613`，403。）

**建议改法**：① `LIMIT_CODES` 用服务端真实码 `connection_limit`（若想保留语义化名字，就在服务端改抛 `wechat_link_limit` 并同步 `tests`）；② `wechat.tsx` 的 create 分支接 `limitErrorCode` + 渲染 `<LimitHint>`；③ `atLimit` 时按钮不要静默 disabled，给一句「Free 最多 1 个微信链接，<Link to="/pricing">升级 Plus</Link> 可到 10 个」。

**如何验证**：`grep -rn "connection_limit\|wechat_link_limit" src/`；免费账号（或 `test/wechat-links.test.ts` 里构造的免费 plan）建第二个链接看 UI 是否出现升级出口。

---

## P2 — 打磨 / 无功能影响

### P2-1 `.landing-footer-bottom` 用 `max-width: 1180px` 而不是容器变量，分割线比正文宽 20px

`src/client/styles.css:2963-2966`。实测 1440px：底栏 L130 R1310 W1180，而页头/正文/页脚上部都是 L140 R1300 W1160；1024px 更明显：底栏 L0 R1024（满宽），其它 28/968 —— 分割线直接顶到屏幕两边。改法与 P1-2 一并处理：`width: var(--container-w); margin-inline: auto`。

### P2-2 价格有 4 处来源，其中 `/pricing` 正文与 FAQ 结构化数据是硬编码，且同页出现 `¥7.3` 与 `¥7.33` 两个「折合月价」

- 单一事实源：`src/shared/billing-offers.ts`（plus_monthly 990、plus_yearly 8800、credits 990/2900/5900）。
- 有测试兜底的：`src/shared/pricing-copy.ts:11-12`（9.9/88，`test/seo.test.ts:352-359` 断言与 `BILLING_OFFERS` 相等）、`src/shared/landing-faq.ts:12`。
- **没有**测试兜底的：`src/shared/seo-content/pricing.ts:36`（`¥9.9 / 月`、`¥88 / 年`、`约 ¥7.3/月`）、`:47`（`¥9.9 / 5000、¥29 / 20000、¥59 / 50000`）、`:122`、`:127`（这两条进 FAQPage JSON-LD）。
- 同页两个数字：方案卡 `src/client/pages/pricing-plans.tsx:36,124-125` 计算 `perMonth = 8800/12/100 = 7.3333` 并 `yuan(perMonth*100)` → **`折合 ¥7.33 / 月`**；正文/prose 写 **`约 ¥7.3/月`**。

实测 `dist/client/pricing.html`：`¥7.33`×1、`¥7.3`×3、`¥9.9`×17、`¥88`×9、`¥29`×3、`¥59`×3 —— 数字都对，只是 credits 包与「折合月价」没人守。建议把 credits 包价格也挪进常量并在 `test/seo.test.ts` 加一条「pricing 正文里的 credits 价格 === BILLING_OFFERS」的断言；`¥7.3`/`¥7.33` 统一一种取整。

### P2-3 `pricing-copy.ts` 注释里的技术理由与事实不符（会误导后来人）

`src/shared/pricing-copy.ts:4-9` 写「一旦 import 价格清单，构建器就会把账单页那套模块合并成一个几十 KB 的共享 chunk 并预加载到每一个页面」，`test/seo.test.ts:352-354` 的用例名与注释也复述了这个理由。**实测不成立**：

- `src/shared/seo.ts:12` `import { BILLING_OFFERS } from "./billing"` → 客户端 `src/client/seo.tsx:3` 引入 `getPageSeo` → 构建产物 `dist/client/index.html` 里本来就有 `<link rel="modulepreload" href="/assets/billing-offers-CAQvGyiF.js">`（240.41 kB / gzip 76.84 kB），里面 grep 得到 `plus_monthly`。
- 也就是说「改成字面量」并没有把账单模块移出首屏，改与不改的首屏集合相同。字面量本身无害（且被测试守住），建议把注释改成真实理由（「不想让文案层依赖账单模型」），否则下一个人会拿它当优化依据。

### P2-4 测试与日期：一条断言把死码固化、一条只钉日期形状、两处 `lastmod` 落后

- `test/limit-hint.test.tsx:26-27` 断言 `render("wechat_link_limit")` 含「10 个微信链接」——这个 code 服务端永远不抛（见 P1-4），测试通过只说明组件能渲染，反而让人以为微信链接限额已有升级出口。建议改断言为真实 code（`connection_limit`）。
- `test/seo.test.ts:84-92`：把原来的 `expect(pageLastModified("/developers/plugins")).toBeUndefined()` 换成只断言 `^\d{4}-\d{2}-\d{2}$` + sitemap 含该值 → 日期漂移不再有任何兜底（改动本身有道理，但等于放弃了「开发者页有维护日期」这个不变量；建议改为断言 `>= 内容里声明的 updatedAt`）。
- `src/shared/docs.ts:1` `DOCS_UPDATED_AT = "2026-10-24"` 未随本次 4 篇 docs 的 `seoTitle/description` 修改一起 bump（getting-started / channels-models / credits / notifications）。
- `src/shared/site-info.ts:31-37`：`/contact` 的 description 本次被改写（`:24`），但 `INFO_PAGE_UPDATED_AT.contact` 仍是 `TERMS_UPDATED_AT = "2026-10-10"`，且 `:34` 的注释「联系页正文在这次改访问统计时没有改动」已经失真。实测 `dist/client/sitemap.xml`：`<loc>…/contact</loc><lastmod>2026-10-10`。

### P2-5 `/developers/plugins` 的页头 `active` 传了 `/docs`，`aria-current="page"` 指错

`src/client/pages/plugin-protocol.tsx:76` `<SiteHeader active="/docs" />`，而该页真实路径是 `/developers/plugins`（`openclaw-guide.tsx:12` 同族页面都没传 active）。结果是读屏软件被告知「当前在 /docs」，同时「文档」链接被高亮。建议不传，或扩展 `NAV.match` 支持前缀数组。附带：移动端抽屉里的 `<nav>` 与桌面 `<nav aria-label="顶部导航">` 同名，抽屉那份没加 `aria-label`，两个同名导航会让读屏难以区分（`src/client/site-header.tsx`）。

### P2-6 Plus 用户的「最近的对话」在请求失败/未返回时是一块空白面板（基线有兜底）

`src/client/pages/dashboard.tsx:33-35` 只在 `data?.plan === "plus"` 时取 `/sessions` 且 `.catch(() => {})`；`:273-274` 现在是 `sessions.slice(0, 4).map(...)`，**基线的 `sessions.length ? … : <Empty …/>` 兜底被删掉了**（`git diff` 里 `-  ) : sessions.length ? (` → `+  ) : (`）。于是：Plus 用户首帧/请求失败时 `.panel.recent-panel` 内什么都没有，也没有错误提示。建议保留 `sessions.length ? … : <Empty title="还没有对话记录" …/>`。分支顺序本身（空状态 → 付费墙 → 列表，用 `data.stats.sessions`）是对的：该值来自 `src/shared/types.ts:136` 与 `src/server/personal-account.ts:2152-2156`（`sessions: sessions.length`），免费/Plus 都恒有值。

### P2-7 5 篇营销页正文直接链到需要登录的 `/app/channels`（待确认是否故意）

`src/shared/seo-content/wechat-gpt.ts:58`（及 `wechat-claude.ts`、`wechat-deepseek.ts`、`wechat-ai-partner.ts`、`bring-your-own-api-key.ts`）在「添加渠道」步骤里写 `打开[渠道与模型](/app/channels)`。匿名读者点进去会被登录门挡下；`scripts/verify-seo.mjs` 的链接校验只覆盖公开页集合，所以检查是绿的。若希望匿名读者也能看懂，指向 `/docs/channels-models` 更稳；若故意要引导注册，建议在句子里写明「登录后」。**待确认**：产品意图（问一句即可）。

### P2-8 `pricing-plans.tsx` 用非空断言取档位，缺档会在模块求值期抛错

`src/client/pages/pricing-plans.tsx:13-14`：`BILLING_OFFERS.find((o) => o.id === "plus_monthly")!` / `"plus_yearly")!`。若以后改名/删除档位，页面在 import 阶段就抛 `TypeError`（首屏白屏），而不是渲染降级。好在 `test/seo.test.ts:352-359` 现在会先失败；建议改成显式查找 + `throw new Error("missing offer plus_monthly")` 或渲染兜底，让失败信息可读。

---

## 已核查通过、不构成缺陷的部分（避免下一轮重复审）

- **`pricing-plans.tsx` 结账流程**：未登录不渲染结账按钮（`src/client/pages/pricing-plans.tsx:145-164` 渲染 `<Link to="/register">免费开始，再升级`）；年/月切换只改 `useState`；`offerId` 用的都是 `BILLING_OFFERS` 里真实存在的 id；`disabled={busy}` 挡住重复点击（`:146`）；跳转用服务端返回的 `url`（`src/server/billing.ts:267-279`，无 url 时抛 `checkout_failed` 502）；错误显示在 `role="alert"` 里。埋点 `checkout_start` 在请求前发（`pricing-plans.tsx:41`）。
- **`api.ts` 错误解析**：`src/server/index.ts:827-832` 的 `app.onError` 序列化 `{ error: code, message }`，所以 `typeof data.error === "string"` 成立，`limitErrorCode` 能命中 `plugin_limit`/`channel_limit`。`api()` 无条件 `await r.json()`（204/非 JSON 会抛 `SyntaxError`）是**本次之前就有**的行为，不算回归（`/api/analytics/event` 返回 204 但客户端不走 `api()`）。
- **漏斗 SQL 口径**：`src/shared/funnel-report.ts` + `src/server/analytics.ts` 的 `getFunnelSummary`：`day BETWEEN ? AND ?`，`to = shanghaiDay(now)`、`from = shanghaiDaysAgo(window - 1)` → 含今天、天数正确；`COUNT(DISTINCT day || ':' || visitor_hash)` 与 UI 文案「非跨天独立人数」一致；`days` 被 `Math.min(Math.max(…, 1), 90)` 夹住；空表返回 0 且 UI 走「该时间范围内还没有关键事件」。`migrations/0016_funnel_events.sql` 的 `path TEXT NOT NULL DEFAULT ''` + 插入永远绑定 `normalizePath(...)` → 不存在 `LOWER(NULL)` 把事件过滤掉的问题。16 个 `FUNNEL_EVENTS` 与 16 个 `trackFunnel(...)` 调用名**一一对应**，无拼写漂移；`allowsFunnelEvent` 只排除 `/demo`，`/app` 内事件能正常入库。
- **`site-header.tsx`**：`isPending` 时不渲染账户区（避免首帧闪烁）；移动端抽屉关闭态 `display:none`（`styles.css:2473`）不可聚焦；Escape 关闭、路由/锚点变化自动收起；`aria-expanded`/`aria-controls` 齐备；≤820px 隐藏桌面 nav 但保留已登录用户的账户菜单。`/#how` 锚点滚动可用（`main.tsx` 的 `ScrollReset` 已处理 hash → `scrollIntoView`）。
- **首屏体积没有回归**（两版构建对照，`gzip` 实测）：基线单 chunk 831.46 kB / **270.83 kB gzip**、无 `modulepreload`；ce69cfa `index` 545.69 kB / 183.02 kB + 预加载 `billing-offers` 240.41 kB / 76.84 kB + 3 个图标 chunk ≈ **260.4 kB gzip**。zod 确实出了首屏：`analytics-schema.ts` 只被 `src/server/analytics.ts:18`、`src/server/auth.ts:14` 引用，客户端对 `shared/funnel` 只有 `import type`（`src/client/analytics-client.ts:2`），构建产物 index chunk 内 `zod` 符号数为 0（只剩懒加载的 plugins chunk）。
- **`related` 内链**：17 个 seo-content 页共 96 条 `related`，全部命中 seo 页 / docs slug / 静态路由，无自指、无死链；正文 markdown 内链 27 个不同 href、58 处，只有 P2-7 那 5 处 `/app/*`。
- **价格三处（Plus）一致**：`BILLING_OFFERS` 990/8800 → 方案卡 `¥9.9`/`¥88`、FAQ 文案 `¥9.9`/`¥88`、JSON-LD offers `9.9`/`88`；实测 `dist/client/pricing.html` 与结构化数据都能对上。
- **`public/_headers`**：新增 `/assets/*: public, max-age=31536000, immutable`，`dist/client/assets/*` 全是带 hash 文件名 → 安全；`/sitemap.xml: max-age=3600` 合理。
- **12px 字号下限没有撑破布局**：脚本扫描 ce69cfa `styles.css`，同时含固定 px `height` 与 px `font-size` 的规则只剩 5 条（`.onboarding-strip > a > span` 12/24、`.avatar` 与 `.message-avatar` 12/31、`.guide-step > span` 13/34、`.illustration-input-field` 12/35），headroom 均 ≥12px；提交版已无 6–11px `font-size`。
- **容器统一的主干到位**：1440/1024/768 三档、`/`、`/pricing`、`/docs`、`/terms` 四页实测，`.site-header-inner`、`.landing-hero`、`.landing-pricing`、`.landing-faq`、`.seopage main`、`.docs-layout`、`.info-main` 左边缘全部一致（1440 全 L140 W1160）；除 P1-1 的 `/docs` 390px 外**没有**横向滚动。

---

## 实际跑过的验证命令与输出摘要

在仓库内（只读）与 `/tmp/wt-ce69cfa`（提交树导出，`node_modules` 软链仓库）执行：

1. `npx tsc --noEmit`（在 `/tmp/wt-ce69cfa`）→ **exit 0，无输出**。
2. `npx oxlint src test`（同上）→ `Found 0 warnings and 0 errors. Finished in 77ms on 264 files with 96 rules`。
3. `npx vitest run`（仓库）→ 60 个服务端测试文件全部通过（含新增 `test/limit-hint.test.tsx` 3、`test/admin-analytics-ui.test.tsx` 6、`test/analytics.test.ts` 44、`test/seo.test.ts` 28）；`pnpm test:client` → 4 文件 37 测试通过。
4. `pnpm build`（仓库）→ `Prerendered 40 public pages, private route shells and a 404 page.` + `SEO checks passed: rendered pages, metadata, indexing boundaries and social image.`（exit 0）。
5. 两版构建对照（`/tmp/wt-0de73ee`、`/tmp/wt-ce69cfa`，`vite build`）→ base `index-ugg96ZnU.js 831.46 kB / gzip 270.83 kB`、无 preload；ce69cfa `index-f3l4ko9y.js 545.69 kB / gzip 183.02 kB` + preload `billing-offers-CAQvGyiF.js 240.41 kB / gzip 76.84 kB`。
6. CDP 布局测量（5311=ce69cfa、5312=0de73ee）→ 关键数字已写在 P1-1/P1-2/P1-3 的表格里；`/docs@390` ce69cfa `scrollW=392/clientW=390`，基线 `390/390`。
7. `node /tmp/seo-check.mjs`、`node /tmp/link-check.mjs` → `related issues: 0`、正文内链 `unresolved: 5`（全是 `/app/channels`）。

**说明**：我没有改仓库任何源码，只写了本文件；`dist/` 由上面的 `pnpm build` 生成。5199 的 dev server 反映的是工作区（含别人未提交的改动），所以布局结论我用的是两个提交各自构建出来的产物，没有用 5199 截图。
