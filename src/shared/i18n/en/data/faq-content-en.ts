import type { FaqDocSection } from "../../../faq-doc";

/** English `/en/docs/faq` answers, also used by the FAQPage structured data. */
export const EN_FAQ_SECTIONS: FaqDocSection[] = [
  {
    id: "no-reply",
    group: "Connection and replies",
    title: "It connects, but why do I get no reply?",
    body: `First send the free \`/wx help\` command in WeChat. No command reply does not necessarily mean Wechatai did not receive the message. Confirm you are messaging from the WeChat account that scanned the code, then open [WeChat connection](/app/wechat) to check the link's connection status, latest message time and error hints. If authorization expired, scan again following [connection troubleshooting](/en/docs/wechat-connection#reconnect). If phone WeChat has no ClawBot entry, update WeChat first; this site cannot enable an entry that is missing.

If commands reply but the model does not, test the connection under [Channels & models](/app/channels) and check the protocol, service address, API key, actual model ID and provider balance. The test sends a fixed short sentence and charges a small amount of Wechatai credits only when it succeeds. Insufficient Wechatai balance means no upstream call; an upstream failure charges no Wechatai credits, and provider API fees are separate. See [model testing](/en/docs/channels-models#import) for configuration and troubleshooting. Use the final public HTTPS endpoint, not a web page that redirects.

OpenClaw and Hermes also need the host online and the connector working. When the computer sleeps or shuts down, the Agent cannot process messages. For Xiaowei tasks, check status on the [cloud tasks page](/app/tasks).`,
  },
  {
    id: "reply-window",
    group: "Connection and replies",
    title: "Why did a reminder or result not arrive after 24 hours?",
    body: `WeChat ClawBot replies must be delivered within 24 hours of the user's message. After the window closes, scheduled reminders, Agent background results or delayed replies may fail to send; this does not mean the model produced no content.

Return to the **original WeChat conversation** and send \`/wx help\` to refresh the reply window; no new scan or token reset is needed. If a notification is already queued, check “Recent deliveries” (“最近投递”) first: pending notifications retry automatically, so do not submit again. If you are unsure whether a request was accepted and must resubmit, use the same \`Idempotency-Key\` and request body. Expired tasks are not guaranteed to be resent; local Agents such as OpenClaw and Hermes also need the device and process online.`,
  },
  {
    id: "model",
    group: "Models and context",
    title: "The model describes itself differently from my configuration?",
    body: `A model's description of its own name and version may be inaccurate and may be influenced by the system prompt. Trust the actual model ID in the workspace configuration and the information shown by \`/wx status\`; \`/wx models\` lists the text model numbers in the current channel.

Wechatai's default system prompt does not require the model to hide its identity; you can view, edit or clear it in model settings. After changing it, send \`/wx reset\` to remove the influence of old context. If replies still miss the point after switching channel or model, confirm the configuration used by the current WeChat session, then create a session and ask again.`,
  },
  {
    id: "limits",
    group: "Models and context",
    title: "The question is short, so why does it say input is too long?",
    body: `Input is not only this sentence; it may include the system prompt, history summary, recent conversation, character settings and attachments. Check the [model input and context settings](/en/docs/channels-models#limits), then try a new session or reset the context.

When a long conversation approaches 80% of the usable input space, Wechatai summarizes earlier content and keeps roughly the last four turns. A summary may miss details, so repeat important requirements. If the upstream still reports a context overflow, Wechatai trims the context and retries once. When the system prompt, a single message or an attachment itself exceeds the limit, shorten the content, split it or adjust the model limit. Before raising a limit, confirm the context length the upstream model actually supports. See [Sessions and context](/en/docs/sessions#context) for more.`,
  },
  {
    id: "connection-test",
    group: "Models and context",
    title: "The connection test fails. What should I check?",
    body: `Under [Channels & models](/app/channels), click Test connection. Wechatai sends the fixed sentence “Please reply only: connection successful” (“请只回复：连接成功”) to verify the protocol, address, key and model ID. A successful test charges a small amount of Wechatai credits. Insufficient Wechatai balance means no upstream call; an upstream failure charges no Wechatai credits, and provider API fees are separate.

Common messages map to locations: authentication failure means check the API key and permissions; a bad address means check the final HTTPS address, path and protocol; model not found means compare the provider's actual model ID; upstream rate limits can be retried later; insufficient upstream balance means check the provider account. Insufficient Wechatai credits means wait for the daily refresh or top up.`,
  },
  {
    id: "attachments",
    group: "Attachments, plugins and tasks",
    title: "An attachment will not send or read. What now?",
    body: `Images and file processing require Plus; images also need the selected model to support vision input. Send the attachment first, then send text instructions after “Staged” (“已暂存”) appears. Up to four per batch, each up to 5 MB, combined up to 8 MB, PDFs up to 100 pages, and extracted text up to 100,000 characters per file.

Staging lasts 15 minutes, does not call a model and costs no credits. Switching models, plugins or sessions clears it. If it reports too large or an unsupported format, send \`/wx cancel\`, then send a compressed or converted attachment. Scanned PDFs need text recognition first; save legacy \`.doc\` files as \`.docx\`.

Xiaowei clears the batch when it accepts a task, so a retry requires resending the attachment and full instructions; adding one line of text does not attach the original file.`,
  },
  {
    id: "notification",
    group: "Attachments, plugins and tasks",
    title: "Can I receive only notifications without a model?",
    body: `Yes. The notification plugin sends orders, alerts or script results to WeChat through a webhook. It needs no model API key, pushes cost no credits, and Free can configure one plugin.

Create a notification configuration on the [plugins page](/app/plugins), copy the dedicated token, then send an HTTP request to the endpoint. Pushes are still limited by the 24-hour reply window after the latest WeChat interaction; after it expires, send \`/wx help\` in the original conversation to refresh it. Accepted but undelivered notifications are kept for up to 24 hours, and status is visible under “Recent deliveries” (“最近投递”). During a network interruption, exactly-once delivery cannot be promised.`,
  },
  {
    id: "privacy",
    group: "Privacy, account and membership",
    title: "Who receives my chat records?",
    body: `The content you send and the context needed for a reply go to the selected model or plugin. Wechatai is an independent product and not an official WeChat or Tencent service. Model services come from the provider you choose; OpenClaw, Hermes and other Agents manage their own files and memory.

Clearing or deleting a session in Wechatai deletes platform messages and related task content, but does not delete data kept by the WeChat client, model provider or Agent. Personal assistant notes, expenses and reminders must be deleted separately on the assistant page; disconnecting WeChat does not clear platform chat records automatically. See the [privacy policy](/privacy) for details.`,
  },
  {
    id: "key-storage",
    group: "Privacy, account and membership",
    title: "Where are API keys stored, and how do I revoke them?",
    body: `Channel model API keys, plugin search API keys and WeChat connection credentials are stored encrypted on the server. Saved upstream API keys are never shown in plaintext when viewing configuration. This is not end-to-end encryption: the server can obtain the plaintext credentials needed to make a request.

The notification token is a different credential: it is fully shown once when generated or reset, so copy it immediately and store it safely; it is not shown again after closing the dialog.

Create a dedicated key for Wechatai with a spending limit instead of reusing your main account key. To replace it, change or delete the channel in channel settings; after deletion the old credential is not used for new requests. If a key leaks, revoke it in the provider console first, then update the Wechatai configuration.`,
  },
  {
    id: "membership",
    group: "Privacy, account and membership",
    title: "After membership expires, are configuration and records kept?",
    body: `Yes. The account returns to Free, and only the earliest-created plugin keeps an allowance. Xiaowei still requires Plus even if it occupies that allowance and cannot accept new tasks. Other plugins beyond the limit, web session history, attachment processing and link counts are paused or limited under Free rules, while configuration and data are retained.

Existing cloud tasks and results can still be viewed and stopped on the [cloud tasks page](/app/tasks). Membership expiry requests a stop for in-flight tasks; if a valid result completed first, it is still settled by the final result. After renewal you can submit new tasks, but old tasks are not rerun automatically. See [Connect WeChat](/en/docs/wechat-connection#multiple) for multiple links.

If a problem remains, [contact us](/contact). Include the original error text and when it happened; never send API keys, connection secrets or account passwords.`,
  },
];
