# 第四轮 review — 新发现（FINDINGS-round4）

审查对象：工作区未提交改动（14 M + 新增 `test/funnel-entry.test.ts` + `design/`），HEAD = `ce69cfa`。
审查人：round4-auditor（只读）。本文件是本次唯一写入的文件。

## 方法与基线

- 自己起 dev server：`pnpm dev --port 5211`；全部请求 `curl --noproxy '*'`（本机 `HTTP_PROXY` 会把 `/` 换成别的站）。
- 量测：`node ~/Documents/dsh/tools/browser-safe/shoot.mjs` + 自写 CDP 探针（`Runtime.evaluate` / `Accessibility.getFullAXTree`），7 个宽度 `[320, 375, 414, 768, 1024, 1280, 1440]` × 5 个页面 `/`、`/docs`、`/pricing`、`/verify-email`、`/no-such-page-xyz`。
- **基线说明**：审查过程中 `src/client/styles.css` 与 `src/client/pages/wechat.tsx` 被并发修改过（mtime 19:52，其余 12 个 M 文件为 17:01）。本文所有结论与数字均取自 19:52 之后的状态；其中 `.hero-note` 的分隔符已是 `::after` 版本（非 `::before`），`wechat.tsx` 成功路径已加 `setLimitCode(undefined)`——后者原本是缺陷，现已修好，本文不再报告。
- 已读 `FINDINGS-round3.md`、`FINDINGS-legacy.md`、`IMPLEMENTATION.md` 第四轮章节，**已记录条目一律不重复**；下面标注「只修了一半」的条目属于「第四轮宣称已修但实测未生效」，按任务要求专门列出并给证据。

---

## P0

本轮未发现 P0。全站 7×5 组合实测 `documentElement.scrollWidth === innerWidth`，无横向滚动，无白屏/报错。

---

## P1

### P1-1 移动端 `.hero-note` 整块左对齐，「第四轮 P1-2 只修了一半」

**现象**
≤760px 时首页 `.landing-copy` 的 H1、副标题都是居中（`textAlign: center`），但三句微文案整块贴在左边，视觉上从居中排版突然断到左对齐。320px 下第三句「聊天记录可随时删除」单独占第二行、从最左边起排。

**实测（CDP，`/`，mobile）**

| 宽度 | `.landing-copy` / `h1` / 副标题 textAlign | `.hero-note` justifyContent | 实际行首 left | 若居中应为 |
|---|---|---|---|---|
| 320 | center / center / center | **flex-start** | 20（第 2 行也是 20） | 61.5 / 101.5 |
| 375 | center / center / center | **flex-start** | 20 | 26.4 |
| 414 | center / center / center | **flex-start** | 20 | 45.9 |

（`.hero-note` 盒在 320 为 `[20, 300]`；三句 span 矩形：span0 `[20, 158.3]`、span1 `[166.3, 217.1]`、span2 `[20, 137]`。）

**根因**
第四轮新增的 `.landing-copy > p.hero-note { justify-content: flex-start }`（`src/client/styles.css:2585`，特异性 0,2,1）压过了 ≤760 块的 `.hero-note { justify-content: center }`（`src/client/styles.css:3811-3814`，特异性 0,1,0）。同处的 `.hero-note { text-align: center }` 对 flex 容器不生效——子项是 flex item，`text-align` 管不到。

即：第四轮为了压过 `.landing-copy > p`（0,1,1）而把选择器提到 0,2,1，顺手把 `justify-content: flex-start` 也一起提权了，反而把自己写的移动端居中规则压掉。

**建议改法**
1. 删掉 `src/client/styles.css:2585` 的 `justify-content: flex-start`（flex 默认就是 flex-start，无需声明）；或
2. 把 ≤760 的规则改成 `.landing-copy > p.hero-note { justify-content: center }` 保持同权后置。
3. 顺手删掉 `src/client/styles.css:3813` 的 `text-align: center`（对 flex 容器无效，是死规则）。

**如何验证**
320/375/414 下 `getComputedStyle(document.querySelector('.hero-note')).justifyContent === "center"`，且每行起排位置 == `note.left + (note.width - lineWidth) / 2`。

---

### P1-2 Plus 用户撞到 10 条上限时，按钮静默 disabled，页面上没有任何解释

**现象**
`/app/wechat` 的「新建链接」按钮在 `atLimit` 时 `disabled`，但两块 `<LimitHint>` 都以 `data.plan === "free"` 为前提。Plus 用户已经有 10 条链接时：按钮点不动、页面上一个字都不说。这恰好是付费用户最可能撞到的状态。

