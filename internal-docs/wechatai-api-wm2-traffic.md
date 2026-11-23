# wechatai 只读 API：流量、来源与落地页注册转化（WM2）

卡：`db112f5e-a938-414d-87dd-d284c09c3eb2`
仓库：`moutsea/wechatai`，默认目标分支 `main`
评审日期：2026-11-23
评审基线：本工作区 `HEAD = b36ca2cba3e4cfbc04f99fa0e466423bda54e936`；本地缓存 `origin/main = 708e3e1caebe62127b3d418434ef56573c87c5b6`；工作树干净，本卡尚无代码改动。本轮未 `fetch`，不能把缓存引用说成远端最新 `main`。
依赖实现：WM1 分支 `feature/wechatai-api-token-3kh`，head `f90a8c114d974e74be116c68d939dee8cc0f0a11`，base `708e3e1`，6 个提交，当前在「待评审」，无 PR、未合并。

## 结论与原子性

- **原子任务**：一张卡、一个分支、一个 draft PR，只交付 `GET /api/metrics/traffic` 的脱敏聚合投影、覆盖/可用性表达、测试与文档。可独立验收、独立回滚，无 schema 迁移、无数据回填、无新基础设施。
- **风险级别：高**。外部 Bearer 边界、运营数据被误读成完整总量、用户可控文本（路径/UTM/referrer）外泄，三类都不能靠“改动小”降级。
- **当前不满足开发准入**，本卡不移动步骤，也不创建 PR：
  1. WM1 仍在「待评审」，没有可复用的已评审底座；WM2 必须等 WM1 评审结论，或在 Coder 明确协调下基于 WM1 分支建立依赖草稿。
  2. 两个契约必须先由 Coder 定稿：窗口覆盖证据、外部响应文本脱敏。见「待 Coder 决定」。
  3. 卡面明确写明「未经 Coder 明确启动不得进入开发」；本次是需求评审，不冒充启动。
- 本卡不拆分：路由可独立上线、独立回滚，范围就是“一个只读流量报表”。不建 parent_id、不建子卡、不进「等待子任务」或「集成验证」。

PR 负责人：本卡 Coder 会话（assignee `916bf250-fb21-4262-9419-f9aad4e07699`）。该会话启动后才创建分支与 draft PR；本次评审会话不建 PR、不合并、不部署。

## 现状证据

### WM1 底座

- WM1 已在分支实现 `src/server/metrics.ts`：先按 `cf-connecting-ip` 做 IP 限流，再校验 `Authorization: Bearer` 的 `METRICS_API_TOKEN`（至少 32 字符、恒定时间摘要比较），再扣专用 token 限流，最后按路径分发；`/api/metrics/health` 之外的路径当前统一 `404`。见 WM1 分支 `src/server/metrics.ts:100-140`。
- WM1 在 `src/server/index.ts:184-185` 用 `app.all("/api/metrics", ...)` 与 `app.all("/api/metrics/*", ...)` 挂在通用 bodyLimit（当前 `src/server/index.ts:153`）与 Session 中间件（当前 `src/server/index.ts:548`）之前。WM2 复用该挂载点，**不应**再改 `index.ts` 的鉴权顺序；若 WM1 合并后挂载点行号变化，以实际文件为准。
- WM1 审计字段白名单、`Cache-Control: no-store`、`X-Robots-Tag`、`429 + Retry-After`、`503` 关闭策略都在 `metricsRequest` 内；WM2 只增加已认证后的路径分发与业务响应，不复制一套鉴权/限流/审计。
- WM1 的 `respond()` 与审计原因是私有实现。WM2 若要返回 400/503 等新状态，必须扩展 WM1 的固定原因枚举（例如 `invalid_range`），不得让 handler 直接 `console.log` 原始 URL/查询串/异常文本。

### 可复用的聚合

