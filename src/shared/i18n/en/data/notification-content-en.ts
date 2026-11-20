import type { DocSection } from "../../../docs";

type NotificationDocSection = DocSection & {
  details?: readonly { title: string; body: string }[];
};

/** English notification guide; mirrors the five sections of the Chinese source. */
export const EN_NOTIFICATION_SECTIONS: NotificationDocSection[] = [
  {
    id: "setup",
    title: "1. Connect WeChat and generate a dedicated token",
    body: `1. Follow [Connect WeChat](/en/docs/wechat-connection#connect) to scan and bind, then send the free \`/wx help\` command in the matching WeChat conversation.
2. Open the [plugins page](/app/plugins), configure “Notifications” (“消息提醒”), enter a source name, choose the receiving WeChat and enable it.
3. Click “Save and set token” (“保存并设置 Token”), then “Generate dedicated token” (“生成专属 Token”), and store the token on your server. **The token is shown only when generated, so save it immediately.**

No model configuration is needed, and you do not send \`/use\`; notifications do not switch the current model or plugin.

**Pushes are limited by the 24-hour WeChat reply window after the latest interaction.** After it expires, send \`/wx help\` in the original WeChat conversation to refresh the window; there is no need to scan again or reset the token.`,
  },
  {
    id: "send",
    title: "2. Send your first notification",
    body: `Put the token in the server environment variable \`WECHATAI_NOTIFY_TOKEN\` and send an HTTP request:

\`\`\`bash
curl --fail-with-body 'https://wechatai.app/api/notify' \\
  -H "Authorization: Bearer $WECHATAI_NOTIFY_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: order-001' \\
  -d '{"title":"收款成功","text":"订单已支付，金额 ¥9.90"}'
\`\`\`

\`text\` is the required body; \`title\` is optional. \`Idempotency-Key\` prevents duplicate notifications on retries: **use a new value for each new event and keep the same key and content when retrying the same event.**

HTTP **202 only means the request entered the queue**; confirm separately whether WeChat delivered it. For local testing, use the local site address and a local token.`,
    details: [
      {
        title: "Which fields and message formats are supported?",
        body: `Titles up to 120 characters, body up to 4,000 characters, request body up to 32 KB. Line breaks and Markdown text are supported; images, attachments and remote file URLs are not.

The Feishu text-message structure is also accepted, still authenticated with the Wechatai token:

\`\`\`json
{"msg_type":"text","content":{"text":"收款成功\\n订单：order-001\\n金额：¥9.90"}}
\`\`\`

This is text-format compatibility only. It cannot replace a Feishu SDK endpoint that requires signature verification, and you must not include \`timestamp\` or \`sign\` fields.`,
      },
    ],
  },
  {
    id: "build-notification",
    title: "Optional: notify yourself after a successful build",
    body: `Put the request in CI, a payment callback or a scheduled script. Store the token as a private platform secret, and **use it only on trusted servers—never in front-end code, a repository or logs**.`,
    details: [
      {
        title: "See a GitHub Actions example",
        body: `Inject the private secret \`WECHATAI_NOTIFY_TOKEN\` as an environment variable of the same name, then add the command below to a step after a successful build:

\`\`\`bash
curl --fail-with-body 'https://wechatai.app/api/notify' \\
  -H "Authorization: Bearer $WECHATAI_NOTIFY_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -H "Idempotency-Key: build-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \\
  -d '{"title":"构建完成","text":"CI 构建已通过，请到代码仓库检查产物。"}'
\`\`\`

Keep the same key for retries of the same build event. A successful script only means the request was accepted; query the final delivery status, and the WeChat reply window must still be valid. Pushes call no model and cost no credits.`,
      },
    ],
  },
  {
    id: "receipt",
    title: "3. Confirm delivery",
    body: `A successful acceptance returns a message ID:

\`\`\`json
{"id":"message ID","status":"pending","duplicate":false}
\`\`\`

Open “Recent deliveries” (“最近投递”) in the notification configuration and refresh, or request \`GET /api/notify/messageID\` with the same token. Only \`state: sent\` means **the WeChat API confirmed sending**; it does not mean the user read it.`,
    details: [
      {
        title: "The request timed out. How do I retry without duplicates?",
        body: `Keep the same \`Idempotency-Key\`, title and body; no second message is created within seven days. The same key with different content returns 409. Without the header, every request creates a new notification.

The backend retries failed sends for up to 24 hours and reuses the WeChat \`client_id\` to reduce duplicates. During a network interruption, exactly-once delivery still cannot be promised.`,
      },
      {
        title: "What delivery states exist, and how long are records kept?",
        body: `| state | Meaning |
| --- | --- |
| pending | Waiting to send or retry |
| sending | Sending |
| sent | The WeChat API confirmed sending |
| failed | Retention expired, or the binding and other configuration became invalid |
| cancelled | The configuration was disabled, the receiving WeChat changed or the token was revoked |

Delivery records are kept for seven days, and the body is cleared after sending succeeds or terminates. Notifications are not written into model sessions or AI context.`,
      },
    ],
  },
  {
    id: "limits",
    title: "4. Quotas and common questions",
    body: `Free can configure one plugin; Plus has no plugin limit. Neither plan charges credits for notification pushes; see [membership benefits](/en/docs/credits#plans). Across all notification configurations on an account: **30 per minute**, **1,000 per rolling 24 hours**, and at most **100 pending**.

A token is the credential for sending notifications to a specific WeChat account, so keep it safe. To stop both the old token and pending notifications, use “Revoke token” (“撤销 Token”); simply resetting the token invalidates the old one, while accepted notifications continue sending.`,
    details: [
      {
        title: "When a request fails, what should I check first?",
        body: `| HTTP status | What to do |
| --- | --- |
| 400 | Check JSON fields, lengths and idempotency-key format |
| 401 | Token invalid, reset or revoked |
| 403 | Plugin disabled or over the plan's configuration allowance |
| 404 | Configuration or delivery record missing, or older than seven days |
| 409 | Connect WeChat and send a message first; or check whether the idempotency key maps to different content |
| 413 / 415 | Request body too large, or not using application/json |
| 429 | Rate or notification limit reached; retry later |
| 503 | Temporarily unavailable; retry with the same idempotency key |

If it returned 202 but no message appeared, check “Recent deliveries” first, then the WeChat connection and 24-hour reply window.`,
      },
      {
        title: "What happens if I disable the plugin, change WeChat or Plus expires?",
        body: `Disabling or deleting the configuration, changing the receiving WeChat or revoking the token cancels unsent notifications. After rebinding WeChat, old notifications are not forwarded to the new target, and already-sent messages cannot be recalled.

After Plus expires, the earliest-created plugin configuration remains usable. Notification configurations beyond the Free allowance stop accepting new requests, and accepted notifications pause and expire after 24 hours.`,
      },
    ],
  },
];
