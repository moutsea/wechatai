# wechatai 只读 API：流量、来源与落地页注册转化（WM2）

本卡为 `db112f5e-a938-414d-87dd-d284c09c3eb2`，仓库为 `moutsea/wechatai`，目标分支为 `main`。
本次复核日期为 2026-11-25，评审会话为 `6bbc7d1e-2717-402f-9372-150a89ac6c68`。

## 评审结论与负责人

本卡是一个原子任务。一个分支、一个 draft PR 交付 `GET /api/metrics/traffic`、必要的输出投影、对应测试与使用说明，可独立验收并回滚。现有 traffic 与 conversions 属于同一流量报表，使用同一窗口与归因口径，适合一次审清。

风险级别为**高**，涉及专用凭据边界、统计完整性和用户可控文本的隐私。预计改动集中于 metrics 分发、一个报表模块、必要的共享映射、对应测试及文档，约 5–8 个文件。文件数仅作规模估计。

PR 负责人由本卡进入「开发中」后接手的开发会话承担，负责唯一 draft PR、逐提交复核、完整验收证据与后续返工。当前工作流开发 profile 为 `92d67037-1df0-4f19-bf5e-8cb0c4965f2b`。历史文档中的 `916bf250-fb21-4262-9419-f9aad4e07699` 是旧会话 profile，现按工作流实际接手者交接。

本轮用户已授权评估完成后流转到「开发中」`ce7108c3-7888-4c98-9347-512e71ef0989`。原先“还需另行明确启动”的评审限制由本轮指令更新。WM1 代码依赖已解除。本次续办按卡面要求收敛两项可逆输出选择，具体取舍见文末，完成文档验证后执行开发流转。

本卡维持独立顶层任务。范围限定于该报表及其必要测试、文档，合并、部署与生产迁移继续需要另行授权。

## 已核对的基线与依赖

| 项目 | 本轮读回结果 |
| --- | --- |
| 当前分支 | `feature/wechatai-api-n8l` |
| 当前 HEAD | `9c336c015f7122fdb119ba9c189e2fc4db078ba4`，已有 WM2 需求文档提交 |
| 复核开始时工作树 | 首次复核时干净，本次续办保留并完成同一需求文档的修改 |
| 本轮 fetch 后的 main | `76590750244d7f5b289f7fb1ad17c45f13ea4a0d`，2026-11-25 合并 PR #52 |
| WM1 合并提交 | `f84b9060a79d421c659cb68737a6b551a33c568b`，已验证是该 main 的祖先 |
| WM1 独立代码评审 | 计划记录 PASS 覆盖 `179fc9251bd8f50030bb8e29f361cba3c5c8e396`，PR #48 已合并 |
| WM4 已有接线 | `52e6695ac0b99e052bbd7053d7db7cdcde2e032c` 已在 main，`metrics.ts` 已分发 `/api/metrics/revenue` |
| WM6 已有接线 | `41ee2a43ffd48bd5db2fe95ce10b100c5b043a5e` 已在 main，`metrics.ts` 已分发 `/api/metrics/retention` 并含 `invalid_query` 审计原因 |
| 本卡依赖状态 | 看板 `blocked_by=[]`，WM1 为 COMPLETED |
| 本卡已有 PR | Kandev 当前关联列表为空 |

WM1 卡为 `affc0518-ed7c-47c6-8cef-db6e671f2128`，标题为「wechatai 外部只读运营 API：专用 token 鉴权、限流与审计」。其计划保留正确生产 Bearer 与有效管理员 Cookie 验证待补的记录。本卡开发使用已合并且有独立代码 PASS 的底座，线上凭据验收留在发布流程处理。

WM4 卡为 `d34f762e-c7f2-4a3a-a558-8f13540220a8`，内部需求文件为 `internal-docs/wechatai-metrics-revenue.md`。WM2 必须以包含 WM1、WM4 和 WM6 接线的 main 为基线，接入时保留 health、revenue 和 retention 分支。WM6 的账号留存观测只覆盖其自身数据链路，不能证明匿名 page_views 的窗口完整性。

`src/server/analytics.ts`、`analytics-budget.ts`、`src/shared/analytics.ts`、`analytics-queries.ts`、`analytics-schema.ts` 在本地 HEAD 与该 main 之间无差异。该 main 中仍未实现 traffic 路由。本轮获取远端引用后按固定 SHA 读取代码，工作区检出的产品代码仍在旧 HEAD，实施前需要同步基线。

