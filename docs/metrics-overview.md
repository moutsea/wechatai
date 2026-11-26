# 只读运营概览 API

`GET /api/metrics/overview` 返回注册、活跃、配置存量与平台用量聚合。调用方使用专用 `Authorization: Bearer <METRICS_API_TOKEN>`。接口无查询参数，附加查询参数会被忽略。配置和轮换方式见[配置说明](configuration.md#只读运营-api)。

## 鉴权与读取

该路由沿用 metrics 前缀的鉴权、限流与审计。未配置、空白、过短、缺失或错误凭据返回 401。Cookie 与登录 Session 无法替代 Bearer。已认证的非 GET 方法返回 405 和 `Allow: GET`。未知路径返回 404。每个 Cloudflare 节点内，IP 与有效凭据分别共用 120 次/60 秒的额度，触顶返回 429 和 `Retry-After: 60`。限流绑定或数据库不可用时返回 503。

所有响应带 `Cache-Control: no-store` 与 `X-Robots-Tag: noindex, nofollow`。日志使用固定路由 `/api/metrics/overview`，只记录时间、方法、状态、限流结果和固定原因。

读取使用 D1 用户主表和 `admin_account_stats` 现有快照。**以 coverage 为准，不自动在读路径写同步**。同步由现有管理员流程执行。

## 响应与时间

顶层字段为 `service`、`documentationVersion`、`timezone`、`generatedAt`、`window`、`coverage`、`summary`、`daily`、`plugins`。服务名为 `wechatai`，文档版本为 `1`，时区为 `Asia/Shanghai`。所有时间戳采用 Unix 毫秒。

`generatedAt` 是响应生成时间。每个账户的数据反映其快照采样时间，累计用量和存量是快照时点合计。消费方须结合采样时间判断新鲜度。

`window` 包含以下字段。

| 字段 | 含义 |
| --- | --- |
| `startsAt` / `startDay` | 今天及此前 29 个上海自然日的首日 00:00 / 日期 |
| `endsAt` / `endDay` | `generatedAt` / 当天日期 |
| `days` | 固定为 30 |
| `includesToday` | 固定为 true，包含今天的未完整日 |
| `endInclusive` | 固定为 true，用户主表查询包含 `generatedAt` |
| `source` | 固定为 `admin_account_stats`，描述业务快照来源 |
| `activeUsers` | `distinct_users_with_settled_usage_per_day`，按用户、日去重 |
| `credits` | `settled_units_divided_by_1000_before_refunds`，平台结算消耗口径 |

`daily` 固定 30 桶，按日期升序。用户 `createdAt` 兼容秒与毫秒。账户日数据和插件用量使用各自快照采样时保留的最近 30 个上海自然日。

## 覆盖与未知值

| coverage 字段 | 含义 |
| --- | --- |
| `totalUsers` | 用户主表账户数，与 `summary.users` 相同 |
| `syncedUsers` | 当前账户中存在快照的数量 |
| `oldestSyncedAt` / `newestSyncedAt` | 最早 / 最晚采样时间，没有快照时为 null |
| `legacySnapshots` | 缺少所需字段、字段类型无效、嵌套日行缺字段或采样时间不一致的快照数量 |
| `complete` | 当前全部账户都有结构完整的快照，空站点为 true |
| `reason` | 完整时 null，否则 `not_synced` 优先，其次 `legacy_snapshot` |

`complete` 表达账户集合和字段覆盖。数据新鲜度由采样时间表达。很旧的完整快照也可具有 `complete=true`。

`summary.users` 和每个日桶的 `newUsers` 直接返回用户主表数字。其他值包装在 `snapshot` 中，结构如下。

```json
{
  "available": false,
  "reason": "not_synced",
  "value": null,
  "observed": { "activeUsers": 2, "requests": 3, "failedRequests": 0, "tokens": 90, "credits": 0.123 }
}
```

此示例为合成的日桶数据。`available=true` 时，`value` 与 `observed` 相同。`available=false` 时，`value=null`，已有样本聚合放在 `observed`。没有快照或存在旧结构时 `observed=null`。部分同步同时存在旧结构时保留 `not_synced` 原因，观测值仍为 null。

| reason | 含义 |
| --- | --- |
| `not_synced` | 至少一个账户没有快照 |
| `legacy_snapshot` | 至少一个快照缺少所需字段或包含无效结构 |
| `not_covered` | 日期超出至少一个快照的保留窗口，快照采样早于日期结束，或采样时间晚于响应时间 |
| `day_incomplete` | 今天仍在进行，只能提供采样时已观测值 |

summary 的 `available` 表达结构完整快照的账户覆盖，同时提供 `asOf.oldest/newest` 采样时间范围。daily 还逐日检查每个快照的保留窗口与采样终点。过去的某日需被全部快照覆盖到下一日 00:00。今天的快照若早于当天 00:00，原因为 `not_covered`，其余为 `day_incomplete`。

稀疏日数组缺行只有在覆盖完整时才能作为已知零值。`observed` 中的 0 表达已同步样本的观测，缺失账户的活跃情况仍未知。确认用户主表账户数为 0 的空站点，summary、daily 和 plugins 均可用，值为零或空数组。

## 字段含义

`summary.snapshot.value/observed` 仅包含以下字段。

| 字段 | 含义 |
| --- | --- |
| `plus` | 快照中的 `planUntil > generatedAt` 的账户数 |
| `links` / `connected` | 微信链接配置数 / 按快照套餐上限裁剪的已连接数 |
| `channels` / `models` | 渠道配置数 / assistants 配置数，使用用户自带模型 Key |
| `plugins` / `sessions` | 插件配置数 / 会话存量 |
| `requests` | 快照中的累计成功结算调用数，以已持久化 usage 为准 |
| `failedRequests` | 已持久化失败且同调用 ID 尚无 usage 的累计数，成功重试排除原失败 |
| `tokens` | usage.tokens 的累计记录值 |
| `credits` | SUM(usage.units)/1000 的累计平台结算消耗，退款不冲减该累计值 |
| `purchasedCredits` | 采样时 kind=purchase 且 expires>sampledAt 的 credit_buckets.remaining 合计 /1000，表示未过期的已购额度余额 |
| `debt` | 采样时 credit_debt 中 id=1 的 amount /1000，表示已结算但未被可用额度覆盖的欠额，扣费超额时增加、可用额度偿还时减少 |

`credits`、`purchasedCredits`、`debt` 单位均为 credits，可为小数。

每个 daily 元素包含 `day`、`newUsers`、`snapshot`。日 snapshot 的值仅含 `activeUsers`、`requests`、`failedRequests`、`tokens`、`credits`。`activeUsers` 仅计该日成功结算调用 `requests>0` 的去重用户。仅失败或仅连接的用户不计活跃。各日活跃相加表达用户日数。

`plugins` 包含 `available`、`reason`、`items`。items 中每项仅含 `pluginId`、`users`、`requests`、`tokens`、`credits`。在聚合排序前按已有公开插件 ID 名单筛选，包括 `legacy` 历史未分类项，随后按成功 requests 降序、pluginId 升序取 Top 20。users 按插件和窗口对用户去重。未知插件标识会被过滤。

窗口包含今天，正常站点的插件排名为观测排名，`available=false`、`reason=day_incomplete`。快照早于今天或晚于响应时间时为 `not_covered`。部分同步时为 `not_synced`。存在旧结构或没有快照时 items 为 null。空站点 items 为 [] 且 available=true。

## 部署后验证

部署与生产凭据操作按既有授权流程执行。验证对应发布版本时，用专用 Bearer 读取 overview，检查 HTTP 200、上述字段、coverage 与采样时间。再检查缺失或错误 Bearer、有效管理员 Cookie 单独请求均返回 401。只记录验证时间、版本和状态码，凭据保留在安全注入渠道。线上运营数字须以授权后取得的响应为依据。
