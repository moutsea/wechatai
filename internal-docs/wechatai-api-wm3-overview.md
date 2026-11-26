# wechatai 只读 API：注册、活跃与平台用量聚合（WM3）

卡：`5a170ea1-a18e-4ec9-8d43-0485121d870d`

仓库：`moutsea/wechatai`，默认目标分支 `main`

评审日期：2026-11-23

评估基线：工作区 `HEAD = b36ca2cba3e4cfbc04f99fa0e466423bda54e936`；本地缓存 `origin/main = 708e3e1caebe62127b3d418434ef56573c87c5b6`；工作树干净。未联网刷新远端，不能据此声称 `main` 已是最新。

## 2026-11-24 实施契约补充

本节更新开发基线、覆盖检查与评审交付顺序，历史评审证据保留供追溯。

- WM1 正式独立 PASS 对应 `179fc9251bd8f50030bb8e29f361cba3c5c8e396`，PR #48 合并为 `f84b9060a79d421c659cb68737a6b551a33c568b`，已 fetch 并确认可达。本卡从该 main 基线开发。
- 本卡沿用独立分支、一个 draft PR。每笔实现提交先自查并记录，完成后通过 step_complete 交工作流独立评审。原单张在途 PR 建议不再作为开工门槛。同文件重叠写入评审交接。
- coverage 的旧结构检查补充 `sampledAt` 与 `synced_at` 一致性、数值字段类型、daily/pluginUsage 的数组及行字段完整性。部分同步与旧结构同时存在时 reason 为 not_synced，observed/items 为 null。
- daily 还检查快照自身保留窗口的起点，取最晚采样账户的 30 日窗口起点。采样晚于 generatedAt 时按 not_covered 处理日桶和插件排名。
- plugins 使用已有 `adminPluginNames` 的公开 ID 名单，在 Top 20 排序前过滤。快照早于今天或晚于 generatedAt 时 reason 为 not_covered，其余包含今日的观测排名为 day_incomplete。
- window 增加 endInclusive、activeUsers、credits、source 元数据，明确包含查询上界、按用户日去重、结算 units/1000 的退款前消耗及快照来源。
- 本轮仅使用明确 test-only 本地配置进行验证。公开接口文档为 docs/metrics-overview.md，内部评审文件留在 internal-docs。

## 结论与原子性

- **原子任务**：一张卡、一个分支、一个 draft PR，只交付 `GET /api/metrics/overview` 的脱敏聚合投影、覆盖度/未知值表达、测试与文档。可独立验收、独立回滚，无 schema 迁移、无数据回填、无新基础设施。
- **风险级别：高**。涉及外部 Bearer 鉴权边界、运营数据外泄、把未知值误报成 0 三类高风险点。改动行数不多不等于低风险。
- **依赖前置：WM1**。本卡复用 WM1 的专用 token、限流与审计，不自建鉴权。依赖不满足时本卡不得开工，见「依赖与基线」。
- 不在本卡实现收入/订单（WM4）、流量/渠道明细（WM2）、激活漏斗（WM5）或 D7 留存（WM6）；不合并、不部署、不写生产 Secret。

## 现状证据

