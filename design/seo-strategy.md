# 微信 AI 赛道的 SEO 计划（微伴 Wechatai）

> 目标：先选定 query，再按 query 设计页面。落地代码已进仓库（10 个新落地页 + 站内链接 + 结构化数据 + 校验），`pnpm build` 通过全部 SEO 断言。
> 结论一句话：**不要去打「微信AI助手」这类被腾讯占满的头部词，去打 ClawBot 的技术长尾和「自带 API Key」这个结构性空位。**

---

## 1. 站点功能与页面盘点（SEO 视角）

### 1.1 产品是什么（决定能抢什么词）

微伴是「把自选的模型 API Key 接进微信」的中转与插件平台。三个事实决定了 SEO 打法：

| 事实 | SEO 含义 |
| --- | --- |
| **不提供 token**。用户填自己的 OpenAI / Anthropic / 兼容 Key | 不能打「免费 GPT」「DeepSeek 免费额度」这类词——点进来的人要的是额度，不是通道，转化必然差 |
| 模型费用归用户的 API 服务商，微伴只按消息量收 credits | 可以做「成本对照」内容（`/pricing`、`/wechat-deepseek` 的成本节），这类内容天然能拿到「多少钱」「怎么收费」的长尾 |
| 依赖微信 ClawBot 插件通道 | ClawBot 是新增通道，技术长尾词**没有成熟页面占位**，这是本阶段最大的机会 |

### 1.2 现有可索引页面（改造前 = 27 个）

- 首页 `/`
- 文档中心 `/docs` + 16 篇（3 篇 tutorial + 13 篇 guide）
- 开发者 3 页：`/developers/plugins`、`/developers/openclaw`、`/developers/hermes`
- 信息页 3 个：`/terms`、`/privacy`、`/contact`
- 私有（noindex）：`/app*`、`/demo*`、登录注册与找回密码 5 页

**结构性问题（改造前）**：

1. 文档 16 篇 H1 用的是导航短标签（「命令一览」「会话」），不含关键词；`seoTitle` 里有关键词却只进了 `<title>`。
2. 首页是全站唯一有说服力的「产品页」，但它只链接文档，没有任何「按需求进入」的落地入口。
3. `/developers/openclaw` 与 `/developers/hermes` 没有页脚，出链只有 1 条 —— 链接死胡同。
4. 每页页脚有 4 个重复 H2（栏目标题），稀释标题大纲。
5. **没有价格页**。`/pricing`、`/price`、`/plan` 全部 404，而「微信 AI 多少钱」是有明确商业意图的词。
6. 没有任何「微信 + 某模型」的场景页，全部靠文档承接，而文档是配置手册，不回答「我要不要用这个方案」。

### 1.3 与竞品的页面结构差距

| 竞品 | 结构 | 我们原来的状态 |
| --- | --- | --- |
| clawbot.ai | 1 个 hub + 10 篇专题 + 16 类 wiki | 0 篇 ClawBot 内容 |
| openclawchina.com | 「三种方式」+ 决策树 | 无方案对比页 |
| openclawlaunch.com | 一个渠道一个落地页 | 无渠道落地页 |
| botfox / weixinbot.ai | 卖 token 的平台，强营销页 | 无对照内容 |

结论：我们的文档质量不输，但**缺少「决策型页面」**——用户搜「微信接入 DeepSeek」时想先知道有几种路、各要多少钱，而不是先看 API Key 填哪个输入框。

---

## 2. Query 选定（先选词，再设计页面）

数据通道：`lite.duckduckgo.com` 可用（18 条 query 实测前 10 结果）；Bing 可取结果数（「微信接入DeepSeek」≈ 64,800）；**无百度 SERP、无搜索量工具**，量级靠 SERP 特征推断。62 条候选词按意图 × 竞争结构 × 与定位匹配度分档。

### 2.1 四条核心判断

