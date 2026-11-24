# wechatai 外部只读运营 API：专用 token 鉴权、限流与审计

## 结论与原子性

- 原子任务：一张卡、一个分支、一个 draft PR，只交付「独立凭据的只读元数据入口 + 限流 + 脱敏审计 + 对应测试与文档」。可独立验收、独立回滚，不需要数据迁移，不建 parent_id、子卡或「集成验证」列。
- 风险：**高**（鉴权与隐私边界）。改动面小不等于低风险；认证失败、路由穿透、日志泄漏任一都不可接受。
- 基线：评估时本地工作树干净，分支 `feature/wechatai-api-token-3kh` 位于 `b36ca2cba3e4cfbc04f99fa0e466423bda54e936`；缓存 `origin/main` 已到 `708e3e1caebe62127b3d418434ef56573c87c5b6`（2026-11-23 13:00 +0800），本分支落后且无自有提交。开工时先 `fetch`、把本分支更新到最新 `main` 并重核基线；不强推 `main`，不 rebase 其他 PR 分支。
- 已核对：仓库内不存在 `METRICS_API_TOKEN`、`/api/metrics` 实现或相关测试；`docs/configuration.md`、`docs/deployment.md`、`.dev.vars.example` 均未登记该变量。本卡从零实现，不重复既有工作。

## 范围

做：

1. 新增独立可选 Workers Secret `METRICS_API_TOKEN`，仅接受 `Authorization: Bearer`。
2. 新增 `GET /api/metrics/health` 元数据响应；未知 `/api/metrics/*`、非 GET 方法按固定契约拒绝。
3. 复用现有 `API_LIMIT` 绑定做 IP 与有效凭据两个维度的节点内限流。
4. 为该前缀全部返回分支写结构化、字段白名单审计，测试验证日志不含敏感输入。
5. 更新配置/部署文档与 `.dev.vars.example`（仅空占位）。
6. 增加鉴权、隔离、限流、审计与回归测试。

不做：

- 不实现 WM2–WM6 的运营指标查询、日期桶、金额/gross/net/毛利/利润/BYOK 成本；不添加零值占位指标。
- 不新增 D1/DO 全局计数、同步任务、数据库迁移、日志队列或新基础设施。
- 不重建后台，不改计费、登录、模型、微信收发、账户 DO 的现有行为。
- 不修改 `billingMode()` 的计费语义；本卡只报告支付配置模式，不证明支付可用。
- 不为后台路由增加 Bearer 兼容；metrics token 不得获得任何后台写权限。
- 不合并、不部署、不写生产 Secret、不修改生产配置。

## 接口契约

### 凭据

- `METRICS_API_TOKEN` 未配置、空白、少于 32 字符或格式不匹配时关闭入口。启用值必须独立随机（建议 32 随机字节），不得复用 `SERVER_MONITOR_SECRET`、`EXECUTOR_SECRET`、`WECHAT_RECEIVER_SECRET`、`BILLING_NOTIFY_TOKEN`、`BETTER_AUTH_SECRET`、`ENCRYPTION_KEY` 等任何现有凭据，无回退 Secret。
- 只读 `Authorization: Bearer`；不接受 Cookie、Better Auth Session、查询参数或请求体中的 token。比较使用固定长度摘要（SHA-256）与恒定时间比较，参照 `src/server/server-status.ts` 的 `serverMonitorAuthorized`，但不得复用它或它的 Secret。

### 响应

`GET /api/metrics/health` 成功 200，字段白名单：

```json
{
  "service": "wechatai",
  "documentationVersion": "1",
  "timezone": "Asia/Shanghai",
  "authenticated": true,
  "billingMode": { "available": true, "mode": "test" }
}
```

- `billingMode`：可可靠识别时 `{ available: true, mode: "test" | "live" }`；缺失或无法识别时 `{ available: false, reason: "billing_not_configured" | "billing_mode_unknown" }`，不得把未配置伪报成 `test`。
- 不得出现计数、用户/订单/微信标识、支付账号或聊天内容。
- 未限流时认证失败统一 401，响应不得包含任何成功元数据字段；错误文案不回显输入。
- 该前缀所有响应：`Cache-Control: no-store`，建议 `X-Robots-Tag: noindex, nofollow`。

### 路由与隔离

