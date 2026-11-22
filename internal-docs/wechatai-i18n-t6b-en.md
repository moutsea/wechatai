# Wechatai i18n T6B 英文开发者页

## 交付与原子性

当前卡 `938b4454-a086-4bf4-a515-d655e67f80a3` 整组交付四个英文开发者 HTML，使用一个以 `main` 为 base 的 OPEN PR。插件协议由一个组件渲染，OpenClaw、Hermes 和 Muse 共用一个接入指南组件。四页共用同一套语言登记、预渲染和索引规则，可逐页验收。回退该 PR 可一并撤销这组译文、链接和索引信号，无需处理持久数据。评估为中等规模，主要工作量是技术译文校对和公开页面回归。

## 范围

- 只登记 `/en/developers/plugins`、`/en/developers/openclaw`、`/en/developers/hermes`、`/en/developers/muse`。`src/shared/i18n/en/developer-pages.ts` 按现有约定默认导出四条完整登记，纯文案可放 `en/` 下的子目录。沿用 `load.ts` 自动发现、`LocaleProvider` 和现有路由及预渲染入口。
- `src/client/pages/plugin-protocol.tsx` 与 `src/client/pages/openclaw-guide.tsx` 按 locale 选择完整正文及页面专属文案。覆盖插件协议的目录、资源链接标签、复制按钮及反馈、状态说明与页内页尾；覆盖三份指南的 Markdown 入口标签、标题和正文。保留现有组件、代码复制行为和锚点 ID。英文页面的可执行命令、代码块、配置键、示例、API 路径和协议版本沿用中文源，译文也保持支持范围、计费和投递限制。
- HTML 内链复用 `localizedHref` 或现有同类逻辑，保留查询参数及锚点。插件协议中的 Muse 指南链接进入相应英文页。页内 `/docs` 链接可使用已登记的 `/en/docs`。原始 Markdown、`/llms.txt`、JSON/Schema、安装器和下载链接沿用无语言前缀的地址。
- 检查 `src/shared/seo.ts` 的开发者页面分支。当前通用登记覆盖标题与 description，但开发者 JSON-LD 仍使用中文源数据。只在该分支引入四页的英文 SEO 文案，保持既有 `WebPage`、`Article` 和面包屑结构。英文 Muse 的 `Article` 与 `FAQPage` 使用英文 canonical，FAQ 问答与正文同源。共享站点及组织标识沿用现有定义。
- 中文 HTML 继续使用 `src/shared/plugin-docs.ts`、`openclaw-docs.ts`、`hermes-docs.ts`、`muse-docs.ts` 的现有内容。`src/server/plugin-docs.ts` 继续提供中文机器可读端点，协议 JSON、Schema、manifest、下载及 LLM 索引保持现有契约。英文正文只接入 HTML 渲染。

范围外为 T6A 法务与联系页、`/docs` 使用文档正文、全站共享页头页脚翻译、通用路由及 SEO 基础设施、Worker 或 Go 业务逻辑、数据库、依赖和部署配置。交付止于 OPEN PR，禁止合并或部署。

## 基线、依赖与负责人

- T1 #12 的合入提交 `f83537a` 已在当前基线。评估时任务分支 `feature/wechatai-i18n-t6b-h2h` 与本地 `origin/main` 均为 `80cc35cc9e768390a7177f0af9a56fb074c6335f`。此环境的 GitHub 查询遇到 DNS 解析失败，远端最新 SHA 待开发开工时核对。复用当前任务分支及看板已设定的 `main` base。保存实际 base SHA，基线和变更验证使用同一组本地预览参数。
- T6A 和 T6B 分别交付、验收和回滚。T6A 使用 `site-info` 页面及英文登记，本卡使用 `developer-pages` 登记、开发者渲染组件及独立测试文件。目前无未满足的前驱，无需加阻塞关系。
- 共用文件的冲突面是 `src/shared/seo.ts`。本卡只编辑开发者分支，T6A 如需调整结构化数据，只编辑法务/联系分支。若确认必须编辑同一处且两卡尚未合入，采用 T6A 先合入的 `main` 为 T6B 新基线，先与对应负责人确认。如果其中一张已由维护者合入，另一张以包含该变更的 `main` 重做差分验收。`i18n/load.ts`、共享路由和通用 SEO 校验脚本应直接复用，测试按本卡主题新增文件。
- PR 负责人为「开发中」指派的开发 agent（profile `916bf250-fb21-4262-9419-f9aad4e07699`），负责实现、验收证据和评审反馈。「评审通过」的提 PR agent（profile `92d67037-1df0-4f19-bf5e-8cb0c4965f2b`）按看板流程核对最终 HEAD 的独立评审结论并创建或复用本卡唯一的 OPEN PR。

