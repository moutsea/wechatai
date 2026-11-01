# Round 3 审查：未提交改动（埋点 + 首页 hero 改版 + 验证页）

**一句话总结：1 条 P0（验证页「用 Google 跳过邮箱验证」对其目标用户必然失败，且失败后文案错、可无限重试）、7 条 P1（H1 拆词、hero-note 样式整条失效、次按钮比主按钮更重、CTA 埋点语义失真、register_view 多计、OAuth 归因断链）、6 条 P2；不建议现在直接合入，P0 + P1 的第 1/2/3 条修完再发。**

审查对象：`git diff` 的 6 个文件（+125/−24），只读审查，未修改仓库任何文件。所有结论都带 `文件:行号`；标「待确认」的给出确认方法；标「代码级确定、未端到端实测」的是我无法在本机完成的验证（需要真人 OAuth 授权）。

---

## P0 — 真 bug：功能对目标用户不可用

### P0-1 验证页的「用 Google 登录，跳过邮箱验证」对刚注册完的人 100% 失败，且失败后文案错、可无限重试

**现象（用户实际会看到什么）**

1. 用户用邮箱+密码在 `/register` 注册（`src/server/auth.ts:117-118` `sendOnSignUp: true`；注册成功后前端跳到 `/verify-email`，`src/client/public-pages.tsx:519`/`:530`）。此时本地账号 `emailVerified = false`（`src/server/auth.ts:108` `requireEmailVerification: true`）。
2. 用户不想等邮件，点新加的「用 Google 登录，跳过邮箱验证」（`src/client/pages/auth-recovery.tsx:194-203`）。
3. Google 授权完回到 `/api/auth/callback/google`，better-auth 按邮箱找到已存在的本地用户、发现没有 google 关联账号，进入关联判定：
   - `node_modules/better-auth/dist/oauth2/link-account.mjs:23`
     `if (!isTrustedProvider && !userInfo.emailVerified || requireLocalEmailVerified && !dbUser.user.emailVerified || accountLinking?.enabled === false || accountLinking?.disableImplicitLinking === true) return { error: "account not linked" }`
   - 项目配置 `src/server/auth.ts:227-231`：`accountLinking: { enabled: true, requireLocalEmailVerified: true, allowDifferentEmails: false }`，且全仓库没有配置 `trustedProviders`（`grep -rn trustedProviders src/` 无结果）。
   - 于是 `requireLocalEmailVerified && !dbUser.user.emailVerified` → **`true`** → `account not linked`。
4. 回调把错误拼回去：`node_modules/better-auth/dist/api/routes/callback.mjs:161-163` → `redirectOnError(c, resolvedErrorURL, "account_not_linked")`，`errors.mjs:15-16` 用 `errorURL.includes("?") ? "&" : "?"` 拼分隔符 → 落地 `/verify-email?returnTo=%2Fapp&error=account_not_linked`。
5. 落地页：`src/client/pages/auth-recovery.tsx:67-70` 把 `error` 交给 `authErrorMessage({ code: "ACCOUNT_NOT_LINKED" })`，而 `src/shared/auth.ts:26-42` 的映射表里**没有** `ACCOUNT_NOT_LINKED`，落到兜底 `"操作未完成，请稍后重试。"`；同时 `:155` `{tokenError ? "重新验证邮箱" : "验证你的邮箱"}` 把标题变成「重新验证邮箱」——**用户根本没在重新验证，他是想跳过验证**。
6. Google 按钮仍在页面上、状态已复位（`startGoogle` catch 里 `setSocialBusy(false)`），用户再点一次 → 同样结局。**死循环。**

**影响面界定（重要，避免夸大）**：只有「本地已存在同邮箱账号且未验证」才会失败——而这恰好是「刚注册完卡在验证页、想跳过验证」的全部人群。若该邮箱在本地从不存在（用户直接从别处来到 `/verify-email` 用 Google 登录），会走新建账号分支并成功；若本地账号已验证，也能关联成功。也就是说：**按钮的招牌功能（跳过验证）在它唯一有意义的场景里不可用**。

