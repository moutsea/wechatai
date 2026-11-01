# 回归验证报告（task-4）

验证对象：删除 /demo 演示工作台 + 首页/登录页真实截图改造 + 死 CSS 清理
验证时间：2026-10-27 10:37–11:20（最终源码：`src/client/landing-real.css` 09:54 最后一改之后）
验证者：verifier（独立验证，未修改任何 `src/` 与 `public/` 文件）

## 一句话结论

**可以交付**：lint / typecheck / test / build 全绿（1144 + 48 用例），`dist/client` 无任何 demo 残留，4 个页面 × 4 档宽度全部无横向溢出，`#how` 锚点不被 sticky 页头遮挡，6 张真实截图全部 HTTP 200 且宽高比误差 ≤0.53%；无 P0、无 P1，只剩 3 条 P2（1 条产品取舍待确认、2 条打磨项）。

---

## 1. 静态检查与构建

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| Lint | `pnpm lint` | ✅ `Found 0 warnings and 0 errors.`（270 files / 96 rules） |
| 类型 | `pnpm typecheck` | ✅ exit 0，无输出 |
| 单测（主套件） | `pnpm test`（第一段） | ✅ **61 files / 1144 tests passed** |
| 单测（客户端） | `pnpm test`（`test:client` 段） | ✅ **7 files / 48 tests passed** |
| 构建（含 prerender + verify-seo） | `pnpm build` | ✅ exit 0 |

构建输出关键行：

```
Prerendered 40 public pages, private route shells and a 404 page.
SEO checks passed: rendered pages, metadata, indexing boundaries and social image.
```

完整日志：`design/review-2026-10-27/verify/test-full.log`、`design/review-2026-10-27/verify/build.log`

> 注：`vite build` 有 1 条既有告警 `index-*.js 552.80 kB │ gzip 185.42 kB`（>500 kB chunk）。该 chunk 体积来自 workspace/schemas，与本次改动无关，见 P2-3。

## 2. demo 残留检查（全绿）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 构建产物文件名 | `find dist/client -iname '*demo*'` | ✅ 0 命中 |
| 旧域名字符串 | `grep -rl "demo\.example\.com" dist/client` | ✅ 0 命中 |
| 路由字符串 | `grep -rl '"/demo' dist/client` | ✅ 0 命中 |
| 任意大小写 demo | `grep -ril demo dist/client` | ✅ 仅 1 命中，为假阳性：`assets/schemas-*.js` 里 zod 内部的 `$ZodEmoji`（"dEmoji" 命中） |
| sitemap | `grep -c "/demo" dist/client/sitemap.xml` | ✅ 0 |
| robots / _redirects / _headers | `grep -i demo …` | ✅ 0 命中 |
| 中文残留 | `grep -rl "演示工作台\|演示界面" dist/client` | ✅ 0 命中 |
| 源码残留 | `grep -rn "demo" src/ -i` | ✅ 仅 3 处**解释性注释**（`src/client/landing-real.css:3`、`src/client/public-pages.tsx:701`、`src/client/context.tsx:34`），符合"注释解释为什么"的风格 |

`/demo` 与 `/demo/app` 的运行时行为（静态服务 + SPA 兜底）：

```
/demo      → title「页面未找到 | 微伴 Wechatai」/ h1「这个页面没有找到。」/ hasDemoWorkbench=false
/demo/app  → 同上
```

首页 prerender HTML 中 `demo` 字样计数 = **0**，且 `#how` / `#real` / `#workspace` 三个锚点各 1 个。

## 3. 多宽度布局实测（页面 × 宽度）

方法：自建静态服务（复刻 Workers 资产路由）伺服 `dist/client`，`/api/*` 反代到 `pnpm dev`（127.0.0.1:5173，含真实 workerd + D1），chrome-headless-shell + CDP `Emulation.setDeviceMetricsOverride` 逐档测量。

| 页面 | 1440 | 1024 | 768 | 390 |
| --- | --- | --- | --- | --- |
| `/` | 1440 / 1440 ✅ | 1024 / 1024 ✅ | 768 / 768 ✅ | 390 / 390 ✅ |
| `/pricing` | 1440 / 1440 ✅ | 1024 / 1024 ✅ | 768 / 768 ✅ | 390 / 390 ✅ |
| `/docs` | 1440 / 1440 ✅ | 1024 / 1024 ✅ | 768 / 768 ✅ | 390 / 390 ✅ |
| `/register` | 1440 / 1440 ✅ | 1024 / 1024 ✅ | 768 / 768 ✅ | 390 / 390 ✅ |