- 独立 metrics 处理器必须注册在 `src/server/index.ts:153` 的 `/api/*` 通用 bodyLimit 与 `:548` 的 Session 中间件之前，覆盖前缀根、子路径与不支持的方法；metrics 请求不得触发 Session 查询、D1/DO、Stripe 或业务聚合。
- 显式校验真实请求方法为 `GET`。安装依赖后实测 Hono 对 HEAD 的处理；不能假设只注册 `.get()` 就会拒绝 HEAD。
- 凭据通过后：已知健康路径的非 GET → 405（`Allow: GET`）；未知只读路径 → 404；认证失败仍 401；限流 429。HEAD/OPTIONS 不返回成功状态或元数据，OPTIONS 不开放跨域。
- metrics Bearer 对 `/api/admin/users`、`/api/admin/sync`、`/api/admin/users/:id/gift-plus`、账户/模型写接口、`/api/internal/server-status` 等无任何额外权限。管理员 Session 的既有读写行为不变；管理员、普通或 Plus Cookie 单独访问 metrics 均 401。

### 限流

- 复用 `API_LIMIT`（120 次/60 秒），独立 metrics 键，不改绑定和现有路由配额。
- 每个 Cloudflare 节点内：每 IP 120/60s；认证成功后共享专用凭据 120/60s。先按 `cf-connecting-ip`（缺失用固定的本地/未知桶，不信任任意转发头）限流，再认证，成功后才扣凭据额度；无效凭据不得消耗有效凭据配额。
- 键中不得包含原始 token；单凭据使用固定 scope 键。
- 触顶 429 + `Retry-After: 60`，无成功元数据。绑定缺失或限流抛错 → 503 并记录固定原因，异常时不得放行。
- 文档必须说明这是节点级限流，不是全球严格配额。

### 审计

- 结构化字段白名单：带时区的 ISO 时间、固定路由模板、方法、实际状态、是否限流、固定枚举原因。覆盖成功、401、404、405、429、503 与内部异常。
- 只记录 `/api/metrics/health` 或 `/api/metrics/*` 固定模板；不得记录原始 URL、query、动态路径、Authorization、Cookie、请求/响应正文、邮箱、用户名、用户/订单/微信标识、`error.message`/stack；无需记录原始 IP 或 token 指纹。
- 沿用 Workers Logs，不新增存储。

## 文件与冲突面

- 新增：`src/server/metrics.ts`，专用测试（建议 `test/metrics.test.ts`，必要时拆分 audit 用例）。
- 接线：`src/server/index.ts`（高冲突面；以最新 `main` 为基线，只做最小挂载）。
- 文档：`docs/configuration.md`、`docs/deployment.md`、`.dev.vars.example`。
- 相关回归：`test/admin.test.ts`、`test/auth.test.ts`、`test/analytics.test.ts`、`test/analytics-auth.test.ts`、`test/billing.test.ts`、`test/wechat-receiver.test.ts`、`test/server-status.test.ts`，以及实际改动涉及的模型/执行路由测试。
- 上游 `main` 近期在 `src/server/index.ts` 增加 Grok 上传路由（同在 bodyLimit 前），与本卡只在挂载点相邻；不与其他卡共享代码依赖。若后续指标卡复用本契约，以上线后的契约文档为准，不在本卡实现。

## 验收标准

1. **凭据/401**：无 Authorization、错误 token、空/过短 Bearer、服务端 Secret 未配置/空白/过短 → 401；无业务字段与成功元数据。
2. **Cookie 隔离**：有效管理员、普通用户、Plus 用户 Cookie 无 Bearer → 401；Cookie + 错误 Bearer 仍失败。使用真实测试 Session fixture，不用伪造 Cookie 字符串冒充。
3. **成功路径**：专用 Bearer 且无 Cookie → 200；字段白名单、`documentationVersion`、时区、`Cache-Control: no-store` 正确；用绑定 spy 证明未调用 Session/DB/DO/Stripe。
4. **支付模式**：test/live/缺失/无法识别四类配置只返回明确模式或 `available:false` + 原因；不得把配置模式解释成支付就绪。
5. **方法/路径**：HEAD/OPTIONS/POST/PUT/PATCH/DELETE、前缀根、未知子路径均无成功元数据和写入；已知路径非 GET 为 405（`Allow: GET`），未知路径 404，与文档一致。
6. **最小权限**：仅 metrics Bearer 访问后台 users/sync/gift-plus、模型/账户写、内部写路由无额外权限；已有管理员 Session 路径按原规则工作。
7. **限流**：IP 与有效凭据分别触顶 → 429 + `Retry-After`；无效凭据不消耗有效凭据额度；`API_LIMIT` 抛错/缺失 → 503 + 固定原因，无成功体。
8. **审计**：捕获成功、401、404、405、429、503 与异常；在 header、Cookie、查询串、未知路径和异常文本中注入测试哨兵，验证该前缀发出的全部日志不含哨兵或个人信息。
9. **回归**：上述测试文件全部通过；直接断言 `/api/health` HTTP 行为，不拿分析路径的排除单测代替探活测试。
10. **命令**：在 load 与 `MemAvailable` 允许时串行运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（或仓库要求的 `pnpm check`）；记录 base/head SHA、命令与退出结果。重活并行或内存 < 2 GiB 时等待并说明。
11. **凭据卫生**：代码、示例、测试只出现空占位或显式 test-only 值；不加载真实 metrics token；用现有 secrets scan 复核。
12. **文档**：说明变量名、最小权限、独立生成、本地独立值、401/404/405/429/503 语义、节点级限流范围、日志字段、响应 schema、单凭据替换式轮换，以及生产配置示例（仅文档，不执行）。
13. **公开树隔离**：本文与测试产物留在 `internal-docs/`，不进入 `docs/`、`doc/`、`public/`、文档 bundle 或 `/api/docs`。