**依据**：`src/server/auth.ts:227-231`、`node_modules/better-auth/dist/oauth2/link-account.mjs:23`、`node_modules/better-auth/dist/api/routes/callback.mjs:161-163`、`node_modules/better-auth/dist/oauth2/errors.mjs:12-17`、`src/client/pages/auth-recovery.tsx:86-104,155`、`src/shared/auth.ts:42`。
（better-auth 版本 1.6.26；`requireLocalEmailVerified` 的默认值本身就是 `true`，见 `link-account.mjs:22` 的 `?? true`。）

**建议改法（任选其一，按推荐序）**

- **A. 放开关联策略（推荐，语义正确）**：`src/server/auth.ts:227-231` 去掉 `requireLocalEmailVerified: true`（或置 `false`）。此时仍需 provider 明确表示邮箱已验证才允许关联——`link-account.mjs:23` 第一个子句 `!isTrustedProvider && !userInfo.emailVerified` 会拦住「Google 说邮箱没验证」的情况（只要不把 google 加进 `trustedProviders`）。账号接管风险方向是对的：被接管的是攻击者自己注册的未验证账号。
  - 副作用检查：放开后，`emailVerified` 会在关联时被置 true（`link-account.mjs:49` `if (userInfo.emailVerified && !dbUser.user.emailVerified && ...email 相同) updateUser(emailVerified: true)`），正好是「跳过验证」想要的效果。
- **B. 保留策略，但把按钮变成「有条件的出口」**：在 `authErrorMessage`（`src/shared/auth.ts:26-41`）补 `ACCOUNT_NOT_LINKED: "这个邮箱已经用密码注册过。请先用邮件完成验证，或直接登录。"`，并把文案改为不承诺能跳过。
- **C. 至少修文案（最小改动）**：补 `ACCOUNT_NOT_LINKED` 映射 + `auth-recovery.tsx:155` 的标题判断增加 `tokenError !== "account_not_linked"`，别把标题改成「重新验证邮箱」。但按钮仍会失败，只是不再误导——**不建议只做 C**。

**如何验证**
- 端到端（推荐作者自己跑一次）：注册 `round3-probe@<你的域名>` → 不点邮件 → 在 `/verify-email` 点 Google → 用同一邮箱的 Google 账号授权 → 观察落地 URL 是否带 `&error=account_not_linked`。
- 纯代码级复核：`sed -n '23p' node_modules/better-auth/dist/oauth2/link-account.mjs` + `git grep -n trustedProviders src/`（应无结果）。
- 我这边**未做端到端实测**（需要真人 Google 授权，属于我不能代替用户完成的动作），上述为代码级确定结论。

---

## P1 — 明显问题：影响体验或埋点可信度

### P1-1 H1 在所有 320–1024 宽度都把「用上」拆成两行，且被染绿的「用」孤零零挂在第一行末尾

**现象**：实际渲染（截图与逐字测量一致）
- 320/375/414/768/1024：`在微信里，用` / `上你的大模型`（两行等宽，第一行末尾是被 `span` 染绿的「用」）
- 1280/1440：`在微信里，用上你的大模型`（一行，正常）
见 `design/review-2026-10-25/17-after-hero-mobile.png`（作者自己的截图，390 宽就能看到「在微信里，用 / 上你的大模型」）。

**依据**：`src/client/public-pages.tsx:124` `在微信里，<span>用上你的大模型</span>` + `src/client/styles.css:2554-2555` 新加的 `text-wrap: balance`。我用 CDP 逐字取行（脚本见文末）对照了 4 种方案：

| 宽度 | 现状（balance） | 改成 wrap | balance + `span{white-space:nowrap}` |
|---|---|---|---|
| 320 | 在微信里，用 / 上你的大模型 | 在微信里，用上你 / 的大模型 | **在微信里， / 用上你的大模型** |
| 375 | 在微信里，用 / 上你的大模型 | 在微信里，用上你的大 / 模型 | **在微信里， / 用上你的大模型** |
| 414 | 在微信里，用 / 上你的大模型 | 在微信里，用上你的大 / 模型 | **在微信里， / 用上你的大模型** |
| 768 | 在微信里，用 / 上你的大模型 | 在微信里，用上你的 / 大模型 | **在微信里， / 用上你的大模型** |
| 1024 | 在微信里，用 / 上你的大模型 | 在微信里，用上你的大模 / 型 | **在微信里， / 用上你的大模型** |