更矛盾的是紧邻的注释本身描述的是相反行为：

```
src/client/pages/wechat.tsx:93  {/* Plus 用户撞到 10 条上限时，升级出口没有意义，只提示删掉不用的链接。 */}
src/client/pages/wechat.tsx:94  {atLimit && data.plan === "free" && <LimitHint code="connection_limit" />}
src/client/pages/wechat.tsx:95  {limitCode && data.plan === "free" && <LimitHint code={limitCode} />}
src/client/pages/wechat.tsx:82  disabled={busy || atLimit}
```

注释说「只提示删掉不用的链接」，代码是「什么都不渲染」。

**依据**：`src/client/pages/wechat.tsx:82`、`:93-95`；`src/client/limit-hint.tsx:12-17`（`LIMIT_LABELS` 只有 channel/plugin/connection 三个键，且文案全是「升级到 Plus」口径，没有 Plus 自身的口径）、`:29`（`if (!label) return null`）。

**建议改法**
给 `LimitHint` 加一个 `plan` 或 `variant` 属性：`plan === "plus"` 时渲染「已达 Plus 上限（10 个微信链接）。删除不用的链接即可继续添加」，不显示 `<Link to="/pricing">`。渲染条件从 `data.plan === "free"` 收窄为只对 connection_limit 的「升级出口」部分生效，提示本身对两种 plan 都要出。

**如何验证**
构造 plus 账户 + 10 条 `wechat_links`，进 `/app/wechat`：按钮 `disabled` 为 true 且页面上存在可达文案（当前为 0 条）。

---

### P1-3 `hero_cta_click` 的 demo 次按钮仍不带 `auth`；新测试还把不存在的行为写成了契约

**现象**
第三轮 P1-4 的修法是「给 `hero_cta_click` 加 `auth: in|out`」，但只加在主按钮上：

```
src/client/public-pages.tsx:136  trackFunnel("hero_cta_click", { cta: "primary", auth: session ? "in" : "out" })
src/client/public-pages.tsx:145  onClick={() => trackFunnel("hero_cta_click", { cta: "demo" })}
```

全仓 `hero_cta_click` 只有这两处（`src/shared/funnel.ts:48`、`src/shared/funnel-report.ts:32` 是定义与标签）。已登录用户点「不注册，先点开看看」时，漏斗数据里仍然是**无身份**的点击——正是 P1-4 要消掉的那一半。

更麻烦的是新测试把这个缺口盖住了：

```
test/funnel-entry.test.ts:18  ["hero_cta_click", { cta: "demo", auth: "in" }, "/"],
```

这条只证明 `funnelEventPayloadSchema` **接受**这个载荷，而真实代码从不发送它。读测试的人会得出「demo 也带 auth 了」的错误结论。

**依据**：`src/client/public-pages.tsx:136`、`:145`；`test/funnel-entry.test.ts:17-18`；`src/shared/funnel.ts:48`、`:57`。

**建议改法**
1. `public-pages.tsx:145` 补 `auth: session ? "in" : "out"`（`session` 在该组件作用域内已可用，136 行就在用）。
2. 测试不要手写字面量：把载荷抽到 `src/shared/funnel-payloads.ts`（或导出构造函数），测试断言真实构造函数产出的对象；至少把 demo 那条改成 `{ cta: "demo", auth: "out" }` 之外，再加一条「主/次按钮都会带 auth」的结构性断言。

**如何验证**
首页点击次按钮，Network 面板看 `POST /api/funnel` 的 `props` 是否含 `auth`；或 `grep -n 'cta: "demo"' src/` 确认改动落地。

---

## P2

### P2-1 分隔符「·」对比度 1.29:1（几乎不可见），且伪元素内容会被读屏读出

**现象**
三句之间的「·」用 `color: var(--line)`，即 `#dfe4e0`。在白色卡片上实测算得对比度 **1.29:1**（`L(#dfe4e0) = 0.7656`，`(1.0+0.05)/(0.7656+0.05)`），远低于 WCAG 1.4.11 非文本 3:1。截图 `/tmp/r4/cta-note-320.png` 里两个点基本看不见，三个短语在视觉上仍是一整句——把「100 credits / 不绑卡 / 可随时删除」做成可扫读列表的目的没达到。

