# 外部只读 API：已支付毛额与退款未知字段（需求评审）

评审日期：2026-11-22；编排复核：2026-11-23（会话 `013e3817-5d18-4a65-8089-a914b56bd831`）。任务：`d34f762e-c7f2-4a3a-a558-8f13540220a8`；初评会话：`86e289a6-260f-49fb-837d-c1831f390424`。仓库仅为 `moutsea/wechatai`，目标分支 `main`。

## 2026-11-24 开发进展

用户已明确授权本卡开发和独立 draft PR，开发会话为 `bbc1aff2-f8f1-4aa2-b9e1-01aca27f8dd6`。当前代码基线为 `f84b9060a79d421c659cb68737a6b551a33c568b`，通过 fetch 和工作树快进取得。WM1 已完成独立代码评审，PASS 对应 `179fc9251bd8f50030bb8e29f361cba3c5c8e396`，PR #48 合并 SHA 与本卡基线一致，祖先检查通过，看板 `blocked_by=[]`。

WM1 计划保留生产正确 Bearer 与有效管理员 Cookie 验证待补记录。本卡依赖采用已合并且取得独立代码 PASS 的实现，生产凭据验收仍由部署与验收步骤处理。

已抽取原后台两段支付 SQL，累计与每日仍在同一 D1 session batch 中查询。收入路由继承 WM1 入口，明确累计、30 日、去重、金额单位及历史订阅覆盖限制。支付模式无法识别和数据库失败均返回 503，来源不可用返回 `available=false` 及原因。没有新增 schema、配置项或数据写入。

每个小提交由本开发会话逐项复核，独立评审按后续工作流执行。第一提交 `35c13f1` 完成共享查询与后台回归，后台 20 用例通过。第二提交 `52e6695` 完成收入路由与权限、隐私、口径测试，定向 3 文件 54 用例通过，typecheck 和 lint 通过。初次定向运行的 7 项失败源于测试日志捕获方式，已按 WM1 的 spy 引用方式修正并重跑通过。

初始安装使用系统 Node 22.18.0，产生 engines 警告。后续验证均采用本机现有 Node 22.23.5。Wrangler 类型生成首次因沙箱日志目录只读和本地监听受限失败，经过执行权限审批后生成成功。全部配置与夹具采用 test-only 数据。

最终本地 `pnpm check` 退出 0，Workers 为 108 文件、2374 用例，客户端为 38 文件、437 用例，lint、typecheck、build 和 SEO 检查通过。构建预渲染 119 个公开页面。日志为 `/tmp/d34f762e-check.log`，定向测试日志为 `/tmp/d34f762e-focused.log`，后台首提交回归日志为 `/tmp/d34f762e-admin.log`。Wrangler 的既有 `redact_query_string` 提示、依赖 sourcemap 缺失和大 chunk 提示仍有输出，命令成功。

完整差异复核确认新路由只接入现有 metrics 入口，复用后台 paid+cny+当前 mode 查询，保留累计和每日独立窗口。文档明确金额单位、去重、查询失败不可用与人工退款说明。内部需求文档未进入构建产物，公开使用说明为 `docs/metrics-revenue.md`。

下文保留 2026-11-22 至 2026-11-23 的需求评审和编排记录。当前开工与依赖状态以上述开发记录为准。

## 结论与开工门槛

本卡可以作为一个原子任务、一个 draft PR 交付：在 WM1 上新增 `GET /api/metrics/revenue`，对外返回本库已支付订单的脱敏毛额汇总。风险级别为高，重点是财务口径、鉴权隔离和隐私；不需要修改计费、退款业务或数据库 schema。

2026-11-23 编排复核：结论不变，本卡是原子任务——一个 draft PR 只交付 `GET /api/metrics/revenue` 及必要的共享聚合抽取、测试与使用文档，可独立验收与回滚；不拆卡、不建父卡/子卡。本轮按编排请求把卡移入「开发中」`ce7108c3-7888-4c98-9347-512e71ef0989`，并登记线性前驱 WM1（`blocked_by`，WM1 完成即解锁）。上一轮“仅授权评审、不移动看板”的边界属于上一轮请求；本轮编排请求已明确要求评估后流转。本轮仍未实现接口、未提交 commit、未创建 PR、未合并、未部署、未使用真实凭据。