1. **「微信AI助手」被腾讯自己占满**：前 10 是新闻稿 + 百度百科「微信AI助手微」词条 + qclaw.qq.com。不正面打——排上去也是找「微信自带 AI」的人，不是找中转站的人。
2. **「自带 API Key」是结构性空位**：所有竞品都在卖 token（注册送积分），利益冲突导致没人认真写「为什么应该用你自己的 Key」。而这个论点恰好是我们的商业模式，别人抄不走。
3. **ClawBot 技术长尾是唯一的新词红利**：「ClawBot 支持哪些模型」「扫一扫绑定」「不回复怎么办」「灰度没入口」——18 条实测 SERP 里**没有任何专门页面**承接。
4. **最大威胁是 clawbot.ai**（同 SERP 占 2 位、10 篇专题 + 16 类 wiki），品牌混淆风险来自 weiban.online（同名「微伴」且教同一条绑定路径）。

### 2.2 分档与页面映射

| 优先级 | Query | 为什么 | 对应页面 |
| --- | --- | --- | --- |
| **P0** | 微信 ClawBot 支持哪些模型 | 新词，零专门页面；回答「通道 ≠ 模型」能一次拿下 | `/wechat-clawbot-models` ✅ |
| **P0** | 微信 ClawBot 怎么绑定 / 扫一扫 | 绑定是所有人的必经步骤，SERP 全是截图贴 | `/wechat-clawbot` ✅ |
| **P0** | ClawBot 不回复 / 没反应 | 高焦虑、低竞争，排上去就能截流 | `/wechat-clawbot#no-reply` ✅ |
| **P0** | 微信插件里找不到 ClawBot / 灰度没有入口 | 时间窗词（灰度期），现在写就是首发 | `/wechat-clawbot#entry` ✅ |
| **P0** | 自带 API Key 接微信 / 不卖 token 的中转 | 结构性空位，与我们定位完全一致 | `/bring-your-own-api-key` ✅ |
| **P1** | 微信接入 DeepSeek | 无官网垄断，个人博客都能排 | `/wechat-deepseek` ✅ |
| **P1** | 微信接入 Claude | 竞品内容多讲桥接，我们讲直连 | `/wechat-claude` ✅ |
| **P1** | 微信接入 GPT / chatgpt-on-wechat | 部署类内容对小白不友好，我们做「跳过部署」 | `/wechat-gpt` ✅ |
| **P1** | 微信 AI 接 agent / OpenClaw 多开 | 几乎无商业落地页 | `/wechat-agent` ✅ |
| **P1** | 微信 AI 方案对比 / 值不值得 | 决策型流量，最能筛出高意图用户 | `/wechat-ai-options` ✅ |
| **P1** | 微信 AI 多少钱 / 怎么收费 | 有价格页就有资格参与 | `/pricing` ✅ |
| **P2 hub** | 微信 AI 助手（头部词） | 被腾讯占据，**不指望排名**，只作内链枢纽 | `/wechat-ai` ✅ |
| **放弃** | 微信 AI 中转站 / API 中转站 | 8/10 结果是程序化榜单站，语义=买便宜 token，与定位冲突 | — |
| **放弃** | 微信记账 / 角色扮演 / 陪伴聊天 | 垂直站与灰产/镜像站群盘踞，ROI 低 | 由文档承接 |
| **放弃** | Hermes 主词 | Nous Research 官方文档墙 | 由 `/developers/hermes` 承接 |

### 2.3 意图切分：避免与文档自相蚕食

`/wechat-deepseek`（决策：走哪条路、花多少钱）vs `/docs/deepseek-in-wechat`（任务：Key 填哪、扫码怎么点）。规则：

- 落地页标题用**「接入/怎么选/多少钱」**，文档标题用**「如何在…里使用/配置」**。
- 落地页正文只留「决策必需」，具体点击步骤一律 `→ 文档`。
- 双向互链：落地页每页 3 条 related 指向文档，文档页脚指向落地页。
- 落地页所有 title 与文档 `seoTitle` 互不重复（`test/seo.test.ts` 已加唯一性断言）。

