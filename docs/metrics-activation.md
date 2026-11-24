# 激活队列只读 API

`GET /api/metrics/activation` 按 Asia/Shanghai 注册日返回激活账号聚合。鉴权、节点内限流和脱敏审计沿用只读运营 API 的专用 `METRICS_API_TOKEN`。该接口通过现有数据库快照和订单查询。配置与轮换方式见[配置说明](configuration.md#只读运营-api)。

## 请求范围

必填查询参数为 `from_ms` 和 `to_ms`，两者都是非负安全整数形式的 Unix 毫秒时间戳，注册范围是 `[from_ms,to_ms)`，且起点必须小于终点。每个参数只允许出现一次，缺失、空值、重复、负数、小数或指数表示均返回 400。其他查询参数不参与计算。

每个账号的观察窗固定为 `604800000` 毫秒，即连续 7 天。观察截止 `observed_until_ms` 取本次请求开始时的服务端时间。`mode` 使用现有计费函数选择的 `test` 或 `live`。客户端传入的观察截止、窗口长度、mode 或采集下限不会覆盖服务端口径。

生产激活采集已在提交 `9e0058f` 对应的部署中启用，该部署于 2026-11-21 17:43:24（Asia/Shanghai）完成。接口采用其后的首个上海整日 `2026-11-22T00:00:00+08:00` 作为保守纳入下限。这会省去更早已经开始采集的部分账号。 [部署记录](https://github.com/moutsea/wechatai/actions/runs/44890566353)

有效范围取请求注册范围与该下限的交集。注册日分组只使用有效范围内的账号，响应保留请求范围和实际范围，便于核对部分日期范围。完全早于下限的请求返回明确不可用。范围内没有注册账号时返回 `days: []`。

## 日桶完整性与阶段

注册时间兼容现有秒级与毫秒级存储，先按后台同一规则换算为毫秒。每个账号的事件窗口为 `[created_at_ms,created_at_ms+window_ms]`，两个端点均包含。完整日桶需要该日有效范围内的每个账号同时满足下列条件。

- 服务端观察截止达到账号窗尾。
- 已有 `admin_account_stats` 快照。
- 快照 `synced_at` 达到账号窗尾。
- 快照包含对象类型的 `activation`。

任一条件未满足，该日返回 `available: false` 和全部已知原因，并省略 `accounts` 及四个阶段计数。有效激活对象内的 null 时间戳表示该阶段没有已记录事件。只有完整日桶可以返回有证据的零。

| 字段 | 计数口径 |
| --- | --- |
| `accounts` | 完整日桶内的注册账号数 |
| `model_tested` | `firstModelTestAt` 在账号窗口内的账号数 |
| `connected` | `firstWechatConnectedAt` 在账号窗口内的账号数 |
| `first_reply_delivered` | `firstWechatReplyAt` 在账号窗口内的账号数，该字段来自确认送达的微信回复 |
| `paid_accounts` | 窗口内至少一笔同 mode、当前 `status='paid'` 的订单所对应的账号数 |

四个阶段彼此独立。通知或 Agent 用户可跳过模型测试后直接回复或付费，因此相邻阶段相除没有漏斗含义。`lastWechatReplyAt` 会被后续活动覆盖，无法重建 D7 或其他历史留存，该接口也不输出留存字段。

同一账号多笔同 mode 的 paid 订单只计一次，其他 mode、非 paid 状态和窗外订单被排除。结果使用查询当时的订单状态与快照，观察截止只用于判断窗口是否完成。`paid_accounts` 是账号计数，gross/net 金额均不适用，退款金额不参与调整，后续订单状态变化可能改变结果。环境中的 Stripe 密钥以 `sk_live_` 开头时 mode 为 live，其他配置（包括缺失）沿用计费函数的 test 回退语义。此字段只表明订单筛选方式。

## 响应

顶层字段为固定口径及日桶，完整日桶保留注册数和四个阶段计数。一个含不可用日桶的示例片段如下。

```json
{
  "available": false,
  "reasons": ["window_incomplete", "snapshot_stale"],
  "days": [
    {
      "signup_day": "2026-11-22",
      "available": false,
      "reasons": ["window_incomplete", "snapshot_stale"]
    }
  ]
}
```

| 顶层字段 | 含义 |
| --- | --- |
| `available` | 采集范围有效且所有返回日桶完整时为 true；空日桶列表在范围有效时也为 true |
| `reasons` | 不可用原因的去重集合，完整结果为空数组 |
| `timezone` | 固定 `Asia/Shanghai` |
| `requested_range` | 请求的 `from_ms` 和 `to_ms` |
| `effective_range` | 实际采用的 `from_ms` 和 `to_ms`；没有有效交集或采集下限未知时为 null |
| `collection_started_at_ms` | 有部署证据的保守纳入下限；证据不可用时为 null |
| `collection_start_policy` | 固定 `first_full_shanghai_day_after_verified_deployment` |
| `observed_until_ms` | 本次请求开始时的服务端毫秒时间戳 |
| `window_ms` | 固定 `604800000` |
| `mode` | 订单筛选使用的 `test` 或 `live` |
| `registration_interval` | 固定 `[from_ms,to_ms)` |
| `event_interval` | 固定 `[created_at_ms,created_at_ms+window_ms]` |
| `stages_independent` | 固定 true |
| `paid_accounts_basis` | 固定 `current_status_paid_deduplicated_by_account` |
| `amount_basis` | 固定 `not_applicable` |
| `refund_adjustment` | 固定 `none` |
| `days` | 按注册日升序返回的日桶，部分不可用时仍保留其他完整日桶 |

日桶原因包括 `window_incomplete`、`snapshot_missing`、`snapshot_stale` 和 `activation_missing`。采集下限未知时，顶层为 `collection_start_unknown`；范围完全早于采集下限时为 `before_collection_start`，这两种情况均返回空日桶列表。

所有响应带 `Cache-Control: no-store` 和 `X-Robots-Tag: noindex, nofollow`。合法查询无论日桶可用性均为 200；未限流且限流服务正常时，缺失或错误 Bearer 为 401，管理员、普通用户和 Plus Cookie 单独使用也是 401。参数错误为 400，已知路径的非 GET 方法为 405，未知路径为 404，限流为 429，限流服务或数据库故障为 503。限流同时覆盖 IP 与有效专用凭据，触顶返回 `Retry-After: 60`。

输出限于聚合和口径。原始用户、订单、支付客户、微信、聊天与凭据字段均通过响应字段白名单隔离。请求不会触发快照同步、Session 查询、账户服务或外部支付服务。快照不足时应由原有管理员同步流程处理。

## 核对参考 SQL

API 直接使用[参考 SQL](analytics/activation-cohort.sql)。使用响应中的有效范围和口径按顺序绑定五个参数，即 `?1=from_ms`、`?2=to_ms`、`?3=observed_until_ms`、`?4=window_ms`、`?5=mode`。SQL 中 available 为 0/1，四个原因列为 0/1，不可用计数为 NULL。API 将原因列映射成数组，将 available 映射成布尔值，并省略不可用计数。比较时使用同一份数据库状态。

## 部署后验证

此接口的生产可读性应在获授权部署后，按实际部署 SHA 验证。凭据通过安全请求头文件或既有密钥注入方式提供，关闭 shell tracing，记录时间、版本和状态码。有效专用 Bearer 应返回日合计或明确 unavailable，无 Bearer 应返回 401。凭据正文禁止进入代码、PR、聊天和日志。
