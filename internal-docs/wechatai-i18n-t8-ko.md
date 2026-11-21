# Wechatai i18n T8 韩语首批 5 页

## 交付与原子性

当前卡 `2836a982-b61d-4e2f-b51c-ed2afebe811c` 交付首批韩语公开页面，走一个独立的 OPEN PR。五页共用韩语词典、公开路由登记、页头页脚和 SEO 生成链路，按五条路径即可逐页验收。整组译文、入口和索引信号可通过回退该 PR 一起撤销，无持久数据或迁移。预计规模中等，工作量主要是逐页翻译与校对、最小共享组件接线及对应回归测试。

## 范围

- 仅登记 `/`、`/pricing`、`/wechat-ai`、`/wechat-bot`、`/wechat-deepseek` 对应的韩语版本，公开 URL 分别为 `/ko`、`/ko/pricing`、`/ko/wechat-ai`、`/ko/wechat-bot`、`/ko/wechat-deepseek`。在 `src/shared/i18n/ko/` 放译文，直属登记模块沿用 `load.ts` 的自动发现规则并默认导出登记数组。纯文案模块放在子目录。
- 首页和价格页复用 T2 组件与现有文案选择方式。覆盖页头页脚、语言切换器、首屏图文、步骤与场景示例、套餐卡、价格估算器、FAQ、面包屑、相关链接及可访问名称。三条落地页复用 T3/T4 的 `SeoPage` 译文接线，共用译文供正文和页面专属 JSON-LD 使用。
- 用自然的现代韩语，品牌名和可执行语法按原义保留，韩语页面上的语言链接标签也使用无汉字的称呼。复用 `localizedHref` 等现有判断，已登记的韩语目标走 `/ko` 路由，其他站内链接保留合法原路径及查询参数或片段。覆盖价格页估算链接、入门文档和三条落地页之间的内链。
- `/ko` 保持 URL 前缀，按现有 locale 定义将韩语页面语言标记设为 `ko-KR`，Open Graph 使用 `ko_KR`。复用系统字体栈。若现有首屏图中有中文，复用现有可呈现韩语的布局或无嵌字素材，保持原有功能示意。
- 范围外为其他韩语 URL、其他语种的译文、文档和法务正文、登录及工作台翻译、支付或计费行为、Worker/Go API、数据迁移、外部字体及其他新依赖、部署配置。

## 基线、依赖与负责人