（单元格为 `documentElement.scrollWidth / clientWidth`）

补充覆盖（同一脚本，另一轮）：

| 页面 | 390 | 768 | 1440 |
| --- | --- | --- | --- |
| `/docs/wechat-connection` | 390 / 390 ✅ | 768 / 768 ✅ | 1440 / 1440 ✅ |
| `/docs/getting-started` | ✅ | ✅ | ✅ |
| `/docs/commands` | ✅ | ✅ | ✅ |
| `/docs/channels-models` | ✅ | ✅ | ✅ |

**方法学补强（重要）**：`src/client/styles.css:2535` 有 `.landing { overflow-x: clip }`，它会把 `.landing` 内部的超宽元素裁掉而不撑大 `documentElement.scrollWidth` —— 单看 `scrollWidth === clientWidth` 会漏判"内容被裁"。因此脚本额外统计 `offenders`（任何 `rect.right + scrollX > clientWidth + 1` 的元素，不受祖先 clip 影响）。

**Lead 复核更正（11:52）**：本报告早期版本写的是"16/16 组合 offenders 全为空"，与 `design/review-2026-10-27/verify/metrics.json`（11:25 那轮）不符。实测 offenders 在 5 组里非空，但全部属于**设计内、有意为之的两类**：

| 页面 | 宽度 | 越界元素 | 最大 overflow | 为什么不是缺陷 |
| --- | --- | --- | --- | --- |
| `/` | 1440 | `div.orbit.orbit-two` | 24px | hero 装饰虚线圆：`src/client/styles.css:2620-2634` 的 `.orbit{position:absolute;inset:0}` + `.orbit-two{transform:scale(1.25,1.05)}`，被同文件 `:2535` 的 `.landing{overflow-x:clip}` 裁在视口内 |
| `/` | 1024 / 768 / 390 | `div.orbit.orbit-two`、`div.orbit.orbit-one` | 133 / 142 / 131px | 同上 |
| `/pricing` | 390 | `table`、`thead`、`tr`、`th`、`td` | 151px | 对照表在 `.seopage-table-scroll{overflow-x:auto}`（`src/client/pages/seo-page.css:285-289`）+ `table{min-width:520px}` 里本就要横向滚动，`role=region` + `tabIndex=0` 可键盘滚动 |

除这两类外：**0 个元素越界**，16/16 组合 `documentElement.scrollWidth === clientWidth` 成立，无横向滚动条。

## 4. `#how` 锚点遮挡

触发方式两种都测了：① 直接导航 `/#how`；② `scrollIntoView({ block: 'start' })`。首页页头 `.site-header` 在 1440/1024 实测高 65px、768/390 实测 61px。

| 宽度 | 页头下沿 | 标题上沿 | 间距 gap | 是否遮挡 | scroll-margin-top |
| --- | --- | --- | --- | --- | --- |
| 1440 | 888 | 943 | **55px** | ❌ 未遮挡 | 88px |
| 1024 | 888 | 943 | **55px** | ❌ 未遮挡 | 88px |
| 768 | 943 | 1002 | **59px** | ❌ 未遮挡 | 88px |
| 390 | 1330 | 1389 | **59px** | ❌ 未遮挡 | 88px |

`scrollY` 落地值 823（1440/1024）/ 882（768）/ 1269（390）。hero 次按钮文案「看看三步怎么配」→ `href="/#how"`，四档宽度均一致，`a[href*="/demo"]` 在各页各宽度均为空数组。

同一区块里三个 tab（`01 配置模型` / `02 连接微信` / `03 开始聊天`）在各宽度下**始终等宽**，没有出现文案长短导致的参差（390 下是 3 等分 112px、两行高 81px）：

| 视口宽 | 1440 | 1200 | 1024 | 981 | 900 | 768 | 390 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 每个 tab 宽×高 | 379×59 | 373×59 | 315×59 | 300×59 | 273×59 | 235×59 | 112×81 |

## 5. 真实截图区（`.landing-real`）

