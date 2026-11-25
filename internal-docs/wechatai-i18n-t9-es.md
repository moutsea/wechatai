# wechatai i18n T9 · 西班牙语首批五页

## 交付与责任

- 当前卡 `f18567cd-6d1a-4ea7-babf-b07a16cc08c8` 是一个原子任务。首页、价格页与三条落地页共享西语页壳、文案选择和同一套发布登记。五个 URL、语言切换和索引信号在一个 PR 内评审，通过回退该 PR 可成组撤回，无需数据迁移。工作量中等。
- 开发负责人为「开发中」指派的 profile `916bf250-fb21-4262-9419-f9aad4e07699`，负责实现、翻译校对、最终 HEAD 和验收证据。PR 负责人为「评审通过」的提 PR profile `92d67037-1df0-4f19-bf5e-8cb0c4965f2b`，独立评审通过后用本卡标题提交一个 OPEN PR，等待人工处理。禁止合并或部署。
- PR base 为 `main`，head 沿用 `feature/wechatai-i18n-t9-es-77w`。评估时工作分支与本地 `origin/main` 同为 `a573f3ec61d9fdc977a3ff7de9b2fa4be8999e91`，远端查询因 GitHub DNS 解析失败未能确认。开发前和最终验收前刷新 `origin/main`，以同一基线构建对照并记录 base/head SHA；本地 `main` 较旧。

## 范围

- 只登记 `/`、`/pricing`、`/wechat-ai`、`/wechat-bot`、`/wechat-deepseek` 对应的 `/es`、`/es/pricing`、`/es/wechat-ai`、`/es/wechat-bot`、`/es/wechat-deepseek`。译文置于 `src/shared/i18n/es/`。`load.ts` 扫描 `./*/*.ts` 作为登记模块，直属 `.ts` 的默认导出须为页面登记数组，其余纯词典放子目录。复用现有 `es` 语言定义与注册表驱动的路由、预渲染、sitemap、hreflang 和切换器。
- 首页和价格页复用 T2 的词典与组件入口，覆盖页头页脚、移动导航、套餐卡、功能表、FAQ、估算器、关联链接、登录态可见入口和无障碍标签。三篇落地页分别以 `src/shared/seo-content/` 下同名中文内容为事实来源，覆盖正文、步骤、表格、FAQ、CTA、目录、面包屑和相关链接。浏览器路由、预渲染及 JSON-LD 复用同一份落地页译文及现有页面结构。核对标题、摘要、社交分享描述和图片替代文本。
- 使用西班牙和拉美读者均易懂的中性西语。复用现有人民币金额、额度和套餐来源，包括 `BILLING_OFFERS`、`DAILY_CREDIT_DEFAULTS` 与营销价格常量。金额、CNY 币种、额度、连接与插件限制、单次购买及续费、退款、模型 API 另付、ClawBot 单聊及地区与账号限制均与对应中文版一致。保留专名、原有参数、命令及锚点。已登记目标走西语链接并保留查询与片段，其他目标沿用原有有效路径。明确检查面包屑 `/es`、价格和估算器 `/es/pricing#estimate`、两个套餐锚点以及文档前置条件和 FAQ 引导。
- 范围外包括文档、法务、开发者页、工作台与注册流程的翻译，新增语言区域、计价或权限逻辑、Go 或 Worker API、依赖、迁移、生产配置和通用框架改造。本文仅放仓库根 `internal-docs/`，禁止导入公开文档内容、客户端或 Worker bundle、静态资源或 `/api/docs`。

## 依赖与文件冲突