- `src/server/analytics.ts:241` `getTrafficSummary(env, days, at)`：一次 `DB.batch` 产出 PV、`visitorDays`、区间去重会话、`pagesPerSession`、每日趋势、热门页、来源、国家、设备、来源深度。
  - `visitorDays = COUNT(DISTINCT day || ':' || visitor_hash)`，是按日去重之和；`daily.uv` 是单日去重。两者都不能称为跨天独立用户。
  - `pagesPerSession = pv / sessions`，两位小数；不能称为“自然人的人均浏览”。
  - 空来源在流量块展示为「（直接访问）」只是展示标签；不证明用户直接输入地址。
- `src/server/analytics.ts:377` `getSignupConversions(env, days, at)`：
  - 分母是窗口内有浏览或注册的会话并集；注册按 `session_id` 去重并取窗口内最早快照；空归因快照不被后续浏览回填。
  - `rows` 与 `sourceRows` 各截断前 15 行；`total`、`unattributed`、`sessions`、`rate` 来自独立汇总，不随截断变化。
  - 未归因注册留在总数与分母。
- `src/shared/analytics-queries.ts:13` `signupConversionQueries`：Worker 与 CLI 共用 SQL；`SOURCE_EXPR`（第 7 行）为 UTM 优先的 `utm:<值>`、否则 referrer 主机、否则空串。WM2 必须复用，不得另写一套口径。
- `src/server/analytics.ts:434` `getFunnelSummary` 与 `src/shared/funnel-report.ts:58` `summarizeFunnel`：只给每个事件的 `visitorDays`/`events`；事件可发生在 `/app` 内；历史 `/demo` 路径仍被排除；禁止把相邻事件相除。该块是可选项。
- `src/server/analytics.ts:457` `getAdminAnalytics` 的 `days` 校验：省略默认 7；只接受 `/^\d+$/` 且 1–90 的整数；`""`、`0`、`-1`、`91`、`1.5`、`1e2`、`NaN`、`Infinity`、混合字符均 400。WM2 沿用该语义，且在一次报告中只取一个 `at`。
- 现有管理员接口 `src/server/index.ts:630` 直接 `c.json(await getAdminAnalytics(...))`；缺表时抛错返回 500，这是既有契约。WM2 **不得**静默把管理员接口改成 200/可用性结构。

### 覆盖与隐私现状

- `src/server/analytics-budget.ts:8-42` 的 `AnonymousAnalyticsBudget.take` 在以下情况丢弃匿名事件：停采/预算为 0、并发租约占用、预算耗尽、预算表错误。表 `anonymous_analytics_budget(day, reserved, last_grant)` 只记录批量预留许可，不记录成功采集数、丢弃数、停采起止或每日心跳。
- 因此 `MIN/MAX(day)`、空表、预算行缺失、`reserved < limit` 都不能单独证明历史窗口完整；空表也不能证明零流量。任何“完整”声明都必须写明证据边界。
- `src/shared/analytics-schema.ts:19` 的 `pageViewPayloadSchema` 只限制 `utmSource` 等字符串长度；`src/server/analytics.ts:72` 的 `recordPageView` 只做 trim/小写/截断。路径允许任意符合 `isTrackedPath` 的纯路径。源码没有保证这些文本不含身份信息。
- 已用现有 SQL 与保留域名的合成邮箱复现：UTM 中的合成邮箱会原样进入 `source`。所以“响应里没有 `user_id`/`email` 字段”不等于无 PII；必须在输出层对路径、UTM、referrer 做确定性处理。
- `src/shared/seo.ts:45` `PUBLIC_PATHS`、`src/shared/seo.ts:58` `PRIVATE_PATHS`、`src/shared/seo.ts:865` `publishedLocalizedPaths()` 是当前站内路由注册表。服务端当前未 import `shared/seo.ts`；直接引入会把数百 KB 的 SEO/i18n 内容打进 Worker，需在实现时单独评估。路径白名单应使用轻量的一级段/语法规则，或新增一个只含路径的小模块，不得为了脱敏把整份内容表引入 Worker。

### 本轮验证边界