`.landing-real-grid` 列数随断点变化（`src/client/landing-real.css:88` 的 980px 断点）：

| 视口宽 | 列数 | 单列宽 | 卡片实测（宽×高） |
| --- | --- | --- | --- |
| 1440 | 2 | 569px | wide 1160×869；569×722、569×722、569×440、569×440 |
| 1024 | 2 | 473px | wide 968×746；473×626、473×626、473×411、473×411 |
| 981 | 2 | 451.5px | wide 925×719；452×604、452×604、452×399、452×399 |
| 980 | **1** | 924px | 断点生效，全宽单列 |
| 900 | 1 | 844px | 全宽单列 |
| 860 | 1 | 804px | 全宽单列 |
| 768 | 1 | 728px | wide 728×611；728×851、728×770、728×520、728×517 |
| 390 | 1 | 350px | wide 350×394；350×497、350×458、350×338、350×337 |

即：**981px 及以上两列（最窄 452px），980px 及以下单列**，不存在"两列把界面截图压到看不清"的窄列区间 —— 与 `landing-real.css:86-92` 注释的设计意图一致。

图片加载与比例（`naturalWidth > 0` = 没裂图；drift = 渲染宽高比与文件宽高比偏差，阈值 ±1%）：

| 图片 | 文件尺寸 | 1440 渲染 | 1024 渲染 | 768 渲染 | 390 渲染 | 最大 drift |
| --- | --- | --- | --- | --- | --- | --- |
| `wechat-reminder.jpg` | 1382×880 | 1158×738.4 | 966×616.1 | 726×463.3 | 348×222.6 | 0.44% |
| `channel-add.jpg` | 1260×1260 | 567×568.0 | 471×472.0 | 726×727.0 | 348×349.0 | 0.29% |
| `wechat-connect.jpg` | 1360×1207 | 567×504.2 | 471×419.0 | 726×645.3 | 348×309.8 | 0.32% |
| `wechat-search.jpg` | 1235×672 | 567×309.5 | 471×257.3 | 726×396.0 | 348×190.3 | 0.52% |
| `wechat-notes.jpg` | 1360×734 | 567×307.0 | 471×255.2 | 726×392.8 | 348×188.8 | **0.53%** |
| `workspace-overview.jpg`（`.landing-preview`） | 1440×900 | 754×471.3 | 562×351.3 | 726×453.8 | 348×217.5 | 0.00% |

全部 `naturalWidth > 0`（无裂图），drift 最大 0.53% ≪ 1%。把**全站所有 `<img>`** 一起算（36 次测量，含页头/页脚图标）也同样是 **0 张 `naturalWidth=0`**。HTTP 层单独核验：

```
wechat-reminder.jpg     HTTP 200  67332 bytes  image/jpeg
channel-add.jpg         HTTP 200  87916 bytes  image/jpeg
wechat-connect.jpg      HTTP 200 117019 bytes  image/jpeg
wechat-search.jpg       HTTP 200 103114 bytes  image/jpeg
wechat-notes.jpg        HTTP 200  49170 bytes  image/jpeg
workspace-overview.jpg  HTTP 200 109072 bytes  image/jpeg
```

prerender 出的 HTML 里每张 `<img>` 都带与文件**完全一致**的 `width`/`height`（1382×880、1260×1260、1360×1207、1235×672、1360×734、1440×900）+ `loading="lazy"` + `decoding="async"` + 中文 alt，CLS 与无障碍都覆盖到了。

> 三步区（`#how`）最终实现用的是 CSS 示意图，没有 `<img>`（Lead 决策：390px 宽下真实弹窗截图里的字会小到看不清）。因此 task-4 原描述里"三步区图片 naturalWidth"一项无测量对象，改为目视核对 Step 01 文案与新的配置路径一致（"选服务商 + 粘贴 API Key"、"协议与请求地址自动填好"）——见截图 `home-1440-how.png`、`home-390-how.png`。

## 6. 控制台与网络

所有被测页面（4 页 × 4 宽度 + 4 个文档页 × 3 宽度 + 断点带 6 档）收集 `Runtime.consoleAPICalled`(error/warning/assert)、`Runtime.exceptionThrown`、`Log.entryAdded`、`Network.responseReceived`(>=400)、`Network.loadingFailed`：

