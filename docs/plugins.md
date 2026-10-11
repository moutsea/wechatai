# 插件开发

[返回 README](../README.md)

微伴将渠道和功能分开：渠道提供模型连接，插件提供处理能力。相同的调用、限额、会话和结果校验由平台网关处理。

## 协议入口

- 源码协议：[plugin-protocol-v1.md](../design/plugin-protocol-v1.md)
- 网页：`/developers/plugins`
- Markdown：`/developers/plugins.md`
- JSON API：`/api/plugins/protocol`
- JSON Schema：`/api/plugins/protocol/1.0/schema.json`
- Agent 索引：`/llms.txt`

自部署后使用自己的域名。公开文档无需登录、不会暴露用户配置。协议 API 的 `availability` 区分已实现和预留能力。

## 开发一个内置插件

1. 在 `src/shared` 定义 Manifest、配置和结果 Schema，明确输入输出能力。
2. 在 `src/server/plugins` 实现处理逻辑，在账户配置与调用路由中接入。
3. 配置 API 验证用户权限、套餐和资源所有权；加密存储 Key，不回传明文。
4. 通过现有网关完成输入输出限制和计量，插件不直接修改钱包。
5. 补充账户隔离、幂等、失败恢复和文档示例测试，再增加前端配置界面。

Manifest 本身不会自动获得网络、文件或执行权限。当前没有用户上传代码、通用第三方插件执行环境或插件市场，不要把协议预留字段当成已开放接口。

## Agent 连接器

[OpenClaw](../integrations/openclaw/README.md) 与 [Hermes](../integrations/hermes/README.md) 使用原生 channel / platform 适配器。用户侧向微伴发起连接，不需要将本机 Gateway 暴露到公网。运行模型、工具、长期记忆和定时任务均留在 Agent 环境。

连接器处理配对、任务认领、独立会话路由、结果发件箱和主动推送。需要保留命令通道、配对重试证明、租约和幂等语义，不能简单换成一次 HTTP 请求。

## 消息提醒

仅接收 HTTP 并转发微信，使用插件专属 Token，无模型调用、无额外 credits 消耗。公开协议位于 `/developers/notifications.md` 和 `/api/plugins/notifications`。

```sh
curl https://YOUR_DOMAIN/api/notify \
  -H "Authorization: Bearer $WECHATAI_NOTIFY_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: your-event-unique-id' \
  -d '{"title":"任务完成","text":"今天的报告已经生成。"}'
```

HTTP 接收成功不代表微信已送达。用返回的 `id` 请求 `GET /api/notify/{id}` 查询回执；重试同一事件沿用相同幂等键和内容。
