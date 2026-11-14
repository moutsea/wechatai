type NotificationDocSection = {
  id: string;
  title: string;
  body: string;
  details?: readonly { title: string; body: string }[];
};

export const notificationSections: readonly NotificationDocSection[] = [
  {
    id: "setup",
    title: "一、连接微信，生成专属 Token",
    body: `1. 按[连接微信教程](/docs/wechat-connection#connect)扫码绑定，然后向对应微信对话发送免费命令 \`/wx help\`。
2. 打开[插件页](/app/plugins)，配置「消息提醒」，填写来源名称，选择接收微信并启用。
3. 点击「保存并设置 Token」，再点击「生成专属 Token」，将 Token 保存到你的服务端。**Token 只在生成时展示，请及时保存。**

无需配置模型，也不需要发送 \`/use\`；通知不会切换当前模型或插件。

**推送受微信最近互动后 24 小时的回复窗口限制。** 超时后，在原微信对话发送 \`/wx help\` 更新窗口，无需重新扫码或重置 Token。`,
  },
  {
    id: "send",
    title: "二、发送第一条通知",
    body: `把 Token 设为服务端环境变量 \`WECHATAI_NOTIFY_TOKEN\`，发送一条 HTTP 请求：

\`\`\`bash
curl --fail-with-body 'https://wechatai.app/api/notify' \\
  -H "Authorization: Bearer $WECHATAI_NOTIFY_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: order-001' \\
  -d '{"title":"收款成功","text":"订单已支付，金额 ¥9.90"}'
\`\`\`

\`text\` 是必填正文，\`title\` 是可选标题。\`Idempotency-Key\` 用于避免重试时重复创建通知：**每个新事件换一个编号，同一事件重试保持编号与内容不变。**

返回 HTTP **202 只表示已进入队列**，下一步再确认微信是否发送成功。本地测试请使用本地站点地址和本地 Token。`,
    details: [
      {
        title: "支持哪些字段和消息格式？",
        body: `标题最多 120 字，正文最多 4,000 字，请求体最大 32 KB。支持换行和 Markdown 文本，暂不支持图片、附件或远程文件 URL。

也支持飞书的文字消息结构，鉴权仍使用微伴 Token：

\`\`\`json
{"msg_type":"text","content":{"text":"收款成功\\n订单：order-001\\n金额：¥9.90"}}
\`\`\`

这只是文字格式兼容，不能直接替换要求飞书签名校验的 SDK 地址，也不要附带 \`timestamp\` 或 \`sign\` 字段。`,
      },
    ],
  },
  {
    id: "build-notification",
    title: "可选：构建成功后通知自己",
    body: `可以把请求放进 CI、支付回调或定时脚本。将 Token 存为平台的私有 Secret，**只在可信服务端使用，不放进网页前端、代码仓库或日志**。`,
    details: [
      {
        title: "查看 GitHub Actions 中的发送示例",
        body: `先把私有 Secret \`WECHATAI_NOTIFY_TOKEN\` 注入同名环境变量，再将下面命令放在构建成功后的步骤中：

\`\`\`bash
curl --fail-with-body 'https://wechatai.app/api/notify' \\
  -H "Authorization: Bearer $WECHATAI_NOTIFY_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -H "Idempotency-Key: build-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \\
  -d '{"title":"构建完成","text":"CI 构建已通过，请到代码仓库检查产物。"}'
\`\`\`

同一构建事件的请求重试保持编号不变。脚本成功只代表请求被接受，仍需查询最终投递状态；微信回复窗口也必须有效。推送不调用模型、不扣 credits。`,
      },
    ],
  },
  {
    id: "receipt",
    title: "三、确认投递结果",
    body: `受理成功会返回消息 ID：

\`\`\`json
{"id":"消息 ID","status":"pending","duplicate":false}
\`\`\`

打开消息提醒配置的「最近投递」并刷新，或携带相同 Token 请求 \`GET /api/notify/消息ID\`。只有 \`state: sent\` 表示**微信接口已确认发送**，不代表用户已读。`,
    details: [
      {
        title: "请求超时，怎样重试才不会重复创建？",
        body: `保留相同的 \`Idempotency-Key\`、标题和正文，7 天内不会创建第二条消息；编号相同而内容不同会返回 409。不提供该请求头时，每次请求都会新增通知。

后台对发送失败的通知重试，最长保留 24 小时，并复用微信 \`client_id\` 减少重复；网络中断时仍无法承诺绝对只投递一次。`,
      },
      {
        title: "投递状态有哪些，记录保留多久？",
        body: `| state | 含义 |
| --- | --- |
| pending | 等待发送或重试 |
| sending | 正在发送 |
| sent | 微信接口已确认发送 |
| failed | 超过保留时间，或绑定等配置失效 |
| cancelled | 配置停用、接收微信变更或 Token 撤销 |

投递结果保留 7 天，正文在发送成功或终止后清除。通知不写入模型会话，也不进入 AI 上下文。`,
      },
    ],
  },
  {
    id: "limits",
    title: "四、额度与常见问题",
    body: `Free 最多配置 1 个插件，Plus 不限插件数量；两种套餐的消息推送都不扣 credits，详见[会员权益](/docs/credits#plans)。每账号所有通知配置合计：每分钟 **30 条**、滚动 24 小时 **1,000 条**、待发送最多 **100 条**。

Token 相当于向指定微信发送通知的凭证，请妥善保存。需要同时停止旧 Token 和待发通知时，使用「撤销 Token」；单纯重置 Token 只会让旧 Token 失效，已受理的通知仍继续发送。`,
    details: [
      {
        title: "请求报错时，先检查什么？",
        body: `| HTTP 状态 | 处理方式 |
| --- | --- |
| 400 | 检查 JSON 字段、长度和幂等编号格式 |
| 401 | Token 无效、已重置或已撤销 |
| 403 | 插件停用或超出套餐配置名额 |
| 404 | 配置或投递记录不存在，或已超过 7 天 |
| 409 | 先连接微信并发送消息；或检查幂等编号是否对应不同内容 |
| 413 / 415 | 请求体过大，或未使用 application/json |
| 429 | 达到频率或通知数量上限，稍后重试 |
| 503 | 暂时无法处理，保留相同幂等编号重试 |

已返回 202 但没有消息时，先看「最近投递」，再检查微信连接与 24 小时回复窗口。`,
      },
      {
        title: "停用插件、换微信或 Plus 到期会怎样？",
        body: `停用、删除配置、更换接收微信或撤销 Token，会取消尚未发送的通知。重新绑定微信时，旧通知不会转发给新对象；已经发出的消息无法撤回。

Plus 到期后最早创建的 1 个插件配置仍可使用。超出 Free 名额的通知配置不再接受新请求，已受理的通知暂停，超过 24 小时失效。`,
      },
    ],
  },
];

// The downloadable integration guide includes the details hidden behind disclosures on the site.
export const notificationGuide =
  "# 消息提醒 HTTP 接入\n\n" +
  notificationSections
    .map((section) =>
      [
        `## ${section.title}\n\n${section.body}`,
        ...(section.details ?? []).map((detail) => `### ${detail.title}\n\n${detail.body}`),
      ].join("\n\n"),
    )
    .join("\n\n");