- 已读源码、查询、schema、迁移（`0014`/`0015`/`0016`/`0020`）、WM1 分支与 WM3 兄弟评审文档。
- 未运行 Worker/Vitest 套件、未跑鉴权端点、未读取生产库、未发生产请求、未读取任何凭据。不能据此声称验收通过。
- 前一轮评审用 Python 标准库 SQLite + 合成夹具验证过：重复注册去重、未归因注册计入分母、截断行不影响总率、UTM 邮箱会出现在 `source`。本轮不重复执行该临时脚本。

## 范围

做：

1. `GET /api/metrics/traffic?days=1..90`（默认 7），复用 WM1 的 Bearer/限流/审计，不新建第二套权限。
2. 返回 `traffic`：PV、按日 UV（`visitorDays`）、会话、人均页数、每日趋势、热门页面、来源、来源深度、国家、设备。
3. 返回 `conversions`：区间内有浏览或注册的会话数、去重注册会话数、未归因数、总转化率、落地页行、来源×落地页前 15 项；总率始终来自全量汇总。
4. 可选返回 `funnel`：每个事件的 `visitorDays`/`events`；不计算相邻事件比率。
5. 逐块可用性与覆盖表达：缺表、预算停采/耗尽、窗口超出保留期、覆盖未知时，不输出全 0 冒充真实零；给出固定原因。
6. 输出层脱敏：路径/UTM/referrer 按确定性规则处理；响应字段白名单；合成敏感文本夹具。
7. 文档：示例 JSON、口径、不可用示例、第一方统计边界、配置引用 WM1；留在 `internal-docs/` 的评审文档不进公开树。

不做：

- 不实现 GSC/Bing/W10/W12、AI 引用率、付费 ROI、访问到付费、收入、用量、留存。
- 不返回 `session_id`、IP、`visitor_hash`、`event_id`、账户/订单/邮箱/姓名/微信身份/聊天/支付明细。
- 不修改采集端、DNT/GPC、180 天保留、会话首访归因、爬虫过滤、`/app` 排除规则。
- 不修改管理员 `/api/admin/analytics` 的既有错误契约或数值口径。
- 不新增 D1 迁移、不同步统计、不触发账户 DO；不合并、不部署、不写生产 Secret。
- 不把空来源写成“无 AI 来源”“确认直接访问”或“付费 ROI”。

## 依赖与分支策略

### WM1 依赖

- WM2 复用 WM1 的专用 Bearer、GET 限制、限流、无密钥审计与 `/api/metrics/*` 挂载；不自行再建 token 或路由前缀。
- WM1 未合并前，WM2 的开发分支以 WM1 head `f90a8c1` 为基线，仅限 Coder 明确协调；**不得**为了解锁 WM2 去合并/部署 WM1。WM1 合并后，以包含 WM1 的最新 `main` 为基线并重新记录 base/head SHA。
- 建议的 WM2 开发分支：`feature/wechatai-api-wm2-traffic`。
- PR：WM1 合并后 base `main`；WM1 未合并时若必须开依赖草稿，base 用 WM1 分支并在 PR 正文写明依赖，WM1 合并后 rebase/retarget。只开 draft，不合并、不部署。
- 本卡与 WM3–WM6 共用 `/api/metrics/*` 分发点与 `src/server/metrics.ts`。同一仓库同一时刻只允许一张在途 PR；若 WM1 的 PR 尚未关闭，按仓库既有串行规则等待，不并发顶成冲突。

### 文件冲突面

