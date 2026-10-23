# 微信收消息服务

可选的常驻 Node.js 服务。它接收微信消息，把真实消息转发给 Cloudflare 上的账户 Durable Object，并在处理消息期间维护微信的“正在输入”状态。空长轮询在服务器上完成，不调用模型、不处理计费、不运行提醒调度。

## 接入与回退

- 服务每 30 秒从 Worker 拉取启用的账户列表，并主动建立入站到 DO 的休眠 WebSocket。服务器无需开放公网端口。
- 微信凭据通过专属运维密钥保护的 TLS 连接交付，只保存在进程内存。此密钥可访问收消息凭据，必须按生产密钥管理，不能交给用户或放进前端。
- 空响应的游标仅写本机；真实消息先写入本机持久目录，再等待 DO 持久化消息与处理 alarm 后的确认。确认丢失或进程重启会重放同一批次，DO 按微信消息 ID 去重。
- 服务器断连后，DO 自动恢复原来的微信轮询。无关闭通知的网络中断由 60 秒心跳租约检测；已在执行的账户任务可能推迟接管。回退期间会重新产生轮询时长费用。
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

## 验证

```sh
npm ci --ignore-scripts
npm test
# 在项目根目录验证账户接收、去重、回退和原有业务：
pnpm test
```

OpenClaw/Hermes 的 HTTP 长轮询也已调整：等待位于普通 Worker，DO 使用休眠 WebSocket 通知新任务，现有连接器无需升级。本服务无需处理 Agent 的密钥或任务内容。