- `src/server/admin.ts:117` 的 `adminOverview` 已用一次 D1 batch 产出：30 个上海自然日的日桶、用户主表与快照覆盖、累计用量、存量、插件 Top 20。
- `src/server/admin.ts:125`：覆盖数 `synced = COUNT(s.user_id)`，`oldest/newest = MIN/MAX(s.synced_at)`；`summary.users` 来自用户主表。
- `src/server/admin.ts:148`：日活按用户、日去重，仅当该日 `requests>0` 计为活跃；失败调用或仅连接不构成活跃。
- `src/server/admin.ts:171`：日数组按 30 天补齐并默认填 0。这个 0 是内部看板默认值，**不能直接当作外部契约的真实零值**。
- `src/server/admin-account.ts:53`：失败统计排除已有 `usage` 的同调用 ID，重试成功后不重复算最终失败。
- `src/server/admin-account.ts:67-68`：日趋势与插件用量来自快照采样时最近 30 日的稀疏数组；只有快照覆盖该日时，缺行才表示该样本为 0。
- `src/server/admin-account.ts:48`：`purchasedCredits = SUM(credit_buckets.remaining)/1000`，条件 `kind='purchase' AND expires>sampledAt`，是快照时点未过期的已购额度余额，不是累计购入、付款金额或收入。
- `src/server/admin-account.ts:49`：`debt = credit_debt.amount/1000`，是已结算但未被可用额度覆盖的欠额；`src/server/wallet.ts` 在扣费超出可用额度时增加、偿还时减少。不是收入支出差额，也不是 `purchasedCredits` 的相反数。
- `src/shared/admin.ts:55` 的内部 `AdminOverview.summary` 还含收入、订单、推荐奖励等字段，外部响应必须逐字段白名单投影，不能展开内部对象。
- `src/server/index.ts:548` 起是通用 Session 中间件；WM1 的 metrics 入口必须继续挂在其之前。当前基线 HEAD **没有** metrics 路由或 `METRICS_API_TOKEN`。
- WM1 实现已在分支 `feature/wechatai-api-token-3kh`，head `f90a8c1`（base `708e3e1`，6 个提交，含 `src/server/metrics.ts`、`test/metrics.test.ts`、配置文档）。该卡当前在「待评审」，无 PR、未合并。其 `metricsRequest` 先做 IP 限流、Bearer 校验、token 限流与脱敏审计，再按路径分发；当前只认 `/api/metrics/health`，其余路径 404。
- `test/admin.test.ts:594` 起已有结算/失败、上海日界、去重、覆盖率、旧快照与只读统计夹具，可直接复用其建库/快照模式。

本文件只做静态评审；本轮未运行测试、未读取任何凭证、未向生产发请求、未执行管理员登录或线上读数。

## 范围

做：

1. 新增 `GET /api/metrics/overview`，复用 WM1 的鉴权/限流/审计与 `adminOverview` 的只读聚合，不另写一套账户统计 SQL。
2. 显式字段白名单与外部类型；内部收入/订单/用户标识/激活字段一律不投影。
3. 统一表达 coverage 与「全站完整值 / 已观测值 / 未知原因」，禁止用内部补零冒充真实 0。
4. 复用既有快照数据做必要的只读完整性判断；不新增同步、回填、定时任务或快照表。
5. 测试：完整/部分/旧结构/过旧/空站点夹具，鉴权与只读回归，敏感字段与日志哨兵。
6. 更新 `docs/configuration.md` / `docs/deployment.md` 中 WM1 的 metrics 契约，补 overview 的字段、窗口、单位与非实时说明。

不做：

- 不实现收入、订单、付费用户、推荐奖励；不实现流量/渠道/搜索来源；不做激活率、D7 留存、访问到付费。
- 不修改 `/api/admin/*` 的 Session + `admin_user` 白名单规则，不为后台路由增加 Bearer 兼容。
- 不调用 `syncAdminStats`、账户 DO `adminStats`、`saveAdminStats`；读路径不触发写同步、额度授予、alarm 或网关请求。
- 不改登录、支付、计费、模型调用、微信收发、账户 DO 行为；不改 `adminOverview` 的既有数值口径（仅允许补充只读覆盖信息与确定性排序）。
- 不合并、不部署、不写生产 Secret；生产验证须另行授权。

## 接口契约

### 路由与鉴权