---

## 3. 落地页设计规范

每页统一结构（`src/client/pages/seo-page.tsx` 的 `SeoPageView`）：

```
面包屑 → H1 + 一句话定位 → 直答块（.seopage-answer，AEO 用）
→ 关键点三条 → [三步操作] → 正文分节（≥4 节，H2 带 id 锚点）
→ FAQ 折叠（≥4 问）→ 相关页面 → CTA → 更新时间
```

设计上的四个刻意选择：

1. **直答块**：把「微信 ClawBot 是什么」这类问题在首屏给出一段 60–120 字的完整答案。AI 搜索（ChatGPT / Perplexity / 豆包）与 Bing 摘要更愿意抓这种紧接 H1 的短答案。
2. **每节都有 `id`**：`#no-reply`、`#entry` 这类锚点既是站内跳转目标，也让「不回复怎么办」这种长尾能直接落到对应段落（并可被 AI 搜索引用）。
3. **表格化对照**：`/wechat-ai-options` 用八维对照表，`/bring-your-own-api-key` 用「Key 存哪 / 走谁网络 / 账单谁付 / 能否带走」四问——表格是 Bing 与 AI 摘要最常引用的形态。
4. **不写「免责式水文」**：每页都放进真实约束（免费版 1 个插件、附件需 Plus、credits 与模型费用分开算），因为含糊的定价描述会带来退款与差评。

结构化数据（`src/shared/seo.ts` 的 `seoLandingPage`）：`WebPage`（或 `Article`）+ `BreadcrumbList` + `FAQPage`，用 `@graph` 输出，`FAQPage.@id` 指向 `<canonical>#faq` 与可见内容一致。**刻意不用 `@id` 引用首页才有的节点**，避免悬空引用。

---

## 4. 内链地图

```
首页 /  ──「按你的问题找入口」6 卡──▶ wechat-ai / wechat-clawbot / bring-your-own-api-key
        │                              wechat-deepseek / wechat-agent / wechat-ai-options
        └─页脚 5 栏──────────────────▶ 全部 10 个落地页 + 16 篇文档 + 3 个开发者页

/wechat-ai（hub）──▶ 其余 6 个场景页 + /pricing
/wechat-clawbot ──#no-reply 被 /wechat-deepseek 与 /wechat-clawbot-models 引用
每个落地页 ──related 3 条──▶ 兄弟落地页 + 对应文档
/developers/openclaw|hermes ──▶ 新增页脚（原来只有 1 条出链，死胡同）
```

页脚从 4 栏改为 5 栏（产品 / 使用帮助 / 开发者 / 实操教程 / 支持与条款），栏目标题从 `<h2>` 改为 `<p>`——消除每页 4 个重复 H2，标题大纲回到「1 个 H1 + 正文 H2」。

---

## 5. 已落地的代码清单