## 现有代码与复用方式

- `src/server/metrics.ts` 的 `metricsRequest` 已执行 IP 限流、专用 Bearer 验证、有效凭据限流、路径与 GET 校验及固定字段审计。WM2 在此入口增加 traffic 分发，非法查询复用已有 `invalid_query` 审计原因和固定错误体。
- `src/server/index.ts:185–186` 已挂载 `/api/metrics` 和 `/api/metrics/*`，位于通用 bodyLimit 和登录 Session 查询之前。现有挂载已满足本卡入口需求。
- `src/server/analytics.ts:241` 的 `getTrafficSummary(env, days, at)` 查询 totals、daily、topPages、sources、sourceDepth、countries、devices。维度限制依次为热门页 20、来源 15、来源深度 15、国家 12、设备 4。
- `src/server/analytics.ts:377` 的 `getSignupConversions(env, days, at)` 返回全量 total、unattributed、sessions、rate 和两组前 15 行。SQL 由 `src/shared/analytics-queries.ts` 的 `signupConversionQueries` 共享。
- `SOURCE_EXPR` 按 UTM、referrer 主机、空串的优先级产生 `utm:<值>`、主机名或 `""`。流量汇总当前把空来源转为「（直接访问）」展示标签，来源×落地页保留空串。
- `getAdminAnalytics` 已有 days 的严格字符串校验。可最小抽取校验 helper 供两处复用，保留管理员已有错误码与数值语义。外部 API 对已知非法参数显式返回 400，避免被 metrics 的统一 catch 转为 503。
- `getFunnelSummary` 可复用事件计数。为收紧本卡交付，首版采用原需求允许的省略方案，验收集中于必选的 traffic 与 conversions。

## 范围与边界

本卡交付专用 Bearer 下的流量和注册会话报表、逐块可用性、文本维度脱敏、对应自动化验证和文档。数据读取全部复用现有聚合，实现使用显式响应字段投影。

范围排除 GSC、Bing 站长分析、AI 引用率、访问到付费、收入、用量、留存、上游成本、毛利及利润。公开报表只处理聚合，session_id、IP、visitor_hash、event_id、账户标识、邮箱、姓名、微信身份、订单与支付明细、聊天内容均禁止输出。

采集端、DNT/GPC、180 天明细保留、首访归因与爬虫过滤沿用既有行为。管理员 analytics 的缺表 500 契约、已有 metrics health/revenue/retention、登录及其他业务路径均须回归验证。本卡默认采用现有配置与存储结构，扩大到覆盖记录、迁移或新增配置时须先单独说明成本并取得范围授权。

## 路由、窗口与统计契约

1. 路由为 `GET /api/metrics/traffic?days=`。省略 days 默认 7，取值为 1–`ANALYTICS_MAX_DAYS`（90）的十进制整数字符串。沿用 `/^\d+$/` 和整数范围校验，因此 `07` 按现有语义可用。
2. 空串、0、负数、91、小数、科学计数、十六进制、空白、NaN、Infinity、混合字符均返回固定的 400 错误体，且发生在业务数据库查询前。鉴权与限流优先级沿用 WM1。
3. 正确专用 Bearer 可通过。缺失或错误 Bearer、仅管理员/普通/Plus Cookie 均失败。有效 Bearer 附带 Cookie 时仍以 Bearer 判定，Cookie 不参与认证。服务端 Secret 的最低长度及失败语义沿用 WM1。
4. 已认证的已知路径非 GET 返回 405 和 `Allow: GET`。未知路径为 404，IP/有效凭据限流为 429 和 `Retry-After`，限流绑定异常为 503。响应继承 `Cache-Control: no-store` 和 `X-Robots-Tag`。
5. 一次请求只捕获一个 `at`，传给所有共享聚合。时区为 `Asia/Shanghai`，`from=shanghaiDaysAgo(days-1, at)`，`to=shanghaiDay(at)`，首尾日期均包含。今天的数据截止请求查询时刻，响应给出生成时刻和 `includesToday=true`。
6. 现有查询按 day 过滤，复用同一时钟可固定日期窗口。测试采用固定数据库夹具，跨请求或并发写入场景的数值一致性按各次读取时刻解释。
7. `visitorDays` 为每日去重访客之和，`daily.uv` 为单日去重，`sessions` 为窗口内去重会话。`pagesPerSession=pv/sessions`，沿用现有两位小数。
8. conversions 的 total 为窗口内去重注册会话数。分母是窗口内有浏览或注册的会话并集，未归因注册计入总数与分母。同一注册会话取最早快照，空快照保留为空，首访查询沿用完整保留期。
9. 完整可用结果的 rate 为 `total/sessions`，单位为 0–1 比例。零分母沿用现有返回 0 的约定。total、sessions 和总 rate 来自全量汇总，两组 LIMIT 15 展示行仅作维度展示。
10. dataSource 固定为 `first_party_site_analytics`。来源空串的流量展示标签为「（直接访问）」，转化展示标签为「未识别来源」。两者仅说明来源字段为空。文档须说明 referrer/UTM 记录的归因范围，以及 GSC、AI 引用和付费 ROI 的独立含义。