WM1 为 `affc0518-ed7c-47c6-8cef-db6e671f2128`（专用 token 鉴权、限流与审计）。2026-11-23 看板状态：已从「暂缓（待开工）」移入「需求评审」并排队，仍无关联 PR，当前源码仍无 `/api/metrics/*` 底座。已登记 `blocked_by=WM1`；WM1 未完成前开发会话不得开工，也不自行合并前驱未合并分支来解依赖。

## 核对基线与证据边界

- 当前检出分支 `feature/wechatai-api-30r`，HEAD 与本地 `origin/main` 同为 `b36ca2cba3e4cfbc04f99fa0e466423bda54e936`（2026-11-22，合并 PR #36）。本地 `main` 引用较旧，不得直接当作实施基线。
- 卡中只读审查基线 `9ef0eca662beee9312375acd3bd1153ab0af878c` 是当前 HEAD 的祖先。本轮未刷新远端，不能把本地 `origin/main` 称为 GitHub 此刻最新 main。
- `/workspace/product-ops/wechatai-api-audit-2026-11-22/CONCLUSIONS.md` 和 `matrix.md` 在本环境不存在；未声称读取这两份文件。
- 本轮未访问生产、未使用或读取任何本地真实 token、未验证管理员会话。卡中 health 200、admin 401 和历史部署 run 均不是 metrics 已上线或已经能读收入的证据。

## 复用现状

`src/server/admin.ts:117` 的 `adminOverview` 已有累计收入及每日支付聚合：

- 累计 SQL（约 131–135 行）过滤当前 `billingMode(env)`、`status='paid'`、`currency='cny'`，包含所需五个累计字段。
- 每日 SQL（约 142–145 行）用 `COALESCE(paid_at,created_at)`、UTC+8 分日，窗口为今天零点往前 29 天至生成时刻；随后补齐 30 个日期桶。
- `src/server/wallet.ts:7` 的 `dayWindow` 可直接复用；`src/server/billing.ts:39` 的 `billingMode` 由现有支付配置决定，不接受外部查询参数选 mode。
- `test/admin.test.ts:640` 已有北京时间分日、未支付和外币排除、test/live 隔离的夹具，可作为回归基线；这些现有测试不能代替新路由鉴权与响应测试。

实施优先把上述两段支付 SQL 抽成小型共享查询/投影，供 `adminOverview` 和新路由复用。不要直接把整个 `adminOverview` 或 `adminUsers` 的响应透传给外部，也不要为收入口径运行账户快照同步、完整后台查询或访问 Stripe 报表。

现有全局 Session 中间件在 `src/server/index.ts:548`，管理员白名单中间件在约 565 行。新路由通过 WM1 子路由注册在 Session 中间件之前，继承其专用 Bearer、只读限制、限流、脱敏审计及禁止缓存策略。

## 接口与财务口径

仅提供 `GET /api/metrics/revenue`。外层版本、错误体和时间字段格式与 WM1 对齐；以下业务字段及语义在本卡独立验收，不能用通用 overview 的默认值替代。