- **共 4 条，全部来自我故意的 `/demo`、`/demo/app` 探测请求**（期望的 404，用于确认路由已删）：
  ```
  GET http://127.0.0.1:5321/demo      → 404（console error + network 404）
  GET http://127.0.0.1:5321/demo/app  → 404（console error + network 404）
  ```
- 除这 4 条外：**0 条 console error、0 条 4xx/5xx、0 张图片 404**。

## 7. 截图归档

目录 `design/review-2026-10-27/verify/`：

| 文件 | 尺寸 | 内容 |
| --- | --- | --- |
| `home-1440-full.png` | 1440×6553 | 首页整页（1440） |
| `home-390-full.png` | 390×8839 | 首页整页（390） |
| `home-1440-how.png` | 1160×657 | `#how` 三步区（1440） |
| `home-390-how.png` | 350×1012 | `#how` 三步区（390） |
| `home-1440-real.png` | 1160×2304 | `.landing-real` 真实截图区（1440） |
| `home-390-real.png` | 350×2350 | `.landing-real` 真实截图区（390） |
| `slices/home-390-part{1,2,3}.png` | 390×~2947 | 390 整页切片（便于逐段查看） |
| `slices/check-header-artifact.png` | 1160×240 | 复核用窄带：`.landing-real` 宽卡里曾出现页头假象的位置，现已干净 |

> 说明：`home-*-how.png` / `home-*-real.png` 是元素级裁剪截图，拍摄时已临时把 `.site-header` 设为 `visibility: hidden`，否则 `captureBeyondViewport` 会把 sticky 页头贴在当前 `scrollY` 处、烤进裁剪区域中间（看起来像"页面正中多了一条导航栏"）——那是截图方法的假象，不是页面缺陷。若后续有人重拍这几张图，请保留这个处理。

## 8. 数据文件

| 文件 | 内容 |
| --- | --- |
| `verify/metrics.json` | 主矩阵 16 组合的完整测量（scrollWidth/clientWidth/offenders/images/heroSecondary/demoLinks/gridInfo/tabsInfo + anchors + demoProbe + issues） |
| `verify/breakpoint/metrics.json` | 1200/1000/981/980/900/860 断点带 |
| `verify/docs/metrics.json` | 4 个文档页 × 390/768/1440 |
| `verify/layout-run.log` | 主矩阵控制台输出（含横向溢出表、图片表、网格表、控制台问题） |
| `verify/test-full.log` / `verify/build.log` | 测试与构建完整日志 |

复现命令（`pnpm dev` 需在 5173 上跑着，供 `/api` 代理；静态服务端口自选 5300+）：

```bash
cd /path/to/wechatai
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node scripts/verify-layout.local.mjs --port 5321 --out design/review-2026-10-27/verify
node scripts/verify-layout.local.mjs --port 5322 --widths 1200,1000,981,980,900,860 --pages / --shotWidths "" --sections "" --out design/review-2026-10-27/verify/breakpoint
node scripts/verify-layout.local.mjs --port 5323 --widths 390,768,1440 --pages /docs/wechat-connection,/docs/getting-started,/docs/commands,/docs/channels-models --shotWidths "" --sections "" --out design/review-2026-10-27/verify/docs
```

（脚本在 `scripts/*.local.mjs`，已被 gitignore；不写 `/tmp`。）

> 踩坑备忘（复跑时注意两条，否则会得到假数据）：① `--onlyShots` 会覆盖 `metrics.json` 里的矩阵结果，别用同一个 `--out` 目录先跑矩阵再跑 onlyShots；② 懒加载图必须逐帧滚动（`await requestAnimationFrame()` + 停顿）才会真的加载，同步 `scrollTo` 循环会把 6 张图里 3–4 张误报成"裂图"。

> 环境状态：验证结束时我已把 `pnpm dev` 关掉、5173 端口交还（我起的静态服务端口 5321/5322/5323/5324 都是随进程退出的），没有残留 chrome-headless-shell 进程。

---

## 9. 问题分级

### P0（阻塞交付）

无。

### P1（交付前应修）

无。

### P2（建议修 / 需知会）

**P2-1 `wechat-reminder-followup.jpg` 是未使用资产（75 KB 白进部署包）**