- `GET /api/metrics/overview`，无查询参数、无请求体、无用户检索。
- 鉴权、限流、审计、`Cache-Control: no-store`、`X-Robots-Tag: noindex, nofollow` 全部沿用 WM1；overview 只在 WM1 的 `metricsRequest` 通过 IP 限流、Bearer 校验、token 限流之后分发。
- 未配置/空白/过短的 `METRICS_API_TOKEN`、缺失或错误 Bearer、空 Bearer → 401，且不含任何成功字段。
- 仅管理员 Cookie、普通 Session、Plus Session、Cookie + 错误 Bearer → 均 401；正确 Bearer 且无 Cookie 才 200。响应不得依赖 Cookie。
- metrics Bearer 对 `/api/admin/users`、`/api/admin/sync`、`/api/admin/users/:id/gift-plus`、账户/模型写接口无额外权限；原管理员 Session 行为不变。
- 已知路径非 GET（POST/PUT/PATCH/DELETE/HEAD/OPTIONS）→ 405 + `Allow: GET`；未知 `/api/metrics/*` → 404；认证失败始终 401。HEAD/OPTIONS 不返回成功元数据，OPTIONS 不开放跨域。
- 限流触顶 429 + `Retry-After: 60`；`API_LIMIT` 缺失或抛错 503。overview 不新增限流键或更宽松的额度。

### 响应白名单

成功 200 顶层字段仅：

```
service, documentationVersion, timezone, generatedAt,
window, coverage, summary, daily, plugins
```

- `service: "wechatai"`，`documentationVersion: "1"`，`timezone: "Asia/Shanghai"`。
- 时间戳均为 Unix 毫秒；`credits` 为平台结算消耗（`units/1000`），可为小数；其余计数为整数。
- 禁止出现：`revenue`、`paidOrders`、`payingUsers`、`membershipRevenue`、`creditsRevenue`、`rewardedReferrals`、`mode`、邮箱、姓名、用户 ID、`isAdmin`、订单号、支付明细、微信标识、聊天/激活事件、插件实例 ID、私有插件名、配置内容。
- 只做显式字段投影，不直接 `...summary`、不直接返回 `adminOverview` 对象。

### 窗口

- 与 `adminOverview` 同口径：今天及此前 29 个上海自然日，共固定 30 桶，按日期升序。
- `window.startsAt = dayWindow(generatedAt).start - 29 * 86400000`；`window.endsAt = generatedAt`；查询上界包含 `generatedAt`。
- `window.includesToday = true`。今天是不完整日，不得声明为完整。
- 响应同时给 `window.startDay` / `window.endDay`（`YYYY-MM-DD`）与 `window.days = 30`，避免调用方自行推算时区边界。
- 业务快照反映各账户 `sampledAt`/`synced_at` 时刻；`generatedAt` 只表示响应生成时间，不表示所有账户已同步到此刻。

### coverage

```json
"coverage": {
  "totalUsers": 120,
  "syncedUsers": 118,
  "oldestSyncedAt": 1730000000000,
  "newestSyncedAt": 1730000000000,
  "legacySnapshots": 0,
  "complete": false,
  "reason": "not_synced"
}
```

- `totalUsers` = 用户主表账户数，等于 `summary.users`；空站点为 0。
- `syncedUsers` = 至少有一条 `admin_account_stats` 的账户数；`oldestSyncedAt` / `newestSyncedAt` 为对应 `synced_at` 的最小/最大值，无快照时为 `null`。
- `legacySnapshots` = 缺少本响应任一快照字段的账户快照数。至少检查 `planUntil`、`links`、`connected`、`channels`、`models`、`plugins`、`sessions`、`requests`、`failedRequests`、`tokens`、`credits`、`purchasedCredits`、`debt`、`daily`、`pluginUsage`。旧结构快照不能用 `COALESCE` 变成 0。
- `complete = totalUsers === syncedUsers && legacySnapshots === 0`；空站点 `complete = true`。
- `reason`：完整时为 `null`；否则 `not_synced`（有账户无快照）优先，其次 `legacy_snapshot`。`complete` 只表示「所有当前账户都有结构完整的快照」，**不表示数据新鲜**；新鲜度看 `oldestSyncedAt` / `newestSyncedAt`。

### 统一可用性表达

所有来自账户快照的数值都使用同一结构；来自用户主表的 `users` / `newUsers` 直接返回真实数字：

```json
{
  "available": true,
  "reason": null,
  "value": 123,
  "observed": 123
}
```

