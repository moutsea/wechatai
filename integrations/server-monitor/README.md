# 服务器状态采集

Node.js 22+，无第三方依赖。独立于收消息与模型执行服务运行，每 30 秒向站点上报一次；不需要开放端口，也不读取业务密钥、聊天内容或日志。

管理员在 `/app/admin?tab=server` 查看 CPU 区间使用率、1/5/15 分钟负载、内存、根分区磁盘、系统运行时间，以及本机 18180/18181 两个服务的健康检查和进程累计计数。计数在对应服务重启后重置；它们不是全站订单或调用统计。Linux 内存使用 `MemAvailable`，包括可回收缓存。磁盘占用包含保留空间。超过 90 秒未收到报告时标记过期，不能据此断定机器宕机（也可能是网络或采集器故障）。只保存最新快照，不提供历史趋势和告警推送。

## 安装

1. 应用 D1 迁移 `0013_server_status.sql`，部署包含上报与管理员读取接口的 Worker。
2. 生成独立随机密钥（例如 `openssl rand -hex 32`），通过 `pnpm cf:production secret put SERVER_MONITOR_SECRET` 写入 Worker。不要复用 receiver/executor 的密钥。
3. 将本目录的 `main.mjs`、`collector.mjs` 放到 `/opt/wechatai-monitor/releases/<version>/`，建立 `/opt/wechatai-monitor/current` 软链接指向此目录。目录和代码需允许 systemd 的动态用户读取。
4. 参考 `.env.example` 创建 `/etc/wechatai-monitor.env`，权限 `root:root 0600`。填入同一密钥、站点 HTTPS 根地址和服务器显示名称。systemd 负责注入环境变量，不要将凭据写入源码。
5. 安装 `wechatai-monitor.service` 到 `/etc/systemd/system/`，执行 `systemctl daemon-reload`、`systemctl enable --now wechatai-monitor`。无需重启消息接收或模型执行服务。
6. 打开管理后台的「服务器」，确认更新时间持续变化。排查用 `systemctl status wechatai-monitor` 和 `journalctl -u wechatai-monitor`；日志仅记录状态码，不输出密钥。

`node main.mjs --print` 仅采集并输出本机一次状态，不需要密钥，也不会发送报告。停用采集器：`systemctl disable --now wechatai-monitor`；90 秒后页面保留最后快照并标记过期。密钥轮换需同时更新 Worker 和采集器。

## 权限与开销

上报端点 `/api/internal/server-status` 只接受独立 Bearer 凭据；管理员登录会话不能写入。读取端点 `/api/admin/server-status` 仅允许 admin allowlist 中的账号，普通用户、Plus 会员和上报凭据均不能读取。数据严格校验，旧报告不能覆盖新快照，整个表固定最多一行。

每台服务器每天约 2,880 次短 Worker 请求和 D1 快照更新；页面可见时每 30 秒读取一次。无 Durable Object 唤醒或常驻等待。当前版本接入单台消息服务器，多台采集器不要共用此端点，否则会互相覆盖。