## 提交与评审

一个分支、一个 draft PR，提交信息含 `affc0518`：

- A：凭据、前缀/方法边界、元数据白名单、鉴权与隔离测试。
- B：限流、完整脱敏审计、限流/异常/日志测试。
- C：配置/部署文档与 `.dev.vars.example` 空占位，补文档契约验证。

每个提交单独 review，记录 SHA 与结论；不把前一 SHA 的结论套到新 SHA。最终对完整 diff、隔离性与回归证据复核。合并、部署和写生产 `METRICS_API_TOKEN` 均需另行授权；本文不代表这些授权已获得。

## 依赖与 PR 负责人

- 任务级依赖：无。无 `blocked_by`，可与无关卡并行。
- 复用依赖：`API_LIMIT` 绑定、`secret()` 读取、`billingMode()` 语义、现有 Workers Logs 与测试 fixture 机制；不改它们的行为。
- PR 负责人：本卡实现者负责按本文件实现、提交与跑检查；draft PR 由「评审通过」步骤的唯一 PR agent 创建；本卡不合并、不部署。

## 实施与复核现状（2026-11-23，需求评审复核）

> 本节由后续会话追加。前面「结论与原子性」中的基线 `b36ca2c` 是评估时快照，已被下面的实施基线取代。

- 分支：`feature/wechatai-api-token-3kh`，实施基线 `origin/main` `708e3e1`；复核基线为代码 HEAD `c14d9268cbe213bd8be60c32d98904c0cc1243df`（本节状态记录提交在其后，只改本文件），工作树干净，与 origin 同名分支同步。本轮未 fetch，`origin/main` 缓存仍为 `708e3e1`，不称其为远端最新。
- 提交（均含 `affc0518`）：`c355f06` 需求文档；`15235e7` 专用 Bearer、前缀/方法边界、元数据白名单与隔离测试；`26d1ebf` 限流、脱敏审计与对应测试；`d21bd07` 配置/部署文档与空占位；`3de5eb7` 公共 `/api/health` 回归；`f90a8c1` 仓库格式化；`bc8044a` 区分 Secret 写入与部署的文档措辞；`c14d926` 真实 Session 与写路由隔离测试。
- 实现：`src/server/metrics.ts`（只读入口；独立 `METRICS_API_TOKEN`；SHA-256 摘要恒定时间比较；IP 先限流、有效凭据后限流；503 fail-closed；字段白名单审计）；`src/server/index.ts` 仅在通用 bodyLimit 与 Session 中间件之前挂载 `/api/metrics` 与 `/api/metrics/*`；文档与 `.dev.vars.example` 空占位。
- 本轮在 HEAD `c14d926` 复核（load 3.38，MemAvailable 约 20 GiB）：`pnpm exec vitest run test/metrics.test.ts` 15/15 通过；`pnpm lint` exit 0；`pnpm typecheck` exit 0；`pnpm check:public` 通过（1062 个文件，未打印密钥）。`git diff origin/main...HEAD` 为 7 个文件、+810/−1；扫描未发现真实凭据。
- 未在本轮执行：全量 Workers/客户端测试与 `pnpm build`。实现会话已在 `f90a8c1` 记录其通过；其后提交仅文档与测试。CI 与生产结果未知。
- 状态：实现与验收矩阵已由 `test/metrics.test.ts` 覆盖，剩余为独立评审、适用 CI 与 PR。未合并、未部署、未写生产 Secret、未验证生产可读性；即使健康路由 200 也只证明元数据鉴权。
- 流转：本卡此前被移回「需求评审」；因实现已完成，本轮不重复实现，直接移交「待评审」。
