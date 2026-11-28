# 已支付毛额 API

`GET /api/metrics/revenue` 提供本库订单的已支付毛额。使用专用 `METRICS_API_TOKEN`，请求头为 `Authorization: Bearer <METRICS_API_TOKEN>`。凭据配置、轮换和限流规则见[配置文档](configuration.md#只读运营-api)。

## 响应口径

成功返回 HTTP 200。以下字段描述配置与数据范围。

| 字段                                               | 含义                                                         |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `service`、`documentationVersion`、`authenticated` | 分别为 `wechatai`、`1`、`true`                               |
| `mode`                                             | 当前站点配置对应的 `test` 或 `live`                          |
| `timezone`                                         | `Asia/Shanghai`                                              |
| `currency`、`unit`                                 | `cny`、人民币元                                              |
| `basis`、`label`                                   | `gross`、已支付毛额                                          |
| `generatedAt`                                      | 生成时刻的 Unix 毫秒时间                                     |
| `source`                                           | `billing_order`                                              |
| `sourceCoverage`                                   | 本库订单及历史订阅的覆盖限制                                 |
| `definitions`                                      | 过滤条件、金额计算、订单与用户去重、分类和每日时间字段的规则 |

查询条件固定为当前 `mode`、`status='paid'`、`currency='cny'`。金额先对整数分求和，再除以 100 转换为人民币元。请求参数不会更改 mode 或时间窗口。

### 累计汇总

`summary.available=true` 表示查询成功。`summary.window` 为「查询时库内全部匹配订单，无日期过滤」，包括 30 日窗口之前的匹配订单。

| 字段                        | 含义                                   |
| --------------------------- | -------------------------------------- |
| `summary.revenue`           | 全部匹配订单的已支付毛额               |
| `summary.paidOrders`        | 匹配订单行数，每行计一次               |
| `summary.payingUsers`       | 在相同累计口径内按用户去重的付费用户数 |
| `summary.membershipRevenue` | `kind='plus'` 的已支付毛额             |
| `summary.creditsRevenue`    | `kind='credits'` 的已支付毛额          |

管理员赠送会员没有支付订单。账户统计快照的同步覆盖率不参与本查询。`payingUsers` 按支付订单去重，访问到付费的会话转化和来源 ROI 需要各自的数据依据。

### 每日汇总

`daily.available=true` 表示查询成功。`daily.items` 始终包含 30 个升序日期，每项仅有 `day`（`YYYY-MM-DD`）、`revenue`（人民币元）和 `paidOrders`。

- `daily.from` 为生成日向前第 29 天的上海零点，单位为 Unix 毫秒。
- `daily.to` 等于 `generatedAt`，单位为 Unix 毫秒。
- `daily.boundaries="inclusive"` 表示包含起止时刻。
- `daily.includesToday=true` 表示包含今天，今天的数据截至 `generatedAt`。
- 日期以 `COALESCE(paid_at,created_at)` 计算，优先支付时间，缺失时回落到创建时间，再按上海自然日分桶。

累计汇总按全部匹配订单求和，每日汇总按上述时间窗口求和。只有数据库查询成功且没有匹配订单或对应日期没有订单时，金额和计数才填 0。

### 退款与覆盖限制

`refunds` 和 `netRevenue` 始终各自返回下列对象，包括没有已支付订单的情形。

```json
{
  "available": false,
  "value": null,
  "reason": "现有 paid 订单求和不是净额，退款未入本聚合"
}
```

毛额采用本库现有 paid 订单金额，退款未进入聚合。退款、争议及历史订阅的特殊账单仍需人工审核，系统不会自动扣回已消耗额度。[支付文档](billing.md#stripe-配置)

历史订阅续费会更新原订单，`paid_at` 仅首次填入，可能缺少后续收款。`sourceCoverage` 在响应中披露这一限制。Stripe 全量实收、完整历史订阅收款及已对账收入需另行核验。

## 错误与访问控制

缺失或错误 Bearer 返回 401。管理员 Cookie、普通用户及 Plus Session 均无法替代专用 Bearer。已知路径仅支持 GET，认证通过的其他方法返回 405，带 `Allow: GET`。未知路径返回 404。所有响应带 `Cache-Control: no-store` 和 `X-Robots-Tag: noindex, nofollow`。

健康路由和收入路由共享前缀级 IP 与有效凭据限流，每个 Cloudflare 节点内各为 120 次/60 秒，超过后返回 429，带 `Retry-After: 60`。限流服务不可用返回 503。

支付模式缺失或无法可靠识别时，返回 HTTP 503，`available=false`，`reason` 为 `billing_not_configured` 或 `billing_mode_unknown`，并附同一原因的不可用 `billingMode` 对象。数据库查询失败时，返回 HTTP 503 和下列对象。

```json
{
  "error": "unavailable",
  "available": false,
  "reason": "revenue_unavailable"
}
```

调用方应显示不可用及原因。响应只包含聚合与口径元数据。审计记录固定路由 `/api/metrics/revenue`、时间、方法、状态和固定原因，凭据及用户与订单明细不进入日志。

本地可沿用配置文档的安全请求头文件示例，将路径替换为 `/api/metrics/revenue`。生产读取需在对应版本经过授权部署后验证，并核对实际部署 SHA。