| 文件 | 变更 |
| --- | --- |
| `src/shared/seo-pages.ts` | 新建：`SeoPage` 类型 + `SEO_PAGES` / `SEO_PATHS` / `findSeoPage` |
| `src/shared/seo-content/*.ts` | 新建 10 个页面数据文件 + `index.ts` |
| `src/client/pages/seo-page.tsx` | 新建：统一落地页模板（10 页复用） |
| `src/client/pages/seo-page.css` | 新建：`.seopage-*` 样式，复用现有设计 token |
| `src/shared/seo.ts` | `PUBLIC_PATHS` 纳入 10 页；新增 `seoLandingPage()` 生成 WebPage/Article + Breadcrumb + FAQ；`pageLastModified` 用 `page.updatedAt` |
| `src/client/prerender.tsx` | 预渲染分支接入落地页 |
| `src/client/main.tsx` | `SEO_PAGES.map` 注册路由 + 引入样式 |
| `src/client/public-pages.tsx` | 首页新增「按你的问题找入口」6 卡内链区 |
| `src/client/site-footer.tsx` | 5 栏、`<h2>`→`<p>`、补全 10 个落地页与 3 篇教程链接 |
| `src/client/styles.css` | `.landing-guides` 样式；页脚栏目标题选择器与 5 栏栅格 |
| `src/client/pages/openclaw-guide.tsx` | 补 `SiteFooter`（修复死链胡同） |
| `src/client/pages/docs.tsx` | H1 改用 `article.seoTitle ?? article.title`（13 篇文档 H1 因此含关键词） |
| `src/shared/plugin-docs.ts` | `/llms.txt` 重写：产品事实（可引用）+ 10 个落地页 + 8 个开发者入口 + 16 篇文档自动生成 |
| `scripts/verify-seo.mjs` | 新增 10 页断言：直答块、FAQ 锚点、`@graph` 结构、跨页锚点可达、内链可解析 |
| `test/seo.test.ts` | sitemap 顺序断言 + 落地页 4 组断言（唯一性 / 数据完整性 / schema / 内链） |

预渲染页面数：27 → **34**（+10 落地页 −3 原有重复计数差异，以 `Prerendered 34 public pages` 为准）。

---

## 6. AI 搜索（AEO）层

三个动作：

1. **`/llms.txt` 重写**：开头给一段「可直接引用」的产品事实（不卖 token、三种协议、绑定路径、真实价格与额度），后面是完整页面清单。AI 搜索最缺的就是「这个站到底卖什么、多少钱」的干净陈述。
2. **每页直答块**：见 §3。
3. **实体区分**：页脚保留「独立开发产品，与微信、腾讯及模型供应商无官方关联」。品牌混淆风险（weiban.online 同名且教同一条绑定路径）需要更明确的一句「微伴 Wechatai（wechatai.app）」实体声明，建议放在首页 hero 下方与 `/contact`。

---

## 7. 验收与校验

```
pnpm typecheck   # 通过
pnpm lint        # 见下方结果
pnpm test        # 见下方结果
pnpm build       # vite + prerender 34 页 + verify-seo 全绿
```

`scripts/verify-seo.mjs` 对每个新页断言：唯一 title/description、canonical、`index, follow, max-image-preview:large`、恰好 1 个 H1 且等于页面数据、正文已预渲染（非空 SPA 壳）、`/register` 存在、JSON-LD `@context`、至少 2 个存在的 `/assets/`、面包屑与 FAQ schema 结构、页内锚点与跨页锚点可达、所有内部链接能解析到真实 `.html`。

---

## 8. 后续（按 ROI 排序）

1. **`/wechat-clawbot` 补真实截图**：故障排查页的排名几乎由「有没有截图」决定，文字回答拿不到「不回复怎么办」的点击。建议 6 张（无插件入口 / 功能页 / 扫码页 / 绑定成功 / 报错 / 灰度提示）。
2. **`/pricing` 接实时价格**：目前写死文案，价格调整时容易与 `src/shared/billing.ts` 不一致，建议从 `BILLING_OFFERS` 渲染。
3. **`/docs/faq` 补 FAQPage schema**：本次未做——Google 已把 FAQ 富结果限制在权威站点，收益低于成本；等 landing 页 FAQ 先跑一段看曝光再决定。
4. **周更 2 篇 ClawBot 长尾**：灰度期窗口有限，`支持哪些模型 / 不回复 / 没入口 / 多开 / 封号` 这类词现在写就是首发，晚 3 个月就是第 8 名。
5. **监测**：Search Console 分 query 看 10 页的曝光与排名；重点看 `/wechat-clawbot-models` 是否吃到「支持哪些模型」的全量。
6. **品牌防护**：`/contact` 与首页加实体声明；考虑注册 `wechatai` 相关社交媒体账号做实体信号。
