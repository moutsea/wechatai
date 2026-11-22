# wechatai 语言选择改为下拉按钮

需求来源为 2026-11-22 的 Kandev 卡 `e91d3210-4b3d-4a8f-95da-21235a1dd4db`。

## 范围与原子性

当前卡交付一个目标为 `main` 的 PR。桌面公共页头和移动导航抽屉共用 `LanguageSwitcher`，下拉交互、样式和对应回归测试作为一次用户可见改动一起交付。回退此 PR 即可恢复平铺链接，无需数据迁移。

- 在 `src/client/language-switcher.tsx` 实现下拉，沿用 `src/client/site-header.tsx` 的桌面入口和窄屏导航抽屉。按当前断点只显示一个语言触发按钮。样式复用 `src/client/styles.css` 的变量和页头布局，图标沿用 `lucide-react`。
- 直接使用 `LocaleProvider` 的 `alternates` 和 `localizedPath`。候选项为当前页面已发布的语种，含当前语种；无译文的页面与未登记的本地化 404 继续隐藏切换器。语言项保留真实链接、`hreflang` 与现有 `lang` 处理，跨语种继续整页导航。按钮显示当前语种，语种名和可访问文案沿用 `LOCALE_DEFINITIONS` 与现有语言文案，包括韩文页对中文和日文的本地化名称。
- 范围限于公共页头语言交互及必要的 i18n 文案和测试。路由登记、URL 与查询参数规则、页面译文、SEO 元数据、工作台、账户菜单业务、后端及发布配置均在范围外。无需新增语种或 UI 库。

## 风险、依赖与分支

- **中等风险。** 公共页头在多种页面间复用。重点防止键盘焦点丢失、按 Esc 时误关外层移动抽屉、390px 溢出，以及切换到当前页未发布的译文。使用真实链接与现有路由数据，并以预渲染和浏览器回归覆盖这些行为。
- **无功能前置卡。** 主线已有 `zh-CN`、`en`、`ja` 和 `ko` 的已登记页面，可独立开发、验收和回滚。语种、路由和语言文案复用现有实现。仓库已有单 worker 的 Playwright 测试；axe 使用独立的浏览器测试工具或临时测试脚本，保留报告，不作为站点运行时依赖。
- **分支。** 复用现有 `feature/wechatai-qvi`，PR base 为 `main`。评估时本地 `origin/main` 和任务 HEAD 同为 `80cc35cc9e768390a7177f0af9a56fb074c6335f`。开发和提 PR 前复核远端 `main`，记录实际验收的 base/head 完整 SHA。
- **文件冲突面。** 本卡主要改切换器、页头、公共样式及对应的客户端和浏览器测试。已提 PR 的 T9（es）与 T10（pt）均修改 `src/client/language-switcher.tsx`、`src/client/site-header.tsx`、`test/browser/public-pages.spec.ts`、`test/i18n-en.client.test.tsx` 和 `test/i18n-ja.client.test.tsx`，涉及语言文案、链接及相关断言。若这些在途 PR 进入合并，建议共享文件按 T9 → T10 → 本卡的顺序吸收已合入的 `main`。本卡开发和独立 PR 验收可立即开始，无需等待，也无需将其他分支的改动带进来。共享文件基线更新后复验新增语种文案及主线已有的链接行为，尤其是 T9 若已合入的查询参数与片段保留。
- **PR 负责人。** 「评审通过」阶段的 `codex-review` 负责推送本卡分支、创建和维护唯一的 OPEN PR，并附 base/head SHA、验收结果和截图。开发阶段负责交付实现与证据。此卡交付止于 OPEN PR。卡片流转到「部署与验收」时仍以此卡的禁止合并、禁止部署要求为准。

## 验收标准

1. 翻译已登记的页面初始仅有一个可见语言触发按钮，显示当前语种。展开后每个已发布语种各出现一次，当前项高亮并有程序可读的当前状态；关闭后菜单项不可聚焦。重复点击触发按钮、点击外部或选中任一语种均收起。未翻译页面和未登记语言的 404 均无语言触发按钮。
2. Tab 可到达触发按钮且焦点清晰可见。按钮具有准确的 `aria-haspopup`、`aria-expanded` 和与菜单匹配的可访问名称。Enter 和 Space 均能展开，方向键可在菜单项间移动，Esc 关闭并将焦点还给触发按钮；在移动抽屉内，第一次 Esc 仅收起语言菜单。仅用键盘即可完成切换。用 axe 检查桌面和 390px 下的闭合及展开态，附结果，语言控件和页头无阻断问题。
3. 用真实构建页面从 `/pricing` 切换到 `/en/pricing` 和 `/ja/pricing` 各一次，并验证链接可返回 `/pricing`。核对实际地址、页面内容、`html[lang]`、链接 `hreflang`，保留现有 canonical 与 hreflang 回归。未登记语种不出现在菜单内。
4. 桌面固定页头在开合前后保持同一高度，且不高于基线。390px 下从移动导航抽屉操作，菜单与全部选项可达，页面与菜单均无横向溢出。PR 附桌面和 390px 各一张展开态截图。对应的渲染 HTML 片段可作为结构证据。
5. 更新 `test/i18n.client.test.tsx`、`test/i18n-ja.client.test.tsx` 里平铺链接的断言，保留目标路径、语言标签与无译文断言，并验证展开状态及当前项。同步检查 `test/i18n-*.client.test.tsx` 其他语种回归、`test/browser/i18n.spec.ts` 与 `test/browser/public-pages.spec.ts` 的选择器和导航断言。用现有 Playwright 覆盖键盘、外部关闭、390px 布局和语言导航。
6. `pnpm check` 全绿，并运行相关 `pnpm test:browser` 用例。`public-pages.spec.ts` 使用 `pnpm check` 生成的 `dist/client`。全量测试与构建串行，开始前查 load、`MemAvailable` 和现有重活；有重活或可用内存低于 2 GiB 时等待并报告。PR 记录实际运行的检查及结果。
7. 本文仅存仓库根 `internal-docs/`。公开文档由 `src/shared/docs.ts` 与页面内容模块显式登记，静态资源从 `public/` 和 `dist/client` 发布。保持本文独立于源码导入、文档登记及 `/api/docs`。构建后检查公开资产和 Worker 产物中无本文文件名或内容，并以本地构建预览检查本文直链和 `/api/docs` 均不返回本文。
