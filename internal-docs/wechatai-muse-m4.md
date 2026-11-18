# Muse M4：承接页与接入流程一致性

本卡 `d4f6f902` 是一个原子任务、一个 PR：让 `/wechat-muse` 的访客按真实流程走到扫码、插件配置和首条微信任务。改动应能通过单独撤回本 PR 回滚，无数据迁移。风险低，主要风险是误导用户或影响共用承接页渲染。

## 范围和现状

- 以 `src/client/pages/plugin-library.tsx:102` 的 Muse 库条目、`src/client/pages/plugins.tsx:499` 的插件入口及实际连接组件 `src/client/pages/openclaw-editor.tsx:238`、`:259`、`:285` 为对照。M1 的正文已区分「连接 Muse」和「复制 Muse 连接指令」；快速答案和步骤摘要仍压成「点击『连接 Muse』复制指令」（`src/shared/seo-content/wechat-muse.ts:13`、`:36`），统一写清先后顺序。
- 现有主 CTA `/app/wechat`，正文有 `/app/plugins`（`src/shared/seo-content/wechat-muse.ts:27`、`:58`、`:60`）。保留扫码入口，并确保手机上能明显找到添加插件的下一步。延用现有样式与中文用词。
- 依 `src/shared/muse-docs.ts:9`、`:14`、`:19` 和 `integrations/muse/` 核对扫码、`/wx help`、连接指令、hook 和在线状态。公开指南的来源是 `museGuide`（`src/server/plugin-docs.ts:186`）；指南自身差异能在本卡说明并由 M2 范围处理，不依赖修改指南完成本卡验收。
- `src/client/pages/seo-page.tsx:12`、`:38` 的通用渲染未给 Muse 长步骤提供折叠或命令复制控件。优先使用现有前端模式，限定交互改动于 Muse 承接页；如触及共用渲染，验证其它承接页维持现状。
- 不做后端、连接器、配对 TTL、在线判定、微信鉴权、计费、生产配置或泛 SEO 改造；不引入依赖。只说明文字和微信已转写语音，不承诺图片、文件、工具审批或 Muse 原生命令。

## 验收和证据

1. 对照表列出页面每一步、实际入口或文案、源码文件与行号，以及差异处理：微信扫码 → 在对应会话发 `/wx help` → 插件页添加 Muse → 「连接 Muse」生成 → 「复制 Muse 连接指令」→ 将指令发给自己的 Muse 主聊天 → 按 `SETUP.md` 注册并启用 hook → 实际轮询成功后显示已连接 → 在微信用 `/use muse` 或 `@muse` 发任务，快捷名以配置为准。写清指令 10 分钟有效、过期需重新生成、安装或 dry run 完成不等于在线，且不出现「直接安装」「无需绑定」等误导。
2. 两个 CTA 分别实际指向 `/app/wechat` 和 `/app/plugins`。320–390 px 检查扫码入口及下一步可见、长步骤可展开收起、页面无横向溢出、示例命令可复制且反馈可见；确认桌面入口可用。给出截图或构建产物及浏览器断言，不录入真实配对指令、账户资料或凭据。
3. 扩展 `test/wechat-muse.client.test.tsx` 覆盖公开内容顺序与目标链接，并复用 `test/muse.client.test.tsx` 核对插件侧；运行 `pnpm check` 和适用的现有浏览器测试 `pnpm test:browser`。全量检查、构建及浏览器验收中的重活串行；启动前检查 load 和 `MemAvailable`，若已有重活或可用内存不足 2 GiB 就等待并说明。本评估阶段未运行这些测试。
4. 本文件只在仓库根 `internal-docs/` 下；不要将其导入 `src/`、登记公开文档路由或复制到 `public/`。检查构建产物不包含该文件或内部卡片标识，公开文档 bundle 与 `/api/docs` 不包含该文件。

## 依赖、冲突和交付

- 硬前驱 M1 已合入 `main`（PR #8，`0f65688`）；以 M1 合并版为承接页基线。M2（PR #7，`e60ff2d`）也已合入，复用现有指南，无需再加阻塞卡。M3 不阻塞 M4；若也改 `src/shared/seo-content/wechat-muse.ts`，先合 M4 的接入流程文案，M3 再以含 M4 的 `main` 为基线叠加 SEO 调整，保留 M4 的步骤和 CTA。若 M3 已先落地，M4 更新基线后保留 M3 的非冲突内容并重跑验收。
- 开发分支 `feature/wechatai-muse-m4-z4n` 当前与核验的 `origin/main`（`0f65688`）一致；开发前刷新远端，用最新 `origin/main` 为开发基线。PR 目标为 `main`，已经用户确认，覆盖原卡描述中的 `master`（远端不存在该分支）。
- PR 负责人：当前卡「开发中」步骤指派的开发负责人，负责本卡改动、测试、证据和唯一 PR。PR 标题带 `M4 d4f6f902`，保持 OPEN；本卡不得合并或部署。