- 高冲突：`src/server/metrics.ts`（WM1 文件；WM2 只加已认证后的路径分发，不改鉴权/限流/审计）。以 WM1 先合并为基线。
- 中冲突：`docs/configuration.md`、`docs/deployment.md`、`.dev.vars.example`（WM1 已改；WM2 只追加，不覆盖密钥/运维约定）。
- 新增：`src/server/metrics-traffic.ts`（建议独立模块，避免继续膨胀 `metrics.ts`）、`src/shared/metrics-traffic.ts`（外部响应类型/脱敏纯函数）、对应测试；如新增轻量路径白名单，放独立小模块。
- 只读复用：`src/server/analytics.ts`、`src/shared/analytics.ts`、`src/shared/analytics-queries.ts`、`src/shared/funnel-report.ts`。除非共享 helper 无法复用，否则不改这些文件的既有行为；不得为了外部 API 重写聚合。
- `src/server/analytics-budget.ts`：如需导出预算上限解析 helper 以消除两处解析分叉，做最小抽取，保持 `allowAnonymousAnalytics` 行为不变。
- `src/server/index.ts`：WM1 已挂载 `/api/metrics/*`，WM2 默认不改；若基线变化导致需要补挂载，只做最小接线。

## 接口契约

### 路由与鉴权

- `GET /api/metrics/traffic`，查询参数仅 `days`；无请求体。
- 鉴权、限流、审计、`Cache-Control: no-store`、`X-Robots-Tag` 全部沿用 WM1。`/api/metrics/traffic` 只在 WM1 的 IP 限流、Bearer 校验、token 限流之后分发。
- 无 token、错误 token、空/过短 Bearer、服务端 Secret 未配置 → 401；管理员 Cookie、普通 Session、Plus Session、Cookie + 错误 Bearer → 401；正确 Bearer 且无 Cookie 才 200。
- 已知路径非 GET（POST/PUT/PATCH/DELETE/HEAD/OPTIONS）→ 405 + `Allow: GET`；未知 `/api/metrics/*` → 404；认证失败始终 401，不泄露成功元数据。
- 限流触顶 → 429 + `Retry-After: 60`；`API_LIMIT` 缺失/抛错 → 503。WM2 不新增限流键、不放宽额度。
- 不得调用 Session、账户 DO、Stripe、admin 同步或写接口。测试用绑定 spy 证明鉴权失败路径在业务查询前返回。

### days 校验

- 省略 → 7。
- 只接受十进制数字字符串且数值为 1–90 的整数；与 `getAdminAnalytics` 完全一致。
- 必须 400 的输入至少包括：`""`、`"0"`、`"-1"`、`"91"`、`"1.5"`、`"1e2"`、`"0x7"`、`" 7"`、`"7 "`、`"NaN"`、`"Infinity"`、`"7abc"`、`"07.0"`。
- 非法输入不得执行 D1 查询，不得返回部分数据；错误体固定、无输入回显。

### 时间与窗口

- 时区固定 `Asia/Shanghai`；`from = shanghaiDaysAgo(days - 1, at)`，`to = shanghaiDay(at)`，与共享函数一致。
- 一次请求只取一个 `at`，`traffic`、`conversions`、`funnel` 共用；不得各块各取 `new Date()`。
- `window` 返回 `{ from, to, days, includesToday: true }`；今天是不完整日，响应和文档都不得声明今天已完整。
- 上海午夜边界：23:59:59 与 00:00:00 的记录必须落在不同 `day`；跨午夜两次请求不假定严格同时。

### 响应白名单

成功 200 顶层字段仅：

```
service, documentationVersion, timezone, generatedAt,
window, coverage, traffic, conversions, funnel
```

- `service: "wechatai"`，`documentationVersion: "1"`，`timezone: "Asia/Shanghai"`，`generatedAt` 为 Unix 毫秒。
- `traffic`、`conversions`、`funnel` 都是 `{ available, reason, data, observed }` 结构；`reason` 在 `available=true` 时为 `null`；`data` 与 `observed` 互斥：
  - `available=true`：`data` 为完整聚合，`observed=null`。
  - `available=false`：`data=null`；若底层查询成功，`observed` 给出已存聚合，并明确它不是完整总量；存储不可用时 `observed=null`。
- 禁止字段：`session_id`、`ip`、`visitor_hash`、`event_id`、账户/用户 ID、邮箱、姓名、订单号、支付明细、微信 ident、聊天内容、`user_id` 列表、token、Cookie。
- 只做显式字段投影，不直接展开内部 `TrafficSummary`/`SignupConversions`/`FunnelSummary`，也不直接序列化管理员响应。

