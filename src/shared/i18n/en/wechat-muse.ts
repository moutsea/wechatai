import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-muse",
  kind: "tutorial",
  title: "Connect Muse to WeChat: setup, switching, and no-reply checks",
  description:
    "The full path for connecting a hosted Muse assistant to WeChat: scan to bind, send /wx help, generate the connection command in the plugin, hand it to Muse, register and enable the hook per SETUP.md, then send tasks with /use muse or @muse. Includes a no-reply checklist.",
  eyebrow: "Muse × WeChat",
  h1: "Connect a hosted Muse assistant to WeChat: setup, switching, and no-reply checks",
  lede: "This does not configure another model in Wechatai. It connects your existing hosted Muse assistant to WeChat: tasks run in Muse's environment, while Wechatai handles the text and the billing.",
  answer:
    "Connecting Muse to WeChat has three steps. First, scan to bind in Wechatai's WeChat connection page and send /wx help in that WeChat conversation. Second, add Muse on the plugins page, click Connect Muse to generate a command, click Copy Muse connection command, and paste it into your own Muse main chat; the command is valid for 10 minutes, so regenerate it if it expires. Muse runs the installer in a Python 3.10+ environment, then registers and enables the hook according to the generated SETUP.md (do not run it in a local terminal; a finished install or a passing dry run does not mean online). Third, after Wechatai actually polls successfully it shows Muse connected; then send /use muse in WeChat to enter the assistant, or call it once with @muse. The actual shortcut name follows your configuration. When there is no reply, check in this order: WeChat is bound → the hook is enabled → Wechatai polling succeeds.",
  primaryKeyword: "connect Muse to WeChat",
  secondaryKeywords: [
    "Muse WeChat integration",
    "Muse WeChat bot",
    "WeChat Muse plugin",
    "how to use Muse in WeChat",
    "WeChat Muse no reply",
  ],
  highlights: [
    "Reuses the existing WeChat connection; no extra model",
    "The connection command is valid for 10 minutes",
    "Text both ways; replies can carry images",
  ],
  ctaHref: "/app/wechat",
  ctaLabel: "Scan to bind WeChat",
  secondaryCta: { label: "Add the Muse plugin", href: "/app/plugins" },
  stepsSummary: "Three-step overview",
  commands: [
    { label: "Establish the reply channel", command: "/wx help" },
    { label: "Switch to Muse", command: "/use muse" },
    { label: "Call once", command: "@muse 任务内容" },
    { label: "Check the current plugin", command: "/wx status" },
  ],
  steps: [
    {
      title: "Bind WeChat and send /wx help once",
      text: "Scan to bind on Wechatai's WeChat connection page, then send /wx help in that WeChat conversation to establish a channel that can receive replies. Scanning itself needs no model configuration.",
    },
    {
      title: "Connect in the plugin, then copy the command",
      text: "Open the plugins page, add Muse, click Connect Muse to generate a one-time connection command, then click Copy Muse connection command and paste it into your own Muse main chat. The command is valid for 10 minutes; regenerate it after expiry. Do not run it in a local terminal, and do not share a command containing one-time pairing information.",
    },
    {
      title: "After it shows connected, switch in WeChat",
      text: "Muse runs the installer in a Python 3.10+ environment and registers and enables the hook according to the generated SETUP.md. Wechatai shows Muse connected only after it actually polls successfully; a finished install or a passing dry run does not count as online. Then send /use muse in WeChat, or call it once with @muse. The actual shortcut name follows your configuration.",
    },
  ],
  sections: [
    {
      id: "what",
      title: "The Muse here is a hosted assistant, not Muse Code or a model API",
      body: `Wechatai connects your **existing hosted Muse assistant**, through Muse's hook runtime:

- You must already use Muse's hosted environment and it must support hooks. The hook wakes up, claims tasks, and returns results.
- Models, tools, long-term memory, and model fees all stay on the Muse side. Wechatai does not replace them with its own ordinary chat model and does not rewrite the memory.
- You do not enter a Muse API key in Wechatai, and it does not consume a Wechatai model channel.

So this is neither a Muse Code integration nor a Muse model API integration; those are different setups. Installation, hooks, and the connector contract are in the [Muse guide](/developers/muse).`,
    },
    {
      id: "connect",
      title: "Full setup: from QR binding to the first task",
      body: "",
      details: {
        summary: "Six-step setup",
        body: `1. **Bind WeChat.** Sign in to Wechatai and scan to bind on [WeChat connection](/app/wechat). This step needs no model and no Muse setup.
2. **Establish the reply channel.** Send \`/wx help\` in the WeChat conversation you just bound; Wechatai replies with a command reference, which shows that the conversation can receive replies.
3. **Add the plugin and generate the command.** Open the [plugins page](/app/plugins), add Muse from the library, and click Connect Muse in the dialog to generate a one-time connection command. The page shows a 10-minute countdown; regenerate it in the dialog after expiry, with no need to scan again.
4. **Hand the command to Muse.** Click Copy Muse connection command and paste it into your own Muse **main chat** for execution. **Do not run it in a local terminal**; the installer must land in Muse's hosted environment, not on your computer.
5. **Let Muse register and enable the hook.** After running the installer, Muse generates \`SETUP.md\` in its environment; follow it to register and enable the hook. Installation requires Python 3.10+, uses only the standard library, and needs no extra dependencies, open ports, or Muse restart.
6. **Confirm the connection and switch in.** Return to Wechatai and wait for the plugin state to become Muse connected. Then send \`/use muse\` in WeChat to switch to Muse and send a text task; you can also call it once with \`@muse\`. The actual shortcut name follows the Shortcut name in the plugin configuration.

Two constraints are easy to miss. First, the installer stores only the pairing information and this configuration's scripts; it **does not call Muse's hook management tool automatically**. A successful install or dry run does not mean connected; only actual successful polling shows online. Second, this integration reuses the existing Wechatai WeChat connection; do not have Muse run another iLink bot against the same WeChat bot.

Repairing the pairing replaces the old credentials and return route. Wait for current tasks to finish and return results before reconnecting; if tasks are still processing or results are pending, the installer blocks the replacement.`,
      },
    },
    {
      id: "use",
      title: "After setup: how to use it, and what can be sent",
      body: `First point the current conversation at Muse:

- \`/use muse\` makes Muse the conversation's plugin; then send text tasks directly. \`/exit\` returns to the ordinary model.
- \`@muse task\` sends only this one message to Muse without changing the current default entry.
- \`/wx help\`, \`/wx status\`, and \`/wx new\` are always handled by Wechatai; \`/wx status\` confirms whether the conversation uses the Muse plugin.
- \`/wx new\` creates a new return route and recent chat history, but **does not clear Muse's own memory** and cannot cancel a tool operation it has already started.

Muse receives **text** and voice already transcribed by WeChat. Its replies can also carry up to 4 images, such as generated pictures; WeChat receives the text first, then the images. Images and files sent to Muse, video, tool approvals, and native Muse commands are not forwarded: switch back to the ordinary model or Xiaowei when you need an attachment, and approve operations in Muse.

Muse receives the latest 10 messages, up to 3,000 characters each, as a recent excerpt stored per return route; long-term memory, tools, and files in the same hosted environment remain shared, so do not let mutually untrusted people use the same Muse environment.`,
    },
    {
      id: "no-reply",
      title: "WeChat Muse does not reply: check in this order",
      body: `The order is fixed: **WeChat is bound → the hook is enabled → Wechatai polling succeeds**. Skipping the first three steps and reinstalling or repairing the pairing usually only makes the problem harder to see.

| Symptom | Check first | Action |
| --- | --- | --- |
| The plugin never shows Muse connected | Whether the hook is registered and enabled | Have Muse read the generated \`SETUP.md\`, register and enable the hook in its environment, and check the hook's enabled state and logs |
| It shows connected, but WeChat tasks do nothing | Where the current conversation points | Send \`/wx status\` to check the current plugin, then \`/use muse\` to switch to Muse and resend |
| Nothing happens right after generating the command | Whether the command expired | The command is valid for 10 minutes; regenerate it after expiry. The same command can be retried in the same environment before it expires |
| Results from old tasks never return after pairing | Whether the pairing was repaired | Repairing replaces the old credentials and return route; wait for current tasks to finish and return results. After disconnecting the old link on the web page, the old queue no longer returns |
| A long task fails midway | Whether the worker is still renewing its lease | A long task renews about every 60 seconds; after ten minutes without renewal it is marked failed and tools are not rerun automatically, so send the task again |
| WeChat context stops working | Whether the return channel is still warm | Pending tasks are kept for 24 hours; when the return channel fails, send a message in the original WeChat conversation to revive it, then resend the task |
| Replies are truncated | Output limit | A reply-truncated notice appears before the text; raising the limit affects new requests only. Ask Muse for a full summary first, then expand in parts |
| It reports insufficient quota | Credit balance | Send \`/wx balance\`; wait for the daily allowance to reset or top up before sending again |

Muse's hook triggers every 5 seconds by default and long-polls for up to 15 seconds, returning immediately when a message exists, so Muse connected usually appears quickly. If it stays offline, the problem is usually on the Muse side: check the hook's enabled state and logs instead of scanning again.`,
    },
    {
      id: "billing",
      title: "Billing and fee boundaries",
      body: `Wechatai charges credits only for **text actually sent in** and **text finally returned**:

- 5,000 input tokens = 1 credit, with output weighted ×8; each image attached to a reply costs 5 credits.
- Muse's internal history, system prompts, tool input, and internal calls are not counted in Wechatai credits; failures are not charged as successful bills; waiting notices and platform source notices are not charged.
- When a reply exceeds the output limit, only the text actually received is billed; the truncation notice does not consume credits, and the cut-off part is not sent later.
- Model service fees follow the party Muse uses; Wechatai does not handle them and does not promise an amount.

Plugin slots follow membership: Free can configure 1 plugin, Plus is unlimited. Disabling a plugin does not free the slot; delete the configuration. See [pricing and credits](/pricing) for plans.

Credentials and the send queue live under \`~/hooks/state/wechatai-muse/<config ID>/\` in the Muse environment and must not be published, committed, or pasted into chat. After disconnecting, old credentials can no longer deliver.`,
    },
  ],
  faq: [
    {
      question: "How is a hosted Muse assistant different from Muse Code or the Muse model API?",
      answer:
        "Wechatai connects the hook of an existing hosted Muse assistant: Muse receives tasks in its own hosted environment, calls its own models and tools, and returns the final text to WeChat. Muse Code is a coding tool and the model API is an interface for programs; neither is the connection method on this page, and Wechatai does not need a Muse API key.",
    },
    {
      question: "How many Muse plugins can a Free user configure?",
      answer:
        "At most 1 plugin. Adding a second plugin is blocked with an upgrade prompt; disabling a plugin does not free the slot, so delete an unused configuration to make room. Plus has no plugin limit.",
    },
    {
      question: "What if the connection command expires?",
      answer:
        "The connection command is valid for 10 minutes. Regenerate it in the plugin dialog after expiry; the same command can be retried in the same environment before it expires, and you do not need to scan WeChat again.",
    },
    {
      question: "Does the plugin showing online mean setup is complete?",
      answer:
        "No. It shows online only after Muse actually polls successfully; a finished install or a passing dry run does not count. After it shows connected, send one task in WeChat and receive the final reply to prove the end-to-end path.",
    },
    {
      question: "What should I check first when WeChat Muse does not reply?",
      answer:
        "Check WeChat is bound, the hook is enabled, and actual polling succeeds: send /wx help in that WeChat conversation to confirm the reply channel, have Muse confirm the hook is registered and enabled per SETUP.md and check the logs, then use /wx status to confirm the conversation has switched to Muse.",
    },
    {
      question: "Can Muse send or receive images or files, or approve tool operations in WeChat?",
      answer:
        "Muse replies can carry up to 4 PNG, JPEG, or WebP images after you run the connection command in Muse once more to install connector 1.1.0. Images and files sent to Muse, video, tool approvals, and native Muse commands do not pass through Wechatai: switch back to the ordinary model or Xiaowei for attachments, and approve operations in Muse.",
    },
    {
      question: "How does Wechatai bill for Muse?",
      answer:
        "By the text actually sent in and finally returned: 5,000 input tokens = 1 credit, output weighted ×8. Model calls, tool input, and memory inside Muse are not counted in Wechatai credits, and failed requests are not charged as successful bills; model service fees from Muse's provider are settled between you and that provider.",
    },
  ],
  related: [
    { label: "Muse guide", href: "/developers/muse" },
    { label: "Plugin library (sign in to add Muse)", href: "/app/plugins" },
    { label: "Connect an agent to WeChat", href: "/wechat-agent" },
    { label: "How to choose WeChat AI", href: "/wechat-ai-options" },
    { label: "Wechatai vs the built-in WeChat AI", href: "/compare/wechatai-vs-wechat-official-ai" },
    { label: "Wechatai vs self-hosted OpenClaw", href: "/compare/wechatai-vs-openclaw" },
    { label: "Wechatai vs commercial WeChat AI platforms", href: "/compare/wechatai-vs-commercial-wechat-ai" },
    { label: "WeChat command reference", href: "/docs/commands" },
    { label: "Connect WeChat (docs)", href: "/docs/wechat-connection" },
    { label: "Pricing and credits", href: "/pricing" },
  ],
  updatedAt: "2026-11-19",
};

export default [
  {
    path: "/wechat-muse",
    title: "Connect Muse to WeChat: Setup and Troubleshooting | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