**依据**：`src/client/styles.css:2597-2602`（`content: "·"; margin-left: 8px; color: var(--line)`）、`src/client/styles.css:22`（`--line: #dfe4e0`）、`:42`（`--line-strong: #b8c8be`）。实测计算样式：`content: "·"`、`color: rgb(223, 228, 224)`、`width: 3.80px`、`margin-left: 8px`。

**可访问性**：CDP `Accessibility.getFullAXTree`（1440px）在 hero-note 段落内返回两条 `name="·"` 的 **StaticText** 节点——伪元素生成的内容进了可访问性树，屏幕阅读器会读到（`aria-hidden` 对伪元素无效，这一点任务书里的怀疑是成立的）。

**建议改法**
1. 颜色改 `var(--line-strong)`（#b8c8be，on #fff 约 1.9:1，仍偏低）或干脆 `var(--muted)`（#59615c，约 7:1）取 `opacity: .55` 之类；目标是 ≥3:1。
2. 换成真实元素而不是伪元素：`<span aria-hidden="true">·</span>`，A11y 与样式都可控；或者去掉分隔符，靠 `gap: 0 10px` + 视觉分组。
3. 若保留伪元素，至少把「·」从可访问性树里摘掉（伪元素做不到，只能用 1 的方案）。

**如何验证**
计算 `color` 与背景的对比度 ≥3:1；`Accessibility.getFullAXTree` 结果中 `name === "·"` 的节点应为 0 条。

---

### P2-2 `/app/wechat` 两处 `<LimitHint>` 可同时渲染，出现两份完全相同的提示

**现象**
`wechat.tsx:94` 条件是 `atLimit && plan === "free"`，`:95` 是 `limitCode && plan === "free"`，两者不是互斥关系。多标签页场景就能同时为真：

1. 标签 A 还显示 0 条链接（`atLimit === false`，按钮可点）；
2. 标签 B 已经占满 Free 的 1 条；
3. 标签 A 点「新建」→ 服务端 409 `connection_limit` → `catch` 里 `setLimitCode("connection_limit")` + `await refresh()`（`wechat.tsx:66`）；
4. `refresh()` 后 `connections.length === 1` → `atLimit` 变 true（`:35`）；
5. 两块 `<LimitHint code="connection_limit">` 同时渲染——同一段文案、同一组「查看方案 / 先单独买 credits」按钮，重复两遍。

**依据**：`src/client/pages/wechat.tsx:35`、`:66`、`:94-95`。

**建议改法**
合成单块：`<LimitHint code={limitCode ?? (atLimit ? "connection_limit" : undefined)} />`；或给 `:95` 补 `!atLimit`。

**如何验证**
两个标签页复现；或用 DevTools 覆写 `fetch`，让 `POST /connections` 返回 `{ code: "connection_limit" }`，观察页面出现几块 `.limit-hint`（`styles.css:1460`）。

---

### P2-3 dashboard 新增空态在 `/sessions` 请求在飞时显示错话，请求失败则永久错话

**现象**
`sessions` 初值是 `[]`，只在 plus 时请求，且 `.catch(() => {})` 静默吞错。渲染分支里 `!sessions.length` 直接给出「还没有可回看的对话 / 在微信里发一条消息，这里就会出现记录。」：

```
src/client/pages/dashboard.tsx:26  const [sessions, setSessions] = useState<ChatSession[]>([]);
src/client/pages/dashboard.tsx:27-31  ... request("/sessions").then(setSessions).catch(() => {});
src/client/pages/dashboard.tsx:273  !sessions.length ? <Empty title="还没有可回看的对话" .../>
```

对一个**有几十条对话**的 Plus 用户，首帧必然走这条分支 → 先看到「还没有可回看的对话」，请求回来后再闪成列表。如果请求失败（网络抖动、后端 500），这句错话会一直挂着，而用户没有任何办法知道是加载失败。

**依据**：`src/client/pages/dashboard.tsx:26`、`:27-31`、`:242`、`:255`、`:273`。

**建议改法**
加 `const [sessionsLoaded, setSessionsLoaded] = useState(false)`，在 `.finally(() => setSessionsLoaded(true))`；空态条件改成 `sessionsLoaded && !sessions.length`，未加载时渲染骨架或什么都不渲染（legacy P2-6 记录的就是「空白面板」，说明纯空白是可接受的现状）；失败时单独渲染「记录加载失败，点击重试」。

**如何验证**
DevTools Network 把 `/sessions` 限速到 Slow 3G 或用 `setTimeout` 注入延迟，刷新 `/app` 观察首帧文案；再把该请求 block 掉，确认错话不会永久停留。