示例（没有覆盖声明、存储正常时）：

```json
{
  "service": "wechatai",
  "documentationVersion": "1",
  "timezone": "Asia/Shanghai",
  "generatedAt": 1730000000000,
  "window": { "from": "2026-11-17", "to": "2026-11-23", "days": 7, "includesToday": true },
  "coverage": {
    "complete": false,
    "reason": "coverage_unknown",
    "basis": null,
    "since": null
  },
  "traffic": {
    "available": false,
    "reason": "coverage_unknown",
    "data": null,
    "observed": {
      "totals": { "pv": 120, "visitorDays": 90, "sessions": 40, "pagesPerSession": 3 },
      "daily": [{ "day": "2026-11-17", "pv": 20, "uv": 15, "sessions": 8 }],
      "topPages": [{ "label": "/pricing", "pv": 30, "visitorDays": 20 }],
      "sources": [{ "label": "utm", "pv": 30, "visitorDays": 20 }],
      "sourceDepth": [{ "label": "utm", "pv": 30, "sessions": 10, "pagesPerSession": 3 }],
      "countries": [{ "label": "CN", "pv": 100, "visitorDays": 80 }],
      "devices": [{ "label": "desktop", "pv": 100, "visitorDays": 80 }]
    }
  },
  "conversions": {
    "available": false,
    "reason": "coverage_unknown",
    "data": null,
    "observed": {
      "total": 5,
      "unattributed": 1,
      "sessions": 40,
      "rows": [{ "label": "/pricing", "sessions": 20, "signups": 4, "rate": null }],
      "sourceRows": [{ "source": "utm", "landingPath": "/pricing", "sessions": 10, "signups": 2, "rate": null }]
    }
  },
  "funnel": {
    "available": false,
    "reason": "coverage_unknown",
    "data": null,
    "observed": { "steps": [{ "name": "register_view", "label": "到达注册页", "visitorDays": 10, "events": 12 }], "side": [] }
  }
}
```

`available=false` 时 `conversions.observed.rows[].rate` 与总 `rate` 为 `null`：分母可能不完整，不能给出转化率结论。`traffic.observed` 的计数与比值只描述已存记录，不是总量。

### 覆盖与逐块可用性

`coverage` 只描述**采集窗口证据**，不描述表是否存在；逐块 `available` 还要叠加该块依赖的表是否可查。

固定原因枚举：

| reason | 含义 | 判定 |
| --- | --- | --- |
| `storage_unavailable` | 该块依赖的表不存在或不可查 | `sqlite_master` 检查目标表；缺表即此原因 |
| `collection_disabled` | 当前采集预算被显式关闭 | `ANALYTICS_DAILY_EVENT_BUDGET` 解析为 0/非法（与 `allowAnonymousAnalytics` 同一解析），且窗口包含今天 |
| `collection_budget_limited` | 预算表缺失或窗口内某日已触顶 | 预算表缺失且窗口含今天；或窗口内某日 `reserved >= 当前上限` |
| `incomplete_window` | 窗口超出可证明的覆盖范围 | `from` 早于保留期起点，或早于 `ANALYTICS_COVERAGE_SINCE` |
| `coverage_unknown` | 没有可核验的覆盖证据 | 未配置 `ANALYTICS_COVERAGE_SINCE`，或历史限额无法核验 |
| `query_failed` | 查询异常（非缺表） | 返回 HTTP 503 `{ "error": "unavailable" }`，不返回部分数据/异常文本 |

判定顺序：表缺失 → `storage_unavailable`；窗口超出保留期 → `incomplete_window`；覆盖起点未配置或窗口早于起点 → `coverage_unknown`/`incomplete_window`；预算关闭/触顶 → `collection_disabled`/`collection_budget_limited`。不得把未知原因伪造成 `complete=false, reason=null`。

**推荐覆盖证据：`ANALYTICS_COVERAGE_SINCE`（需 Coder 批准）**