## 风险

**中风险。** 同一份中文源同时服务人读 HTML 和机器可读端点。英文选择放在 HTML 层，使用相同基线的 HTTP 响应体逐字节对照。协议示例、配置键或投递限制的翻译偏差可能误导接入，需与当前中文源逐项校对。漏接 locale 或复用中文 JSON-LD 会造成英文 URL、客户端和搜索元数据不一致，用预渲染与浏览器接管后的结果覆盖这一风险。

## 验收与证据

1. 构建后按 `docs/development.md` 用 `pnpm exec vite preview --host 127.0.0.1 --port 5174` 做本地生产式预览，并运行 `pnpm test:seo http://127.0.0.1:5174`。四条英文 URL 首次 GET 直接返回 HTTP 200 和 `text/html`。逐页核对英文标题、正文和专属标签，检查协议目录锚点与复制控件、Muse 指南链接和 `/en/docs` 链接、三个指南的原文入口。覆盖客户端接管后的英文正文与链接，抽查中英切换。按贡献指南随 PR 附前端截图。
2. 四个中英页面组分别自 canonical。英文为 `lang="en"` 与 `og:locale=en_US`，中文为 `zh-CN` 与 `zh_CN`。两边都含指向对应中英页的 `hreflang`，`x-default` 指向无前缀中文页。英文标题、描述、页面结构化数据与可见内容相符，Muse 的 FAQ 逐条对应。与同一基线比较 sitemap URL 集合，恰好新增以上四条，无删除。抽查 `/en/developers/notifications` 和 `/en/developers/plugins.md` 走真实 404。
3. 中英文逐页核对政策与技术事实、可执行命令、代码块、配置键、示例和现有锚点。四个中文 HTML 仍返回 200，正文、页内控件和链接与基线一致，比较时忽略构建资源指纹及新增的语言切换和 hreflang。
4. 在同一 base 和本卡 HEAD 分别构建并预览。对以下五条完整路径记录 HTTP 200、Content-Type 及原始响应体，用 `cmp` 核对字节并记录 SHA-256。复用已有 Worker 测试与 SEO HTTP 检查覆盖协议 JSON/Schema、manifest、下载入口和 `/llms-full.txt` 的回归。

   - `/developers/plugins.md`
   - `/developers/openclaw.md`
   - `/developers/hermes.md`
   - `/developers/muse.md`
   - `/llms.txt`

5. `pnpm check` 通过，包含 lint、类型检查、测试、构建和构建后 SEO 验证。新增本卡独立回归用例，运行相关 `pnpm test:browser` 用例与贡献指南要求的 `pnpm test:openclaw`。提交前对暂存内容执行 `pnpm check:public`。重活开始前查看 load、`MemAvailable` 和现有构建/测试进程。已有重活或可用内存低于 2 GiB 时说明并等待，基线和 HEAD 的重活全程串行。PR 记录实际命令、输出、base/head SHA 和改动文件清单。
6. 本规划仅存放于仓库根 `internal-docs/wechatai-i18n-t6b-en.md`。公开树、源码导入、文档登记与 `/api/docs` 都排除本文件。构建后扫描 `dist/client` 与 `dist/wechatai` 产物，确认无本文件名或独有标题；在本地生产式预览确认文件直链不可访问，`/api/docs` 不返回本文。