---

### P2-4 `test/funnel-entry.test.ts` 有一条恒真断言，测不到任何东西

**现象**

```
test/funnel-entry.test.ts:46-49
const known = new Set<string>(FUNNEL_EVENTS);
for (const { name } of [...FUNNEL_STEPS, ...FUNNEL_SIDE_EVENTS])
  expect(known.has(name)).toBe(true);
```

`FUNNEL_STEPS` / `FUNNEL_SIDE_EVENTS` 的元素类型是 `readonly { name: FunnelEvent; label: string }[]`（`src/shared/funnel-report.ts:12`、`:29`），`FunnelEvent` 就是 `typeof FUNNEL_EVENTS[number]`——名字写错在 `tsc` 阶段就报错，根本跑不到这里。这条测试**不可能失败**，属于 P2-4 想要覆盖「新埋点无测试」却写成了装饰。

顺带：`test/funnel-entry.test.ts:51-54`（主/辅清单不重叠）与 `:56-60`（四个入口事件在辅助清单里）是真断言，`it.each` 载荷那组除 P1-3 提到的假载荷外是真断言，`funnel-policy` 那组也是。与 `test/seo.test.ts`、`test/limit-hint.test.tsx` 无重叠、无冲突（`limit-hint.test.tsx` 测的是 `LIMIT_LABELS` 文案与出口链接，`seo.test.ts` 测价格字面量）。

**建议改法**
反过来断言才有价值：`for (const e of FUNNEL_EVENTS) expect(steps.has(e) || side.has(e)).toBe(true)`——这条在「往 `FUNNEL_EVENTS` 加了事件却忘了加进报表」时才会红，而那正是真实会犯的错。

**如何验证**
从 `FUNNEL_SIDE_EVENTS` 里临时删掉一条（比如 `demo_view`）：`tsc` 仍然通过、现有测试仍然全绿；换成上述反向断言后立刻变红。即可证明现有断言零价值。

---

### P2-5 `verify_sent` 与 `verify_send` 两个事件名只差一个字母，后台相邻展示

**现象**

```
src/shared/funnel-report.ts:14  { name: "verify_sent", label: "验证邮件发出" }
src/shared/funnel-report.ts:35  { name: "verify_send", label: "发送验证信" }
```

前者由注册流程自动发信时触发（`public-pages.tsx:533` 一带），后者由验证页手动发/重发触发（`auth-recovery.tsx:96`）。两个名字差一个字母、两个 label 语义几乎重合，在漏斗报表里相邻展示（主步骤 vs 辅助事件），读数据时极易把「自动发出」和「用户手动重发」加在一起算。第三轮 P2-3 把 `verify_resend` 改成 `verify_send` 时引入了这个近名对。

**依据**：`src/shared/funnel-report.ts:14`、`:35`；`src/shared/funnel.ts:57`；`src/client/pages/auth-recovery.tsx:96`；`src/client/public-pages.tsx:533`。

**建议改法**
改成不会被看混的名字，例如 `verify_mail_auto_sent` / `verify_mail_manual_send`，或合并成一个事件用 `props.first` + `props.trigger: "auto"|"manual"` 区分。改名同时更新 `funnel-report.ts` 两处、`auth-recovery.tsx:96`、`test/funnel-entry.test.ts` 的引用。

**如何验证**
打开 `/admin` 的漏斗报表，两栏标题并排时是否一眼能区分；`grep -rn "verify_sent\|verify_send" src/` 确认引用全部同步。

---

### P2-6 折合月价的精度只统一到了 `/pricing`，billing 页仍写「约 ¥7.33 / 月」

**现象**
第四轮回归-6 新增 `approx()`（`src/client/pages/pricing-plans.tsx:20`，保留一位小数），`/pricing` 输出「折合 ¥7.3 / 月」「比按月付省 ¥30.80」。但同一数字在 billing 页还是两位小数：

```
src/client/pages/billing.tsx:341  {interval === "year" ? "约 ¥7.33 / 月，按年付费" : "按月付费"}
```

`src/shared/seo-content/pricing.ts:36`、`:122` 写的是「约 ¥7.3/月」。于是站内同时存在 `¥7.33` 与 `¥7.3` 两种写法（legacy P2-2 记录的就是这个，第四轮只修了其中一处）。

**核算**：`plus_yearly.amount = 8800` 分 → `8800/12/100 = 7.3333`，一位小数是 `¥7.3`；`12 × 7.3 = 87.6 ≠ 88`，属一位小数舍入的可接受误差，不算错账。`yearlySaving = (990×12 − 8800)/100 = 30.8` 正确。