结论：`balance` 确实消除了「孤字行」，但代价是在逗号之外的任意两字之间断行，正好切开了动词「用上」；去掉 balance 更差（裁出「型」这类孤字）。

**建议改法**：保留 `text-wrap: balance`，给标题的 `span` 加 `white-space: nowrap`（`src/client/styles.css:2557` 那条 `.landing-copy h1 span` 里加一行）。实测 320–1024 全部变成「在微信里，」/「用上你的大模型」，1280+ 仍是一行。

**如何验证**：320/375/768/1024/1440 五个宽度看标题折行；或用文末探针脚本 `--script` 注入上述 CSS 复测。

### P1-2 `.hero-note` 的新样式几乎全部失效（特异性被 `.landing-copy > p` 吃掉），375 宽还出现单字「除」孤行

**现象**（CDP 实测 computed style，非推断）
- 768/1024/1280/1440：`font-size: 14px`、`line-height: 30.1px`、`margin-bottom: 33px` —— 而作者写的是 `font-size: var(--text-sm)` = **13px**、`margin: 14px 0 0`。
- 320/375/414：`font-size: 12px`、`line-height: 25.8px`（手机断点里的 12px 覆盖），仍不是 13px。
- `.hero-note` 到 `.hero-trust` 的实际间距 = **33px**（笔记的下外边距 33 生效，作者想要的 `0` 没生效）。视觉上这段微文案被排成了正文（1.63 倍行高改为 2.15 倍）。
- 375 宽：note 折成 `每天 100 credits 免费 · 不绑卡 · 聊天记录可随时删` / `除` —— **单字孤行**。

**依据**：`src/client/styles.css:2560-2565` `.landing-copy > p { font-size:14px; line-height:2.15; margin-bottom:33px }`（特异度 0,1,1）压过 `:2579-2583` `.hero-note { margin:14px 0 0; font-size:var(--text-sm) }`（0,1,0）；`:3778`（≤760 断点）又给了 `.landing-copy > p { font-size:12px }`；`:4310` 还有第三条 `.landing-copy > p`。而 `src/client/public-pages.tsx:149` 的 `.hero-note` 确实就是 `.landing-copy` 的直接子 `<p>`。→ `.hero-note` 只剩 `margin-top:14px` 和（≤760 的）`text-align:center` 真正生效。

**建议改法**（两步）
1. 提高特异度或换结构：`.landing-copy > p.hero-note { font-size: var(--text-sm); line-height: 1.7; margin-bottom: 0 }`（0,2,1 稳赢），或把 note 换成 `<div class="hero-note">` 避开 `.landing-copy > p`。
2. 375 的孤字：把三句拆成成分不可断的 span（我实测过这个方案，见下表）：

| 宽度 | 现状 | 拆 span + `white-space:nowrap` + flex-wrap |
|---|---|---|
| 320 | 每天 100 credits 免费 · 不绑卡 · 聊天记录 / 可随时删除 | 每天…免费 · 不绑卡 / 聊天记录可随时删除（每句完整） |
| 375 | 每天…可随时删 / **除** | 每天…免费 · 不绑卡 / 聊天记录可随时删除（每句完整） |
| 414 | 一行 | 一行 |

注意：只给 `.hero-note` 加 `text-wrap: balance` 反而会把「不绑卡」拆成「不」/「绑卡」（实测 375 下变成 `每天 100 credits 免费 · 不` / `绑卡 · 聊天记录可随时删除`），**不要只加 balance**。

**如何验证**：375 与 1440 各看一次；`getComputedStyle(document.querySelector('.hero-note')).fontSize` 应为 13px。

### P1-3 次按钮比主按钮更重：主按钮 13px / 高 50px，次按钮 15px / 高 52px —— 作者注释写的「同尺寸」并未实现

**现象**（实测 rect + computed style，1024/1280/1440 三个宽度一致）
- 主按钮「免费开始，3 分钟上手」：`font-size: 13px`，`h = 50px`
- 次按钮「不注册，先点开看看」：`font-size: 15px`，`h = 52px`
- 行内（≥1001px）两者 `align-items: center`，顶端差 1–2px。作者截图 390 宽里肉眼就能看出次按钮的字更大。

