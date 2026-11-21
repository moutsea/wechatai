# Wechatai i18n T10 巴西葡语首批五页

## 交付与原子性

当前卡 `e26d9d77-b1cf-4c0f-a0eb-a11c1de4b0f8` 交付首批巴西葡语公开页面，一个独立 OPEN PR。五页共用葡语词典、站点导航、路由登记和索引规则，逐页验收，整批交付。回退该 PR 即撤下本批葡语正文、入口、语言关联和 sitemap 条目，无需数据回滚。规模中等，主要工作量是五页翻译及校对、共用组件的必要接线和回归验证。

## 范围

| 中文源路径 | 葡语 URL | 英文对应路径 |
| --- | --- | --- |
| `/` | `/pt` | `/en` |
| `/pricing` | `/pt/pricing` | `/en/pricing` |
| `/wechat-ai` | `/pt/wechat-ai` | `/en/wechat-ai` |
| `/wechat-bot` | `/pt/wechat-bot` | `/en/wechat-bot` |
| `/wechat-deepseek` | `/pt/wechat-deepseek` | `/en/wechat-deepseek` |

- 译文放 `src/shared/i18n/pt/`。沿用 `src/shared/i18n/load.ts` 的自动发现规则，直属模块默认导出登记数组，仅登记表中五条中文源路径。文案模块放子目录。由现有登记表驱动页面、预渲染、切换器、hreflang 和 sitemap。保留 URL 前缀 `/pt`，葡语 `htmlLang` 从 `pt` 调整为 `pt-BR`，沿用 `og:locale=pt_BR`。
- 首页、价格页复用 T2 和随后已进入基线的营销文案选择方式。补齐页头页脚、语言切换器、首屏及可读图片文字、步骤与场景、套餐及估算器、FAQ、CTA、面包屑、相关链接和可访问名称。三条落地页使用已合入的 `SeoPage` 译文选择和共用模板，正文和页面专属 JSON-LD 复用同一份文案。沿用原页面结构、锚点、可执行命令和品牌专名。
- 采用自然的巴西葡语。价格、币种、套餐周期、额度、退款、费用边界、模型能力和微信接入要求以同一基线的中文版为准。金额保留人民币原值。使用现有 `localizedHref` 或同一登记规则为已翻译目标生成葡语链接，其他目标使用已有的有效路径，保留查询参数和片段。检查首页、价格页与三条落地页的互链和价格估算、入门文档、法务、注册等跳转。
- 范围外包括其他葡语 URL、其他语种的译文、文档与法务正文、登录和工作台翻译、后端与 API、支付或计费行为、数据迁移、新依赖、新国际化框架及部署配置。

## 基线、依赖与负责人