- `available=true`：当前全部账户都有结构完整的快照；`value` 是这些快照的合计，`observed` 与 `value` 相同（保留字段形状，便于消费方统一处理）。对 `summary` 这只表示账户集合与字段完整，不表示同一时刻或实时；对 `daily` 还要求该日已被所有快照覆盖。
- `available=false`：`value=null`，`observed` 为当前已同步快照上的观测值；若连一个快照都没有，`observed=null`。`reason` 取以下枚举之一：
  - `not_synced`：部分账户没有快照；
  - `legacy_snapshot`：存在旧结构快照，缺失字段不能推成 0（此时 `observed=null`，避免假零）；
  - `day_incomplete`：今天尚未结束；
  - `not_covered`：至少一个快照采样早于该日结束，未覆盖完整日。
- `available` 不声明实时。`summary` 的时点由 `coverage.oldestSyncedAt/newestSyncedAt` 表达；不同账户的快照时刻可能不同，合计不是同一时刻的实时值。文档必须写明「累计用量/存量是快照时点合计，不是实时累计」。

### summary

```json
"summary": {
  "users": 120,
  "snapshot": {
    "available": true,
    "reason": null,
    "asOf": { "oldest": 1730000000000, "newest": 1730000000000 },
    "value": { "...": 0 },
    "observed": { "...": 0 }
  }
}
```

`value` / `observed` 仅含下列字段：

| 字段 | 含义 |
| --- | --- |
| `plus` | 快照 `planUntil > generatedAt` 的账户数 |
| `links` | 微信链接配置存量 |
| `connected` | 按套餐连接上限裁剪后的已连接数，沿用账户统计语义 |
| `channels` | 渠道配置存量 |
| `models` | `assistants` 配置数，不是平台网关 Key 数 |
| `plugins` | 插件配置存量 |
| `sessions` | 会话存量 |
| `requests` | 快照中的累计成功结算调用数 |
| `failedRequests` | 持久化失败且同 ID 无 `usage` 的累计失败数 |
| `tokens` | `usage.tokens` 累计 |
| `credits` | `SUM(usage.units)/1000` 的平台结算消耗，不是模型提供商成本、收入或退款后净额 |
| `purchasedCredits` | 快照时点未过期已购额度余额，口径见上 |
| `debt` | 快照时点已结算未覆盖欠额，口径见上 |

不得输出 `lastActiveAt`、`lastFailure*`、激活字段、单用户明细或订单聚合。

summary 的可用性规则：

- 空站点（`totalUsers=0`）→ `available=true`，`value` 全 0。
- `syncedUsers=0` → `available=false`、`reason=not_synced`、`value=null`、`observed=null`。
- 部分同步 → `available=false`、`not_synced`，`observed` 为该批快照的合计。
- 全部同步但存在旧结构快照 → `available=false`、`legacy_snapshot`、`observed=null`。
- 全部同步且结构完整 → `available=true`，即使 `oldestSyncedAt` 很旧；此时必须靠 `coverage`/`asOf` 说明非实时，不能宣称窗口完整。

### daily

固定 30 个元素，日期升序。每项：

```json
{
  "day": "2026-10-25",
  "newUsers": 2,
  "snapshot": {
    "available": true,
    "reason": null,
    "value": { "activeUsers": 3, "requests": 5, "failedRequests": 0, "tokens": 100, "credits": 0.4 },
    "observed": { "activeUsers": 3, "requests": 5, "failedRequests": 0, "tokens": 100, "credits": 0.4 }
  }
}
```

