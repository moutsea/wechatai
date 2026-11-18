# 微信收消息服务

可选的常驻 Node.js 服务。它接收微信消息，把真实消息转发给 Cloudflare 上的账户 Durable Object，并在处理消息期间维护微信的“正在输入”状态。空长轮询在服务器上完成，不调用模型、不处理计费、不运行提醒调度。

## 接入与回退

- 服务每 30 秒从 Worker 拉取启用的账户列表，并主动建立入站到 DO 的休眠 WebSocket。服务器无需开放公网端口。
- 微信凭据通过专属运维密钥保护的 TLS 连接交付，只保存在进程内存。此密钥可访问收消息凭据，必须按生产密钥管理，不能交给用户或放进前端。
- 空响应的游标仅写本机；真实消息先写入本机持久目录，再等待 DO 持久化消息与处理 alarm 后的确认。确认丢失或进程重启会重放同一批次，DO 按微信消息 ID 去重。
- 服务器断连后，DO 自动恢复原来的微信轮询。默认由账户 DO 检查 60 秒心跳租约；启用下方 VPS 巡检后，由 Go 集中检查连接，已在执行的账户任务可能推迟接管。回退期间会重新产生轮询时长费用。
- 重连与回退交接时，消息可以重复接收，但旧批次不能倒退新游标。独立提醒 Worker 保持原有到期调度。
- 普通模型、插件和已领取的 OpenClaw/Hermes 任务处理期间，通过微信 `getconfig` / `sendtyping` 显示“正在输入”，完成或失败后取消。刷新定时器只在本服务运行，不增加 DO 的定时唤醒；状态有 14 分钟有效期，接口失败会退避，不影响聊天。离线 Agent、附件暂存和主动通知不保持输入状态。仅使用 Cloudflare 回退收消息时暂不显示此状态。

## 部署

1. 先应用 `migrations/0011_wechat_receivers.sql`（只增加发现表，无凭据或消息内容），再发布网站代码。
2. 给网站 Worker 配置一个独立随机 `WECHAT_RECEIVER_SECRET`，至少 32 字符。`WECHAT_RECEIVER_ACCOUNTS` 填允许接管的账户 DO ID（逗号分隔），或 `all`；留空停用接管。
3. 将本目录放到服务器，例如 `/opt/wechatai-receiver/releases/<release>/`，运行 `npm ci --omit=dev --ignore-scripts`。把 `/opt/wechatai-receiver/current` 指向该版本。
4. 创建独立系统用户 `wechatai-receiver`。建立权限 `600`、root 所有的 `/etc/wechatai-receiver.env`：

   ```ini
   WECHATAI_ENDPOINT=https://your-domain.example
   WECHAT_RECEIVER_SECRET=replace-with-the-worker-secret
   # 可选：初次验证时只接管这些账户，留空接管全部已允许账户。
   WECHAT_RECEIVER_ONLY=
   HEALTH_PORT=18180
   ```

5. 安装本目录的 `wechatai-receiver.service` 到 systemd，执行 `systemctl daemon-reload` 和 `systemctl enable --now wechatai-receiver`。默认使用 `/var/lib/wechatai-receiver` 持久保存未确认消息；部署时不可删除该目录。默认内存上限 768 MB、CPU 上限 1 核，可在压测后调整。
6. 检查 `curl http://127.0.0.1:18180/health` 和 `journalctl -u wechatai-receiver`。健康信息只含连接数量、轮询/转发计数；不含凭据或聊天内容。`connected` 应与 `accounts` 一致，`polls` 应持续增加。

发布新版本时先安装依赖、测试，再原子替换 `current` 符号链接并重启服务。短暂中断会由云端接管，持久目录中的未确认消息会在恢复后补交。回退时可停止此服务，或清空 Worker 的 `WECHAT_RECEIVER_ACCOUNTS`；不需要撤销用户微信连接。

本机消息文件权限为 `600`，不保存微信 token。部署时保留；退役服务器前先确认已无待交付消息，再清理持久目录和运维密钥。单台服务器提供的是自动回退方案，不等同于多机容灾。

## 按账户把空闲连接巡检迁到 VPS

