# 前向 D1 / D7 留存

`GET /api/metrics/retention?days=30` 使用独立 `METRICS_API_TOKEN` 的 Bearer 鉴权，响应为按注册日分组的聚合。凭据配置和轮换沿用[只读运营 API 配置](configuration.md#只读运营-api)。

## 窗口与成功定义

`days` 默认 30，接受 1–90 的整数。窗口包含 Asia/Shanghai 当天，按注册日升序返回每天一个队列。秒与毫秒格式的注册时间均按 `user.createdAt` 归一化。

注册日为 D0，D1 观察 D0+1 当天，D7 观察 D0+7 当天，均从 00:00（含）到次日 00:00（不含）。D1 最早在 D0+2 的 00:00 可用，D7 最早在 D0+8 的 00:00 可用。两个周期独立判断成熟状态。

活跃使用账号成功结算时追加的 `usage`，以记录的结算时间分日。聊天、图片、云端任务和远程 Agent 的成功请求均沿用既有成功定义，包含成功的主动任务。同账号同观察日至少成功一次计为一个活跃账号。失败请求、首次回复及覆盖型 `last_reply_at` 不参与计算。

分母是注册日队列中查询时仍存在的注册账号数，包含确认未活跃的账号。分子是目标日成功活跃的去重账号数。只有整个队列的目标日覆盖完整且分母非零时才返回比率，取值范围为 0–1。

## 采集和覆盖

**历史不可回推。** 新版管理员统计同步首次成功时持久化采集标记。当前仍存在的账号记录中最早标记的下一个上海自然日为 `collectionStartDay`。首次同步当天整体排除，更早注册队列返回不可用。

已有管理员 `POST /api/admin/sync` 按原分页游标同步。采集起点之前的注册队列仅记录采集标记。符合前向条件的账号至多确认 D1 和 D7 两个已结束的观察日，结果和覆盖证据原子保存到 `admin_account_stats.data.retention`，离开日统计的滚动 30 天窗口后继续保留。周期尚未结束时可以只保存采集标记。读取留存 API 只查询 D1 聚合，刷新数据沿用管理员授权同步。

任一账号没有同步、源查询失败、旧版本缺少留存字段或缺少完整覆盖证明时，整个队列的对应周期返回 `coverage_incomplete`。即使已有部分正向活跃记录，也需要完整的分母覆盖。

首版支持原 DO 的成功结算账本。Go 账号的完整写入连续性尚未获得证明，有 `account_backend_routes` 记录的账号返回覆盖不足。同步观察到切换时会持久化来源不可用标记，回切后继续保持不可用，等待后续完整覆盖能力。

账号删除会移除其统计记录并影响历史队列分母。如果最早采集标记的账号被删除，采集起点可能向后移动。响应返回实际使用的起点。

## 响应

每个周期含 `targetDay`、`available`、`reason`、`numerator`、`denominator` 和 `rate`。可用时 `reason` 为 null，不可用时三个数值字段均为 null。

```json
{
  "timezone": "Asia/Shanghai",
  "generatedAt": 1794240000000,
  "collectionStartDay": "2026-11-02",
  "window": { "days": 1, "from": "2026-11-10", "to": "2026-11-10" },
  "cohorts": [
    {
      "day": "2026-11-10",
      "d1": {
        "targetDay": "2026-11-11",
        "available": false,
        "reason": "window_incomplete",
        "numerator": null,
        "denominator": null,
        "rate": null
      },
      "d7": {
        "targetDay": "2026-11-17",
        "available": false,
        "reason": "window_incomplete",
        "numerator": null,
        "denominator": null,
        "rate": null
      }
    }
  ]
}
```

| reason | 含义 |
| --- | --- |
| `collection_not_started` | 当前无有效采集标记 |
| `before_collection` | 注册日在完整采集起点之前 |
| `window_incomplete` | 对应观察日尚未结束 |
| `empty_cohort` | 采集与成熟条件满足，但该注册日无账号 |
| `coverage_incomplete` | 成熟非空队列有账号缺少完整覆盖 |

先判断采集起点及窗口，再判断空队列与覆盖。完整队列的零活跃会返回 `available=true`、`numerator=0`、非零分母和 `rate=0`。

## HTTP 与运行边界

专用 Bearer 通过后正常查询返回 200，包括明确不可用的业务结果。无效或重复 `days` 返回 400，缺失或错误凭据返回 401，已知路径的非 GET 方法返回 405，限流返回 429，限流器或数据库故障返回 503。Cookie、普通 Session、Plus Session 与管理员 Session 都不能代替 Bearer。响应使用 `Cache-Control: no-store`。

JSON 仅含队列汇总。审计沿用固定时间、路由、方法、状态、限流与原因字段，查询参数、凭据和个人明细均排除。

回滚撤回留存入口及同步扩展。原 `usage` 账本继续留存，旧版本的快照写入可能覆盖留存 JSON。重新启用后，缺少采集标记或覆盖证据的周期返回不可用，完整采集从有效的新标记起算。

功能发布后需完成管理员同步并积累完整观察窗。部署验收记录只写时间、版本和状态，D7 尚未成熟时应得到 `window_incomplete`。