- T1 [PR #12](https://github.com/moutsea/wechatai/pull/12) 的路由和 SEO 骨架、T2 [PR #14](https://github.com/moutsea/wechatai/pull/14) 的营销页词典及英文首页和价格页均已在当前基线。T5 英文文档已在基线，西语文档继续沿用原链接，开发无需等文档卡。
- T3 [PR #13](https://github.com/moutsea/wechatai/pull/13) 提供 `/en/wechat-ai`、`/en/wechat-deepseek` 及 `SeoPage` 译文接线。T4 [PR #18](https://github.com/moutsea/wechatai/pull/18) 提供 `/en/wechat-bot` 并接续 T3 共用实现。两者的页面未出现在已核对的 `main` 快照。西语词典和逐页校对可以并行准备；最终共享接线与五页中英西互指验收使用包含 T3、T4 的 `origin/main`，顺序为 T3、T4、T9。本卡无需复制或提前登记英文译文。
- 与 T3、T4 的主要冲突面为 `src/shared/i18n/index.ts`、`src/shared/seo.ts`、`src/client/prerender.tsx`、`src/client/pages/seo-{landing,page,related}.tsx`、`seo-page-labels.ts`、语言切换器和通用页面测试。以先合入的 T3、T4 实现为准，优先只新增 `es` 词典和登记，复用完整译文接线、页壳标签及链接逻辑。
- T7 已在开发分支调整 `public-pages.tsx`、页头页脚、首页步骤与用例、估算器、价格组件、`landing-faq.ts`、`seo-content/pricing.ts`、共享 SEO 和测试。若有同文件改动，T7 先行，以含 T7 的 `main` 为基线。T8 若与本卡修改同一共享文件，按在途顺序由 T8 先合入该文件，T9 基于它验证；T10 如修改同一共享文件，以含 T9 的 `main` 为基线。各语言目录与独立验收用例可并行准备，各 PR 均指向 `main`。

## 风险与验收证据

**中风险。** 注册、客户端渲染、预渲染和索引可能不同步。共享词典选择可能回归现有语言，翻译也可能改变计费或能力口径。用最终 PR 基线比对可见内容和生成结果，回滚后复验五个 `/es` URL 返回 404，且其 sitemap 和语言链接消失。

1. 五个目标 URL 在生产资产规则的本地预览中逐一返回 HTTP 200。首个 HTML 和浏览器渲染均有西语正文，无中文回退。逐页核对正文、可见素材文字、展开态、移动页壳、`alt`、`aria-label`、FAQ 和结构化数据的可读文案。按页面列出西语标记与汉字扫描结果，语言切换器的既有自称 `中文` 单独核对。回归相同基线的中文与英文正文、金额、链接和交互。
2. 确认 `/es/docs`、任一未登记的西语文档子路径和落地页真实返回 HTTP 404，无中文页面回退、重定向或索引入口。用生产资产规则预览核对，避免把开发服务器 SPA 或浏览器 fixture 的状态当作 HTTP 证据。检查上述西语内链及已登记和未登记目标的行为。
3. 每个页面组的中文、英文、西语 HTML 均使用自指 canonical 和完整互指的 hreflang，西语 `lang` 和 hreflang 为 `es`，`x-default` 指向对应中文无前缀路径，`og:locale` 沿用现有 `es_ES`。其他已登记语种照常互指。FAQ、面包屑和报价等 JSON-LD 与西语页面一致，报价继续用 CNY。对比同一基线的 sitemap，URL 集合恰好新增上述五条，无删除，已有条目的 `lastmod` 保持原值。
4. `pnpm check` 通过，包含 lint、类型、测试和构建及 SEO 检查。补跑相关浏览器用例和生产规则本地预览的 `pnpm test:seo http://127.0.0.1:5174`，预览按 `docs/development.md` 启动。重活前查 load、`MemAvailable` 与正在执行的构建和全量测试。已有重活或可用内存低于 2 GiB 时说明并等待，构建与全量测试串行。PR 附命令结果、五页与 404 证据、sitemap diff、最终改动文件清单和前端截图。
5. 在构建产物中按文件名和本文标题检查 `dist/` 的客户端资产及 Worker bundle 均无本文内容。生产规则本地预览请求内部文档直链和 `/api/docs`，确认均不返回本文。

## 首轮评审返工

- `/es/pricing` 的月付和年付入口经注册页转邮箱登录后，分别回到 `/es/pricing?interval=month#plan-month`、`/es/pricing?interval=year#plan-year`。只放行确切的 `/es/pricing` 路径，不放行子路径或外部地址。
- 西语估算器明确说明平台用量每轮向上取整到 0,001 credit 的倍数；输入 1001、输出 1000、每天 1 轮时显示 `1,801 créditos`。计算和计费不变。
- 正式基线 `94ccdcfd` 包含 T4 和 T7。机器人页回归使用生产登记，要求中、英、日、西四页都可索引、canonical 自指并完整互指，`x-default` 指向 `/wechat-bot`。

## 二次评审返工

- `/es/pricing#estimate` 的两个供应商单价框保留键入内容，`1,5` 与 `1.5` 按同一单价参与估算，混用分隔符的单价提示无效。用 Playwright 真实键入回归验证；令牌、轮数和费用公式不变。
- 登录后，账户菜单按当前页面语言显示余额。西语余额 `12.345` 显示为 `12,345`，与估算器的小数分隔符一致；仍沿用原有精度：小额最多三位小数，绝对值达到 100 时取整。

## 第三轮评审返工

- 只有西语供应商单价框接受逗号或句点作为小数点。其他语言沿用原生数字输入；Chromium `en-US` 键入 `1,000`，以每天一轮、输入一百万 token、零输出计算时仍显示 `About ¥1,000`。
- 页头语言切换只替换语言路径，保留查询参数和锚点。切到 `/es/pricing?interval=year#plan-year` 后仍选中年付套餐，切到 `/es/pricing#estimate` 后估算器仍展开。