**依据**：`src/client/styles.css:2572-2574` 只给了 `.hero-actions .button { padding: 15px 22px }`，字号仍是 `.button` 的 13px（`:173`）；`:2575-2578` 注释写着「次按钮和主按钮同尺寸：零门槛入口不该被做成一行小字」，但实现只给 `.hero-actions .hero-secondary { font-size: var(--text-base) }`（15px，`--text-base:15px` 见 `:32`）。→ 只有次按钮被放大，主按钮没跟上。

**建议改法**：把字号提到共同规则上——`.hero-actions .button { padding: 15px 22px; font-size: var(--text-base) }`，然后 `.hero-secondary` 那条可以删；顺手统一高度（都在 `.hero-actions` 里加 `align-items: stretch` 或在 `.hero-actions .button` 上给 `min-height: 52px`）。

**如何验证**：1440 下量两个 `a.button` 的 `getBoundingClientRect().height` 与 `fontSize`，应相等。

### P1-4 `hero_cta_click{cta:"primary"}` 对已登录用户语义失真，会稀释「首屏点主按钮 → 到注册页」的换算

**现象**：已登录用户看到的是「配置我的模型」、跳 `/app/channels`，但埋点依然发 `cta=primary`，和未登录用户的「免费开始，3 分钟上手」完全无法区分。这类点击**永远不会**产生 `register_view`，因此漏斗里 `hero_cta_click(primary) → register_view` 的转化率会被系统性压低，且压低幅度随老用户回访比例漂移。

**依据**：`src/client/public-pages.tsx:135`（onClick 固定发 `cta:"primary"`）、`:137`（`{session ? "配置我的模型" : "免费开始，3 分钟上手"}`）、`:104`（`StartLink` 把 `to` 改成 `/app/channels`）。同页 `:100` 的 StartLink 在 `isPending` 时根本渲染 `<button disabled>`（不发事件，符合预期）。

**建议改法**：`onClick={() => trackFunnel("hero_cta_click", { cta: "primary", auth: session ? "in" : "out" })}`（props 上限 8 个键、value ≤120 字符，完全够用，见 `src/shared/funnel.ts` 的 `funnelPropsSchema`）；后台 `FUNNEL_SIDE_EVENTS`（`src/shared/funnel-report.ts:32-35`）目前只显示「N 访客日 · N 次」的汇总，如需分列可在侧栏加一条按 props 拆分的展示，或直接用 `auth` 维度在 SQL 侧过滤。

**如何验证**：登录态打开 `/`，点主按钮，看 `/api/analytics/event` 的 postData 是否带 `auth:"in"`（抓包方法见文末）。

### P1-5 `register_view` 会在不该发的时候发：已登录用户访问 `/register` 也计数，dev 下还会双发

**现象**
- 已登录用户打开 `/register` 会被 `Navigate` 送走，但**在那之前** `useEffect` 已经发了一条 `register_view` → 「到达注册页」的分母掺入老用户。
- 我在本地实测（`React.StrictMode` 开启，`src/client/main.tsx:49`）**一条访问发了 2 条 `register_view`**，两条 `eventId` 不同（`d1a42a80…` / `ae619caf…`，sessionId 相同），服务端按 `event_id` 去重因此无效，等于记 2 次。同一页面里既有的 `demo_view` 也是双发，说明这是 StrictMode 的既有现象、**只影响 dev/preview**，生产构建不会双发。

**依据**：`src/client/public-pages.tsx:407-411`（`useEffect(() => { if (register) trackFunnel("register_view") }, [register])` 位于 `:411` 之后才 `if (isPending) return`，且在 `/login` 的同一组件里 `register=false` 时不发）。实测抓包见文末附录。

**建议改法**：把 effect 移到 `isPending` 与 `session` 判断之后（`if (isPending || session) return;` 再发），或在 effect 内 `if (!register || session) return;`。StrictMode 双发不必修（生产不触发），但若担心 preview 环境数据，可在 `trackFunnel` 侧对「同 session 同 name 同 path」做一次 1s 内的去重。

**如何验证**：退出登录 → 打开 `/register` → 抓 `/api/analytics/event` 只应有 1 条（dev 下 2 条为 StrictMode，可 `pnpm build && pnpm preview` 复核）；登录后打开 `/register` → 应为 0 条。

### P1-6 从验证页发起的 Google 注册丢失 `additionalData` → `oauth_click` 有数、注册归因无数据

