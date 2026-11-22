# WeChatAI Go backend

VPS 按功能承接消耗 Durable Objects 资源的工作。登录、OAuth、Stripe 支付入口和 D1 继续由 Cloudflare 提供。

按大模块划分数据所有权，应用层编排跨模块事务，小模块的原子操作显式接受同一个 `*sql.Tx`。外部调用不占用数据库事务。

- [模块、交互与迁移约束](../docs/go-backend-architecture.md)
- [实现状态、构建、发布与备份](../docs/go-backend-deployment.md)
- [完整切换所需的能力](contract/contract.json)

```sh
go vet ./...
go test -race ./...
go run ./cmd/wechatai version
```

设置 `WECHATAI_DEPLOY_MODE=standby` 可在空账户目录上发布本机健康探针。接收器、巡检和执行器仍独立运行。整账户接管需要 `check-ready` 通过，并显式切换账户路由。

### 按账号灰度微信发送

仍由 PersonalAccount 处理的账号可以单独通过 VPS 发送微信文字、图片、文件和提醒。VPS 主动连接 Worker，无需开放入站端口。收消息、生成回复和计费仍由既有链路处理。

1. 在生产 Worker 配置独立的 `WECHAT_SENDER_SECRET`（至少 32 字符）和单个 `WECHAT_SENDER_ACCOUNT`（已核对归属的 64 位账号对象 ID）。`WECHAT_SENDER_ENABLED` 默认关闭。
2. 在 VPS 的 `/etc/wechatai/wechat-sender.env` 配置同一密钥、同一账号 ID 和 HTTPS 站点 `WECHAT_SENDER_ORIGIN`，文件权限为 root 0600。安装并启用 `backend/deploy/wechatai-wechat-sender.service`。
3. 从可信环境请求 `GET /api/internal/wechat-sender/status`，携带 Bearer 密钥和 `X-Wechatai-Account`。当 `connected`、`ready` 均为真时，再将 Worker 的 `WECHAT_SENDER_ENABLED` 设为 `true`，重新核验三项状态。此探测只验证双向连接。用灰度账号在手机验证实际收件，文字回执会记录 `transport=vps`。
4. 回滚时先将 `WECHAT_SENDER_ENABLED` 设为 `false`，核验后可以停止发送器。连接中断时，发送器将错误交回现有队列，由队列沿用原消息的 client ID 决定重试。

增加账号时，将附加名单保存到 Worker 密钥 `WECHAT_SENDER_PILOTS`，格式为 `[{"account":"<64 位账号对象 ID>","token":"<独立随机密钥，至少 32 字符>","enabled":false}]`。每个账号和密钥都必须唯一。把同一份 service 文件安装为 `/etc/systemd/system/wechatai-wechat-sender@.service`，然后执行 `systemctl daemon-reload`。实例 `wechatai-wechat-sender@2.service` 读取 `/etc/wechatai/wechat-sender2.env`，变量与主实例相同，使用该账号自己的 ID 和密钥。启用实例后用该密钥完成第 3 步的探测，再仅将对应条目的 `enabled` 改为 `true`。回滚单个账号时将该条目设为 `false` 并再次探测。

### 全量微信发送出口

全量共用两个 VPS 发送进程。现有独立灰度账号继续使用原进程。其他账号及新绑定账号按账户对象 ID 固定分配出口，队列沿用同一条消息的 client ID 重试。发送器只处理微信及微信 CDN 的出站请求。

1. 配置独立的 Worker 密钥 `WECHAT_SENDER_POOL_SECRET`（至少 32 个字符），先保持 `WECHAT_SENDER_POOL_ENABLED=false`。
2. 从可信环境带上该 Bearer 密钥请求 `GET /api/internal/wechat-sender/pool`。为返回的每个对象 ID 配置一个 VPS 发送实例，例如 `wechatai-wechat-sender@pool0` 和 `wechatai-wechat-sender@pool1`。每份 root 0600 环境文件分别填写返回的 ID、共用出口密钥及 HTTPS 站点。进程沿用灰度版 Go 程序。
3. 逐个请求带对应账号头和密钥的 `/api/internal/wechat-sender/status`。两个实例都返回 `connected=true`、`ready=true` 后设置 `WECHAT_SENDER_POOL_ENABLED=true`，再次核对每个实例的三项状态及实际发送回执。
4. 回退全量时将 `WECHAT_SENDER_POOL_ENABLED` 设为 `false`，待生产探测确认后再按需停止共用进程。独立灰度账号保留自己的设置。