- PR base 为 `main`，复用 `feature/wechatai-i18n-t10-pt-cfd`。评估时分支 HEAD 与本地远程跟踪引用 `origin/main` 同为 `a573f3ec61d9fdc977a3ff7de9b2fa4be8999e91`，已含 T1 路由和 SEO 骨架、T2 英文首页与价格页。本地 `main` 落后，当前环境的 GitHub 查询受网络限制，开发交付前须核对实际远端 `main` 并记录对照基线。 [T1 PR #12](https://github.com/moutsea/wechatai/pull/12) · [T2 PR #14](https://github.com/moutsea/wechatai/pull/14)
- T3 提供 `/en/wechat-ai`、`/en/wechat-deepseek` 和完整落地页接线，T4 提供 `/en/wechat-bot`。评估时 Kandev 记录 #13、#18 均为 OPEN，#18 当前以 T3 分支为 base。收口顺序为 **T3 → T4 → T10 最终验收**。葡语词典、文案校对及独立用例可先在本卡分支准备。共享落地页接线和五页最终验收使用 T3、T4 均已进入且三条英文落地页实际登记的 `origin/main`。T10 的 PR 直接指向 `main`，附该基线的验收证据。禁止带入在途英文 PR 提交或新增英文占位路径。T4 是最终验收的直接前驱，T3 经 T4 传递。现有卡的开工依赖已满足，译文准备可与上游并行。 [T3 PR #13](https://github.com/moutsea/wechatai/pull/13) · [T4 PR #18](https://github.com/moutsea/wechatai/pull/18)
- 共用文件冲突面包括 `src/shared/i18n/index.ts` 和已有词典选择模块、`src/shared/seo.ts`、`src/client/prerender.tsx`、`src/client/pages/seo-*.tsx`、页头页脚、语言切换器、首页和价格页组件及共用 SEO 测试。落地页共用接线以 T3、T4 顺序合入后的 `main` 为基线。T7、T8、T9 可分别准备各自的词典与测试。对确需编辑的同一共享文件，评审与合入顺序采用 **T7 → T8 → T9 → T10**，仅限实际重叠的卡，后行卡以包含先行修改的 `main` 为基线并重验。本卡独占 `pt/` 与葡语用例，复用已合入的词典选择，避免另建实现。
- PR 负责人为本卡「开发中」指派的开发 agent，profile `916bf250-fb21-4262-9419-f9aad4e07699`，负责实现、校对、准备证据及跟进评审。「评审通过」的提 PR agent，profile `92d67037-1df0-4f19-bf5e-8cb0c4965f2b`，核对最终 HEAD 的独立评审 PASS 后创建或复用本卡唯一的 OPEN PR。禁止合并或部署。

## 风险

**中等。** 价格、额度、退款和能力边界的误译会影响用户决策。沿用 `src/shared/pricing-copy.ts`、`billing-offers.ts`、`credits.ts` 及中文源页的事实口径。共享组件漏接葡语可使五条 URL 输出中文。错误登记可公开索引未翻译的页面。验收同时检查构建产物、浏览器接管后内容和本地预览 HTTP 响应。

## 验收与证据

1. 表中五条葡语 URL 首次请求均为 HTTP 200。逐页核对预渲染和浏览器接管后的巴西葡语正文、页头页脚、首屏图文、可读属性、FAQ 及估算器展开态、CTA、命令复制反馈和相关链接。附逐页葡语标记及解码后可读字段的汉字扫描。葡语页面上的语言切换器使用葡语可读标签，确需保留原值的命令与专名单列。手机宽度核对布局和可操作性。
2. 对照中文源页核对人民币数值、套餐及额度、平台和模型 API 费用、退款与续费、ClawBot 前置条件以及模型能力边界。核对页面专属 SEO 文案和 JSON-LD 与对应可见内容一致。回归对应的中文、英文页面正文、价格和链接。
3. `/pt/docs` 和其他未登记葡语页面直达时返回真实 HTTP 404。切换器及站内链接只对已登记的目标生成 `/pt` 路径。验证 `/pt/pricing#estimate` 和入门文档等链接的真实目的地及片段。
4. 五组页面分别断言 zh-CN、en 与 pt-BR 自指且互指，canonical 各指自身，`x-default` 指向该组中文原路径。葡语页 `lang=pt-BR`、`og:locale=pt_BR`，已发布的其他语种关联仍保留。用同一基线构建的 sitemap 比较 URL 集，恰好新增表中五条葡语 URL，既有 URL 无删除且 `lastmod` 保持一致。单独断言葡语白名单和 zh/en/pt 三语关联，避免仅按登记结果计算预期而漏查缺项。
5. 开始全量检查前查看 load、`MemAvailable` 及正在运行的测试、构建。有重活或可用内存低于 2 GiB 时说明并等待。串行运行 `pnpm check`（含构建和静态 SEO 校验）、贡献指南要求的 `pnpm test:openclaw` 及相关 `pnpm test:browser` 用例。用仓库文档中的 `pnpm exec vite preview --host 127.0.0.1 --port 5174` 和 `node scripts/verify-seo.mjs http://127.0.0.1:5174` 验证构建后的 HTTP 路由。按贡献指南对准备提交的文件运行 `pnpm check:public`。PR 附命令结果、逐页证据、sitemap diff、base/head SHA 和改动文件清单。
6. 本文仅存于仓库根 `internal-docs/wechatai-i18n-t10-pt.md`。禁止从源码导入、登记为公开文档或复制到公开树。构建后检查 `dist/client` 与 Worker bundle 中无本文的文件名和独有标题。用本地预览确认文档直链不可访问且 `/api/docs` 不返回本文。

## 复审回归

- 手机价格页分别选择 Plus 月付和年付，经注册页切换至邮箱登录。登录成功后返回 `/pt/pricing` 对应的 `interval` 查询参数和套餐锚点；其他葡语路径仍不作为登录回跳目标。
- 葡语页面的桌面和手机切换器用葡语命名目标语言，`hreflang` 仍标注目标页语言。手机已登录时打开账号菜单，核对可访问名称、余额、升级、退出和键盘关闭。
- 复审基线 `94ccdcfd` 已发布 T4 英文 bot 和 T7 日语五页。五组独立断言覆盖中文、英文、日语、巴葡的自指与互指；`x-default` 仍指向各组中文原路径。