## 覆盖证据与逐块可用性

现有 `anonymous_analytics_budget(day,reserved,last_grant)` 记录批量预留许可。`AnonymousAnalyticsBudget.take` 在停采、并发租约占用、许可耗尽、预算表异常时可丢弃采集。现有存储缺少成功采集数、丢弃记录、历史限额及停采区间。

据此，空表、MIN/MAX(day)、预算行存在或 `reserved < 当前上限` 都不足以证明历史窗口完整。旧文档的 `ANALYTICS_COVERAGE_SINCE` 日期声明也无法证明整段窗口持续完整，本次撤回其“满足条件即可 complete=true”的方案。预算 reserved 达到上限说明已预留到上限，实际丢弃是否发生仍需证据。

可用性按每个报表块表达。缺少可信完整性证据时 `available=false`、`reason="coverage_unknown"`、`data=null`。首版现有存储无法支持生产 `available=true` 的完整窗口声明，这一能力限制须在使用文档与响应中明示。未来完整性来源需要另议，测试桩里的完整状态只验证契约。

| reason | 使用条件 |
| --- | --- |
| `storage_unavailable` | 该块依赖表确实缺失，或依赖的预算存储不可读。允许最小只读表存在性检查，数据库异常仍走固定安全错误 |
| `collection_disabled` | 当前配置按既有解析实际关闭采集，且查询窗口包含今天。原因描述限定在当前状态 |
| `collection_budget_limited` | 有明确预算限制或拒绝采集的证据。描述范围受证据约束，历史 reserved 与当前上限的比较不能生成历史丢弃结论 |
| `incomplete_window` | 有明确缺采日期、保留截断或其他窗口缺失证据 |
| `coverage_unknown` | 缺少可信窗口覆盖证据，或历史限额和采集状态无法确认 |

按实际可证原因选择状态，缺表优先表达该块存储不可用。正常数据库查询异常通过 WM1 返回固定 503 和白名单审计，原始 SQL、异常文本及原始维度均禁止输出。多个块使用各自依赖判断，避免把一个块的缺表结果传播到独立块。

`traffic` 依赖 `page_views`。`conversions` 同时依赖 `page_views` 与 `signup_attributions`，浏览缺失时转化分母也不可用。预算表异常会影响匿名浏览采集的覆盖判断，必须传递到 conversions。

### 已采集数据展示

在查询成功且覆盖未知或已知不完整时，提供 `observed` 描述**库内已采集记录**。完整窗口的 `data` 保持 null，`available` 保持 false，conversions 的总 rate 和行 rate 统一为 null。traffic 的 pagesPerSession 仅描述库内记录的比值。这样能复用现有计数，并由元数据持续表达覆盖限制。

查询失败或该块依赖表缺失时，observed 为 null。该输出选择使用现有聚合与状态规则，保持本卡只读 API 的实施范围。

交付响应形状如下，数值为一致的合成夹具，所有字符串维度已经投影。

```json
{
  "service": "wechatai",
  "documentationVersion": "1",
  "timezone": "Asia/Shanghai",
  "asOf": "2026-11-25T09:00:00.000Z",
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
      "total": 1,
      "unattributed": 0,
      "sessions": 1,
      "rate": null,
      "rows": [{ "label": "/pricing", "labelRedacted": false, "sessions": 1, "signups": 1, "rate": null }],
      "sourceRows": [{ "source": "", "sourceRedacted": false, "landingPath": "/pricing", "landingPathRedacted": false, "sessions": 1, "signups": 1, "rate": null }]
    }
  }
}
```