- `newUsers` 来自用户主表 `createdAt` 的秒/毫秒兼容分桶，始终是真实值，不受快照影响。
- `snapshot.value` / `snapshot.observed` 仅含 `activeUsers`、`requests`、`failedRequests`、`tokens`、`credits`。
- `activeUsers` 按用户、日去重且 `requests>0`；失败或仅连接不构成活跃。不得把每日活跃相加称为 30 日去重活跃。
- 可用性按日判断：
  1. 空站点 → `available=true`，全 0。
  2. `syncedUsers < totalUsers` → `not_synced`，`observed` 为已同步样本合计。
  3. `legacySnapshots > 0` → `legacy_snapshot`，`observed=null`。
  4. 今天：若 `oldestSyncedAt < 今天 00:00`（上海）→ `not_covered`；否则 `day_incomplete`。今天永远不能 `available=true`（有账户时）。
  5. 过去某日 `D`：仅当 `oldestSyncedAt >= dayWindow(D).end`（即所有快照都在该日结束后采样）才 `available=true`；否则 `not_covered`。
- 只有 `available=true` 时，稀疏 `daily` 缺行才表示该日该样本为 0；`observed` 中的 0 只能按「已观测快照」解释，不能当全站真实 0。
- 过旧快照即使 `syncedUsers=totalUsers`，也不能凭 `oldest/newest` 推导逐日全量数据；必须按上述逐日覆盖判断。

### plugins

```json
"plugins": {
  "available": false,
  "reason": "day_incomplete",
  "items": [
    { "pluginId": "wechatai/llm-chat", "users": 2, "requests": 5, "tokens": 100, "credits": 0.4 }
  ]
}
```

- 窗口与 daily 相同，按窗口内成功 `requests` 降序，`pluginId` 升序作确定性 tie-break，最多 20 项。
- `users` 为窗口内该插件去重人数；`pluginId` 使用既有稳定 ID 或既有公开中文名。
- 禁止输出插件实例 ID、私有名称、配置、用户列表。
- 可用性：空站点 → `available=true`、`items=[]`；`syncedUsers<totalUsers` → `not_synced`；`legacySnapshots>0` → `legacy_snapshot`；否则窗口包含今天 → 有账户时恒为 `day_incomplete`。`items` 在 `not_synced` / `day_incomplete` 时为已观测 Top 20，在 `legacy_snapshot` / 无快照时为 `null`。
- 因为窗口固定包含今天，插件排名在正常站点上始终是观测值；文档不得把它描述成完整 30 日排名。

## 未知值与零值规则

1. 用户总数与 `newUsers` 不依赖快照，可独立返回真实值。
2. 部分同步时返回已观测聚合，但必须同时给出 `available=false`、`reason=not_synced`、`coverage` 与采样时间；缺失账户不参与已知活跃/不活跃分类。
3. 全站完整值无法确认时 `value=null`；已观测数放 `observed`，绝不把部分样本的 0 当成全站 0。已有非零聚合也不能默认为完整值。
4. 无快照、旧结构缺字段、日期不在快照观测范围分别用 `not_synced`、`legacy_snapshot`、`not_covered` 区分；不从 `COALESCE` 或补零推导真实 0。
5. 日桶缺行只在 `available=true` 时表示该样本为 0；采样后新发生的调用一律未知。
6. 不新增定时同步或历史回填；读路径不写同步。文档固定写明「以 coverage 为准，不自动在读路径写同步」。
7. 空站点在确认 `totalUsers=0` 时允许真实 0；「有账户但没有快照」不得与空站点混为一谈。

## 文件与冲突面

预期改动：

- `src/server/metrics.ts`（WM1 文件）：在鉴权/限流/审计之后分发 `/api/metrics/overview`，复用 `respond()` 的日志与头部。高冲突面。
- `src/server/admin.ts` / `src/shared/admin.ts`：仅在必要时补充 `legacySnapshots`、插件 tie-break 等兼容只读信息；不重写账户聚合，不改管理后台用户列表。
- `test/metrics.test.ts`、`test/admin.test.ts`：新增/扩展夹具与断言。
- `docs/configuration.md`、`docs/deployment.md`：WM1 已改同一文件；以 WM1 合并后的 `main` 为基线追加。
- 新增 `internal-docs/wechatai-api-wm3-overview.md`（本文件）。

冲突与串行：