- 新增可选配置 `ANALYTICS_COVERAGE_SINCE`，格式 `YYYY-MM-DD`，按 Asia/Shanghai 解释；只放 `.dev.vars.example` 空占位与文档，不写真实值。
- 语义：运维声明“从该上海自然日起，第一方采集持续开启且预算未被关闭”。它不是历史回填，也不是逐请求证明；不改变采集端。
- `coverage.complete=true` 仅在以下全部成立时：
  - 窗口 `from >= ANALYTICS_COVERAGE_SINCE`；
  - 窗口在 180 天保留期内；
  - 当前预算配置 > 0；
  - 预算表存在，且窗口内每个存在记录的日 `reserved < 当前上限`；
  - 目标表存在。
- 只要任一条件不成立，`available=false` 并给原因；`observed` 可给已存聚合（缺表除外）。
- 文档必须说明：该声明不能发现 isolate 并发丢弃、D1 写入异常、浏览器端 DNT/adblock 或用户未执行 JS 的漏计；`complete=true` 只表示“没有已知的管道缺口”，不是“所有访问者都已统计”。
- 成本：一个可选配置 + 文档 + 测试；无迁移、无回填、无新表。超出“只读 API”最小改动，需 Coder 明确批准。
- **若 Coder 不批准该配置**：退化为 `coverage.reason = "coverage_unknown"`，所有块 `available=false`、只返回 `observed`；不得为了拿到 `available=true` 伪造覆盖证据，也不得新建心跳/监控框架。该退化不影响本卡其余实现与验收。

`signup_attributions` 缺失只会让 `conversions` 不可用；`page_views` 缺失会让 `traffic` 与 `conversions` 不可用；`funnel_events` 缺失只让 `funnel` 不可用。`page_views` 缺失时 `signup_attributions` 的计数仍可查，但转化分母依赖浏览，`conversions` 仍不可用。

### 脱敏规则

所有路径/UTM/referrer 都来自用户可控输入，外部响应必须按以下确定性规则输出；管理员后台的原有展示不变。

1. 路径（`topPages[].label`、`conversions.rows[].label`、`sourceRows[].landingPath`）：
   - 先按 `normalizePath` 归一；空路径、含 `@`、`%`、`+`、`:`、反斜杠、控制字符，或长度 > 200、层级 > 8 的路径 → `"(other)"`。
   - 每个路径段 1–64 字符；纯数字段 ≥ 6 位、32 位以上十六进制/UUID/长 token 形态 → `"(other)"`。
   - 一级段必须在站内公共/注册路径清单内（至少覆盖 `docs`、`pricing`、`compare`、`developers`、`wechat-ai`、`wechat-bot`、`wechat-deepseek`、`claude-code-api-pricing`、`login`、`register`、`verify-email`、`forgot-password`、`reset-password`、`terms`、`privacy`、`about`、`en`、`ja`、`ko`、`es`、`pt`，以及 `/`）；未知一级段 → `"(other)"`。清单放独立小模块维护，不把整份 `shared/seo.ts` 内容打进 Worker。
   - 脱敏后重新按 `label` 聚合计数；不得只改标签不合并行。
2. 来源（`sources[].label`、`sourceDepth[].label`、`sourceRows[].source`）：
   - 空串 → `"(unknown_source)"`；不得写成 `"(direct)"`、`"(no_ai)"` 或并入 UTM。
   - `utm:<值>` → **统一输出 `"utm"`**，所有 UTM 值合并计数；不输出 UTM 原文。这是外部 API 与管理员后台的明确差异。
   - referrer 主机名：仅当匹配严格小写 DNS 主机名（总长 ≤ 253，标签 1–63，字母数字与连字符）才输出；否则 `"(other_source)"`。
   - 以上标签聚合后重新计算 `pv`/`visitorDays`/`sessions`/`signups`；不得把不同来源的计数错误相加到空来源。