适用于一个 VPS 接收器实例及其本机 Go 巡检进程。接收器仍处理微信长轮询、落盘和消息重放。Go 每 20 秒比较本机最近收到 pong 的会话与 Worker 的 D1 登记。健康会话不会触发账户 RPC，也不需要逐账户写 D1。每轮成功扫描只更新一条共享心跳，每页读取最多 100 个到期会话。缺失的会话交给原账户核对，迟到的旧会话回报无法接管新连接。

1. 在站点的 D1 应用 `0018_receiver_watchdog.sql`，发布本版 Worker。确认生产环境已有每分钟一次的 Cron Trigger。现有接收器继续使用原协议。
2. 在代码仓库运行 `pnpm build:receiver`。它会生成 `backend/dist/linux-amd64/wechatai-receiver-<version>.tar.gz`，包含接收器、Go 二进制、依赖锁及两份 systemd 单元。arm64 VPS 构建时设置 `WECHATAI_BUILD_ARCH=arm64`。生产使用已审查、已提交的版本。
3. 按上方接收器发布步骤解压到新的版本目录，运行 `npm ci --omit=dev --ignore-scripts`，保留原状态目录并更新 `/opt/wechatai-receiver/current`。将包内的 `wechatai-receiver-watchdog.service` 安装到 `/etc/systemd/system/`。随后执行以下命令。两个服务共用现有的接收器环境文件，Go 以出站 HTTPS 访问 Worker，读取回环端口的 `/watchdog`；无需开放 VPS 入站端口或配置账户数据库密钥。

   ```sh
   systemctl daemon-reload
   systemctl enable wechatai-receiver-watchdog.service
   systemctl restart wechatai-receiver.service wechatai-receiver-watchdog.service
   ```

4. 在站点 Worker 设置 `WECHAT_RECEIVER_WATCHDOG_ACCOUNTS`，先填一个已由 VPS 接收的账户 DO ID。它支持逗号分隔的 ID 或 `all`；接收本身仍受 `WECHAT_RECEIVER_ACCOUNTS` 限制。新协议连接在 Go 最近成功巡检后才能交接，暂不可用时保留一分钟的账户巡检并自动重试。
5. 通过既有受鉴权的 `/api/internal/wechat-receiver/status/<accountId>` 核对 `delegated: true`、`watchdog: "vps"`，在 VPS 的 `/health` 核对 `supervisedSessions`。对照灰度账户启用前后的 alarm 调用、GB·s、消息量和回复延迟。只有空闲巡检会由约 1 分钟降到 15 分钟一次兜底，真实消息、回复重试、二维码和业务到期照常调度。

正常断开 WebSocket 时账户立即重排接收。整个 VPS 失联时，最近一次成功扫描超过 60 秒，Worker 在下一次分钟级 cron 开始恢复，每次最多认领 32 条；积压会延后恢复。若 D1 或 cron 同时不可用，账户还有 15 分钟的兜底闹钟。移出灰度名单可回退到原一分钟巡检，且继续使用已有 VPS 接收器和游标。停用所有 Go 巡检时可停止新的 systemd 单元。只回退监督方式时无需替换账户快照。

本地跨进程演练先运行 `pnpm test:receiver` 安装接收器依赖，再运行 `pnpm test:receiver-watchdog`。演练使用真实 Node 接收器、Go 进程、TLS、workerd、D1 与 WebSocket，微信上游及缺失 pong 由测试控制。

单账户灰度可以在同一台 VPS 另起接收器，给它设置 `WECHAT_RECEIVER_POOL=dedicated`、`WECHAT_RECEIVER_ONLY=<账户 DO ID>` 和独立的 `HEALTH_PORT`。Worker 的 `WECHAT_RECEIVER_DEDICATED_ACCOUNTS` 接受精确的账户 DO ID，控制发现列表与 WebSocket 接入。先核对共用接收器已释放该账户，再启动专用接收器并沿用同一持久目录。Go 巡检进程使用专用接收器的健康端口，可在 `backend` 下运行 `go build ./cmd/receiver-watchdog` 独立构建。回退时先停止专用接收器，移除该账户的两项名单配置，共用接收器将在下一次发现时恢复接收。

## 验证

```sh
npm ci --ignore-scripts
npm test
# 在项目根目录验证账户接收、去重、回退和原有业务：
pnpm test
```

OpenClaw/Hermes 的 HTTP 长轮询也已调整：等待位于普通 Worker，DO 使用休眠 WebSocket 通知新任务，现有连接器无需升级。本服务无需处理 Agent 的密钥或任务内容。