1. 响应显式包含 `mode: test|live`、`timezone: Asia/Shanghai`、`currency: cny`、金额单位「人民币元」、口径 `gross` 与显示名称「已支付毛额」，以及 `generatedAt`。mode 复用站点现有口径；如 WM1 无法可靠提供 mode，按其不可用约定说明原因，不能猜为正式收入。现有 `billingMode` 缺少支付配置时回落为 test，这不证明测试支付已配置或生产收入已同步。
2. 累计汇总 `summary` 明确 `available=true` 后，返回 `revenue`、`paidOrders`、`payingUsers`、`membershipRevenue`、`creditsRevenue`。SQL 均使用同一 `mode + paid + cny` 条件；金额先在整数分上求和，再除以 `100.0`。`membershipRevenue` 限 `kind='plus'`，`creditsRevenue` 限 `kind='credits'`。
3. 累计窗口是查询时库内全部匹配订单，不受每日 30 天窗口限制。`paidOrders=COUNT(*)`，按本库订单行计一次；`payingUsers=COUNT(DISTINCT user_id)`，在相同累计窗口、mode、状态和币种内去重。内部计算可以使用用户 ID，响应不得返回用户 ID。会员获赠不产生支付订单，不计作收入或付费用户。重复读取不能增加订单数。
4. `daily` 及其可用性、窗口元数据明确：起始为生成日往前第 29 天的上海零点，截止为 `generatedAt`，起止均按现有查询包含边界；30 个日期按升序返回，包含今天且今天未满一天。每项仅含 `day`、`revenue`、`paidOrders`；按 `COALESCE(paid_at,created_at)` 的毫秒时间分日，不改用订单创建日或 Stripe 结算日。
5. 响应同时写明数据源 `billing_order`、金额计算、订单和用户去重规则，以及每日时间字段的 fallback。累计汇总不是每日 30 个桶的合计，不能在文案中混用。
6. `refunds` 和 `netRevenue` 各自必须为 `{ available: false, value: null, reason: "现有 paid 订单求和不是净额，退款未入本聚合" }`。本卡不实现退款汇总，因此即使没有 paid 订单，也不能宣称退款或净额为 0；累计和每日毛额都不扣退款。
7. SQL 成功且确实没有匹配订单时，已知毛额、订单数、付费用户数及空日期桶可以是 0。数据库错误不得转为成功的全零响应，应使用 WM1 错误约定（服务不可用）；未知或来源不可用必须用 `available=false` 和原因，值为 null 或不提供，不能补 0。账户快照同步覆盖率不是支付聚合的可用性依据。

已知覆盖限制：`src/server/billing.ts:383` 的历史订阅续费处理更新原 `billing_order`，`paid_at` 也只首次填入；不是每次续费都新增订单行。因此该接口只能称「本库订单的已支付毛额」，不能宣称是 Stripe 全量实收、已对账收入或完整历史订阅收款。响应的 `sourceCoverage`（或 WM1 同义元数据）和使用文档必须说明这一点。本卡不补历史账、不改变该写入路径；需要全量对账时另议范围。

## 权限与禁止范围

无 Bearer、错误 Bearer、仅管理员 Cookie、普通用户 Session、Plus Session 均不能读通；其他服务的凭据不能代替专用 metrics 凭据。正确 Bearer 不依赖 Session，也不能借此调用后台用户明细、同步或写入功能。该路由的缺失或错误 token 验收固定为 401，限流为 429；沿用 WM1 对未配置服务的失败约定。

响应使用字段白名单，不返回邮箱、姓名、用户 ID 列表、订单号、支付主体、支付明细、微信 ident、聊天内容或原始数据库行。日志不得记录 Authorization、Cookie、真实 token、配置秘密或买家信息。示例与夹具只用合成数据。

不做访问到付费的会话转化、来源 ROI、上游模型成本、毛利或利润；`payingUsers` 只是付费用户数。不做 GSC、Bing、AI 引擎引用测量，不修改 W10/W12 的范围或报告；不暴露 `/api/admin/users` 的 `paidAmount`。不更改登录、模型调用、付款通知或退款业务，不新建账本、迁移、队列或依赖。

## 独立验收清单（未来实施时执行）

