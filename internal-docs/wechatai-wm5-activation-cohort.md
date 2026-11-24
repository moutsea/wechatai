# WM5 激活队列只读 API 需求评审

## 结论

本卡 `b7ef8872-48dc-4019-b47a-594d78256e6b` 是 `moutsea/wechatai` 的独立需求。用一个 draft PR 交付按注册日聚合的 `GET /api/metrics/activation`，连同参考 SQL、接口文档与测试独立验收。回滚边界是本 PR 的路由和读模型，无数据迁移。风险为高，重点是外部凭据的权限边界、日桶完整性和活跃数据误报。

2026-11-25 复核结论为需求评审通过，规模中等，继续按一张卡、一个 draft PR 交付。WM1 是唯一代码前置，看板状态为 COMPLETED，其最终实现 HEAD `179fc9251bd8f50030bb8e29f361cba3c5c8e396` 已有独立 PASS 记录。GitHub PR #48 于 2026-11-24 17:20:45（Asia/Shanghai）合并，本轮 fetch 确认合并提交 `f84b9060a79d421c659cb68737a6b551a33c568b` 即当前 `origin/main`。开发依赖已满足，按本轮指令移交「开发中」。

## 证据与范围

- 工作区 `HEAD` 为 `b36ca2cba3e4cfbc04f99fa0e466423bda54e936`，分支 `feature/wechatai-api-zq5` 比本轮已刷新 `origin/main` 落后 58 个提交且无自有提交。当前唯一工作区变更为本需求文档。评估代码从 `git show origin/main:<path>` 读取，开发前保留本文并同步分支，记录实际 base SHA。卡面历史审查点 `9ef0eca662beee9312375acd3bd1153ab0af878c` 仅作历史记录。卡面附件 `CONCLUSIONS.md` 与 `matrix.md` 在当前环境缺失，本轮已直接检查相关源码、WM1 独立评审记录与 GitHub 元数据。
- 最新 `src/server/index.ts` 第 185–186 行已将 `/api/metrics` 与 `/api/metrics/*` 挂到 `metricsRequest`，早于通用 bodyLimit 和 Session 中间件。`src/server/metrics.ts` 已提供 Bearer 校验、IP/有效凭据限流、固定字段审计和异常处理，目前只支持 health。本卡在这个处理器内增加 activation 分派，并把其路径加入审计固定模板。现有后台读路由仍依赖 Better Auth Session 和 `admin_user` 白名单。
- 本轮 GitHub 只读查询确认采集代码部署 run `44890566353` 成功，真实 `Publish Cloudflare Worker` 步骤成功，deploy job 于 2026-11-21 17:43:24（Asia/Shanghai）结束。核对其 head `9e0058fdd2e81f45417b0a2601276aa451f8471f`，已含三个激活时间戳的写入及快照字段。本轮选定 run 结束后的首个上海整日 `2026-11-22T00:00:00+08:00` 为保守纳入下限，文档与响应需披露这一截断可能省去更早的已采集账号。实现以已有部署证据对应的常量表达下限，无需新增生产配置。 [Deploy Cloudflare edge](https://github.com/moutsea/wechatai/actions/runs/44890566353)
- 优先复用 `docs/analytics/activation-cohort.sql`、`src/server/admin-account.ts` 输出的 `admin_account_stats.data.activation` 与 `billingMode(env)`。本卡查询现有快照和订单，统计阶段口径沿用现有采集。由 WM1 提供独立 Bearer 校验、限流与审计，并在强制 Session 的全局中间件前挂载 metrics 路由。
- 范围排除历史回填、留存（WM6）、存量连接或模型统计（WM3）、访问到付费、GSC、Bing/IndexNow（W10）、AI 引用（W12）及 BYOK 上游成本、毛利、利润。登录、后台同步、计费、模型调用与微信发送均沿用现有路径。

## 统计和响应契约

- 注册日按 Asia/Shanghai 归桶。有效注册范围沿用 `[from_ms, to_ms)`，下限取请求起点与已验证采集下限的较晚值。公开有效区间、观测截止、时区、计费 mode 和观察窗长度。本轮选定每账号连续 7×86400000 ms，事件落在 `[createdAt, createdAt + window_ms]` 时计入。`src/server/auth.ts` 的注册时间字段使用秒级 timestamp，`src/server/admin.ts` 已兼容秒与毫秒。参考 SQL 和 API 必须先沿用该兼容换算统一为毫秒，再筛选、归桶和计算窗尾，覆盖两种已有数据。
- 以有效注册范围内的全部账号判断日桶完整性。任一账号未满窗、没有快照、`synced_at` 早于窗尾，或快照缺少有效 `activation` 对象，当日提供 `available=false` 和原因，省略阶段计数。完整日桶可以返回有证据的零。采集下限无法确认时返回明确不可用。
- 按账号分别统计 `firstModelTestAt`、`firstWechatConnectedAt`、`firstWechatReplyAt`，以及窗内至少有一笔同 mode、`status='paid'` 的订单。付费阶段按账号去重，gross/net 金额与退款净额均不适用。通知或 Agent 用户可跳过模型设置，各阶段彼此独立。
- 响应仅含日级聚合、可用性与统计口径。严禁邮箱、姓名、用户 ID 列表、订单号、支付明细、微信 ident、聊天内容及任何密钥。保留 `lastWechatReplyAt` 会覆盖历史的解释，留存交由 WM6。

## 验收

1. 本地集成测试用 API 的有效 `from_ms`、`to_ms`、`observed_until_ms`、`window_ms` 和 `mode` 执行参考 SQL，比较可用日桶的注册及四阶段合计。覆盖上海午夜、采集下限、事件窗尾、`synced_at` 恰好等于窗尾、同账号多单去重、异 mode 和非 paid 订单。
2. 现行 SQL 先过滤不合格账号再分组。内存 SQLite 已复现同日缺快照或部分账号未满窗时仍返回部分合计。实施需让 SQL 与 API 共享整日资格判定，确保上述场景只报告该日不可用。分别覆盖缺快照、过旧快照、缺激活对象和真实零值。
3. 用跳过模型测试且成功回复或付费的样本验证独立阶段。用只有 `lastWechatReplyAt` 的样本断言首次回复计数保持原值，响应无 D7 或其他留存字段。覆盖对外响应字段白名单。
4. 有效专用 Bearer 可读日合计或明确不可用。无 token 为 401，错误 token、仅管理员 Cookie、普通 Session、Plus Session 均无读权限。只读请求不触发同步，WM1 的限流与脱敏审计沿用现有契约。
5. 在独立的 `docs/metrics-activation.md` 写清窗口、时区、去重、计费 mode、gross/net 适用性及 unavailable 语义，需要入口链接时并入同一 PR。串行执行对应 Workers 测试、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 和 `pnpm check:public`，保留真实输出。重活前检查 load、MemAvailable 与已有重活进程，已有重活或可用内存小于 2 GiB 时等待并说明。本文件保存在仓库根 `internal-docs/`，公开页面从 `src/client/prerender.tsx` 生成，静态资产目录为 `public/`，公开文档内容来自显式源码模块。验收时检查构建产物和 `/api/docs` 无此文档标记。
6. 只有未来另行授权部署并核对实际部署 SHA 后，才进行生产验收。记录有效 token 可读或明确不可用，以及无 token 401。验证记录仅包含时间、部署标识和结果。看板、仓库、PR 和日志均禁止记录凭据。

## 依赖、分支和交付

- 线性前置为 WM1 `affc0518-ed7c-47c6-8cef-db6e671f2128`，其完成状态、独立 PASS 与已合入提交均已核实。当前保留这一条已满足依赖。WM3 的 overview 与 WM6 的留存各用独立查询。
- 使用当前专用分支 `feature/wechatai-api-zq5`，开发前以含 WM1 的最新 `origin/main` 为基线同步，统一以 `main` 为 draft PR 目标。仅提交本卡改动，建议依次拆为聚合与 SQL 对照、路由与权限测试、接口口径文档。每个小提交单独 review。
- PR 负责人为本卡「开发中」步骤承接的 Codex agent，当前步骤 profile 为 `codex-review`（`92d67037-1df0-4f19-bf5e-8cb0c4965f2b`），负责实现、验收证据、逐提交评审交接与唯一 draft PR 的完整交付。本卡现有 assignee 标签为 Codex2。开 PR 环节复用本分支的既有 PR，提交信息含 `b7ef8872`。交付边界为 draft PR，合并和部署另需明确授权。
- 本卡独立验收与回滚，全部文件服务于激活队列这一件事，采用同一 PR，无需拆卡。回滚该 PR 的路由分派、读查询、对应测试和文档即可撤回功能。本轮仅完成需求复核与文档更新，功能实现、功能测试及构建验收由开发阶段完成。


## 接口接入与文件冲突面

- 查询入口为 `GET /api/metrics/activation`，使用 `from_ms` 和 `to_ms` 表示注册时间范围，校验为有效非负安全整数且 `from_ms < to_ms`。`observed_until_ms` 由服务端在请求开始时取当前时间，`window_ms` 固定为 604800000，`mode` 取 `src/server/billing.ts` 导出的 `billingMode(env)`，由这五项形成 SQL 核对参数。API 对参数错误返回明确 400，查询异常走 WM1 的 503 与脱敏审计。观察截止是窗口达成判定时点，数据来源仍是当前快照与订单状态。
- 响应公开请求范围、有效注册范围、采集下限、时区、观察截止、窗口长度、mode 和日桶。每个不可用日桶给出 `available=false` 与固定原因，完整日桶才提供 `accounts`、`model_tested`、`connected`、`first_reply_delivered`、`paid_accounts`。范围完全早于采集下限时给出明确不可用原因。范围内没有注册账号时返回空日桶列表，不生成缺少快照证据的阶段零值。
- 阶段时间戳 null 在有效 activation 对象内表示该阶段没有记录。SQL 使用 LEFT JOIN 保留每个注册账号的资格信息，在日级资格确认后计算阶段合计。API 与参考 SQL 的五个参数、秒毫秒换算和日桶资格一致；可共用查询文本，避免复制两套计算逻辑。
- 计费筛选复用 `src/server/billing.ts` 的 `billingMode(env)`。WM1 health 的同名局部函数用于报告 Stripe 配置可得性，开发时须区分导入。激活响应文档说明缺失或非 live 配置沿用计费函数的 test 回退语义，mode 仅表明订单筛选方式。
- 优先新增 `src/server/metrics-activation.ts`、`test/metrics-activation.test.ts` 与 `docs/metrics-activation.md`，修改参考 SQL 和现有 `src/server/metrics.ts` 分派，必要时更新 `test/metrics.test.ts` 与文档入口。本轮 main 的已有前缀挂载可以直接复用。
- 2026-11-25 GitHub 文件清单显示，WM4 PR #49（卡 `d34f762e-c7f2-4a3a-a558-8f13540220a8`）及 WM3 PR #50（卡 `5a170ea1-a18e-4ec9-8d43-0485121d870d`）均为 OPEN、非 Draft，并与本卡的 `src/server/metrics.ts`、`test/metrics.test.ts` 重叠。若更新配置文档入口，还会重叠 `docs/configuration.md`。这两个先行 PR 的共享文件改动以其各自先合入后的最新 main 为接线基线，本卡保留已落地的 revenue、overview 分派和测试。独立激活查询可以先在已满足的 WM1 基线上开发，共享文件在提 PR 前核对合入状态并同步；按工作流的文件冲突规则处理仍在途的重叠 PR。PR #47 的工作台多语言文件与本卡预计改动面无交集。
- 需求文档只留在仓库根 `internal-docs/wechatai-wm5-activation-cohort.md`。源码检索确认当前 `public` 静态目录、显式文档模块及 i18n glob 均未引用它。开发后的 build 验收需扫描生成物中的文件名与本文件标题，并核对 `/api/docs` 响应未含本文件内容。

## 本轮实测与证据限制

- 对最新 main 的原始 SQL 运行内存 SQLite 样本。同日注册两人，完整快照得到 accounts=2；第二人缺快照时得到 accounts=1；第二人尚未满窗时仍得到 accounts=1。后两项复现了需要在本卡修正的部分合计问题。新增验收还须用秒级和毫秒级 createdAt 的等价样本核对同一天、同窗尾与同计数。
- WM1 最终计划记录 PR #48 自动部署成功，也记录正确生产 Bearer 及真实管理员 Cookie 的正向/隔离验收仍有待补凭据。其代码已通过独立评审并进入 main，满足本卡本地实现依赖。WM5 的生产取数验收仍按未来授权后的实际部署 SHA 与安全凭据执行。
- 本轮只读核对 GitHub、源码、发布包含的采集字段与内存 SQL；完整功能测试和构建尚未执行。之前缺失的审查附件仍不可读，后续验收使用上述可复现源码及测试证据。


## 开发记录（2026-11-25）

- 已在分支 `feature/wechatai-api-zq5` 保留本文并快进到已含 WM1 的 `f84b9060a79d421c659cb68737a6b551a33c568b`。WM1 最终实现提交 `179fc9251bd8f50030bb8e29f361cba3c5c8e396` 是该基线的祖先，独立 PASS 已在前置卡计划核实。
- 提交 `777b784` 交付共享参考 SQL、激活聚合与日期范围解析及首批 32 项测试。SQL 先保留全部注册账号，以注册日判断完整性，再提供计数；秒/毫秒注册时间统一后参与筛选。D1 对参数 SQL 后置注释的限制已在定向测试中发现并修正，参考 SQL 的解释注释放在语句之前。
- 提交 `c59c687` 接入现有 metrics 鉴权、限流、固定路径审计和异常处理，增加真实 Worker 请求验证，并在 WM1 原有真实普通/管理员/Plus Session 样本中覆盖 activation。`src/server/index.ts` 仅调整原有注释以反映新增数据库聚合。三组定向测试共 77 项通过。
- 接口口径写入 `docs/metrics-activation.md`，配置文档提供入口链接。开发只改激活查询、对应入口、SQL、测试及文档，无数据库迁移。
- 本轮使用临时目录中的 Node 22.19.0 与项目 pnpm 10.15.0。系统 Node 22.18.0 低于仓库声明，所有最终测试、类型检查和构建均使用受支持版本。依赖按锁文件安装，测试使用本地开发配置和显式 test-only 绑定。
- 串行 `pnpm check` 退出 0，包含 lint、typecheck、108 文件 / 2397 项 Workers 测试、38 文件 / 437 项客户端测试、build 和 SEO 检查。构建预渲染 119 个公开页面。完整输出为 `/tmp/wechatai-wm5-check.log`，定向验证输出为 `/tmp/wechatai-wm5-route-tests.log`。
- 构建产物扫描共 309 文件，内部需求文档文件名与标题均无匹配。本地构建预览首次因清理后的构建缺少开发鉴权配置导致 `/api/docs` 500；补充显式 test-only 预览配置后，`/api/health` 200、`/api/docs` 401、无 Bearer 的 activation 401、带测试 Bearer 的采集前范围 200 且 `before_collection_start`。四项响应均无本文标记，结果存于 `/tmp/wechatai-wm5-preview-checks.json`。预览已关闭，临时构建凭据文件已删除。
- 2026-11-25 最终读回 PR #49 与 #50 均为 OPEN，head 分别为 `1b73fcf8ff2638f1db7421e485a760244ad943ef` 和 `71f618f560ac40c1c4846616cc58c444d0209123`，mergeCommit 均为空。最新 fetch 的 main 仍为 `f84b9060`。一次性交接要求以这两个先行 PR 合入后的 main 接线，当前本地接入验证基于 WM1，最终共享基线条件待满足。后续同步落地后的 main、保留 revenue/overview 入口并重验受影响路径，再发送开发完成信号并进入独立评审。
- 独立评审可按聚合与 SQL、路由与鉴权、文档三个提交单元串行核对，最终覆盖同一最终 HEAD 的完整 diff。当前证据为开发验证，独立评审与唯一 draft PR 交付按既定工作流继续。