- 证据：`grep -rn "wechat-reminder-followup" src/ public/` → 0 命中；文件存在 `public/images/real/wechat-reminder-followup.jpg`（75,441 bytes，1348×734）。
- 影响：只增加部署体积，不影响正确性。若本来打算用于文档页/后续区块，请归入下一批；否则删掉。
- 复现：`ls -la public/images/real/wechat-reminder-followup.jpg && grep -rn wechat-reminder-followup src/ public/`
- **已处理（Lead，11:47）**：文件已删除（`rm -v public/images/real/wechat-reminder-followup.jpg`）。原图仍完整保留在 `design/review-2026-10-27/k2-assets/`，将来要用随时能取回；删除后重跑 `lint/typecheck/test/build` 全绿，`dist/client/images/real/` 只剩 6 张被引用的图，`dist` 内无 followup 残留。
- **本条已被推翻（同日 11:59 之后）**：那个"中断"的会话其实被恢复并继续推进，它给文档页新增了引用 —— `src/client/pages/doc-screenshots.ts:84` 的 `reminderClarify`（文档页「定时提醒」一节）指向这张图。文件已按同一配方从 `design/review-2026-10-27/k2-assets/b2.png` 重新导出恢复（crop `(0,0,1348,734)`、quality 85、optimize、progressive、subsampling 0，产物 75,441 bytes / 1348×734，与原件字节数一致）。结论：它现在是有引用的正式资产，"未使用资产"不成立，不再计入问题。教训见 `code-review-2.md` 的"并发写者"一节。

**P2-2 真实截图区第一行两张卡片图片比例不同，右侧卡片底部留白 ~64px**

- 证据：`channel-add.jpg` 是 1:1（1440 下渲染 567×568），`wechat-connect.jpg` 是 1.127:1（567×504）；`.landing-real-card` 是 `display:flex; flex-direction:column` 且 grid 默认 stretch，两卡片被拉到同高 722px，于是右侧卡片 caption 之下多出约 64px 空白。
- 观感：正视截图里能看出来（左卡 caption 三行收在底边，右卡收在中间偏上），非功能缺陷。
- 建议（二选一）：① 把这一对调成比例接近的图（`wechat-connect` 裁成接近正方形再裁掉多余留白）；② 给 `.landing-real-card img` 加 `object-fit: cover; aspect-ratio: 1 / 1`（只对非 `.is-wide` 生效）让同排等高。
- 位置：`src/client/landing-real.css:44-50`（img 规则）、`.landing-real-grid` 见 `:24-29`。
- 复现：`home-1440-real.png` 第一行；或 `node scripts/verify-layout.local.mjs --port 5321 --widths 1440 --pages / --shotWidths 1440` 看 `gridInfo.cards` 的 h 差值。
- **Lead 决定（11:52）：本轮不改，等换图。** 两个建议的代价都比现状大：`wechat-connect.jpg` 是 1360×1207 的整屏配置页截图，按 ① 裁成接近正方形要横向切掉约 11%（右侧"填写 API Key / 保存"那一列会被切）；按 ② `object-fit:cover; aspect-ratio:1/1` 同样是 `cover` 裁剪，一样会吃掉界面内容。为了消掉一块空白去裁真实界面截图，得不偿失。当前同排等高、边框对齐的栅格在截图里看着是整齐的（`home-1440-real.png`），64px 只是右侧 caption 少一行的自然结果。**将来重拍/补图时，挑一组比例接近（都 1:1 或都 4:3）的配对即可根除。**

**P2-3 全量并发下存在既有 flaky 用例（与本次改动无关）**

- 我自己在 09:50 那轮**并发跑 Chrome 实测时**遇到 `test/personal-assistant.test.ts > personal reminders > pauses reminders for disabled and expired Plus, resumes after recovery` 失败 1 次（`AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times`，`test/personal-assistant.test.ts:1584`）；该文件单独连跑 4 次全绿，独占跑全量也全绿。Lead 报告 `test/llm-tools.test.ts` 的「shrinks only tool text to fit the whole request…」在全量并发下同样偶发失败、单跑通过。
- 结论：是时间/CPU 敏感用例在并发下的 flaky，**不是本次改动的回归**；CI 上若偶发红灯，先单独复跑该文件再判断。
- 建议：给这两处断言加显式等待或固定时钟（`vi.setSystemTime`），别让偶发失败污染回归信号。
- 复现：`pnpm test`（机器有负载时更易复现）；单跑 `pnpm exec vitest run test/personal-assistant.test.ts` → 78 passed。