**现象**：同一次 Google 登录，从 `/login`、`/register` 发起会把 `signupAttribution()` 塞进 OAuth state（服务端 `context.path.startsWith("/callback/")` 时从 `getOAuthState()` 取出并写 `signup_attributions`），从新加的 `/verify-email` 按钮发起则什么都不传，服务端取到 `undefined` → `analyticsSessionIdSchema.safeParse` 失败 → `return`，不记归因。结果：漏斗里能看到 `oauth_click`，但这条旁路注册进不了归因表，等于新增了一条「有入口、无结果」的假数据。

**依据**：`src/client/pages/auth-recovery.tsx:92-97` 的 `authClient.signIn.social({ provider, callbackURL, newUserCallbackURL, errorCallbackURL })` 无 `additionalData`；对照 `src/client/public-pages.tsx:476` 的 `additionalData: browserPageViewReporter().signupAttribution()`；服务端 `src/server/auth.ts:206-210`（`context.path.startsWith("/callback/") ? (await getOAuthState())?.analyticsSessionId : undefined`，随后 `safeParse` 失败即 return）。state 会把 additionalData 一起带走（`node_modules/better-auth/dist/oauth2/state.mjs` 的 `stateData = { ...additionalData, callbackURL, ... }`）。

**建议改法**：在 `auth-recovery.tsx` 的 `signIn.social` 里补 `additionalData: browserPageViewReporter().signupAttribution()`（并 import `browserPageViewReporter`），与登录页保持一致。

**如何验证**：修好后从 `/verify-email` 走一次 Google 新注册，查 D1 `signup_attributions` 是否有该 session 的行；或对比 `/login` 发起的同流程。

---

## P2 — 打磨

### P2-1 `.auth-recovery > .social-login { margin-top: 4px }` 是死规则（实测 28px）
`src/client/pages/auth-recovery.css:68-70` 特异度 (0,2,0) 与 `src/client/styles.css:3085` `.auth-form > .button { margin-top: 28px }` 相同，而 `styles.css` 在样式表里更靠后 → 实测 Google 按钮的 `margin-top` 是 **28px**，不是 4px。作者把间距收小的意图没实现。
改法：写成 `.auth-form > .social-login { margin-top: 4px }`（同样 (0,2,0) 但更靠后）或 `.auth-recovery > .button.social-login`（0,3,0）。验证：`getComputedStyle(btn).marginTop` 应为 4px。
（顺带：28px 也说得过去，但在「发送验证邮件」与「用 Google 跳过」之间，脚本上 4px 更能表达二者是同一环节的两个选项——作者原本的意图也是这个。）

### P2-2 `/404` 页的 `.hero-actions` 被首页新规则波及（≤1000px 按钮变通栏）
`src/client/not-found.tsx:13-17` 复用了 `.hero-actions`。改动后 ≤1000px 的 `.hero-actions { align-items: stretch }` + `.hero-actions .button { width: 100% }` 让 404 页的「回到首页」变成 **407px 通栏**（768 宽实测），紧随其后的「使用文档」文本链接也被 stretch 到同宽。我把改动前的规则注回去做了对照：按钮宽度从 407px 回到 **98px**（同一页面同一宽度，见文末探针）。1024 宽不受影响（仍是 98px）。
改法：把通栏规则收窄到 `.landing .hero-actions`（或给 404 用一个自己的类）。
验证：`/definitely-not-a-page-xyz` 在 375/768 下看按钮宽度。

### P2-3 `verify_resend` 的语义与事件名不符：首次发送也叫「重发」
`src/client/pages/auth-recovery.tsx:124` 的 `trackFunnel("verify_resend")` 在**首次**点「发送验证邮件」时也会发（按钮文案此时是「发送验证邮件」，`sent=false`），后台清单里却叫「重发验证信」（`src/shared/funnel-report.ts:35`）。
改法：要么改名为 `verify_send` 并在 props 里带 `{ first: sent ? "n" : "y" }`，要么只在 `sent === true` 时发。验证：首次发送后看 postData。