缺表块的示例为 `{ "available": false, "reason": "storage_unavailable", "data": null, "observed": null }`。来源被隐藏时以 `source=null, sourceRedacted=true` 表达，与真实空来源 `source="", sourceRedacted=false` 分开。

## 文本脱敏与同口径

旧方案以一级路径段和合法 DNS 语法放行文本，仍可暴露 `/docs/person-fixture` 或 `person-fixture.example.com`。新方案以**完整值精确白名单**控制输出。

- 路径清单从实施基线的已发布完整路径和 `/login`、`/register` 形成有限集合。语言前缀只接受实际注册的完整路由。采集规则排除的令牌页继续排除。实现优先复用轻量路由常量，必要时增加一个仅含完整路径的输出常量及一致性测试，避免导入整份 SEO/i18n 内容。
- 首版来源清单采用现有合成测试已覆盖且无个人信息的固定值 `utm:bing`、`utm:newsletter`、`google.com`、`bing.com`、`chatgpt.com`，加真实空串。这是输出许可清单，真实流量是否来自这些值仍由数据库记录决定。后续增加值通过代码评审，首版无需环境变量。
- 白名单内来源保留 `SOURCE_EXPR` 原有编码。白名单外的路径或来源置 null，并给对应 `*Redacted=true`，每条共享查询结果仍独立成行。相同 null 标签的行代表不同隐藏维度。
- 流量 sources/sourceDepth 需要在共享映射处保留原始 source 编码，再做外部投影。允许最小可选映射参数或小型共享映射抽取，默认管理员输出维持现有展示。禁止通过「（直接访问）」标签反推空串，也禁止复制查询。
- 国家只输出现有两位大写代码形态，设备只输出既有枚举。异常文本采用 null 和固定脱敏标记，查询得到的各行独立保留。
- 每行计数、原排序和截断沿用共享查询。隐藏维度之后不得重新求和 distinct 计数。一个访客或会话可以跨多个来源和页面，行内去重值相加会重复。总率和全量总数始终来自原汇总。

这一投影保留共享查询的每行数值，同时收紧外部文本边界。精确白名单、原始编码、全量 totals 及去重正确性纳入实现验收。

## 分支策略、文件冲突与回滚

沿用当前分支 `feature/wechatai-api-n8l`，避免创建重复分支或 PR。实施前再次 fetch，以包含 WM1、WM4 和 WM6 的 main 同步本分支，保留已有需求文档提交并记录实际 base/head SHA。当前代码复核基线是 `76590750244d7f5b289f7fb1ad17c45f13ea4a0d`。

| 文件 | 改动范围与先后关系 |
| --- | --- |
| `src/server/metrics.ts` | 唯一高冲突接线点。先采用已合并 WM1、WM4、WM6，随后增加 traffic 路径与固定审计模板，复用已有 400/invalid_query 处理 |
| `src/server/metrics-traffic.ts` | 建议新增独立报表模块，调用现有聚合、执行可用性判断与显式投影 |
| `src/server/analytics.ts`、`src/shared/analytics.ts` | 仅必要的日期校验复用或原始来源映射抽取，同步验证管理员调用 |
| `src/shared/analytics-queries.ts` | 复用原 SQL 与 SOURCE_EXPR。若实现需要修改，须用完整同口径夹具证明已有调用行为 |
| 对应 metrics/analytics 测试 | 覆盖新路由并回归 WM1、WM4、WM6，使用原仓库测试模式 |
| `internal-docs/wechatai-api-wm2-traffic.md` | 需求、验收、合成示例及决策记录，保持根目录内部树 |
| WM1 配置与部署文档、示例配置 | 现有配置说明直接引用，首版无需新增配置项 |
| `src/server/index.ts` | 复用已有前缀挂载，必要性由实施基线确认 |

WM3–WM6 如另有在途改动命中上述文件，接入前核对其实际提交和 PR 文件交集。同文件以已合入 main 的前一张卡为基线，彼此独立的模块可并行设计。原文“同仓任何时刻只允许一张在途 PR”的限制已删除，按当前工作流的实际文件交集规则处理。

回滚单位为本卡唯一 PR 的 traffic 接线、输出投影及对应文档。验收需证明回滚后 health/revenue/retention 和原有采集仍可用。本卡代码独立于新增存储结构。

## 验收标准

