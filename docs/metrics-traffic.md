# 流量与落地页注册统计 API

`GET /api/metrics/traffic?days=7` 使用独立 `METRICS_API_TOKEN`，从现有第一方站点统计读取脱敏聚合。凭据配置、轮换和限流沿用[专用只读运营 API 配置](configuration.md#只读运营-api)。

## 请求与权限

请求头为 `Authorization: Bearer <METRICS_API_TOKEN>`。请从安全的凭据存储注入请求头，日志仅记录状态和必要元数据。

| 参数或行为 | 契约 |
| --- | --- |
| `days` 省略 | 默认 7 |
| `days` 有效值 | 十进制整数字符串，数值 1–90，允许 `07` |
| `days` 非法值 | 空串、0、负数、91、小数、指数、十六进制、空白及其他字符返回 400 |
| 凭据缺失或错误 | 401，管理员、普通用户和 Plus Cookie 单独访问也失败 |
| 有效 Bearer 附带 Cookie | 由 Bearer 鉴权，Cookie 不参与报表读取 |
| 已认证请求使用非 GET 方法 | 405 和 `Allow: GET`，包含 HEAD 和 OPTIONS |
| 超过 IP 或有效凭据限流 | 429 和 `Retry-After: 60` |
| 限流服务或数据库查询异常 | 503，固定错误体，原始异常仅在安全边界内处理 |

成功返回 HTTP 200，逐块 `available` 表达完整统计的可用性。全部响应设置 `Cache-Control: no-store` 和 `X-Robots-Tag: noindex, nofollow`。

## 窗口与口径

日期桶为 `Asia/Shanghai`。`window.from` 为今天往前 `days-1` 日，`window.to` 为今天，包含首尾日期。`includesToday=true` 表示包含尚未结束的今天。`asOf` 是本次请求捕获的时钟，所有共享查询使用同一个时钟确定日期范围。数据库按 day 筛选，数值反映本次读取时已存的数据。

| 字段 | 含义 |
| --- | --- |
| `pv` | 已存浏览记录数 |
| `visitorDays` | 每日去重访客之和，按日更换的访客哈希无法用于跨日自然人去重 |
| `daily[].uv` | 对应单日的去重访客数 |
| `traffic.totals.sessions` | 窗口内浏览记录的去重会话数 |
| `pagesPerSession` | PV / 会话数，保留两位小数，分母为零时共享查询返回 0 |
| `conversions.total` | 窗口内去重注册会话数 |
| `conversions.unattributed` | 其中缺少落地页快照的注册会话数 |
| `conversions.sessions` | 窗口内有浏览或注册的会话并集，包含未归因注册 |
| `conversions.rate` | 完整窗口未知时为 null |

注册按 session_id 去重并取窗口内最早快照。归因快照为空时保留为空，未注册会话的首访沿用完整保留期内的最早浏览。总数来自全量汇总，展示行截断和脱敏均不改变全量计数。共享查询的完整口径为 `total/sessions`、比例单位 0–1，外部首版在覆盖未知时隐藏总率与每行 rate。

`limits` 明示热门页最多 20 行，来源、来源深度、落地页、来源×落地页各最多 15 行，国家最多 12 行，设备最多 4 行。一个访客或会话可出现在多个维度行，各行去重数之和不用于重新计算全量总数。

## 完整性与已采集记录

当前存储仅记录采集事件和批量预留许可，缺少历史停采、丢弃和逐日限额证据。因此首版完整报表始终使用 `available=false`、`data=null`，以固定原因说明限制。`observed` 提供查询成功的已采集记录聚合，允许其中出现真实的库内零计数，同时保留完整性未知状态。conversions 的总 rate 和行 rate 始终为 null。

| reason | 当前实现的证据范围 |
| --- | --- |
| `coverage_unknown` | 无完整覆盖证据，包括空表、稀疏窗口、预算行缺失、历史限额未知或当前仍有许可 |
| `collection_disabled` | 按采集端同一规则解析当前预算，结果为 0。`basis=current_budget_config` |
| `collection_budget_limited` | 今日已预留数量达到当前限额，当前无法再申请新许可。`basis=current_day_permits_fully_reserved`，缓存中是否仍有未用许可、是否已经丢弃事件仍未知 |
| `storage_unavailable` | 报表依赖表缺失或预算表缺失。该块 observed 为 null |

`coverage.checkedDay` 指明当前配置和许可检查对应哪一天。历史预算行不与当前上限比较后生成丢弃结论。日期声明、MIN/MAX(day) 和预算未触顶均无法证明历史窗口完整。现有存储也无法可靠定位历史缺采区间，未知历史缺口归入 `coverage_unknown`。

`page_views` 缺失影响 traffic 和 conversions；`signup_attributions` 缺失仅影响 conversions；预算表缺失影响两块。普通数据库故障返回固定的 503 `{"error":"unavailable"}`，避免将异常掩盖成零计数。首版省略可选漏斗，因此 `funnel_events` 缺失不影响这两个报表块。

## 文本维度与来源

外部投影只允许完整值精确匹配的路径和来源。路径清单包含当前已发布且允许采集的公开页面、历史 `/guide`、`/login` 和 `/register`。多语言路径必须是已经注册的完整页面。未知子路径和后缀使用 null 及 `labelRedacted` 或 `landingPathRedacted` 标记。

来源许可值为 `""`、`utm:bing`、`utm:newsletter`、`google.com`、`bing.com`、`chatgpt.com`。其他来源使用 `source=null` 和 `sourceRedacted=true`，同时清空展示 label。许可清单只控制文本输出，数据库中的实际记录决定计数。

许可来源沿用 `SOURCE_EXPR` 编码，UTM 优先，其次 referrer 主机，最后为空串。流量中真实空串展示为「（直接访问）」，来源×落地页的真实空串按「未识别来源」理解。来源缺失可能与应用剥离来源等情况有关，标签不能证明用户直接打开页面。

隐藏标签后，各行保留独立的计数、排序和截断。多条 null 行代表多个隐藏维度，不能据此累加 visitorDays 或 sessions。国家仅输出两位大写代码，设备仅输出 desktop、mobile、tablet，异常文本也隐藏。

`dataSource=first_party_site_analytics` 表示本站第一方采集。该数据源的观测范围受浏览器执行、隐私偏好和采集预算影响。GSC、Bing 站长统计、AI 引擎引用测量及访问到付费归因需要各自的数据来源。

## 合成响应示例

以下展示一天、一个会话、两次浏览和一个注册会话。完整性仍未知。

```json
{
  "service": "wechatai",
  "documentationVersion": "1",
  "timezone": "Asia/Shanghai",
  "asOf": "2026-11-25T08:00:00.000Z",
  "window": { "from": "2026-11-25", "to": "2026-11-25", "days": 1, "includesToday": true },
  "dataSource": "first_party_site_analytics",
  "coverage": { "complete": false, "reason": "coverage_unknown", "basis": null, "checkedDay": "2026-11-25" },
  "semantics": {
    "observed": "stored_records_only",
    "visitorDays": "sum_of_daily_deduplicated_visitors",
    "pagesPerSession": "pv/sessions",
    "conversionDenominator": "union_of_pageview_and_signup_sessions",
    "rateUnit": "ratio",
    "emptyTrafficSourceLabel": "（直接访问）",
    "emptyConversionSourceLabel": "未识别来源",
    "emptySourceIsConfirmedDirect": false
  },
  "limits": { "topPages": 20, "sources": 15, "sourceDepth": 15, "countries": 12, "devices": 4, "rows": 15, "sourceRows": 15 },
  "traffic": {
    "available": false,
    "reason": "coverage_unknown",
    "data": null,
    "observed": {
      "totals": { "pv": 2, "visitorDays": 1, "sessions": 1, "pagesPerSession": 2 },
      "daily": [{ "day": "2026-11-25", "pv": 2, "uv": 1, "sessions": 1 }],
      "topPages": [{ "label": "/pricing", "labelRedacted": false, "pv": 2, "visitorDays": 1 }],
      "sources": [{ "source": "", "label": "（直接访问）", "sourceRedacted": false, "pv": 2, "visitorDays": 1 }],
      "sourceDepth": [{ "source": "", "label": "（直接访问）", "sourceRedacted": false, "pv": 2, "sessions": 1, "pagesPerSession": 2 }],
      "countries": [{ "label": "CN", "labelRedacted": false, "pv": 2, "visitorDays": 1 }],
      "devices": [{ "label": "desktop", "labelRedacted": false, "pv": 2, "visitorDays": 1 }]
    }
  },
  "conversions": {
    "available": false,
    "reason": "coverage_unknown",
    "data": null,
    "observed": {
      "total": 1, "unattributed": 0, "sessions": 1, "rate": null,
      "rows": [{ "label": "/pricing", "labelRedacted": false, "sessions": 1, "signups": 1, "rate": null }],
      "sourceRows": [{ "source": "", "sourceRedacted": false, "landingPath": "/pricing", "landingPathRedacted": false, "sessions": 1, "signups": 1, "rate": null }]
    }
  }
}
```

缺表块使用以下结构，独立的其他块按各自依赖返回。

```json
{ "available": false, "reason": "storage_unavailable", "data": null, "observed": null }
```

受控示例和本地验收用于说明接口契约。实际发布后，需在对应部署版本下通过专用凭据验证 HTTP 200、日期与逐块可用性，再确认无凭据请求仍返回 401。
