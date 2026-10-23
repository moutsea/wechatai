# 微信消息耗时任务执行器

将微信聊天中的模型请求、自动摘要、搜索、网页读取、生图请求及下载、附件下载与解析移到独立 Node.js 服务。Cloudflare 负责权限、会话、个人助理记录、提醒、credits 结算与微信投递。网页端的模型连接测试仍在 Cloudflare 执行。

这不是用户上传代码的运行环境。服务只执行本站生成的受限 HTTP/附件任务，不接受任意脚本。模型请求和密钥在账户 Durable Object 内加密保存，领取时通过 HTTPS 交给执行器。Node 不持久化请求或密钥；尚未确认收妥的结果会临时保存在权限为 0700 的服务目录中，确认后删除。因此该服务器也属于持有用户数据的受信任基础设施，应做好磁盘与系统权限管理。

## 工作流程

1. 账户对象保存活动任务并登记 D1 发现表，结束请求。等待期间不保留计时器或活动网络请求。
2. 执行器每 2 秒发现并领取任务。完成回传后，优先直接领取同账号的下一步，减少多轮工具调用等待。同一账号最多一个在途任务，领取有唯一凭证。
3. 请求完成后，执行器先保存结果再回传。网络失败只重传结果，不重复请求上游。
4. 账户对象恢复已保存的处理进度。个人助理写入操作在整轮成功时一次提交，credits 也只结算一次。
5. 如果执行器在尚未持久化结果时退出，重启后将该任务标为未完成，不自动重跑可能已执行的上游操作。

任务最多等待领取 3 分钟；单次 HTTP 请求最多 5 分钟；整轮最多 14 分钟。完成回传预留最多 1 分钟，受整轮期限约束。超时失败不扣本站 credits；上游若已受理，仍可能计费。

## 部署

需要 Node.js 22.19+，可访问站点、用户配置的模型和搜索接口，以及微信文件 CDN。HTTP 请求只允许公开 HTTPS 地址，DNS 结果绑定到实际连接，拒绝内网、回环、云元数据地址和非标准端口。生成图片的跳转继续由原有上限控制。

```sh
pnpm install --frozen-lockfile
pnpm build:executor
pnpm test:executor
```

1. 先应用新增表迁移 `0012_execution_queue.sql`，然后发布网站代码。未设置以下密钥时保持原处理路径。
2. 创建独立随机密钥 `EXECUTOR_SECRET`，至少 32 字符，不能复用收消息服务或用户插件 token。
3. Worker Secret `EXECUTOR_ACCOUNTS` 最初只填测试账号的 Durable Object ID；多账号用逗号分隔。验收后可改为 `all`。
4. 将此目录的运行文件和生成的 `attachments.bundle.mjs` 放入 `/opt/wechatai-executor/releases/<version>`，更新 `current` 软链接。创建独立的 `wechatai-executor` 系统用户。
5. 将服务配置安装到 `/etc/systemd/system/wechatai-executor.service`。将下面环境变量写入 `/etc/wechatai-executor.env`，文件权限 0600：

```dotenv
WECHATAI_ENDPOINT=https://your-domain.example
EXECUTOR_SECRET=replace-with-dedicated-random-secret
EXECUTOR_CONCURRENCY=2
# 可选：仅领取这些账号；正式全量时留空
EXECUTOR_ONLY=
HEALTH_PORT=18181
```

6. 启用并启动 `wechatai-executor.service`。健康检查仅监听 `127.0.0.1:18181/health`，无需对外开放端口。

D1 发现表不保存正文、密钥或结果；即使登记暂时失败，账户对象内的任务仍保留，并通过 alarm 重试登记。执行器只向网站发起出站 HTTPS，不暴露公网任务入口。内部接口需要独立服务密钥，普通登录账号无权访问。

## 验收和更新

先在测试账号验证普通聊天、插件工具调用和图片生成；确认服务 `/health` 中 completed 增长、failed 不增长，账户任务完成且无重复扣费。再同时放开 Worker 和服务端的账号范围。只扩大服务端范围不会让未开启的账号迁移。

普通网站发布不会终止服务器上已经领取的模型请求。升级执行器时先用 `systemctl kill --signal=SIGUSR2 --kill-whom=main wechatai-executor.service` 暂停领取新任务，等待 health.active 为 0，再切换版本并重启服务，避免中断在途上游请求。接收微信消息的 `wechatai-receiver` 和独立提醒调度器不随本服务重启。

回退时先将 Worker 的 `EXECUTOR_ACCOUNTS` 设为空，阻止新任务进入；现有任务仍需让旧服务完成回传。不要直接停止有在途任务的执行器，也不要将执行器切换到旧代码无法识别的活动任务上。完成后可以停用服务，保留迁移表。

待回传文件仅用于故障恢复，不能直接删除来“重试”任务。磁盘中的 `.json` 文件必须保留直到 accepted/stale 确认。启动时会重传完成结果；只有开始标记的任务会以中断失败回传。每个任务完成后清理缓存；单轮活动缓存上限为 96 MiB。