1. 专用 Bearer 成功，缺失/错误 Bearer、真实管理员/普通/Plus Session 单独访问失败。Cookie 加错误 Bearer 失败，有效 Bearer 加 Cookie 成功。用 spy 验证登录 Session、账户 DO、支付服务与写入口均未因该请求被调用。
2. days 默认 7，1、07、90 有效。空串、0、-1、91、1.5、1e2、0x7、首尾空白、NaN、Infinity、7abc、07.0 均 400，且无业务查询与输入回显。
3. 固定 at 和数据库夹具，逐字段对比共享 traffic/conversions 的全部已返回数值。单独断言不可用 rate=null、observed 计数、隐藏维度和状态。验证上海午夜边界。
4. 跨日同访客按 visitorDays 表达，daily.uv 与 sessions 的去重层级准确，pagesPerSession 精度沿用。采集过滤、DNT/GPC、爬虫与保留行为回归通过。
5. 注册夹具覆盖重复注册、未归因注册、仅注册无浏览、窗口前首访、空快照及超过 15 行。原始共享查询的全量 total、sessions、rate 与截断无关。
6. 来源采用 UTM 优先、referrer 次之、空串最后的编码。白名单外值和真实空来源明确区分。加入同访客/同会话跨两个来源或路径夹具，防止脱敏后的 distinct 重复计数。
7. 分别删除 page_views、signup_attributions、预算表并模拟普通查询故障，校验依赖传播与固定错误。当前停采、预算预留触顶、历史限额未知、覆盖未知、已知缺口都有对应测试。空表与缺失预算行不产生完整零流量声明。
8. 在 UTM、完整路径的后缀、合法 referrer 子域放入合成敏感文本，同时加入邮箱、编码值和长 token 夹具。响应任何位置和审计均无原文，固定白名单值与数值可按契约出现。
9. 认证、限流、GET/HEAD/OPTIONS/POST 等方法、未知路径、固定审计、no-store 按 WM1 验证。已有 health/revenue/retention 与管理员 analytics 的数值和错误契约回归通过。
10. 文档提供完整合成示例、不可用示例、字段白名单、窗口、去重、截断、输出隐藏差异、第一方统计来源及凭据配置引用。已采集记录与完整性状态必须同时可见。
11. 根目录 internal-docs 文件不进入 docs/doc/public、公开文档导入链、静态复制、文档 bundle 或 `/api/docs`。实施构建后检查产物中不存在本卡评审标题和卡号。
12. 每个小 commit 的提交信息带 `db112f5e`，每个单独 review。相关测试、类型检查、lint、适用构建和最终完整 HEAD 独立评审通过后，仅创建本卡唯一 draft PR。

## 实施与验证顺序

1. 按本次评估取舍定稿响应字段和示例，验证需求文档后流转到开发。
2. 同步最新 main，核对 WM1/WM4/WM6 提交。小 commit 交付输出类型、必要共享映射及针对数据和隐私的回归测试，逐提交复核。
3. 小 commit 接入 metrics traffic 分发、窗口与可用性处理、集成验证。所有业务查询继续复用原函数。
4. 小 commit 补齐接口使用说明、剩余回归和最终证据。同一最终 HEAD 做整卡独立评审，随后建立唯一 draft PR。