### P2-4 新埋点没有测试覆盖
`test/funnel-events.client.test.tsx`（19 个用例，全绿）里没有任何一条断言 `hero_cta_click` / `register_view` / `oauth_click` / `verify_resend`；`grep -rn "hero_cta_click" test/` 无结果。新增事件目前只靠手测。
改法：在该测试文件里加 2–3 个用例（点击 CTA 后 `fetch` 收到正确 name/props、DNT 下不发、`/demo` 路径被 `allowsFunnelEvent` 拦）。
验证：`pnpm test`.

### P2-5 `.hero-note` 与 CTA 无程序化关联（可选）
`src/client/public-pages.tsx:149` 是独立 `<p class="hero-note">`，没有 `id`，主按钮上也没有 `aria-describedby`。屏幕阅读器用户听「免费开始，3 分钟上手」时听不到「每天 100 credits 免费 · 不绑卡」。属于语义打磨，非阻塞。改法：`<p id="hero-note">` + 主按钮 `aria-describedby="hero-note"`。
同页对比度没问题：`--muted #59615c` on `#fff` = **6.39:1**，`--muted` on `--page #f6f7f6` = **5.9:1**，`.auth-next-steps` 的 li 用 muted on `#f6f7f6` 也是 5.9:1，均过 AA（13px 正文需 4.5:1）。

### P2-6 「每天 100 credits 免费 · 不绑卡 · 聊天记录可随时删除」三条都已核对为真；只有 trust 行的「我们不卖 token」需要产品口径确认
- 100 credits/天：`src/shared/credits.ts:7` `DAILY_CREDIT_DEFAULTS = { free: 100, plus: 1000 }`，按天重置（`src/server/personal-account.ts:2035`）→ **成立**，且用的是常量而非硬编码，不会漂移（`public-pages.tsx:149-151`）。
- 不绑卡：注册与免费流程无支付方式要求（仅 Plus 走 Stripe）→ **成立**。
- 聊天记录可随时删除：`src/client/shell.tsx:188`「删除全部会话记录」+ `:216` 二次确认「所有会话、归档和聊天内容将从平台删除」→ **成立**。
- 三种协议：`src/shared/types.ts:4` `type Protocol = "chat-completions" | "responses" | "anthropic"` → **成立**。
- 开源仓库可查：`package.json` 的 repository 指向 `github.com/moutsea/wechatai`，`curl https://api.github.com/repos/moutsea/wechatai` 返回 200 → **成立**。
- 「自带 API Key，我们不卖 token」：代码里没有按 token 销售的计费（Plus 是订阅），**但并不存在"完全与 token 无关"**——额度就是按 token 折算的：`src/shared/credits.ts:1-2` `TOKENS_PER_CREDIT = 5000`、`OUTPUT_TOKEN_WEIGHT = 8`。免费用户用自己的 Key 却仍受 token 折算的每日额度约束，文案容易被理解成"额度与 token 无关"。**标记为待产品确认**，不是代码 bug。确认方法：向产品确认这句的对外口径，或改成「自带 API Key，模型费用不由我们代收」。

### P2-7 验证页三步预告与真实流程一致，但第一步「配置模型」的措辞值得再核（低优先）
`src/client/pages/auth-recovery.tsx:205-212`：①配置模型（填 API Key 与服务地址）②扫码连接微信 ③直接在微信里说话、额度每天重置。与工作台的实际引导顺序一致（模型 → 渠道扫码 → 对话），口径没问题。唯一小瑕疵：`<li>` 里同时用了「：」和空格分隔（`配置模型：填 API Key 与服务地址`），三行标点不统一（另两行没有冒号），属排版细节。

---

## 已核对通过、不构成缺陷的部分（避免下一轮重复审）

1. **服务端确实接受这 4 个事件**，且不会因缺少 sessionId 整条丢弃：
   - `src/shared/funnel.ts:48-54` 已把 4 个名字加进 `FUNNEL_EVENTS`；`funnelEventPayloadSchema`（同文件）里 `sessionId` 为 optional；props 约束为 key ≤40 / value string ≤120 或 number/boolean / 最多 8 个。
   - `src/server/index.ts:163` `POST /api/analytics/event` → `analyticsPrecheck` → `recordFunnelEvent`（`src/server/analytics.ts:118`）：bot UA 丢弃、zod 失败记 `invalid_payload`、props JSON 截断 1000 字符、`event_id` 冲突去重；**服务端不按 `isTrackedPath` 过滤漏斗事件**（符合设计意图）。
   - 实测：4 个事件里的 `hero_cta_click`(primary/demo) 与 `register_view` 都已抓包确认成功入站（见附录 postData）。
