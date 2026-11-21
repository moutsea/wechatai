# wechatai i18n T4：其余英文 SEO 落地页

当前卡 `e836110c-c1e3-439d-8296-b968fb9356aa`。2026-11-20 用户确认：T2 保留 `/en/pricing`，T4 新增其余 14 条，sitemap 恰好 +14；原 15 篇口径作废。

## 范围与原子性

`src/shared/seo-content/index.ts` 登记 23 篇。T3 的白名单包括 `wechat-ai`、`wechat-clawbot`、`wechat-clawbot-models`、`wechat-deepseek`、`wechat-claude`、`wechat-gpt`、`wechat-kimi`、`wechat-qwen`。余下 15 篇包含 T2 已负责的 `/pricing`。两张卡不能重复登记 `/en/pricing`，也不能把 T2 的 URL 计作 T4 的 sitemap 增量。

T4 新增以下 14 条：

- `/en/bring-your-own-api-key`、`/en/wechat-agent`、`/en/wechat-ai-options`、`/en/wechat-bot`、`/en/wechat-glm`、`/en/wechat-muse`
- `/en/wechat-ai-ban-risk`、`/en/wechat-ai-privacy`、`/en/wechat-ai-image`、`/en/wechat-ai-partner`、`/en/wechat-character-card`
- `/en/compare/wechatai-vs-wechat-official-ai`、`/en/compare/wechatai-vs-openclaw`、`/en/compare/wechatai-vs-commercial-wechat-ai`

保留一张原子卡、一个 OPEN PR。页面共用 `SeoPage` 模型及模板；`compare-page.tsx` 只按 slug 找页，实际表格由 `seo-page.tsx` 渲染，`comparison` 数据在对应中文源模块中。表格译文随对应页面交付，一起验收；回退 PR 即撤下本卡译文、登记和索引信号，保留 T2、T3 与中文页面。风险中等：事实误译、共用模板回归、未翻译内容被索引；不涉及持久数据。

## 依赖、分支与负责人

- T1 PR #12 已合入；评估时 `feature/wechatai-i18n-t4-en-jrj` 与本地 `origin/main` 同为 `f83537a`。PR base `main`；开发前核对远端，记录实际基线和 HEAD，勿用落后的本地 `main`。
- 译文可按独立命名空间准备。最终基线顺序 T2 → T3 → T4：T2 先落地英文公共页头、页脚及首页、价格页；T3 再接通完整 `SeoPage` 译文选择及共用模板文案。T4 以包含两者的 `main` 为基线。共用冲突面是 `src/shared/seo.ts`、`src/client/prerender.tsx`、`src/client/pages/{seo-page,seo-landing,seo-related}.tsx` 及共用回归测试；T4 仅补缺失的对比路由或表格文案接线，测试优先用独立文件。T3 的 `/en/wechat-glm` 未登记反例在 T4 登记后换成仍未发布的反例。
- PR 负责人：本卡「开发中」指派的开发 agent，负责逐页对照、开唯一 OPEN PR、提供证据并响应评审。不合并、不部署。

## 验收

1. 在 `src/shared/i18n/en/` 用独立 T4 模块放译文及登记，复用 T1 自动发现与 T3 的正文选择。不改 T3 八篇、`/pricing`、原中文正文、文档、后端、计费、鉴权、部署配置或依赖。保留命令、锚点和查询参数；只为已登记目的地使用英文链接。
2. 白名单逐页在采用生产资产 404 规则的本地预览直达 HTTP 200。检查预渲染与浏览器接管后的正文、展开项、FAQ、CTA、关联链接、可访问标签和页头页脚，单列必须原样保留的可执行命令、专名与语言切换器的 `中文` 自称。三张对比表检查标题、表头、行名、单元格、`note` 和缺失数据提示；竞品名、来源、数值、`null` 与其未核实语义不变。价格、币种、额度、地区限制及合规表述逐项与中文核对。
3. 每组中英文 canonical 自指、hreflang 互指，`x-default` 指向中文原路径，`lang` 及 `og:locale` 正确。英文页面 JSON-LD 与可见内容一致，保留共用实体标识。与含 T2/T3 的同一基线比，sitemap 恰好新增上述 14 条，原有 URL 与 `lastmod` 不变。检查未登记路径真正返回 404，中文原页与 T2/T3 英文路由通过回归。
4. 开工前查负载、全量测试或构建进程及 `MemAvailable`；有重活或低于 2 GiB 时等待并说明。串行运行 `pnpm check`（含构建及静态 SEO 校验）、相关 `pnpm test:browser` 用例；用 `node scripts/verify-seo.mjs <本地预览 origin>` 核验 HTTP。PR 附逐页证据、sitemap diff、基线及 HEAD、检查输出和改动文件清单。
5. 本文仅放仓库根 `internal-docs/`，不导入、不登记、不复制到任何公开树。构建后查公开资产和文档 bundle 无文件名或独有标题；用本地生产规则预览确认本文直链不可访问且 `/api/docs` 不返回本文。
6. `/en/wechat-ai-image` 正文和 FAQ 区分套餐：Free 在微信保存生成图；只有 Plus 可在生成后 30 天内从网页会话记录查看。FAQ 的 JSON-LD 与可见答案一致。
7. `/en/bring-your-own-api-key` 的 FAQ 和 `/en/wechat-ai-options` 的 BYOK 对比段均要求兼容协议、公网 HTTPS 域名和默认 443 端口；仅能从公网访问不够。
8. `/en/wechat-character-card` 的换模型 FAQ 明确：同一角色换绑后续聊可将旧剧情上下文发送给新服务商；要隔离旧剧情，下一条聊天消息前先在微信发 `/wx new`，保留旧记录。
9. `/en/wechat-character-card` 的导入正文和 FAQ 明确：点击保存时上传并存储原卡 JSON（含创作者备注和扩展）；PNG 封面不上传、不保存。
10. `/en/wechat-agent` 的费用正文和 FAQ 分开说明：自托管 OpenClaw 本地推理无模型 API 费，但有设备和维护成本；使用云 API 才按服务商资费计算；微伴单独按中转边界计 credits。