- WM1（`affc0518`）必须先合并；本卡不得基于未合并的 `feature/wechatai-api-token-3kh` 直接开 PR，否则 PR 会夹带 WM1 的 6 个提交。
- WM2/WM4 也会改 `src/server/metrics.ts` 的路径分发与文档；同仓已有「任何时刻只允许 1 张在途 PR」的规则，按卡片顺序串行，每张只挂自己的 handler，不重复改通用鉴权。
- `src/server/index.ts` 在 WM1 已挂 `app.all("/api/metrics", ...)` 与 `app.all("/api/metrics/*", ...)`；本卡优先只在 `metrics.ts` 内分发，避免再次改 `index.ts`。若必须改，以 WM1 合并后的行号为基线。

## 分支、提交与评审

- 现有分支 `feature/wechatai-api-duj` 位于 `b36ca2c`，落后 `origin/main`（`708e3e1`）且不含 WM1。开工时先 `git fetch`，确认工作树干净，从**已合并 WM1 的最新 `main`** 重建/更新本分支；不强推 `main`，不 rebase 其他卡分支，不混入其他仓库或其他卡提交。
- 一个 draft PR，base `main`。建议三个小 commit，每个单独 review 通过后再继续：
  1. 外部类型、字段白名单、coverage/可用性适配与纯函数；完整/部分/旧结构/过旧/空站点夹具测试。
  2. `metrics.ts` 路由分发、鉴权/方法/只读回归测试、日志与敏感字段哨兵。
  3. 配置/部署文档与字段语义、窗口、去重、credits 口径说明。
- 提交信息含卡号 `5a170ea1`。最终审查针对明确 base/head SHA 的完整 diff；每个 commit 有独立 review 记录。
- PR 负责人：Coder 明确启动后进入「开发中」的本卡实现者，负责实现、测试、提交并开唯一 draft PR。独立评审按既有流程。本卡不合并、不部署；生产验证（专用 token 200、无/错 token 401、Cookie 不替代 token、响应无邮箱）须另行授权后执行，记录时间与状态，不写秘密。

## 依赖与基线

- **任务依赖：WM1 `affc0518-ed7c-47c6-8cef-db6e671f2128`**（专用 token 鉴权、限流与审计）。本卡通过 `blocked_by` 等待其完成；WM1 未合并到 `main` 前不开工。
- 截至本评审：WM1 在「待评审」，head `f90a8c1`，无 PR；其契约见 `internal-docs/wechatai-api-token-3kh.md` 与分支上的 `src/server/metrics.ts`。本卡不复制其鉴权实现。
- WM3 实现前重新核对：`origin/main` 是否包含 WM1 的最终合并提交；WM1 的 `metrics.ts` 分发点、`respond()` 审计字段、429/503 行为是否与本文一致。不一致时以已合并契约为准，先更新本文件再实现。
- 本卡无其他任务级依赖；WM2/WM4 不阻塞本卡，但同文件修改按「单张在途 PR」串行。

## 验收标准

以下均为实施后必须执行的门槛；本轮未运行。