- PR base 为 `main`，使用现有 `feature/wechatai-i18n-t8-ko-dzh`。评估时该分支 HEAD、`origin/main` 和经远端查询的 `main` 均为 `a573f3ec61d9fdc977a3ff7de9b2fa4be8999e91`。T1 公开路由和 SEO 骨架、T2 英文营销页均已在该基线。 [T1 PR #12](https://github.com/moutsea/wechatai/pull/12) · [T2 PR #14](https://github.com/moutsea/wechatai/pull/14)
- T3 提供 `/en/wechat-ai` 和 `/en/wechat-deepseek`，T4 提供 `/en/wechat-bot`，三条英文路由均已登记。整卡返工以合入 T4 和 T7 的 `main`（`94ccdcf`）为基线，保留日语 `ja-JP` 互指；不引入在途提交或英文占位路由。 [T3 PR #13](https://github.com/moutsea/wechatai/pull/13) · [T4 PR #18](https://github.com/moutsea/wechatai/pull/18) · [T7 PR #22](https://github.com/moutsea/wechatai/pull/22)
- 文件冲突面为 `src/shared/i18n/index.ts`、`src/shared/seo.ts`、`src/client/prerender.tsx`、`src/client/pages/seo-*.tsx`、`src/client/language-switcher.tsx` 和共享 SEO 测试。T3/T4 的共享实现先落地主线。T7 日语与本卡的词典、验收用例可并行。若两卡确认还要同时改同一共享文件，建议该文件由 T7 先落地，T8 基于含该改动的 `main` 补韩语并重跑验收；本卡独占韩语 locale 定义及 `ko/` 文件。首页、价格页、页头页脚等公共文案接线只做所需更动。
- PR 负责人为本卡「开发中」指派的开发 agent（profile `916bf250-fb21-4262-9419-f9aad4e07699`），负责实现、校对、记录 base/head SHA 和验收证据并跟进反馈。工作流中的「评审通过」提 PR agent（profile `92d67037-1df0-4f19-bf5e-8cb0c4965f2b`）核实最终 HEAD 的评审结果后创建或复用本卡唯一的 OPEN PR。评估、开发和提 PR 阶段禁止合并或部署。

## 风险

**中等。** 价格、额度、退款及能力边界的译文失真会直接影响用户预期。沿用 `pricing-copy.ts`、`billing-offers.ts`、`credits.ts` 和中文原页的事实来源。共享模板漏接韩语可能使韩语 URL 输出中文；逐页检查预渲染结果和浏览器接管后的内容。路由错登会影响索引；用同一生产规则的本地预览对照路由、hreflang 和 sitemap。

## 验收与证据

1. 五条韩语 URL 首次请求均真实返回 HTTP 200。逐页核对预渲染 HTML 与浏览器接管后的正文、页头页脚、首屏图文、FAQ 展开态、估算器、CTA、相关链接、`alt`、`aria-label` 和页面专属 SEO 文案。附韩语内容标记、汉字扫描（如 `rg -n '\p{Han}'`，扫描解码后的可读字段）和必要截图。手机宽度检查字体、换行与页面交互，字体无需额外下载。
   - 共享组件从 `src/shared/i18n/ko/` 引用本卡译文；词典迁移不改变可见文案、链接或 SEO。
   - 桌面和手机切换器中的中文入口显示 `중국어`，目标仍为对应中文页；登录后打开 `/ko/pricing` 的账户菜单，核对可访问名称及工作台、会员和退出登录操作，不豁免固定文案中的汉字。
   - 未登录选择韩语月付或年付后，注册页的登录入口保留完整目标；登录后回到原套餐卡，保留 `interval` 和 `#plan-*`。只允许精确的 `/ko/pricing`，不放宽外部或未登记路径。
2. 对照相同基线的中文源页核对价格、币种、每日与购买额度、微信连接和插件限制、图片费用、模型 API 另付、续费及退款表述。三条落地页的模型能力、ClawBot 前置条件和使用限制与中文一致。页面专属 JSON-LD 与可见正文一致，保留已有实体标识与真实链接目标。
   - `/ko/wechat-ai` 的 description、Open Graph 和 Twitter 描述须明确 Xiaowei 使用用户配置的模型，模型 API 费另付服务商。`#models` 不扩写中文原页未声明的 DeepSeek 能力。
   - 首页场景、价格页 FAQ 正文与 FAQPage 均说明：服务开放后，Plus 用户先配置自己的文本模型，再在插件页手动启用 Xiaowei。
3. `/ko/docs` 及未登记的韩语路径（如 `/ko/wechat-claude`）直达真实 HTTP 404，无语言重定向、目标页正文或检索入口。用登记集合断言只有上述五条韩语路径，验证切换器和内链不生成未登记的韩语 URL。
4. 五组页面的 zh/en/ko 各自 canonical 自指，hreflang 含本页并成组互指，韩语为 `ko-KR`，`x-default` 指向当前页面的中文原路径。既有其他语种若已经发布则保留其链接。对照同一基线，sitemap 的 URL 集合恰好增加本卡五条，无删除，原条目的 `lastmod` 保持一致。回归中文和英文对应页面的正文、价格及可访问性。
5. 开始全量验证前检查 load、`MemAvailable` 及现有测试或构建进程。有其他重活或低于 2 GiB 时说明并等待。串行运行 `pnpm check`（已含构建和静态 SEO 校验）、仓库适用的 `pnpm test:openclaw` 和相关 `pnpm test:browser` 用例。对采用生产资产规则的本地预览执行 `node scripts/verify-seo.mjs <本地预览 origin>` 核验真实 HTTP 状态。提交前按贡献指南对准备提交的文件运行 `pnpm check:public`。PR 附命令结果、逐页及 sitemap 证据、base/head SHA 和改动文件清单。
6. 本文仅存放在仓库根 `internal-docs/wechatai-i18n-t8-ko.md`。禁止导入源码、文档登记或静态资产。构建后核对公开产物和文档 bundle 中没有此文件名或独有标题，在本地生产规则预览中确认该文件直链不可访问且 `/api/docs` 不返回本文。