2. **不会被 `funnel-policy` 误挡**：`src/shared/funnel-policy.ts` 的 `allowsFunnelEvent` 只排除 `/demo` 与 `/demo/*`（`demo_view` 例外），`/`、`/register`、`/verify-email`、`/login` 全部放行。
3. **后台侧栏清单已同步**：`src/shared/funnel-report.ts:32-35` 把 4 个事件加进 `FUNNEL_SIDE_EVENTS`（不进 `FUNNEL_STEPS`，故不参与条形图的 max 计算）；`src/server/analytics.ts:363` 的 `getFunnelSummary` 明确排除 `/demo` 路径但会统计新事件。
4. **`signIn.social` 的返回值假设正确**：`{ url, redirect }`（`node_modules/better-auth/dist/api/routes/sign-in.mjs:194-205`），客户端 `redirectPlugin` 在 `data.url && data.redirect` 时 `window.location.href = data.url`（`client/fetch-plugins.mjs`），所以 `auth-recovery.tsx:98` 的 `!response.data?.url` 判断成立；成功后不复位 `socialBusy` 也是安全的（页面正在跳转）。
5. **`errorCallbackURL` / `newUserCallbackURL` 都被支持且无开放重定向**：两者都在 `socialSignInBodySchema` 里；传入值分别是 `authReturnPath()` 归一化后的 `/app*` 内部路径（`src/shared/auth.ts:2-12` 拒绝非 `/app`、`//`、反斜杠）和 `/verify-email?returnTo=...`（站内相对路径）。错误码拼装用 `?`/`&` 自动判别（`errors.mjs:15-16`），不会被 `?` 重复破坏。
6. **`/auth/providers` 的 fetch + AbortController 清理正确**：`auth-recovery.tsx:76-85` 有 `signal.aborted` 守卫、cleanup 里 abort、`verified` 时早退；本地实测 `curl --noproxy '*' http://127.0.0.1:5199/api/auth/providers` → `{"providers":["google","github"]}`，所以本地会渲染该按钮（`src/server/index.ts:294` + `src/server/auth.ts:84`）。
7. **按钮不会误提交表单**：实测 `type="button"`（`auth-recovery.tsx:197`），回车仍走 `<form onSubmit>`。
8. **失败态不会永久卡住 busy**：`catch` 里 `setSocialBusy(false)`（`:102`）；只有"跳转被浏览器拦截"这一种边缘情况会让按钮停在「正在前往授权…」。
9. **DNT/GPC 对 OAuth 无副作用**：`trackFunnel` 在 `optedOut` 时只是不发埋点（`src/client/analytics-client.ts`），不影响 `signIn.social`；服务端归因也自行检查 `dnt`/`sec-gpc`（`src/server/auth.ts:198-203`）。
10. **`.button.secondary` 与 `.hero-secondary` 无样式冲突**：`.button`（`styles.css:173`）与 `.button.secondary`（`:197`）的 background/color/border 组合正常，实测次按钮 `background: #fff`、`color: #111613`、`border: 1px solid #b8c8be`、`min-height 46px`；`.hero-secondary` 只加了字号（问题见 P1-3）。
11. **`.hero-actions .button { padding: 15px 22px }` 的影响面已确认**：`.hero-actions` 全仓库只有首页（`public-pages.tsx` 与 `not-found.tsx`）用到，影响面见 P2-2，不涉及其他页面。
12. **桌面/平板无横向溢出**：320/375/414/768/1024/1280/1440 七个宽度下 `documentElement.scrollWidth === innerWidth`，`.landing { overflow-x: clip }`（`:2535-2538`）也兜住了。
13. **`.auth-next-steps` 不与既有 `.auth-*` 规则打架**：`.auth-layout` 背景 `#fff`（`:2987-2992`），方块背景 `#f6f7f6` + `1px solid #dfe4e0` 能看出来；`> p` 用 `--ink`、`ol` 用 `--muted`，没有命中 `label { display:flex }` 之类的全局规则（结构里没有 label）；`.auth-recovery` 与 `.auth-form` 同元素，故 `> .social-login` 选择器本身有效（失效原因是特异度，见 P2-1）。
14. **tsc / lint / test 全绿**：见附录。

