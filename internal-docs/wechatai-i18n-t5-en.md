# wechatai i18n T5：英文文档族 20 页

## 交付、依赖与风险

- **一个原子任务、一个 OPEN PR，base 为 `main`。** 交付 `/en/docs` 索引和 19 篇英文文章。15 篇指南与 4 篇教程共用索引、搜索、上下篇导航、正文渲染和 SEO；按栏目拆分会引入中间态以及重复修改共享文件。用路径清单逐页审阅；整组登记、内容和界面可通过回退同一个 PR 一起撤销，无持久数据改动。
- **风险：中等。** 主要风险是文档可访问但未预渲染、英文页面混入中文正文或 SEO 文案、中文锚点及导航回归、操作说明或额度被译错。中文截图保留；当操作依赖中文按钮名时，英译说明应保留可对照的原界面标签。
- **依赖：T1 已完成。** PR #12 已进入 `main`；评估时 `origin/main` 和 `feature/wechatai-i18n-t5-en-zqv` 的 HEAD 均为 `f83537a`。沿用 T1 注册表和公开路径机制。T2/T3 的译文不是本卡功能前置，首页和价格未登记时保留合法的中文目标。
- **分支与文件冲突：** 使用当前 T5 feature 分支，开发及最终验收前核对 `origin/main`，不以落后的本地 `main` 或其他 feature 分支为 base。T5 独占 `src/shared/i18n/en/docs-*` 与文档模板和正文；重点冲突是 T2/T3 已改的 `src/shared/seo.ts`，以及 T2 已改的 `site-header.tsx`、`site-footer.tsx`、通用浏览器用例，T3 已改的 `prerender.tsx`。文档用例独立，直接复用现有路由和页壳；若仍须与在途卡改同一文件，该文件以 T2/T3 先合入后的 `origin/main` 为最终基线，届时刷新差异和验收。若 T4/T6 同期改同一文件且尚未合入，T5 先合入、T4/T6 以含 T5 的 `main` 为基线；已经合入的共享改动一律保留。开发可并行，不堆叠 PR。
- **PR 负责人：** 当前卡「开发中」指派的开发 agent（profile `916bf250-fb21-4262-9419-f9aad4e07699`），负责翻译、逐页校对、开 PR、提交证据并处理评审反馈。此阶段禁止合并或部署。

## 范围与边界

- `/en/docs`，以及下列 `/en/docs/<slug>`（以 `src/shared/docs.ts` 的 `DOC_ARTICLES` 为准）：
  - 指南：`getting-started`、`channels-models`、`model-providers`、`wechat-connection`、`commands`、`sessions`、`attachments`、`credits`、`faq`、`cloud-agent`、`ds-chat`、`image-generation`、`roleplay`、`personal-assistant`、`notifications`。
  - 教程：`wechat-ai-assistant`、`deepseek-in-wechat`、`multiple-openclaw-in-wechat`、`hermes-in-wechat`。
- 复用 `src/client/pages/docs.tsx`、`docs-content.ts`、`guide-content.ts` 及其 `doc-*.tsx`、搜索和章节目录。翻译索引卡片与分类、侧栏、搜索提示和空结果、目录、上下篇、正文、表格、FAQ、图注和无障碍文案；检查专用图示和交互组件中的硬编码文案。按功能组织英文 `docs-*.ts`；T1 会扫描语言目录直属 `.ts`，其默认导出必须是已完成页面登记数组，纯数据模块可放子目录。不要为未完成正文登记占位路由。
- 命令、代码块、参数名、已有正文链接目标、锚点 ID 和图片资源保留。文档页壳生成的索引、搜索和上下篇链接使用已登记英文路径；未登记的跨区目标仍走现有中文 URL。用中文版及既有事实来源核对额度、限制、套餐和前置条件，复用已有常量，不复制计费规则。
- SEO 沿用 T1，覆盖英文标题、摘要、文档结构化数据（含目录、面包屑和 FAQ）及当前页 canonical；仅为已登记页面生成英文预渲染、sitemap 项和 hreflang。中文默认路径、旧 `/guide` 跳转及已有对外 API 保持原样。
- 不做其他语种、营销页或开发者文档翻译、截图重制、全站页壳重构、Go/Worker API、配置迁移或新依赖。当前计划仅放根目录 `internal-docs/`，不得作为公开文档注册、导入客户端或服务端 bundle、复制到静态资产或从 `/api/docs` 返回。

## 验收证据

1. 逐页列出全部 20 条路径：生产等效的本地预览实际 HTTP 200，首次 HTML 有对应英文标题和所选正文标记，浏览器进入后语言保持一致。逐篇对照中文核查术语、步骤、命令、链接和所有额度/限制；中文截图与示例中刻意保留的原文不算漏译。
2. 覆盖英文索引到指南及教程、搜索命中与无结果、目录锚点、上下篇和语言切换；对照同一基线确认 `/docs` 与 19 篇中文正文、URL 和锚点保持不变。对未登记的英文文档做真实 HTTP 404 验证，确认无中文正文回退，也无切换或搜索索引入口。
3. 基线与候选 sitemap 的 URL 集合差值恰好为这 20 条（无删除），原条目的 `lastmod` 不变。核对每对中英文页面的 canonical、`lang`、`og:locale`、双向 hreflang，且 `x-default` 指向同页中文 URL；核对英文 JSON-LD 与可见内容一致，生成的文档索引不指向未登记的英文页。
4. `pnpm check`（已含构建）通过；按仓库现有脚本执行相关文档浏览器用例及 `pnpm test:seo`。全量测试和构建串行；开始前查看 load、`MemAvailable` 及是否已有重活，内存低于 2 GiB 或有重活就说明并等待。PR 附命令结果、路径和 sitemap 差异、改动文件清单，并检查公开静态资产及 Worker bundle 不含内部计划，根目录内部文档直链和 `/api/docs` 不暴露计划内容。