## 实施与验收记录（开发分支 `feature/wechatai-muse-m4-z4n`）

开发基线：`origin/main` `0f65688`。

### 页面步骤与实现对照

| 页面步骤 | 实际入口或文案 | 源码 | 差异处理 |
| --- | --- | --- | --- |
| 微信扫码 | 主 CTA「扫码绑定微信」→ `/app/wechat`；正文「微信连接」 | `src/shared/seo-content/wechat-muse.ts:27`、`:69` | 保留原入口，主 CTA 指向实际微信连接页 |
| 发 `/wx help` | 第一步标题与正文，命令按钮「建立回复通道」 | `src/shared/seo-content/wechat-muse.ts:39`、`:70`、`:32` | 与插件页文档一致 |
| 插件页添加 Muse | 次 CTA「添加 Muse 插件」→ `/app/plugins`；正文插件页链接 | `src/shared/seo-content/wechat-muse.ts:29`、`:71` | 新增首屏次 CTA，手机首屏即可进入下一步 |
| 「连接 Muse」生成 | 第 3 步「连接 Muse」生成一次性指令 | `src/shared/seo-content/wechat-muse.ts:71` | 先写生成，再写复制，不再压成一句 |
| 「复制 Muse 连接指令」 | 第 4 步复制指令，粘贴到 Muse 主聊天 | `src/shared/seo-content/wechat-muse.ts:72`、`:43` | 与 `openclaw-editor.tsx` 的按钮文案一致 |
| 按 `SETUP.md` 注册启用 hook | 第 5 步、步骤摘要、快速答案 | `src/shared/seo-content/wechat-muse.ts:73`、`:48`、`:13` | 明确由 Muse 在托管环境执行，不在本机终端 |
| 实际轮询成功才在线 | 快速答案、步骤摘要、接入约束 | `src/shared/seo-content/wechat-muse.ts:13`、`:48`、`:76` | 明示安装完成或 dry run 通过不等于在线 |
| `/use muse` / `@muse` | 第 6 步与可复制命令 | `src/shared/seo-content/wechat-muse.ts:74`、`:33-35` | 补充快捷名以配置为准 |

同时修正快速答案与步骤摘要中的「点『连接 Muse』复制指令」压缩表述；补充指令 10 分钟有效、过期在弹窗重新生成；未出现「直接安装」「无需绑定」等误导。

### 交互与移动端

- `src/client/pages/seo-page.tsx:195-203`：可选 `secondaryCta`，Muse 页面渲染 `/app/plugins`；其它承接页未配置时保持原行为。
- `src/client/pages/seo-page.tsx:220-232`：可选 `stepsSummary` 将三步概览包进原生 `details`（默认展开、可收起），可选 `commands` 渲染复制按钮并显示「已复制 / 复制失败」。
- `src/shared/seo-content/wechat-muse.ts:63-80`：`#connect` 六步正文使用既有区段 `details`（默认折叠），标题和目录锚点保留；无需改通用渲染或样式。
- `src/client/pages/seo-page.css:215-279`、`:580-582`：命令区与步骤折叠样式；窄屏单列。`code` 增加 `overflow-wrap: anywhere` 防止长路径横向溢出。
- 测试：`test/wechat-muse.client.test.tsx:35` 起覆盖顺序、双 CTA、三步概览与复制反馈；`test/browser/public-pages.spec.ts:965` 起在 320/390 px 断言双 CTA 可见、两种折叠、复制反馈与内容、无横向溢出。六步回归在 `aafbf75` 两种宽度均因第一步默认可见而失败；修复后逐项验证六步默认隐藏、展开可见、再次收起后隐藏。

### 首次开发验证（`aafbf75`，不替代返工后检查）

- `pnpm check`：通过（lint、typecheck、vitest 与生产构建；构建后 prerender 51 个公开页，SEO 校验通过）。
- `pnpm test:browser`：77 passed（含 Muse 320/390 px 用例）。
- `pnpm exec vitest run --config vitest.client.config.ts test/wechat-muse.client.test.tsx`：6 passed。

### 公开产物与路由隔离

- 本地构建产物：`dist/client` 为公开 HTML 与客户端 bundle，`dist/wechatai` 为 Worker（`wrangler.json` 指向 `index.js` 及 `../client`）。检查两目录的文件路径及内容均无 `internal-docs`、`wechatai-muse-m4.md` 或卡号 `d4f6f902`。旧记录中的 `dist/server` 不存在。
- 按生成的 `dist/wechatai/wrangler.json` 本地启动 Worker：`GET /developers/muse.md` 返回 `200 text/markdown`，正文与 `src/shared/muse-docs.ts` 的 `museGuide` 一致，实际注册点是 `src/server/plugin-docs.ts:183-187`。
- `/api/docs` 是独立的隔离检查，不是 Muse 指南路由：匿名 `GET /api/docs` 返回 `401`、JSON `unauthorized`；`GET /internal-docs/wechatai-muse-m4.md` 返回 `404`。三条响应都不含上述内部标记。