---

## 我实际验证过的命令与输出摘要

```
$ git -C <repo> diff --stat
 src/client/pages/auth-recovery.css | 26 +++++++++++++++++++++
 src/client/pages/auth-recovery.tsx | 17 ++++++++++++++
 src/client/public-pages.tsx        | 46 ++++++++++++++++++++++++++----------
 src/client/styles.css              | 45 ++++++++++++++++++++++++++----------
 src/shared/funnel-report.ts        |  4 ++++
 src/shared/funnel.ts               | 11 +++++++++
 6 files changed, 125 insertions(+), 24 deletions(-)

$ npx tsc --noEmit            → exit 0（无输出）
$ pnpm lint                   → exit 0；"Found 0 warnings and 0 errors."（264 files, 96 rules）
$ pnpm test                   → exit 0；服务端 60 files / 1114 tests passed，客户端 4 files / 37 tests passed

$ curl --noproxy '*' -s http://127.0.0.1:5199/api/auth/providers
{"providers":["google","github"]}

$ curl -s -o /dev/null -w '%{http_code}' https://api.github.com/repos/moutsea/wechatai
200

$ grep -rn "trustedProviders" src/          → 无结果（只有 node_modules 内部默认逻辑）
$ grep -rn "hero_cta_click\|register_view\|oauth_click\|verify_resend" test/   → 无结果（无测试覆盖）
```

**CDP 布局/埋点探针**（只读，仓库文件零改动；脚本在 `/tmp`）
- `/tmp/probe-round3.mjs`：首页 7 个宽度 + 404 + `/verify-email` + `/register` 的量测，并抓 `Network.requestWillBeSent` 里 `/api/analytics/*` 的 postData。
- `/tmp/probe-h1.mjs`：逐字符取行（`Range` per char）+ 4 种折行方案对照。
- `/tmp/probe-note-404.mjs`：hero-note 的 span 方案实测 + 404 页「注入旧规则」回滚对照。

实测抓到的埋点请求体（节选）：

```
POST /api/analytics/event  {"eventId":"c3a6d3ac-…","name":"hero_cta_click","props":{"cta":"primary"},"sessionId":"57e80704-…","path":"/"}
POST /api/analytics/event  {"eventId":"41f862eb-…","name":"hero_cta_click","props":{"cta":"demo"},"sessionId":"57e80704-…","path":"/"}
POST /api/analytics/event  {"eventId":"d1a42a80-…","name":"register_view","sessionId":"57e80704-…","path":"/register"}
POST /api/analytics/event  {"eventId":"ae619caf-…","name":"register_view","sessionId":"57e80704-…","path":"/register"}   ← 同一访问的第 2 条（StrictMode）
```

关键量测数字（`getComputedStyle` / `getBoundingClientRect`）：

```
.hero-note   1440px: fontSize 14px  lineHeight 30.1px  marginBottom 33px   （作者写的 13px / 14px 0 0）
.hero-note    375px: fontSize 12px  → 折行 "…聊天记录可随时删" / "除"
主按钮        1440px: fontSize 13px  height 50px
次按钮        1440px: fontSize 15px  height 52px
H1            320–1024: "在微信里，用" / "上你的大模型"
h1 注入 span{white-space:nowrap} 后: 320/375/414/768/1024 全部为 "在微信里，" / "用上你的大模型"
404 页 768px:  改动后 .button = 407px；注入改动前规则后 = 98px（.text-link 407 → 48px）
Google 按钮 margin-top: 28px（auth-recovery.css 里想要的 4px 未生效）
.auth-next-steps: 355×138 @1440，ol display:grid gap:4px padding-left:18px，li 13px/#59615c/line-height 22.75
横向溢出：320/375/414/768/1024/1280/1440 七个宽度均无（scrollWidth === innerWidth）
```

**我没能做到的验证（如实说明）**
- P0-1 的端到端实测：需要真人完成 Google OAuth 授权，我只能做到代码级确证（better-auth 1.6.26 源码 + 项目配置）。
- 生产构建下 `register_view` 是否只发一条：未跑 `pnpm build && pnpm preview` 复核，按 React 语义判断 StrictMode 双发仅限 dev（同页 `demo_view` 双发也印证是同一机制）。