1. 在同一夹具中放入两种 mode、paid/open/failed/expired、cny/usd、plus/credits、多订单同用户。断言仅当前 mode 的 paid+cny 进入五项累计字段，用户去重、订单数和两个种类的金额准确；分别验证 test 与 live，两者不混加。
2. 放入 30 天之前的 paid 订单，断言计入累计但不计入 daily；覆盖上海 23:59:59 与次日 00:00:00、窗口起点、生成时刻及之后、`paid_at=null` fallback。断言恰有 30 个升序日期、金额为人民币元、空日期桶为已知 0。
3. 用有实际 paid 订单的合成夹具验证 gross 求和；同时断言 `refunds` 和 `netRevenue` 均 unavailable、值非 0、reason 完整。空订单集也必须保持退款/净额未知。
4. 新路由测试覆盖无凭据、错误或其他服务凭据、仅管理员 Cookie、普通及 Plus Session；缺失/错误 Bearer 为 401。正确专用 Bearer 无 Session 可读，超限为 429。只写/同步接口不得因 Bearer 新增权限；确认沿用 WM1 而非复制鉴权。
5. 检查成功体和错误体字段，不含任何 PII 或订单明细；失败不伪装全零，日志不含测试秘密。文档与响应元数据都区分 test/live、累计/30 天、gross/net、去重及历史订阅覆盖限制。
6. 使用文档固定用词「已支付毛额」，链接 [billing 的 Stripe 配置说明](../docs/billing.md#stripe-配置)，引用「退款、争议及历史订阅的特殊账单仍需人工审核，系统不会自动扣回已消耗额度」。不使用「净收入」标注 gross。
7. 先运行新路由测试、现有 `test/admin.test.ts` 和 WM1 鉴权回归，再按仓库要求运行 lint、typecheck 及 `pnpm check`。测试/构建等重活串行；本轮没有执行这些功能验证，也没有产生测试通过结论。

本评审文件仅保存在仓库根 `internal-docs/`，不导入运行时代码，不复制到 `docs/`、`public/`，不登记公开文档 bundle 或 `/api/docs`。实现阶段的公开使用说明只记录接口契约，不包含本评审的内部任务信息。

## 分支、冲突面与交付顺序

- 实施前刷新远端 main，并记录真实 base/head SHA。先确认含已评审、可用的 WM1 底座；若 WM1 仍为未合并 draft，保持待开工，不为解除依赖自行合并。只有 Coder 明确指定其他依赖基线时才调整分支方案并说明 PR 差异边界。
- 保持本卡一个原子 draft PR、目标 `main`。PR 负责人＝本卡「开发中」的开发会话（单一负责人：对本分支、提交、PR 内容、测试和每个 commit 的 review 记录负责）；独立评审会话只审不改；合并与部署只由「部署与验收」按授权执行；不新建父卡或子卡，不并行委派开发。
- 建议三个小 commit：①共享支付聚合及已有后台行为回归；②接入 WM1 的 revenue 路由、元数据与权限/隐私测试；③使用文档和完整验收证据。每个 commit 含本卡短号 `d34f762e`，逐个 review；未完成前一提交的 review 不推进下一提交。最终再审累计 diff，防止单提交审查遗漏集成问题。
- WM1 先处理前缀注册、专用鉴权、环境占位、限流和审计；本卡不重做。共享 `src/server/index.ts` 的注册处必须以 WM1 为基线。
- 与 WM3 可能冲突于 `src/server/admin.ts`、`src/shared/admin.ts`、`test/admin.test.ts` 及 metrics overview/revenue 的共用查询。授权实施时按真实落地先后复用先到版本；另一卡刷新基线再接入。不引入本卡对 WM3 的额外硬依赖，不覆盖对方汇总字段。
- 无 schema 或数据写入，未来代码回滚范围为本 PR 的路由及共享查询变更；回滚仍须遵守生产变更授权。本卡不执行合并、部署、远端迁移、生产 Secret 写入或生产回滚。

## 仅未来另行授权部署后的验证

先核实实际部署 SHA/run 与经过 review 的 HEAD 一致，再通过安全注入的专用 Bearer 读取接口，验证已支付毛额和 unavailable 的退款字段；无 token 为 401，单独 Cookie 不得成功。记录验证时间、状态、口径结论和非敏感部署证据，不保存密钥或响应明细。没有部署授权与版本证据时，不得写「已经能读收入」「metrics 已上线」或把既有 401 探活当作交付成功。