**P2-4 既有 build 告警：单个 chunk 552.80 kB（gzip 185.42 kB）超过 500 kB 提示线**

- 与本次改动无关（`assets/index-*.js`，来自 workspace/schemas 依赖），不影响构建通过（exit 0）。
- 复现：`pnpm build 2>&1 | grep "larger than 500 kB"`。

---

## 10. 需要 Lead 知晓的一处"任务书 vs 实现"偏差

task-3 验收项 3 写的是"把每步的 CSS 假示意图替换为真实截图"，最终实现仍是 **CSS 示意图**（`src/client/landing-steps.tsx` 的 StepPreview），真实截图集中在新的 `.landing-real` 区块。

- 判断：这是**有理由的产品取舍**，不是遗漏 —— 390px 宽下三步区的真实弹窗截图，正文会缩到 ~7px 不可读；而把 5 张真实图集中在 `.landing-real` 里整行/两列展示，读起来是舒服的（见 `home-1440-real.png`）。我按现状验证，未视为缺陷。
- 但如果这份 task-3 验收项要写进交付说明，措辞需要改成"真实截图集中在一个独立区块展示，三步区保留示意图"。

---

## 11. 与 Lead 自测数据的交叉核对

| 项 | Lead 自测 | 我的实测 | 一致 |
| --- | --- | --- | --- |
| 4 页 × 4 宽度横向溢出 | 全无 | 全无（16/16） | ✅ |
| 6 张图 HTTP + 裂图 | 全 200、无裂图 | 全 200、`naturalWidth>0` 全部成立 | ✅ |
| hero 次按钮 → `#how` | `location.hash=#how`, `scrollY≈823` | 四档 `href="/#how"`，`scrollY` 823/882/1269 | ✅ |
| `#how` 标题未被页头遮住 | h2 top 120 > 页头底 65 | gap 55–59px，`covered=false` | ✅（数值口径不同：Lead 量视口内坐标，我量文档坐标差值） |

## 12. 结论

本次「删除 /demo + 真实截图落地 + 死 CSS 清理」改动在功能、布局、资源加载、SEO 产物与测试层面均无回归。三条 P2 都不阻塞：P2-1（未使用图片）、P2-2（同排卡片图片比例不齐）建议顺手修掉；P2-3、P2-4 是既有问题，随手记录即可。

---

## 13. Lead 收尾处理（11:47-11:53，本报告之后的动作）

原验证会话在第 46 步后中断，以下由 Lead 接续完成，记录在此以便追溯：

1. **P2-1 已修，随后又被推翻**：11:47 删除 `public/images/real/wechat-reminder-followup.jpg`；11:59 恢复的旧会话给文档页加了引用，12:2x 由本轮 code review 按原配方重新导出恢复（见 §12 P2-1 末尾的"推翻"条目）。
2. **P2-2 不改**：理由见 §9 P2-2 末尾的"Lead 决定"，本轮不裁真实界面截图。
3. **§3 offenders 结论已更正**：见 §3 的"Lead 复核更正"表格 —— 越界元素只有 hero 装饰圆（被 `overflow-x:clip` 裁剪）和 `/pricing@390` 的横向滚动表壳两处，都属设计内。
4. **删除后重跑全量门禁**（`.continue-final-gates.local.log`，EXIT=0）：
   - `pnpm lint` → 0 warnings / 0 errors
   - `pnpm typecheck` → 无错
   - `pnpm test` → 主套 61 files / 1144 tests passed；客户端套 7 files / 48 tests passed
   - `pnpm build` → exit 0，`Prerendered 40 public pages, private route shells and a 404 page`，`SEO checks passed`，仅剩 §9 P2-4 的既有 chunk 体积提示
5. **产物核对（已过时，见下）**：当时 `dist/client/images/real/` = 6 张，`dist` 内 `*followup*` 命中 0。现状是 7 张（含恢复的 `wechat-reminder-followup.jpg`），全部有引用。
6. **待办（未做）**：`git commit` —— 工作区含 58 个已改文件 + 若干未跟踪目录（`design/review-2026-10-27/` 未进 `.gitignore`，上一轮的 `design/review-2026-10-25/` 也是未跟踪状态），提交范围等用户确认。
