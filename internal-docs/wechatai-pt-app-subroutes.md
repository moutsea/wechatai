# wechatai 葡萄牙语工作台子路由本地化需求评估

评估日期为 2026-11-27。本卡为 `93062de0-c720-4a8a-b099-01f968b9f511`，标题为「wechatai 工作台葡萄牙语子路由本地化（/pt/app/*）」。仓库为 `moutsea/wechatai`。卡面占位词 `ptNAME` 按标题和现有 `LOCALE_DEFINITIONS.pt` 解释为葡萄牙语，HTML 语言标记沿用 `pt-BR`。

## 交付单元、风险与负责人

本卡可作为一个原子任务，交付一个 base 为 `main` 的 PR。唯一交付结果是现有葡语工作台子页可访问，并在导航和登录回跳后继续使用葡语。路由登记、页面壳、导航与文案是这一使用流程的必要部分，适合对同一最终 HEAD 完成评审及整体回退。卡面本身已经按语种划分，本轮保留当前独立顶层卡。

规模预估为大，涉及 12 个静态入口、一类动态详情及页面内现有弹窗和管理页签。前序语言卡可能已经补齐共用取词和路由能力，实际变更量应在前驱合入后重新核对。按调用链串行分段审查，最终整卡验收。

整体风险为中。主要风险包括直接刷新仍 404、共用 base 拼接错误、query/hash 丢失、固定中文遗漏，以及共享页面对既有语言的回归。登录回跳允许范围属于安全敏感点，需要验证原有外部跳转防护。账单、额度和管理页面涉及敏感业务展示，使用同一 fixture 比对数值、单位、权限与请求负载。

PR 负责人为本卡开发承接人 Codex，沿用当前工作流 profile `92d67037-1df0-4f19-bf5e-8cb0c4965f2b`。负责人承担独立分支、实现、测试证据及返工。独立评审检查最终 HEAD，开 PR 阶段创建或复用本卡唯一 PR。交付状态为 OPEN，合并和部署须遵守本卡用户明确禁止的约束，该约束覆盖后续阶段。

## 2026-11-28 开发依据更新

任务描述在 2026-11-27 23:55 明确解除对西班牙语卡的依赖，允许本卡独立开发与上线。当前工具读回依赖为空。本轮以远端 main 的 `3f329352ac0d73da0ee1611ce4169bbfd7fe1443` 为实际基线，独立补齐葡语流程必需的共用接入点。下文依赖链和前置阻塞记录是此前评估历史，本轮执行以上述卡面更新为准。

本卡由单一开发会话在独立分支修改。运行时使用临时安装的 Node 22.23.5，依赖按现有锁文件离线安装。合并与部署交由「部署与验收」阶段，开发阶段交付一个 base main 的 OPEN PR，并通过 step_complete 进入独立评审。

## 已核实的仓库现状

- GitHub `main` 与评估工作树 HEAD 均为 `3f329352ac0d73da0ee1611ce4169bbfd7fe1443`，通过本轮 `git ls-remote origin refs/heads/main` 核实。PR #47 已于 2026-11-25 合并，本轮 `gh pr list -R moutsea/wechatai --state open` 返回空列表。
- 已读 README、CONTRIBUTING、开发说明、package.json、相关页面、语言登记、路由、构建和测试。业务仓库未发现 AGENTS.md。
- `src/client/main.tsx` 的 `appRouteTarget` 仅将去除语种前缀后恰好等于 `/app` 的路径交给本地化 Workspace。`src/shared/i18n/pt/dashboard.ts` 也只登记 `/app`。
- `src/client/workspace.tsx` 已有全部子页组件，包含 `assistants` 的渠道页别名及 `tasks/:id?`。未知子路由回退 `/app`。
- `src/client/context.tsx` 将共用 `base` 固定为 `/app`。侧栏、账单、通知等沿此值生成链接。`user-menu.tsx`、`limit-hint.tsx`、`pages/admin.tsx`、`plugin-upgrade.ts` 等另有硬编码工作台目标，应核对实际调用链后处理。
- `src/shared/seo.ts` 中 `localizedDashboardPaths()` 仅枚举各语种工作台首页，`scripts/prerender.mjs` 据此生成静态私有壳。`public/_redirects` 的动态任务规则只有 `/app/tasks/*`，生产资源使用 404 兜底。客户端识别与构建产物需一起补齐。
- `authReturnPath` 接受 `/pt/app`，对 `/pt/app/channels` 等子页会回退 `/app`。`test/auth.test.ts` 已明确断言这一现状，原卡关于回跳支持的描述只覆盖工作台首页。
- `pages/admin.tsx` 对已登录但无管理权限的用户显示拒绝访问页。会话失效由 AppProvider 跳转既有 `/login?returnTo=...`。用户已确认沿用现有拒绝访问行为，页面提示使用葡语。
- 葡语 `copy/dashboard.ts` 已覆盖 dashboard、onboarding、shell、membership、notices 五组。Billing、Credits、Invite、独立通知页、渠道、插件、任务、会话、微信连接、管理页签及嵌套组件仍需逐项核对固定中文。
- 葡语公开教程尚未登记，`test/i18n-pt.test.ts` 明确将 `/pt/docs` 作为缺译目标测试。现有 `localizedHref` 仅为已登记译文生成前缀。

## 范围与边界

实现覆盖以下现有路由，复用当前页面组件和 URL 语义。

- `/pt/app`
- `/pt/app/channels`
- `/pt/app/assistants`
- `/pt/app/plugins`
- `/pt/app/tasks`
- `/pt/app/tasks/:id`
- `/pt/app/wechat`
- `/pt/app/sessions`
- `/pt/app/billing`
- `/pt/app/credits`
- `/pt/app/invite`
- `/pt/app/notices`
- `/pt/app/admin`

导航覆盖侧栏、当前项、概览快捷入口、通知铃铛、账单与额度互链、邀请入口、任务详情与返回、管理页返回、插件升级返回以及工作台内实际出现的账户菜单。复用 `localizedPath`、`splitLocalePath` 和现有 `localizedHref`，沿当前路径确定语种，并保留既有 query/hash。

固定产品文案覆盖标题、说明、按钮、表单标签、表头、无障碍名称、加载、空态、错误、校验和确认弹窗。缺失键写入 `src/shared/i18n/pt/copy/` 的现有合适模块，取词接入复用前序卡实现。用户输入、模型名、聊天内容和管理员发布的通知正文按原始内容展示。已知产品错误提示通过现有错误码或本地提示提供葡语。

静态页面壳、动态详情 rewrite、页面语言与 noindex 纳入同一交付。未登录和会话失效进入既有登录流程，已登录无管理权限显示葡语拒绝访问页并提供 `/pt/app` 返回入口。公开帮助目标已有葡语译文时加前缀，缺译教程保留现有可访问入口。

范围外包括公开教程全文翻译、新功能、计费或额度计算、支付回调、登录认证协议、管理员权限规则变更、schema、迁移、生产配置、依赖升级及通用框架扩建。中文与英文默认行为、前序语言已交付结果是回归基准。涉及这些边界的新增要求须先说明成本并由用户确认。

## 验收标准

1. 路由与刷新。使用登录 fixture 逐一打开并刷新上述 12 个静态入口，HTTP 页面壳为 200，客户端显示相应页面。由 fixture 提供的真实任务 ID 可直接访问和刷新详情。`assistants` 沿用渠道页语义。
2. 导航与语种。桌面和 390px 窄屏逐项点击侧栏及范围内站内入口，工作台 URL 保持 `/pt/`，当前项和页面匹配。已有 query/hash 的业务语义保留。未知工作台子路径按既有兜底语义处理并保留葡语。
3. 葡语显示。各页有数据、空态、加载、失败以及实际表单和管理页签的固定产品文案使用葡语。以包含中文用户数据的 fixture 验证用户内容完整保留。金额、币种、额度、日期、业务时区和单位与基线表达一致。
4. 登录回跳。未登录或会话失效访问 `/pt/app/...?...#...` 时进入既有登录流程，成功后回到同一葡语路径。沿用现有允许范围校验，外部地址、协议相对地址、反斜线和规范化后越出允许范围的地址继续被拒绝。已登录无管理权限显示葡语拒绝访问提示，返回入口为 `/pt/app`，管理数据仍受现有服务端权限限制。
5. 权限及数值。葡语与中文同一 fixture 下的账单、额度和后台数据一致。API 路径、请求负载、计费计算与权限边界通过既有回归。普通用户调用管理接口仍受现有权限限制。
6. 帮助链接。已登记葡语的公开目标使用现有工具生成对应链接。缺少葡语译文的教程保留现有可访问目标，逐项核对工作台内实际帮助链接可达。
7. 构建和索引。使用真实构建产物验证葡语页面入口及任务详情直接访问，HTML lang 为 `pt-BR`，私有页 noindex 正确。工作台保持在 sitemap、llms 和公开教程收录范围之外。
8. 既有路由。`/app`、所有现有 `/app/*`、前序语言工作台及原有公开页面通过相关回归。静态 HTTP 壳为 200 与登录后内容可用分别取证。
9. 内部文档隔离。本文件位于业务仓库根 `internal-docs/`。检查最终静态资产、客户端与服务端 bundle 和公开教程索引，检索本文件名及卡号应无命中。若存在 `/api/docs`，其响应也应无本文内容。源码当前未发现本地 `/api/docs` 路由，外部文档 URL 的字符串命中不作本地路由证据。
10. PR 交付。一个 PR，base 为 `main`，状态 OPEN。提供最终 base/head SHA、实际检查结果、桌面和窄屏截图、同仓文件冲突核对以及最终 HEAD 的整卡独立评审结论。

## 实施与验证

先满足西班牙语前驱，更新到包含其已合入提交的 `main`，再核对本轮记录的缺口。共用能力已有实现时直接复用。补葡语路由登记及构建入口，修正导航 base 和遗漏链接，再沿普通页面、插件与任务、管理页签串行接入葡语文案。相关短文案和内链随对应页面一起交付。

复用并按具体回归缺口扩展 `test/i18n-pt.test.ts`、`test/i18n-pt.client.test.tsx`、`test/seo.test.ts`、`test/auth.test.ts`、`test/auth-expiry.client.test.tsx`、通知与管理相关测试及 `test/browser/dashboard-i18n.spec.ts`。当前浏览器测试主要覆盖工作台首页和引导，应补充子页直达、刷新、侧栏点击、回跳和权限显示的实际验收。

仓库规定提交前执行 `pnpm check`、`pnpm test:openclaw`，并在暂存目标文件后运行 `pnpm check:public`。`pnpm check` 包含 lint、typecheck、Vitest、构建与 SEO 校验。开发说明要求构建后执行 `pnpm test:browser`。命令均来自 package.json、CONTRIBUTING 和开发说明，选择测试参数前读取现有配置或工具帮助。

全量测试和构建串行运行，每次开工前读取 load、MemAvailable 和已有重活进程。已有重活或 MemAvailable 小于 2 GiB 时等待并说明。遵守全局会话上限 4，由单一 agent 执行。评估阶段只做源码、Git 和 PR 查询，功能测试与构建尚待开发交付验证。

## 依赖、基线与文件冲突

用户规定 ja → en → ko → es → pt。本卡唯一直接前驱为「wechatai 工作台西班牙语子路由本地化（/es/app/*）」`beb5e395-6e5a-4a39-8574-73054fae8982`，日语、英语和韩语通过线性链继承。续评时从西班牙语需求文档及任务目录标识取得确切 ID，并通过 `add_task_dependency_kandev` 登记唯一依赖。工具返回 `blocked=true`、`blocked_reason=pending`，`depends_on` 仅包含该西班牙语卡。

本卡分支为 `feature/93062de0-pt-app-subroutes`，评估起点为 `3f329352ac0d73da0ee1611ce4169bbfd7fe1443`。实现基线为西班牙语前驱正式通过且提交已进入 `main` 后的 SHA。实际开发和开 PR 前再次查询 OPEN PR 与各 PR files，重叠文件按卡面要求等待先行 PR 合入，再更新本卡基线。当前空列表只反映本轮查询时点。

共用文件以下述西班牙语卡先合入后的版本为基线，包含更早 ja、en、ko 的累积成果。

- 路由及页面壳涉及 `src/client/main.tsx`、`workspace.tsx`、`context.tsx`、`shell.tsx`、`locale.tsx`、`prerender.tsx`、`src/shared/seo.ts`、`scripts/prerender.mjs`、`scripts/verify-seo.mjs` 和 `public/_redirects`。
- 页面及导航涉及范围内 `src/client/pages/` 页面、实际嵌套组件、`notices.tsx`、`user-menu.tsx`、`limit-hint.tsx` 和 `plugin-upgrade.ts`。
- 葡语专属变更集中于 `src/shared/i18n/pt/dashboard.ts` 及 `src/shared/i18n/pt/copy/`。共用词典类型和读取方式以已合入前驱为准，具体缺口核实后再改。
- 登录回跳及回归涉及 `src/shared/auth.ts`、认证与页面现有测试、`test/browser/dashboard-i18n.spec.ts`。

回滚单元为本卡整个 PR，回退后恢复含西班牙语前驱的 main 基线，无数据迁移步骤。提交信息包含卡号 `93062de0`。

现有 `add_task_dependency_kandev` 只能添加依赖边，其 schema 没有 `start_when_unblocked`；`update_task_kandev` 同样没有该字段。新建工具支持该配置，但本卡需要保留既有身份。依赖自动唤醒须通过支持既有卡的编排入口落实后读回确认，本轮未宣称配置完成。

## 内部文档隔离依据

公开教程由 `src/shared/docs.ts`、客户端内容模块和已登记语言模块显式提供。i18n 发现 glob 为 `src/shared/i18n/load.ts` 的 `./*/*.ts`，只覆盖语言注册目录。静态资源来自 public，预渲染输入来自公开和私有路由清单。当前源码与脚本没有导入 internal-docs 的记录，本文件位于这些构建输入之外。构建产物的最终隔离证据按验收第 9 项补齐。

## 用户已确认的验收口径

用户于 2026-11-27 选择 Q1 第一项和 Q2 第一项，以下内容作为实施与验收依据。

1. 沿用现有权限处理。未登录和会话失效进入既有登录流程，已登录无管理权限显示葡语拒绝访问页及 `/pt/app` 返回入口。在现有安全回跳校验内补齐葡语工作台子页允许范围，优先复用前驱提交。
2. 公开帮助链接沿用现有可访问目标，已登记葡语页面才加前缀。公开教程全文翻译维持范围外。

Q3 返回第一项选项标识，未附链接或 ID。现已通过任务目录与西班牙语需求文档核实前驱 ID，并成功登记依赖，无需用户再次补充。

## 工作区状态与流转

初始任务目录为无 remote 的占位仓库。通过 Kandev 自动接入仓库失败，错误为任务环境 `502713d0-2d51-4e01-9e30-77f93828e3b7` 未 provisioned。现已创建本任务内独立 linked worktree，路径为 `/var/lib/kandev/tasks/794cc727-04b7-4ae4-94fd-7f8f3173fa43/93062de0-c720-4a8a-b099-01f968b9f511/wechatai`。本文件位于该业务仓库根目录。

`add_branch_to_task_kandev` 接管现有工作树仍返回仓库尚未关联当前卡。续评时使用 `add_workspace_sources_kandev` 关联原 repository ID `e0c89250-2aa4-4e83-9d39-54668652d13f`、base main，返回 `task has an active turn`。需在会话空闲时通过该受支持入口关联仓库，然后接管既有工作树，保留本文件和分支。接管调用使用 worktree_path 和 checkout_branch，省略 repository_id、repository_url、local_path。

验收口径已确认，需求评估定稿。按要求通过 move_task_kandev 将本卡移入开发中 `ce7108c3-7888-4c98-9347-512e71ef0989`，工作流为 `1a609d7f-8fc7-4fea-a5d9-3c5cf9c0ceef`。实际实现须先确认西班牙语前驱正式通过且提交已在 main 可用。工作树关联和既有卡 start_when_unblocked 配置仍待恢复，依赖边登记已完成。move_task 已接受移入开发中的请求，回执为 `disposition=deferred`，`move_id=04c33cf4-8404-4721-bc87-59affba994b2`，将在本回合结束时处理。

## 开发前置检查（2026-11-27）

结论为 BLOCKED。西班牙语唯一前驱 `beb5e395-6e5a-4a39-8574-73054fae8982` 尚未提供正式 PASS 和可用实现提交。

本轮读取前驱任务计划及最近会话，依赖查询时前驱为 SCHEDULING，最近会话为进入开发阶段。西班牙语工作树 HEAD 与 origin/main 同为 `3f329352ac0d73da0ee1611ce4169bbfd7fe1443`，`git diff --stat origin/main...HEAD` 无输出，状态仅包含未提交的内部需求文档。GitHub 按 `feature/beb5e395-es-app-subroutes` 查询全部状态 PR，结果为 `[]`。

重试后的 `git ls-remote origin refs/heads/main` 返回 `3f329352ac0d73da0ee1611ce4169bbfd7fe1443`。本卡 base/head 同为该 SHA，分支为 `feature/93062de0-pt-app-subroutes`。

本轮改动限于前置检查记录，功能实现与测试、类型检查、lint、构建尚待前驱满足后执行。恢复时确认前驱最终 HEAD 的正式评审 PASS、相关提交已进入 main，再同步本卡基线并复用前驱实现。本卡开发完成信号保持未发出。

## 本卡实现说明（2026-11-28）

本轮按已解除依赖的卡面执行，实际实现基线为 `3f329352ac0d73da0ee1611ce4169bbfd7fe1443`。通过已有 locale、路由、页面组件、预渲染与 formatCopy 接入葡语。新增词典位于 `src/shared/i18n/pt/copy/workspace.ts`，原创角色模板的葡语内容位于同目录的 `roleplay.ts`。页面在固定文案调用处取词，用户模型名、公告正文、会话与任务内容继续按原始值显示。

12 个静态入口已登记。动态任务详情与未知葡语工作台子路径由既有私有壳承接，客户端分别显示详情或返回葡语概览。查询参数和片段沿用原始业务行为。工作台内链接、插件升级返回、账户菜单和登录回跳保持葡语。服务端的回跳允许范围只增加葡语工作台子页，既有来源校验和认证流程继续生效。

已知产品错误通过现有消息或错误码显示葡语。历史额度流水仅翻译已知系统说明与固定数值模板，金额、时间戳和自定义说明保持原始数据。新增配置采用葡语默认提示，已有配置按保存值展示。Grok 的操作说明使用可选翻译参数，旧调用方仍使用原始指令，连接器与 Routine 名称作为既有标识保留。

浏览器实际发现葡语账单按钮和手机顶栏横向溢出，已对 `pt-BR` 工作台添加局部换行样式。桌面和 390px 窄屏截图随本卡交付。

- [桌面账单截图](pt-app-subroutes/billing-desktop.png)
- [手机账单截图](pt-app-subroutes/billing-mobile.png)

新增回归覆盖入口与刷新、桌面和手机侧栏、任务详情、未知路径兜底、登录和会话失效回跳、普通用户管理权限、10 类插件配置、角色页签、管理后台页签、服务失败、中文原始内容和数值对照。已有葡语账户菜单测试按本卡新增的子路由导航行为同步更新。

验证使用临时 Node 22.23.5 运行时和现有锁文件。详细最终命令输出、base/head SHA 与 PR 状态记录在本卡计划中，创建 PR 时同步交付。截图使用测试夹具数据。


## 最终开发验证（2026-11-28）

最终源码通过 `pnpm check`。服务端为 114 个测试文件、2513 项测试，客户端为 42 个测试文件、469 项测试，lint、类型检查、构建与 SEO 检查均成功。`pnpm test:openclaw` 为 27 项通过，`pnpm test:browser` 为 327 项通过。暂存后的 `pnpm check:public` 对 1122 个索引文件检查通过。

真实构建由本地 Worker 预览验证。34 个 HTTP 探测通过，包含葡语的 12 个静态入口、动态任务、未知子路由、中文工作台及前序语言首页。葡语入口均返回 200，HTML 为 pt-BR，并有 noindex 响应头和页面标记。全站 `scripts/verify-seo.mjs` 的真实 HTTP 模式通过。内部需求文档与截图的公开地址返回 404，`/api/docs` 经过既有认证中间件返回 401，响应均不含内部文档内容。

最终静态资源、客户端和服务端运行 bundle 对本卡文件名、卡号与 internal-docs 的检索为零命中。构建器的 wrangler.json 仅在 configPath、userConfigPath 元数据中保留工作目录路径。预览使用的临时本地测试配置已通过仓库脚本清理。

## PR 交付状态（2026-11-28）

开发验证完成后复核同仓 OPEN PR，发现韩语 PR #56「[f78c690a] 韩语工作台子路由本地化」已开启。其 head 为 `ee219086ace95039011041b1e112870b7ff958a6`，base 为 main，完整清单含 138 个文件，与本卡有 54 个文件重叠。重叠涉及路由、页面、导航、共用取词模块、鉴权回跳、SEO 和浏览器测试。

卡面要求开 PR 前遇到其它 OPEN PR 文件重叠时等待，因此当前先提交本卡已验证的实现与截图。PR 交付和开发完成流转处于阻塞状态。恢复时重新核实 #56 状态，若已合入则同步实际 main、处理共享文件并重新验证，之后创建本卡唯一 OPEN PR。

## 合入韩语基线后的兼容验证（2026-11-28）

韩语 PR #56 于 2026-11-28 08:44（Asia/Singapore）合入 main。09:07 的远端查询确认 OPEN PR 为空，main 为 `669bcf08abf2d344c3328e7e774f8fd16ee6b469`。本卡在原功能分支合入该基线，按新 main 的页面取词、共享状态显示、角色预设参数和动态任务登记接入葡语。葡语词典复用此前已交付内容，补齐共享页面新增键，并增加页面文案键覆盖检查。韩语现有路由、文案与测试继续保留，路由登记的相关断言同时覆盖葡语。

本次仍由单一开发会话完成，每项全量测试或构建前核对全机资源并串行执行。沙箱内完整检查因监听本地端口被拒而中断，经批准在沙箱外重跑。首次同步后的 `pnpm check` 成功，服务端 2514 项、客户端 490 项测试通过，lint、类型检查、构建和 SEO 检查通过。金额展示与实际浏览器验收继续按本卡原验收口径核对，最终输出将在交付记录补齐。

最终前端兼容修复包括内置头像标签、服务端连接错误以及用户模型名与产品文案同名时的原样展示。共享错误显示补充状态码和未知错误的葡语兜底。最终 `pnpm test:client` 为 43 个文件、491 项通过，lint 与 typecheck 退出 0。重新构建和 SEO 校验通过。完整浏览器第二轮为 336 项通过、1 项模型名回归失败，该处已修复，最终工作台专项复验结果待追加。

## 最终兼容验收结果（2026-11-28）

合并基线后的最终开发验证完成。服务端 2514 项通过，最终客户端 491 项通过，lint、typecheck 和最终构建均退出 0。最终完整 `pnpm test:browser` 为 `337 passed (5.0m)`，覆盖葡语 16 项及韩语 10 项工作台专项。此前浏览器发现的头像标签、连接错误和同名模型文本问题均已修复并在最终套件通过。`pnpm test:openclaw` 为 27 passed、0 failed。桌面和手机账单截图已从最终浏览器产物更新。

最终公开资源与运行文件共扫描 331 项，本卡文档名、卡号和 internal-docs 均零命中。构建后的本地 Worker 使用临时生成的测试密钥验证认证响应，密钥值隐藏并在验收后清理。构建保留原有 Wrangler observability 字段及 chunk 体积提示。

Kandev 现有工作树接管仍受仓库未关联限制，评审使用本文件所在的业务工作树及本卡 PR。本轮资源门禁检测到他卡 Playwright/Vitest 时暂停了重活，释放后才继续。历史首次开发中的一次构建重叠已记入任务计划，本轮按资源检查串行完成。

真实 HTTP 探测 47 项通过，葡语及韩语静态入口和任务详情均返回 200，葡语 HTML lang 为 pt-BR，私有路由 noindex 正确。内部文档和两张截图的公开请求返回 404，`/api/docs` 在临时测试配置下按既有认证返回 401。仓库 HTTP SEO 校验通过。预览进程已结束，`scripts/sanitize-build.mjs` 已清理构建目录的临时测试密钥。

## 首次独立评审返工（2026-11-28）

独立评审唯一 P1 为插件升级后丢失葡语。旧流程仅保存插件配置目标，Stripe 成功、取消和订阅管理统一返回 `/app/billing`，页面随后以默认语种构造继续配置链接。

本轮在插件升级和账单支付跳转处保存账户隔离的当前标签页返回意图，保存时机为取得并验证支付链接之后。账单入口使用已有 `splitLocalePath`、`localizedPath` 校验精确工作台基址，恢复对应账单地址并保留实际返回的 query/hash，在目标页面消费该意图。支付状态查询与账单内容在语种恢复后挂载。继续配置沿用原有插件意图格式和当前工作台 base。金额计算、订单复用与支付幂等沿用现有服务端链路，已有 Stripe 会话的标准返回地址也能恢复语种。浏览器会话存储不可用时沿用现有容错，进入标准账单页。

新增 5 条真实构建浏览器回归，覆盖插件和账单入口的成功、取消，以及从插件进入订阅管理后返回。回归同时检查请求负载、query/hash、葡语账单标题、插件配置目标、390px 窄屏和返回后主动切换语种。旧构建上 5 条均因返回 `/app/billing` 失败，证据位于 `/tmp/93062de0-rework-browser-red.log`。新增 6 项客户端测试覆盖返回基址、账户隔离、一次性消费、篡改值和存储不可用，最终完整验证与提交证据随本卡计划记录。

复审仍按原始完整需求审查，从 `669bcf08abf2d344c3328e7e774f8fd16ee6b469` 到返工最终 HEAD。交付继续使用 PR #57。

返工后的 390px 取消结账页面保留葡语提示及返回插件入口。

- [取消结账后的手机账单截图](pt-app-subroutes/upgrade-return-mobile.png)

本轮最终本地验证使用 Node 22.23.5 和现有锁文件。`pnpm check` 通过，Worker 2514 项、客户端 497 项通过，lint、类型检查、构建与 SEO 通过。完整浏览器回归 342 项通过，其中新增 5 条由修前失败转为通过。OpenClaw 27 项通过。最后的浏览器断言调整后再次执行 lint 和类型检查，均通过。真实 HTTP 48 项和 HTTP SEO 通过，内部文档与新增截图返回 404，`/api/docs` 返回 401。331 个公开资源及运行文件的内部文档标识扫描零命中。临时预览进程与测试密钥已清理。

首轮全量检查曾有 3 项既有 Worker 测试触发 5 秒超时，原命令复跑后全部通过。原始证据位于 `/tmp/93062de0-rework-check-timeouts.log`，最终证据采用 `/tmp/93062de0-rework-` 前缀，包含 `check.log`、`browser-red.log`、`browser-green.log`、`browser-full.log`、`lint.log`、`typecheck.log`、`openclaw.log`、`http.log`、`seo-http.log`、`isolation.json`。任务执行期间曾发现 PR #57 已关闭且未合并，已依照本轮保持唯一 OPEN PR 的指令重新打开原 PR。


## 第二次独立评审返工（2026-11-28）

独立评审唯一 P1 为 Free 用户打开 `/pt/app/plugins` 并点击 `Configurar Xiaowei` 后，升级弹窗的套餐标题和无障碍名称仍为 `Plus 月付`、`Plus 年付`。弹窗按 `BILLING_OFFERS` 枚举套餐时直接使用默认名称，葡语取词遗漏了这两处。

本轮复用葡语定价词典的 `pricingCopyPt.plans.offerName`，按套餐周期生成 `Plus Mensal` 和 `Plus Anual`，同一名称用于标题和 `aria-label`。购买按钮继续使用 API 目录中匹配的 offer，金额沿用现有目录价格及档位金额。

新增桌面 1280px 与手机 390px 的 Free 升级弹窗回归，检查两个套餐标题、无障碍名称、购买按钮、金额及页面葡语文案。修前真实构建上的两项测试均因中文套餐标题失败，证据位于 `/tmp/93062de0-rework2/browser-red.log`。回归使用测试账户和模拟账单 API。

- [Free 升级弹窗手机截图](pt-app-subroutes/upgrade-plans-mobile.png)

本轮继续使用 PR #57。后续独立复审覆盖原始完整需求及基线 `669bcf08abf2d344c3328e7e774f8fd16ee6b469` 到最终 HEAD 的全部差异。


本轮最终 `pnpm check` 通过，Worker 114 个文件、2514 项测试通过，客户端 44 个文件、497 项测试通过，lint、类型检查、构建与 SEO 全部通过。新增两项弹窗回归由修前失败转为修后通过，完整浏览器套件为 344 passed，OpenClaw 为 27 passed。截图调整后再次执行 lint 和类型检查，均通过。真实 HTTP 49 项及 HTTP SEO 通过，内部文档和四张截图返回 404，`/api/docs` 返回 401。331 个构建运行文件对内部文档标识零命中。预览进程与临时测试密钥已清理。

本轮证据统一位于 `/tmp/93062de0-rework2/`，包含 `browser-red.log`、`browser-green.log`、`check.log`、`browser-full.log`、`openclaw.log`、`lint.log`、`typecheck.log`、`http.log`、`seo-http.log` 和 `isolation.json`。金额、周期名称与公开定价页按现有共享档位及葡语词典核对。


## 第三次独立评审返工（2026-11-28）

独立评审唯一 P1 为支付返回时会话查询晚于工作台数据，账单页首次挂载以空 email 读取返回意图，真实账户随后到达又触发清除，最终停在中文账单页。

本轮复用仓库按账户 key 挂载组件的模式，将账单返回状态绑定到当前 email。身份从空值变为登录账户时重新初始化对应返回意图，恢复葡语账单地址后按已有逻辑消费记录。后续主动切换语种继续使用用户选择。

新增真实构建浏览器回归，Free 用户在 390px 页面从 Xiaowei 升级进入模拟支付，取消返回时将会话响应延迟 1 秒。测试检查葡语账单、query/hash、回跳意图消费、葡语插件配置入口，以及后续主动访问中文账单。修前因实际返回 `/app/billing` 失败，日志位于 `/tmp/93062de0-rework3/browser-red.log`。账单 API 和 Stripe 使用测试替身。

修后同一回归为 1 passed，日志位于 `/tmp/93062de0-rework3/browser-green.log`。手机截图已核对葡语账单标题、取消支付提示及返回插件入口。

- [会话延迟返回后的手机账单截图](pt-app-subroutes/delayed-session-return-mobile.png)

本轮 `pnpm check` 退出 0，Worker 2514 项与客户端 497 项通过，lint、类型检查、构建和 SEO 通过。完整浏览器 345 项通过，包含新增延迟会话回归及既有五条支付返回回归。OpenClaw 27 项通过。真实 HTTP 50 项及 HTTP SEO 通过，内部文档和五张截图返回 404，`/api/docs` 返回 401。331 个构建运行文件对内部文档标识扫描零命中，临时预览及测试密钥已清理。证据统一位于 `/tmp/93062de0-rework3/`。

评审原始独立探针在修后构建上为 7 passed，包含此前稳定失败的延迟会话场景，结果见 `/tmp/93062de0-rework3/independent-green.log`。
