# wechatai i18n T1：locale 骨架与 SEO 参数化

## 评估与交付

- 原子任务：一个以 `main` 为 base 的 OPEN PR。所有改动共同实现一条规则：只有显式登记的公开译文才能拥有带语言前缀的 URL。路由、预渲染、sitemap 和 hreflang 需要同时遵守这条规则，拆开交付会产生可访问但不可发现的页面，或索引指向未发布内容。
- 风险：中等，集中在公开页面可达性、搜索索引和客户端路由。单 PR 可独立验收；若将来需回滚，回退该 PR 即可恢复原路由和生成产物，不涉及持久数据。当前卡仅交付 OPEN PR，禁止合并或部署。
- 基线：评估时 `origin/main` 与当前分支 `feature/wechatai-i18n-t1-loc-upn` 均为 `1d997f8`。开发前核对 `origin/main`，用同一基线制作中文页面与 sitemap 的对照，避免使用落后的本地 `main`。PR 负责人：当前卡「开发中」指派的开发 agent，负责开 PR、记录基线与验收证据并响应评审。
- 无上游卡。现有 T2–T10 以 T1 合入后的 `main` 为基线，各自开 PR。冲突面是 `src/shared/i18n/`、路由和 SEO 入口以及后续翻译可能触及的共享模板：T1 先于翻译卡；后续如果有两张卡必须改同一共享文件，后一张以先合入卡的 `main` 为基线。优先按语言和命名空间分文件，避免每张卡都改中央注册表。本次不改现有依赖关系、不建新卡。

## 范围与实现约束

1. 在 `src/shared/i18n/index.ts` 定义 `AVAILABLE_LOCALES`、类型、路径与译文登记接口。词典沿用 TypeScript 模块 `src/shared/i18n/<locale>/<namespace>.ts`。实现可以利用现有 Vite 构建链按目录发现登记模块，显式按路径确认译文完整；只存在一个语言目录不足以发布任何 URL。T1 的正式译文注册为空。
2. 浏览器入口 `src/client/main.tsx` 与静态入口 `src/client/prerender.tsx` 共用 locale 判定与 `LocaleProvider`。仅在已登记公开页面解析语言前缀；空注册表时 `/en` 和 `/en/pricing` 走 404，不得显示中文首页或价格页。页头语言切换器用真实 `<a>`，仅链接当前页面已登记的替代语言；无替代语言时保持现有页面外观。
3. `src/shared/seo.ts` 的 `renderSeoHead`、`renderSitemap` 与 `scripts/prerender.mjs` 的生成路径使用同一注册表。可索引译文使用自身 canonical；一组存在译文的页面互列自身和已发布语言，`x-default` 指向对应的无前缀中文 URL（首页为 `/`）。空注册表不输出 hreflang。通过 `index.html` 模板与现有 `src/client/seo.tsx` 导航更新保持 HTML `lang` 与 `og:locale` 同步。沿用现有公开路径、`lastmod` 和 404 资产规则。
4. 让 `scripts/verify-seo.mjs` 与 `test/browser/public-pages.spec.ts` 的 locale 相关断言按路径、语言和预期参数化；保留中文专属的现有内容与交互回归。测试可临时注入译文登记样例，正式构建不包含样例。复用现有测试、静态渲染和 SEO 机制。

不做：任何正式翻译、中文正文或 URL 改写、文档内容迁移、登录或工作台本地化、Go 后端、鉴权或计费、部署配置变更，也不引入新依赖。

## 验收与证据

- `pnpm check` 通过，保留输出；构建后按仓库已有的 `pnpm test:browser` 脚本验证相关页面。全量检查与构建串行，开工前核对负载和 `MemAvailable`；已有重活或可用内存低于 2 GiB 时等待。
- 用同一基线和当前分支的构建产物比对 `/`、`/pricing`，两条路由 HTTP 200，中文可见正文与元数据保持原值（`zh-CN`、`zh_CN`）；对比时忽略构建资源指纹。提交 `sitemap.xml` diff，验证 URL、顺序和 `lastmod` 逐条一致，且无语言前缀 URL、无发布出来的译文 HTML 或 hreflang。
- 使用带生产资产 404 规则的本地预览运行 `verify-seo.mjs` 的 HTTP 检查，证明 `/en/pricing` 返回真正的 404，且不重定向至中文。浏览器用例另验客户端直达和切换逻辑。Vite 开发模式的 SPA 回退和 Playwright 的静态资产模拟不作为真实 HTTP 状态证据。
- 用测试样例验证一条登记路径同时进入预渲染、sitemap、相互指向的 hreflang 与切换链接，未登记路径在这些入口都缺席。验证译文 HTML 的 `lang`、`og:locale` 与单语 canonical，并覆盖返回中文后的元数据更新。
- 文档仅放在仓库根 `internal-docs/`，不导入 `src/`，不登记公开文档或 API，不复制到 `public/`。构建后检查公开资产与 Worker bundle 不含本文件路径或独有标题，验证本文件的直链不可访问、`/api/docs` 不返回内部文档。PR 中列出改动文件与上述证据。