1. **鉴权矩阵**：无 token、错误 token、空/过短 Bearer、Secret 未配置/空白/过短 → 401，无成功字段；仅管理员 Cookie、普通 Session、Plus Session → 401；Cookie + 错误 Bearer → 401；正确专用 Bearer 且无 Cookie → 200。测试使用真实 Session fixture，不用伪造 Cookie 字符串冒充。
2. **最小权限**：metrics token 访问 `/api/admin/users`、`/api/admin/sync`、`/api/admin/users/:id/gift-plus` 及写接口无额外权限；仅 Bearer 请求这些原接口仍失败；现有管理员 Session 正反例不变。
3. **方法与路径**：`POST/PUT/PATCH/DELETE/HEAD/OPTIONS /api/metrics/overview` → 405 + `Allow: GET`；未知 `/api/metrics/*` → 404；成功响应 `Cache-Control: no-store`、`X-Robots-Tag: noindex, nofollow`。
4. **窗口边界**：固定 `now` 验证上海 15:59:59Z / 16:00:00Z 日界、首日 `00:00` 边界、今天未完整日；恰好 30 桶、日期升序、`startsAt/endsAt` 与查询上界一致。
5. **完整夹具**：所有用户均有结构完整、采样于同一 `now` 的快照。summary 的 `available=true`，`value` 与同 `now` 的 `adminOverview` 在全部公开字段上一致；过去 29 日 `daily.available=true` 且 `value` 与 `adminOverview.daily` 一致；今天 `available=false`、`reason=day_incomplete`，`observed` 与 `adminOverview` 今日桶一致；`plugins.available=false`、`reason=day_incomplete`，`items` 与 `adminOverview.plugins` 一致。`credits` 精度按现有整数 `units/1000` 换算。
6. **活跃/失败口径**：同一用户同一天多条成功调用只计一个 `activeUsers`；仅失败用户不计活跃；成功后不重复算失败；失败统计排除已有 `usage` 的同调用 ID。
7. **部分同步**：有账户无快照 → summary/daily `available=false`、`reason=not_synced`、`value=null`，`observed` 等于已同步样本合计；`users`/`newUsers` 仍是真实全量。
8. **旧结构**：存在缺失字段的快照 → `legacySnapshots>0`、`complete=false`、`reason=legacy_snapshot`，summary/daily `observed=null`，不得把缺失字段补成 0。
9. **过旧快照**：全员有快照但 `oldestSyncedAt` 早于窗口内某日结束 → 该日 `available=false`、`reason=not_covered`；今天更早于快照开始 → `not_covered`，否则 `day_incomplete`。不得凭 `oldest/newest` 推导逐日全量。
10. **稀疏日桶**：全覆盖且该日确实无 usage 时，缺行返回真实 0 且 `available=true`；窗口外或未覆盖日期不得返回真实 0。测试同时覆盖两种情形。
11. **空站点**：`totalUsers=0` → `complete=true`，summary/daily/plugins 全 0 或空数组且 `available=true`；「有账户无快照」不得走此分支。
12. **字段与日志泄露**：用允许字段的结构断言，并在夹具邮箱、姓名、用户 ID、订单号、激活字段放入敏感哨兵；响应 JSON 不含哨兵或禁止字段。捕获该请求日志，验证不含 token、Cookie、Authorization、邮箱、姓名、用户/订单标识、原始 URL/查询串或错误文本。
13. **只读**：请求前后 `admin_account_stats`、`user`、计费/账户关键行不变；不新增快照、不调用 `syncAdminStats`/`saveAdminStats`/DO `adminStats`；GET 不触发同步、额度授予、alarm 或网关请求。用绑定/函数 spy 证明。
14. **确定性与性能**：`daily` 固定 30 项、插件排序稳定（requests 降序，pluginId 升序）；不按用户逐条查询，不新增 N+1；一次 overview 的 D1 查询数与 `adminOverview` 同阶。
15. **命令**：在负载与内存允许时串行运行 `pnpm lint`、`pnpm typecheck`、相关 `pnpm exec vitest run <files>`（必要时 `pnpm test`）、`pnpm build`（或仓库要求的 `pnpm check`）；记录 base/head SHA、命令与真实退出结果。重活并行或 `MemAvailable < 2 GiB` 时等待并说明。
16. **文档**：说明路由、鉴权、限流、窗口、字段白名单、`available/observed/value/reason` 语义、credits/debt/purchasedCredits 口径、非实时性、空站点与旧快照行为、节点级限流与不自动写同步；不写真实 token、真实运营数字或生产账号信息。
17. **公开树隔离**：本文件及测试产物留在 `internal-docs/`，不进入 `docs/`、`doc/`、`public/`、文档 bundle 或 `/api/docs`。

## 交付边界

- 本卡完成条件：一个 draft PR、三个可分别 review 的提交、上述验收证据齐全、最终 HEAD 的独立 review PASS。
- 不包含：合并、部署、生产 Secret 写入、线上读数、迁移或数据修复。
- 未获得另行授权前，任何文档、日志、PR 或回复不得声称已读到线上注册/调用数字，或把本地 token 当成已上线权限。