3. 国家/设备：国家只保留大写 2 字母或 `"(unknown)"`；设备只保留 `desktop`/`mobile`/`tablet` 或 `"(unknown)"`。
4. 漏斗：事件名是 `FUNNEL_EVENTS` 枚举，标签是服务端静态文案，不含用户文本；不额外输出 `props`、`path`、`session_id`。
5. 测试必须包含：UTM 中的合成邮箱、路径中的合成邮箱/长 token、referrer 中的异常字符；断言响应任何位置都不含哨兵。不得只用“没有 email 字段”证明无 PII。

**备选（需 Coder 选择）**：若业务必须看到 UTM 活动名，新增 `METRICS_UTM_ALLOWLIST`（或等价配置）只输出白名单值，其余归 `"utm"`；需额外配置与维护成本。若选择该方案，未列出的 UTM 仍不得并入空来源。

### 口径

- `visitorDays`：按日去重访客之和；不是跨天独立用户。响应字段名与文档都不得用 `uniqueUsers`/`UV 总量`。
- `daily.uv`：单日去重；与 `visitorDays` 不同层级。
- `pagesPerSession`：`pv / sessions`，两位小数；不是自然人人均。
- 转化率：`total / sessions`，分母是窗口内有浏览或注册的全部会话（含未归因）；明细 15 行截断不影响总率。`available=false` 时不给 rate。
- 来源优先级：UTM > referrer 主机 > 空；外部脱敏后 `utm` 合并所有 UTM 值，但优先级与计数口径仍来自 `SOURCE_EXPR`。
- 空来源：流量块在管理员界面显示「直接访问」只是标签；外部 API 用 `unknown_source`，不声称确认直接访问。来源×落地页的空来源是「未识别来源」，不等于 AI 引用、无 AI 来源或付费 ROI。
- 漏斗：每个事件的 `visitorDays`/`events` 分别返回；不得相邻相除，不得给整体转化率。`/app` 内业务事件保留；历史 `/demo` 排除。

## 验收标准