**建议改法**
把折合月价抽成共享函数（如 `src/shared/price-format.ts` 导出 `approxMonthly(amountCents)`），`billing.tsx:341`、`pricing-plans.tsx`、`seo-content/pricing.ts` 三处统一调用，避免下一轮再漂。

**如何验证**
`grep -rn "7\.33" src/` 应为 0 命中。

---

## 未验证（需另行确认，不计入上面的分级）

1. **真实读屏软件对「·」的朗读**：只证明了它进了 Chrome 的可访问性树（两条 `name="·"` 的 StaticText），未在 VoiceOver / NVDA 上实听。验证方式：用 `Accessibility.getFullAXTree` 已可复现暴露；实听需在有声环境手动验证。
2. **真机 `@media (pointer: coarse)` 下的触控目标**：CDP 的 `mobile: true` 只改视口与 UA，不产生 `pointer: coarse`。首页按钮实测 `height: 52px`（≥44），但其它 `:hover`/`pointer` 分支未在真机核对。
3. **Safari 对 `.landing { overflow-x: clip }` 的裁剪**：只在 Chromium 验证了 `orbit` 装饰元素被裁剪（无横向滚动）；Safari 的 clip 行为未测。验证方式：Safari 打开 320px 宽首页看是否出现横向滚动条。
4. **`/pricing` 对照表在触摸设备上的可滚动提示**：320px 下宿主容器 `overflow-x: auto`（ow 280 / sw 520）可滚，且有 `tabIndex=0 role="region" aria-label="对照表"` 键盘可达；但没有视觉滚动提示（渐变/阴影），触摸用户是否知道能滑未验证。

## 本轮已核对通过 / 不重复报告

- 7 宽度 × 5 页面**无横向滚动**（`scrollWidth === innerWidth`，含 `/docs` 320/375）；`docs.css:563-565` 的 `calc(-1 * var(--gutter))` 在 ≤820 下 `--gutter` 解析为 20px（`styles.css:55`），出血量正确；全仓 `-22px`/`-20px`/`-24px` 在 `src/client/**/*.css` 零命中。
- 左边缘统一：`/docs`、404、`/pricing` 的 `.site-header-inner` / `.landing-footer-main` / `.landing-footer-bottom` / 内容区在 320/768/1024/1440 逐像素对齐。
- 主次按钮同尺寸（第三轮 P1-3）：7 个宽度下两个按钮 `font-size: 15px`、`min-height: 52px`、实测 `height: 52px` 完全一致；≤768 都通栏。
- `.landing .hero-actions` 收窄到 `.landing`（第三轮 P2-2）：404 页 `.guide-page` 未受影响，按钮 106×52、fs 15px，无破版。
- `wechat_link_limit` → `connection_limit`（legacy P1-4 / 回归-4）：`src/` 无旧码残留，仅 `design/` 历史文档保留；服务端 `src/server/personal-account.ts:1586` 已抛新码；`api.ts:13` 的 `LIMIT_CODES` 三个码与服务端一致。
- `verify_resend` → `verify_send`（第三轮 P2-3）：全仓无 `verify_resend` 残留；事件名无服务端白名单需同步（`migrations/0016_funnel_events.sql` 只约束 `name TEXT`，无 CHECK）。
- `/verify-email` 的 Google 按钮（第三轮 P0-1）：`git show HEAD:src/client/pages/auth-recovery.tsx | grep Google` 无输出 → 第三轮加、第四轮删，相对 HEAD 净变化为零；实测 `hasGoogle=false`、`googleBtns=0`、无空 `<p>`、`.auth-divider` 为 null、无多余间距。
- 新链接 `:focus-visible`：`styles.css:91-93` 的 `button/a/summary:focus-visible` 全局覆盖，新增的 `/pricing`、`/app/billing` 文字链接（`limit-hint.tsx:38`、`:42`）已覆盖。
- `limitCode` 跨操作残留：`wechat.tsx:61` 已有 `setLimitCode(undefined)`（失败路径 `:66` 之外），上一个操作失败留下的提示不会挂到下一次成功操作上。
- `test/limit-hint.test.tsx`（3 例）与 `test/seo.test.ts`、`test/funnel-entry.test.ts` 无重叠冲突；`limit-hint.tsx` 在 wechat 页的用法（除 P1-2 的 plan 缺口外）与组件契约一致。
