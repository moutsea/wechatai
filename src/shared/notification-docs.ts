export const notificationSections = [
  {
    id: "setup",
    title: "创建一组消息提醒",
    body: `消息提醒不调用模型、不消耗 credits。Free 用户最多配置 1 个插件，Plus 会员插件配置数量不限。适合接收支付成功、服务告警和脚本执行结果。

1. 先在[微信连接](/app/wechat)中扫码绑定，然后向对应微信对话发送一条消息。
2. 打开[插件](/app/plugins)，找到「消息提醒」，填写通知来源名称并选择接收微信。
3. 点击「保存并设置 Token」，在打开的「专属 Token」区域点击「生成专属 Token」，复制到你的服务端。Token 只在生成时展示，请及时保存。以后可从消息提醒卡片上的「设置 Token」或「管理 Token」重新打开。

无需配置 LLM 渠道，也不需要发送 /use。通知不会切换你正在使用的模型或插件。不同项目可以建立不同配置、使用不同 Token。`,
  },
  {
    id: "send",
    title: "发送第一条通知",
    body: `向 \`POST /api/notify\` 发送 JSON，并在 Authorization 请求头中提供 Bearer Token。正式站地址为 \`https://wechatai.app/api/notify\`；本地测试请使用本地站点地址和本地 Token。


\`\`\`bash
curl 'https://wechatai.app/api/notify' \\
  -H "Authorization: Bearer $WECHATAI_NOTIFY_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: order-20261010-001' \\
  -d '{"title":"收款成功","text":"订单已支付，金额 ¥9.90"}'
\`\`\`

title 为可选标题，最多 120 字；text 为必填正文，最多 4000 字。支持换行和 Markdown 文本，暂不接收图片、附件或远程文件 URL。请求体最大 32 KB。

也兼容飞书的文字消息结构，鉴权仍使用微伴 Token：

\`\`\`json
{"msg_type":"text","content":{"text":"KimiSeek 收款成功\\n订单：order-001\\n支付金额：¥9.90"}}
\`\`\`

这是兼容文字消息格式，不能直接替换要求飞书签名校验的 SDK 地址。不要附带飞书的 timestamp 或 sign 字段。`,
  },
  {
    id: "receipt",
    title: "确认是否送达，以及请求重试",
    body: `首次接收成功返回 HTTP 202，例如：

\`\`\`json
{"id":"消息 ID","status":"pending","duplicate":false}
\`\`\`

**202 表示消息已保存并等待发送，不代表微信已经收到。** 使用相同 Token 请求 GET /api/notify/消息ID 查询结果，也可在配置弹窗中刷新「最近投递」。只有 state 为 sent 时，表示微信接口已确认发送成功。

| state | 含义 |
| --- | --- |
| pending | 等待发送或重试 |
| sending | 正在发送 |
| sent | 微信接口已确认发送成功 |
| failed | 超过保留时间，或绑定等配置已失效 |
| cancelled | 配置停用、接收微信变更或 Token 撤销 |

Idempotency-Key 是你为每个业务事件分配的唯一编号，例如订单 ID。同一事件重试时保持编号、标题和正文不变，7 天内不会创建第二条消息；相同编号但内容不同会返回 409。新的事件必须换一个编号。不提供此请求头，每次请求都会创建一条新消息。

请求失败或超时后，可以用相同的 Idempotency-Key 重试。推送失败会在后台重试，最长保留 24 小时；每次使用相同微信 client_id 降低重复投递的可能，但网络中断时无法承诺绝对只出现一次。

接口和页面保留近 7 天的投递结果；正文发送成功或终止后会清除。通知不写入模型会话，也不会影响 AI 的上下文。`,
  },
  {
    id: "limits",
    title: "额度、权限与常见错误",
    body: `每个账户所有消息提醒配置合计：每分钟最多 30 条，滚动 24 小时最多 1000 条，待发送最多 100 条。配置 Token 即授予向指定微信推送的权限，请只在可信服务端使用，不要放在网页前端或公开仓库。

| HTTP 状态 | 处理方式 |
| --- | --- |
| 400 | 检查 JSON 字段、长度及 Idempotency-Key 格式 |
| 401 | Token 无效、已重置或已撤销 |
| 403 | 插件已停用，或超出当前套餐的配置上限 |
| 404 | 配置或投递记录不存在，或记录已超过 7 天 |
| 409 | 先连接微信并发送一条消息；或同一幂等编号对应了不同内容 |
| 413 / 415 | 请求体过大，或没有使用 application/json |
| 429 | 请求过于频繁或达到通知额度，请稍后重试 |
| 503 | 暂时无法处理，请保留相同幂等编号再试 |

Plus 到期后最早创建的 1 个插件仍可使用。超出 Free 配置上限的消息提醒插件不再接受新通知，已接收的通知暂停投递，超过 24 小时失效。停用、删除配置、更换接收微信或撤销 Token，会取消尚未发送的通知。重新绑定微信后，旧通知不会转发给新的绑定对象。

重置 Token 会立即使旧 Token 失效，已接收的通知继续发送；若需要同时取消待发通知，请使用「撤销 Token」。已经发出的消息无法撤回。`,
  },
];

export const notificationGuide =
  "# 消息提醒 HTTP 接入\n\n" +
  notificationSections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n");