1. **鉴权隔离**：正确 WM1 Bearer + 无 Cookie → 200；无 token、错误 token、空/过短 Bearer、管理员 Cookie、普通 Session、Plus Session、Cookie + 错误 Bearer → 401，且无成功字段。用 spy 证明失败路径未调用 Session/DB/DO/Stripe/业务聚合。
2. **方法与路径**：`/api/metrics/traffic` 非 GET → 405 + `Allow: GET`；未知 `/api/metrics/*` → 404；限流 → 429 + `Retry-After`；限流绑定异常 → 503；以上均无业务数据。
3. **days**：默认 7；1 与 90 有效；验收清单中的非法值全部 400；非法值不执行 D1；错误体固定。
4. **同口径**：固定同一时钟、同一 DB 夹具、同一窗口，API 的 `data`/`observed` 与共享 `getTrafficSummary`/`getSignupConversions`/`getFunnelSummary` 逐字段一致（脱敏维度按规则对比）；上海午夜边界正确。
5. **流量语义**：跨日同一访客只能称 `visitorDays`；`daily.uv` 与区间合计语义写清；`pagesPerSession` 不称自然人人均；`/app`、静态资源、一次性令牌页、爬虫按现有规则过滤。
6. **注册转化**：重复注册同会话只算一次；未归因注册计入总数与分母；仅注册无浏览；历史首访不被窗口截断；空快照不回填；超过 15 行时总率仍用全量 totals。
7. **来源**：UTM 优先；空来源在两种标签中语义正确；外部 UTM 合并不改变总量；不能推出 AI 引用、无 AI 来源、确认直接访问或付费 ROI。
8. **漏斗**：分事件返回；永不相邻相除；保留 `/app` 业务事件与历史 `/demo` 过滤。
9. **可用性矩阵**：分别覆盖 `page_views`、`signup_attributions`、`funnel_events` 缺表；预算表不可用、预算为 0、预算触顶、历史限额未知、覆盖未知、窗口早于保留期/覆盖起点；依赖块 `available=false` + 固定原因，不给假零。覆盖完整且真实无事件时返回 0（若 `ANALYTICS_COVERAGE_SINCE` 获批）与未知明确区分；未获批时不得声称该场景可用。
10. **无 PII**：响应字段白名单；无 session_id/IP/visitor_hash/event_id/账户/订单/邮箱/姓名/微信/聊天/支付详情；UTM/路径/referrer 中的合成敏感文本按约定不出现；日志哨兵不出现。
11. **回归**：`GET /api/admin/analytics` 的既有数值与缺表 500 契约不变；`/api/health`、`/api/analytics/page-view`、`/api/analytics/event`、DNT/GPC、保留期清理行为不变。
12. **文档**：可用/不可用示例、字段表、时区、窗口、去重、脱敏差异、第一方统计边界、配置引用 WM1；不写真实秘密；评审文档不入 `docs/`、`doc/`、`public/`、文档 bundle 或 `/api/docs`。
13. **命令**：在 load 与 `MemAvailable` 允许时串行运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`（或相关 Worker 测试）、`pnpm build`；记录 base/head SHA、命令与真实退出结果。重活并行或可用内存 < 2 GiB 时等待并说明。

## 提交与评审顺序

1. 小 commit：外部响应类型、覆盖/可用性纯函数、脱敏纯函数与单元测试；明确 `available`/`observed`/`data` 与原因枚举。单独 review。
2. 小 commit：在 WM1 `metricsRequest` 分发点接入 `/api/metrics/traffic`，复用三个共享聚合，处理逐块状态与 400/503/审计原因；集成测试。单独 review。
3. 小 commit：文档、示例 JSON、PII/鉴权/回归测试；如 Coder 批准 `ANALYTICS_COVERAGE_SINCE`，再补配置与文档。单独 review。
4. 同一最终 HEAD 完整验收 review；只开 draft PR。功能测试随前两个提交交付，避免中间提交无验证。
5. 撤销仅回退 WM2 路由、外部类型与输出层；不撤 WM1 或既有采集。任何数据库变动须另行审查，本卡不计划迁移。

## 待 Coder 决定

1. **覆盖证据**：
   - 推荐：新增可选 `ANALYTICS_COVERAGE_SINCE`（无迁移），按上文条件给 `complete=true`；成本是一个配置 + 文档 + 测试，需批准。
   - 备选：不新增配置，所有窗口 `coverage_unknown`、`available=false`、只给 `observed`；绝不伪造完整。
   - 不接受：把空表/预算行/`MIN(day)` 当成完整证据。
2. **文本脱敏**：
   - 推荐：路径白名单 + 段语法；UTM 原文不输出、统一 `utm`；referrer 仅合法主机名；空来源 `unknown_source`。
   - 备选：新增 `METRICS_UTM_ALLOWLIST` 输出白名单活动名，其余仍归 `utm`；需额外配置与维护。
   - 不接受：原样返回 UTM/任意路径，只靠专用 token 保护；不满足卡面“响应无 PII”。

在上述两项定稿、WM1 评审结论可用、Coder 明确启动之前，本卡不进入开发、不创建 PR、不合并、不部署。

## 本轮实际验证

- 已读：`src/server/analytics.ts`、`src/server/analytics-budget.ts`、`src/shared/analytics.ts`、`src/shared/analytics-queries.ts`、`src/shared/analytics-schema.ts`、`src/shared/funnel-report.ts`、`src/shared/seo.ts`、`migrations/0014`/`0015`/`0016`/`0020`、`src/server/index.ts`、WM1 分支 `src/server/metrics.ts` 与 `index.ts` 挂载、WM1 需求文档、WM3 兄弟评审文档。
- 已记录基线：HEAD `b36ca2c`；缓存 `origin/main` `708e3e1`；WM1 head `f90a8c1`（base `708e3e1`，6 个提交，待评审、无 PR）。
- 未运行完整 Worker/Vitest、类型检查、lint、构建；未访问生产、未读取生产库或凭据。上述验收项均未执行，不能据此声称 PASS。
- 本轮没有产品代码改动、没有 PR、合并或部署；只新增并提交本评审文档（`bf9d7ffa94`）。