功能测试随对应提交交付。基线已有 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm check:public`，定向 Worker 测试采用现有 Vitest 配置。开发者按实际改动选择相关测试并执行仓库要求的适用检查，记录命令、退出码和 base/head SHA。

本机全局会话上限为 4。重活启动前检查 load、MemAvailable 和已有测试/构建进程，已有重活或可用内存不足 2 GiB 时等待并说明。全量测试与构建串行，禁止使用并行子 agent 或后台 AI 绕过限制。

## 本轮评估取舍

用户要求继续按卡面完成本轮工作。上次问题没有收到选项答案，本次由评估会话依据原始验收确定以下可逆实现选择，作为开发交接依据。

- **覆盖未知时的展示方式**。采用 `available=false + data=null + observed`，展示库内已采集计数，转化率为 null。完整性未知在响应及文档中明确标识。若未来需要可信完整窗口与完整转化率，再确定覆盖证据来源和成本。
- **未许可文本维度的展示方式**。采用完整值白名单，其他标签置 null 并加脱敏标记，保留各行计数、排序和截断。许可来源保留 SOURCE_EXPR 编码，真实空串保持独立含义。
- **可选漏斗**。首版省略原需求标为可选的 funnel，聚焦 traffic 与 conversions。

这些选择落实卡面要求的数据真实性、无 PII 和聚合复用，范围保持一个只读流量报表。原先将两项输出选择设为必须等待用户回答的门槛在本轮解除。

## 本轮实际验证与历史修正

本轮已再次获取 main、验证 WM1 合并提交祖先关系、读取该 SHA 的 metrics 分发与测试，以及共享 analytics、schema、预算实现和文档发布链。现有公开文档由显式源码导入，Vite 的动态导入限定 i18n 子目录，wrangler 静态根为 public，未发现 internal-docs 的构建入口或 `/api/docs` 接线。

使用 Python 标准库 SQLite 的合成数据验证了旧脱敏合并方案的问题。同一天、同访客、同会话的两条浏览分别属于两个 UTM，两个桶的 visitorDays/sessions 相加均为 2，真实合并去重均为 1。命令退出 0。该验证只针对聚合规则，功能路由验收留待开发执行。

本轮修正了旧文档的 WM1 状态、覆盖声明方案、文本放行规则、distinct 合并规则、Cookie 与 Bearer 联合行为、过时 profile 和同仓 PR 数量限制。旧文档所写 `bf9d7ffa94` 不作为当前提交证据，实际已有文档提交为 `9c336c015f7122fdb119ba9c189e2fc4db078ba4`。

本轮交付为需求文档与任务计划更新。Worker/Vitest、类型检查、lint 和构建的功能验收尚待开发执行。线上状态沿用依赖卡记录的证据边界，本轮没有生产请求或真实凭据验证。

续办已将复核基线从 `2fec26ec9a004530022454381b9ebedf81b7b36e` 更新到 `76590750244d7f5b289f7fb1ad17c45f13ea4a0d`，检查了新增 retention 分发、日期校验及覆盖来源。两者之间的 analytics 聚合、schema 与预算实现无变化。WM2 日期校验仍复用管理员的默认 7 和允许 `07` 的语义，retention 的默认 30 及更严格字符串校验保留在其自身路由。


## 2026-11-25 开发记录

开发基线为 `76590750244d7f5b289f7fb1ad17c45f13ea4a0d`。已核对 WM1 计划中的正式独立 PASS（覆盖 `179fc9251bd8f50030bb8e29f361cba3c5c8e396`），并验证 WM1 合并提交为基线祖先。当前分支通过 `e6c387562f431ec49918d870784dcab0b6aa6a9b` 同步该 main，保留需求文档提交。

第一实现提交 `cd8fd92` 抽取管理员与外部接口共用的 days 校验、预算配置解析，以及 raw 来源映射选项。原查询与默认管理员投影保留。逐提交复核了默认调用行为、错误码、边界和预算解析，56 项 analytics 测试、类型检查和 lint 通过。

报表使用 `metrics.ts` 已有鉴权、限流、方法边界和审计，只新增 traffic 分发及固定路由模板。逐块读取和显式投影位于 `metrics-traffic.ts`。完整路径许可清单采用 126 个实际发布或登录注册路径，测试直接与现有路由注册表比对，Worker 只引入轻量清单。

当前预算触顶原因具体限定为当天许可已预留完，响应提供 `basis=current_day_permits_fully_reserved` 和 `checkedDay`，并在使用文档说明剩余缓存许可与实际丢弃情况仍未知。历史预算行只保留其原始证据范围，缺少历史缺采证据时使用 coverage_unknown。该实现没有可证的 incomplete_window 分支，也没有完整性为 true 的生产分支。

公开使用说明为 `docs/metrics-traffic.md`，仅包含接口契约和合成示例。内部评审文档继续位于根目录 internal-docs。实际功能测试和最终 HEAD 证据以任务计划交接记录为准。

第二实现提交 `b5ed385` 交付 traffic 路由、可用性状态、显式字段投影、路径许可清单和使用说明。逐提交复核了鉴权分发顺序、共享查询调用、独立行计数与隐私边界。7 文件相关 Worker 验证通过 169 项，新增文档响应比对和 SQL 只读断言后，2 文件 WM2 定向验证通过 39 项，类型检查和 lint 通过。相关日志为 `/tmp/wm2-shared-tests.log`、`/tmp/wm2-route-tests.log`、`/tmp/wm2-final-focused.log`。本地采用 Node 22.19.0 和 lockfile 锁定依赖，`.dev.vars` 只使用新建的 test-only 值。全量检查与最终 SHA 记录继续保存在任务计划。
