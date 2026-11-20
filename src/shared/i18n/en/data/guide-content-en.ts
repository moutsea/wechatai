import { IMAGE_CREDITS, OUTPUT_TOKEN_WEIGHT, TOKENS_PER_CREDIT } from "../../../credits";
import { BILLING_OFFERS } from "../../../billing-offers";
import { REFERRAL_CREDITS } from "../../../referrals";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";
import type { DocContent, DocScreenshot, DocSlug } from "../../../docs";
import { EN_FAQ_SECTIONS } from "./faq-content-en";
import { EN_NOTIFICATION_SECTIONS } from "./notification-content-en";

// Generated from the same workspace captures as the Chinese guide; only alt text
// and captions are translated, the images themselves keep the Chinese interface.
const sessionHistory: DocScreenshot = {
  src: "/images/docs/session-history.jpg",
  alt: "WeChat-style chat bubbles in session history, with model replies, a copy action and a credits entry point",
  caption:
    "Review the conversation on the web; the “…” menu at the top right manages this record. Viewing a record does not switch the WeChat session. (Sample data)",
  width: 425,
  height: 699,
};

// Descriptions match the shared command list one-for-one; the command strings
// themselves are the protocol and never translate.
const commands: [string, string][] = [
  ["/wx help", "Show command help and the full guide"],
  [
    "/wx status",
    "Show the plugin used by the current WeChat link; in normal chat, shows the channel and model",
  ],
  ["/wx channels", "List all channels and their numbers"],
  ["/wx channel 2", "Switch to channel 2 and continue with its most recently used model"],
  ["/wx models", "List the text models and numbers in the current or default channel"],
  ["/wx plugins", "List configured plugins and their @ shortcut names"],
  [
    "/use ds",
    "Enter or switch to a plugin by alias only; /wx plugins shows aliases, no need to exit first",
  ],
  [
    "/exit",
    "Leave the plugin and prefer the normal model session; creates one when a text model exists, otherwise clears the selection and keeps records",
  ],
  [
    "/wx model 2",
    "Switch to model 2 in the current or default channel and continue its most recent active session",
  ],
  [
    "/wx new",
    "Create a session with the current model or plugin; uses the default text model when nothing is selected and keeps old records",
  ],
  ["/wx sessions", "List session numbers and mark the current and archived sessions"],
  [
    "/wx switch 2",
    "Switch to session 2 from the list just shown; archived sessions are restored automatically",
  ],
  ["/wx reset", "Reset the context and history summary, keeping the chat records"],
  [
    "/wx archive",
    "Archive the current session; creates a new one when the previous model or plugin is available, otherwise tries a normal model, or only archives when none is available",
  ],
  [
    "/wx clear",
    "After confirmation, clear the messages in the current session and keep the session",
  ],
  [
    "/wx delete",
    "After confirmation, delete the current session and free one session slot; does not create a new session automatically",
  ],
  [
    "/wx delete 2",
    "After confirmation, delete session 2 from the list just shown without switching first; also cleans up disabled or deleted plugin sessions",
  ],
  ["/wx balance", "Show available credits"],
  [
    "/wx stop",
    "Ask the cloud to stop the current session's task and wait for confirmation; completed external actions cannot be undone",
  ],
  ["/wx cancel", "Discard staged images or files without affecting chat records"],
];

export const EN_GUIDE_CONTENT: Record<
  Exclude<
    DocSlug,
    | "wechat-ai-assistant"
    | "deepseek-in-wechat"
    | "multiple-openclaw-in-wechat"
    | "hermes-in-wechat"
  >,
  DocContent
> = {
  "getting-started": {
    sections: [
      {
        id: "clawbot-entry",
        title: "1. How Wechatai works",
        illustration: "wechat-ai-bridge",
        body: `Wechatai is a bridge between AI and WeChat, using the **WeChat ClawBot protocol** to connect. You send a message in WeChat; Wechatai passes it to the configured model or Agent and sends the result back.

The website handles configuration. WeChat is where you use it day to day. You do not install Wechatai on a computer or keep it running.

**Before you start:** confirm that your phone's WeChat has **Me → Settings → Plugins → WeChat ClawBot** (“我 → 设置 → 插件 → 微信 ClawBot”). If the entry is missing, update WeChat to the latest version. Normal model chat also needs an API key from your provider (not a chat-site password).

Model API charges come from the provider and are separate from Wechatai credits. [Learn about costs](/en/docs/credits).`,
      },
      {
        id: "prepare",
        title: "2. Configure a model",
        illustration: "channel-setup",
        body: `Wechatai does not supply the large language model. Before chatting, connect a model provider and use the **API key** that provider gives you.

Supported providers include DeepSeek, SiliconFlow, OpenAI and Anthropic, plus third-party channels compatible with the OpenAI or Anthropic protocols. [See supported providers and connection options](/en/docs/model-providers).

Open the [workspace](/app) and go to “Channels & models” (“渠道与模型”):

1. Click “Add channel” (“添加渠道”) and choose your provider.`,
      },
      {
        id: "start",
        title: "3. Connect WeChat",
        illustration: "wechat-connection",
        body: `1. Open [WeChat connection](/app/wechat), click “Create link” (“创建链接”), then “Get QR code” (“获取二维码”).
2. On your phone, open WeChat and go to **Me → Settings → Plugins → WeChat ClawBot “Details” → Connect a new OpenClaw** (“我 → 设置 → 插件 → 微信 ClawBot「详情」→ 连接新的 OpenClaw”). Scan Wechatai's QR code and confirm. Some versions label this “Scan” (“扫一扫”); OpenClaw does not need to be installed.`,
        afterIllustration: `3. Once Wechatai shows “Connected” (“已连接”), choose the current channel and model for normal chat. To use an existing Agent, finish the plugin setup in the next section first. Then send “Hello” in the matching WeChat conversation; when you get a reply, you can keep chatting.

**Reading this on your phone?** Display the QR code on a computer or another device, then scan it with phone WeChat. If the entry is missing or the connection fails, see [Connect WeChat](/en/docs/wechat-connection#connect).`,
      },
      {
        id: "next",
        title: "4. Enable a plugin (optional)",
        illustration: "plugin-setup",
        body: `Normal model chat does not need a plugin. To extend what the AI can do:

1. Open the [plugins page](/app/plugins), find the plugin you want and click “Configure plugin” (“配置插件”).
2. Follow the page to choose a model, fill in the configuration, set an easy-to-remember “WeChat shortcut name” (“微信快捷名称”), then save and keep it enabled.
3. In WeChat, send \`/use shortcut\` to select it. For example, with the shortcut “画图” (Draw), send \`/use 画图\`, then describe the image.`,
        afterIllustration: `**Only need it once?** Send \`@画图 draw a cat napping in the sun by the window\`. Send \`/exit\` to return to normal model chat. Shortcut names follow what you saved; enabling a plugin on the web does not switch the current WeChat session automatically.

Learn as needed: [AI image generation (image model required)](/en/docs/image-generation) · [Roleplay](/en/docs/roleplay) · [Xiaowei: files and tasks (Plus only)](/en/docs/cloud-agent). To connect an existing Agent, see [Muse](/developers/muse), [Hermes](/developers/hermes) and [OpenClaw](/developers/openclaw).`,
      },
    ],
  },
  "model-providers": {
    intro:
      "Wechatai connects AI to WeChat; it does not supply the large language model. Model chat requires a provider you choose, and that provider bills the model API usage.",
    sections: [
      {
        id: "providers",
        title: "Supported model providers",
        illustration: "model-providers",
        body: `Open [Channels & models](/app/channels) and click “Add channel” (“添加渠道”) to connect the providers below. For preset channels, enter your own API key and the endpoint and protocol are filled in automatically. KimiSeek uses the one-click import entry.

Zhipu, Bailian and Volcengine Ark Coding Plans are also supported. With these plans, choose the matching Coding Plan preset and use the API key issued for that plan.

Wechatai tries to sync available models after saving. If syncing fails, add models manually by following the [model import guide](/en/docs/channels-models#import). Whether a model works depends on the models the provider offers, your account permissions and your balance.`,
      },
      {
        id: "kimiseek",
        title: "KimiSeek one-click import",
        illustration: "kimiseek-import",
        body: `Open [Channels & models](/app/channels), click “Add channel” (“添加渠道”), then click **kimiseek one-click import** (“kimiseek 一键导入”) next to “Provider” (“服务商”). Follow the prompts on the new page to link your account.

After linking, Wechatai imports the channel and tries to sync models automatically; you do not type an API key. Return to the channels page, confirm the models you need were imported, then continue to [connect WeChat](/en/docs/getting-started#start).`,
      },
      {
        id: "custom",
        title: "Other third-party providers with compatible protocols",
        body: `Third-party providers compatible with **OpenAI Chat Completions, OpenAI Responses** or **Anthropic Messages** are also supported.

When adding a channel, choose “Custom (third-party channel / other protocol)” (“自定义（第三方渠道 / 其他协议）”), then follow the provider's documentation to enter the protocol, Base URL and API key. Fetch models or add model IDs manually. See the [channels and models guide](/en/docs/channels-models#configure) for the exact steps.`,
      },
    ],
  },
  "channels-models": {
    intro:
      "A channel stores a model provider's endpoint, protocol and API key. A model is the actual model ID called through that channel. One channel can serve several models, so you do not re-enter the key for each model.",
    sections: [
      {
        id: "configure",
        title: "1. Add a model channel",
        illustration: "channel-form",
        body: `A channel is the connection configuration for a model provider. Wechatai does not supply the model: use the **API key** from the provider, not a chat-site password.

1. Open [Channels & models](/app/channels), click “Add channel” (“添加渠道”) and choose a provider.
2. Enter the API key and click “Save and fetch models” (“保存并获取模型”). Preset channels fill in the endpoint and protocol automatically.

DeepSeek, SiliconFlow, OpenAI and Anthropic are supported. [See the full provider list](/en/docs/model-providers)`,
        afterIllustration: `### kimiseek: official partner with one-click setup

No manual API key entry: link your account and the channel is imported.

1. In [Channels & models](/app/channels), click “Add channel” (“添加渠道”), then **kimiseek one-click import** (“kimiseek 一键导入”) next to “Provider” (“服务商”).
2. On the page that opens, follow the prompts to link your account.
3. Back in Wechatai, the channel is imported and models sync automatically. Confirm the models you need appear in the list.`,
        followUpIllustration: "kimiseek-import",
        details: [
          {
            title: "Third-party provider: how do I fill in a custom endpoint?",
            illustration: "custom-channel",
            body: `Choose “Custom (third-party channel / other protocol)” (“自定义（第三方渠道 / 其他协议）”) as the provider, then enter the protocol, Base URL and API key from the provider's documentation. The channel name is only for your own reference.

The example below uses a service compatible with OpenAI Chat Completions. If the provider requires OpenAI Responses or Anthropic Messages, choose that protocol.

Click “Save channel” (“保存渠道”), then fetch models in the next section. When a preset is selected, you can also click “Custom endpoint” (“自定义接口”) to change the address or protocol.`,
          },
          {
            title: "How do I change the key or endpoint later?",
            body: `Edit and save the channel; all new requests for its models use the new configuration.

- **Keep the current endpoint:** when changing only the channel name, notes or protocol, you can leave the API key empty and keep using the encrypted key already saved. To update it, enter a new key.
- **Change provider, API host or plan path:** enter the matching API key again. When the edit page says “Service address changed” (“服务地址已更改”), it cannot be left empty.`,
          },
        ],
      },
      {
        id: "import",
        title: "2. Sync and test models",
        illustration: "channel-models",
        body: `Preset channels try to import models automatically after saving. To sync again, or for a custom channel, click “Fetch available models” (“获取可用模型”). **Fetching the list does not consume Wechatai credits.**

When you see a text model, click the **lightning icon “Test connection”** (“测试连接”) on its row. Wechatai sends a test request. **Testing consumes a small amount of credits and may incur provider API charges.**`,
        afterIllustration: `Once the test succeeds, continue to [connect WeChat](/en/docs/wechat-connection#connect). Image models are used in the [AI image plugin](/en/docs/image-generation).`,
        details: [
          {
            title: "Sync failed, or the model I want is missing?",
            body: `The channel is usually already saved, so do not create it again. Click “Add model” (“添加模型”), enter a display name and the **model ID** from the provider's documentation, choose the model type and save. The model ID is not the channel name.

Each channel can hold up to 50 models. Re-syncing skips models already added and never overwrites their settings or chat history.`,
          },
          {
            title: "The model is imported; why does the test still fail?",
            body: `First check that the API key is valid, the provider balance is sufficient and the account may use that model. For custom channels, also verify the protocol, address and model ID. A model appearing in the list does not guarantee that this account can call it.

A model ID and its channel cannot be changed after saving. To change the ID or channel, add a new model.`,
          },
        ],
      },
      {
        id: "limits",
        title: "3. Adjust reply style and usage",
        illustration: "model-settings",
        body: `Keep the defaults for your first run. To adjust, click the **pencil icon “Edit model”** (“编辑模型”) on the model row:

- **System prompt** (“系统提示词”): tell the model how to answer, for example “Answer in concise English and give the conclusion first.”
- **More settings** (“更多设置”): adjust input, output and spending limits as needed. Expand the illustration below for what each field means.`,
        afterIllustration: `After changing the prompt, send \`/wx reset\` in WeChat if you want to start from a new context; this does not delete chat records.

**The credits limit only caps Wechatai charges; provider API fees are separate.** [Learn how the allowance is calculated](/en/docs/credits).`,
      },
      {
        id: "switch",
        title: "4. Switch models in WeChat",
        illustration: "model-commands",
        body: `In [WeChat connection](/app/wechat), click “Switch channel and model” (“切换渠道与模型”), or use the commands below directly in WeChat. **Switching models does not require scanning the QR code again.**`,
        afterIllustration: `Plus members can also set a shortcut name for a model under “More settings” (“更多设置”), for example “写作” (Writing), then send \`@写作 polish this paragraph\` for a one-off call without changing the default model or plugin.

Switching models continues that model's most recently used session. See the [WeChat command reference](/en/docs/commands) for more.`,
      },
    ],
  },
  "wechat-connection": {
    intro:
      "Scan a QR code to connect Wechatai to WeChat, then chat or use plugins in WeChat ClawBot. Switching models, plugins and sessions never requires scanning again, and the Wechatai website does not need to stay open.",
    sections: [
      {
        id: "connect",
        title: "1. Connect WeChat by QR code",
        illustration: "wechat-code",
        body: `1. Open [WeChat connection](/app/wechat) and select an existing link. If you have none, click “Create link” (“创建链接”), enter a name and save.
2. Click “Get QR code” (“获取二维码”). Scanning does not require a configured model first, and OpenClaw does not need to be installed.

**Reading this site on your phone?** Sign in to the same Wechatai account on a computer or another device, open the same WeChat link to display the QR code, then scan it with phone WeChat.`,
        afterIllustration: `3. On your phone, open WeChat and go to **Me → Settings → Plugins → WeChat ClawBot “Details” → Connect a new OpenClaw** (“我 → 设置 → 插件 → 微信 ClawBot「详情」→ 连接新的 OpenClaw”). Scan your QR code and confirm on the phone. Some versions label this “Scan” (“扫一扫”).

If the entry is missing, update phone WeChat to the latest version first. Scan with the WeChat account you plan to use every day. Only one-to-one chats with ClawBot are supported; group chats are not.`,
        followUpIllustration: "wechat-connection",
      },
      {
        id: "verify",
        title: "2. Send a message to verify the connection",
        illustration: "wechat-status",
        body: `Back in Wechatai, confirm the link shows **“Connected” (“已连接”)**. Then open the matching WeChat ClawBot conversation and send \`/wx help\`. If you receive the command help, the message channel works. **This command costs no credits.**`,
        afterIllustration: `After connecting, continue according to how you plan to use it:

- **Chat with a model:** finish [channel and model configuration](/en/docs/channels-models), choose the current channel and model in [WeChat connection](/app/wechat), then ask a question directly.
- **Use a plugin or an existing Agent:** finish [plugin setup](/en/docs/getting-started#next), send \`/use shortcut\`, wait for the confirmation that you entered the plugin, then send the task. Xiaowei requires Plus and an available text model; existing Muse, Hermes and OpenClaw agents do not need their models configured again in Wechatai.
- **Only receive notifications:** after the help command, configure [Notifications](/en/docs/notifications). No model API key is needed.`,
      },
      {
        id: "multiple",
        title: "3. Manage multiple links",
        body: `Free includes **${WECHAT_LINK_LIMITS.free}** WeChat links; Plus allows up to **${WECHAT_LINK_LIMITS.plus}**. In the “Manage links” (“管理链接”) menu at the top of [WeChat connection](/app/wechat), choose the link to work with. You can also rename links to tell their purposes apart.

Each link keeps its own current model, plugins and session context, while models and credits are shared across the account.`,
        details: [
          {
            title: "What is the difference between disconnecting and deleting a link?",
            body: `- **Disconnect** (“断开连接”): stops sending and receiving for this link and keeps its chat records. You can scan again on the same link later without using another slot.
- **Delete link** (“删除链接”): stops messaging and frees the slot. Chat records remain, but a new link does not continue the old link's sessions.`,
          },
          {
            title: "Can I still use multiple links after Plus expires?",
            body: `The first link keeps working. Chat on the remaining links is paused and records are kept. Renewing restores them; if the WeChat authorization has expired, scan again.`,
          },
        ],
      },
      {
        id: "reconnect",
        title: "4. When the connection misbehaves",
        body: `Check the link status first, then messages and the model or Agent. You usually do not need to delete or recreate the link.`,
        details: [
          {
            title: "“Plugins” or ClawBot is missing from WeChat?",
            body: `Update phone WeChat to the latest version, then check **Me → Settings → Plugins** (“我 → 设置 → 插件”). Scanning must happen in phone WeChat; WeChat for Windows/Mac and WeCom do not use this path. If it is still missing, [contact us](/contact) for help.`,
          },
          {
            title: "The QR code or connection expired; how do I reconnect?",
            body: `In [WeChat connection](/app/wechat), select the original link, click “Get QR code” (“获取二维码”) and scan again. There is no need to create a link. If the page says “Scanned, confirm on your phone” (“已扫码，请在手机上确认”), complete the confirmation first.`,
          },
          {
            title: "It says connected, but messages get no reply?",
            body: `1. Send \`/wx help\` first. If the command also gets no reply, check the connection status, recent messages and error hints in the workspace, and confirm you are messaging from the WeChat account that scanned the code.
2. If commands reply but normal chat does not, test the text model in [Channels & models](/app/channels) and check the API key, balance and model ID. Testing consumes a small amount of credits and may incur provider API charges.
3. Using an Agent: send \`/wx status\` to verify the current plugin. The host running OpenClaw or Hermes must stay online. For Muse, confirm the hosted assistant and connector are available. For Xiaowei, check progress on [Cloud tasks](/app/tasks).

See the [FAQ](/en/docs/faq) for more.`,
          },
          {
            title: "After a long silence, reminders or task results do not arrive?",
            body: `WeChat ClawBot replies must be delivered within **24 hours** of your last message. After a long gap, send a new message in the matching WeChat conversation to refresh the reply window. An expired window alone does not require scanning again, and expired task results are not guaranteed to be resent.

If a newly sent message still gets no reply, keep checking the connection, model or Agent; do not assume the window expired.`,
          },
        ],
      },
    ],
  },
  commands: {
    intro:
      "Wechatai control commands such as checking status or switching models and sessions cost no credits. Calling a model or plugin with @ is billed by actual use. Native OpenClaw and Hermes commands follow the rules below. Numbers in commands are examples; use the numbers from the list you just received.",
    sections: [
      {
        id: "commands",
        title: "Command list",
        body: `| Command | Purpose |
| --- | --- |
${commands.map(([command, description]) => `| \`${command}\` | ${description} |`).join("\n")}

\`/wx clear\` and \`/wx delete\` ask for confirmation. The confirmation code is valid for 60 seconds. Clearing and deleting cannot be undone, so check the session name in the confirmation message and confirm with the full command it gives.`,
      },
      {
        id: "plugins",
        title: "Enter a plugin, or use it once",
        body: `- \`/use ds\`: enter the plugin with the shortcut alias ds; subsequent messages go to it. Only plugin aliases work, not display names or numbers. \`/use\` and \`@\` match aliases case-insensitively. Set aliases in the web configuration; they cannot be all digits. \`/wx plugins\` lists them.
- \`/use 画图\`: switch directly to another plugin without exiting first.
- \`/exit\`: leave the plugin and prefer the normal model session. Without a text model it clears the current choice; use \`/use shortcut\` to enter again, or \`@shortcut question\` for a one-off call.
- \`@画图 an orange cat, 3:4\`: call the image plugin once, then stay in the previous default mode.

In any mode, \`@shortcut content\` calls a model or plugin once. These calls consume credits normally; sending only a plugin name does not enter the plugin.

Free can configure one plugin and can enter or call that plugin. Shortcut names for normal models require Plus; see [Switch models](/en/docs/channels-models#switch). For billing details, see [Credits](/en/docs/credits#metering).`,
      },
      {
        id: "agent-commands",
        title: "How do OpenClaw and Hermes commands differ?",
        body: `In OpenClaw or Hermes mode, native commands such as \`/new\` and \`/help\` go to the Agent. Add \`/wx\` for Wechatai commands. \`/use\` and \`/exit\` are always handled by Wechatai.

Normal model chat and other plugin modes still accept the short form without \`/wx\`, but learn the full form to avoid confusion after switching.

You can also send \`@claw /new\` or \`@hermes /help\` to forward a native command once. To send \`/exit\` to an Agent, use \`@shortcut /exit\`.

An Agent's \`/new\` does not delete Wechatai chat records; \`/wx new\` creates a Wechatai session and gives subsequent Agent conversations a separate session. Agent commands are billed by actual input and output; \`/stop\` is free. The Agent controls execution permissions. Upgrade an older connector first. See [Sessions and context](/en/docs/sessions#manage) for the difference between new, reset and delete.`,
      },
    ],
  },
  sessions: {
    intro:
      "A Wechatai session stores chat records; context is what the AI actually receives when answering. Resetting context does not delete records. To change topics, create a session and switch back later. Commands run in WeChat; the web session history is mainly for Plus members to review and organize.",
    sections: [
      {
        id: "manage",
        title: "Create, switch and clean up",
        body: `| Action | What happens |
| --- | --- |
| \`/wx new\` | Creates a session with the current model or plugin; old records remain |
| \`/wx sessions\`, \`/wx switch 2\` | List and switch sessions; choosing an archived session restores it |
| \`/wx reset\` | Clears context and the history summary; chat records remain |
| \`/wx archive\` | Archives the current session; creates a new one when the previous model or plugin is available, otherwise tries a normal model, and only archives when none is available |
| \`/wx clear\` | After confirmation, clears the current session's messages and keeps the session |
| \`/wx delete\` | After confirmation, deletes the current session and frees one session slot; does not create a new session |
| \`/wx delete 2\` | After confirmation, deletes session 2 from the list just shown without switching and without affecting others |

“Reset” is for making the AI reconsider the question from scratch. “Clear” and “Delete” remove records permanently. None of them delete messages already in the WeChat client.

Only “Delete session” frees a session slot; archiving and clearing do not. Free users can also send \`/wx sessions\` to list sessions, then \`/wx delete number\` to remove unneeded ones, checking the name and confirming as prompted. No switch is needed, and sessions whose plugin was disabled or deleted can still be cleaned up. Numbers refer only to the list just shown for the current WeChat link; if the list changes, list again. After deleting the current session, use \`/wx new\` to start normal chat or \`/use shortcut\` to enter a plugin.`,
      },
      {
        id: "history",
        title: "Review records on the web",
        screenshots: [sessionHistory],
        body: `Plus members can open [Session history](/app/sessions) to view conversations, rename sessions, create or switch sessions, and archive, restore, clear or delete them.

The left side has “All sessions” and “Archived” lists and search by session name. Each record is marked as a current WeChat session or a remote Agent session. Opening a record only views it; **it does not switch the session WeChat is using** until you click “Switch to WeChat” (“切换到微信”). Other common actions are in the session menu:

- **Rename** (“重命名”): changes only the platform display name, not the context.
- **Archive** (“归档”): moves it from the usual list to “Archived” without freeing a session slot.
- **Restore** (“恢复”): puts an archived session back in the list; you still switch to it manually.
- **Clear messages** (“清空消息”): deletes platform messages, context and matching cloud task content, keeps the session and does not free a slot.
- **Delete session** (“删除会话”): permanently deletes platform messages and matching cloud task content, and frees one session slot.

Free users can still use session commands in WeChat, and account settings also clean up platform records. After Plus expires, web session history is unavailable and saved data is retained under membership rules; renew to view it again.

[Personal assistant notes, expenses and reminders](/en/docs/personal-assistant#records) are stored separately; clearing chat does not delete them. OpenClaw and Hermes manage their own files and long-term memory; clearing a Wechatai session does not delete that content.`,
      },
      {
        id: "context",
        title: "What happens in long conversations?",
        body: `When context approaches 80% of the usable input space, Wechatai summarizes earlier content and keeps roughly the last four turns. Original chat records are not deleted; a summary may miss details, so repeat important requirements.

If the upstream still reports a context overflow, Wechatai trims the context further and retries once. Summaries use the current model and API key; Wechatai charges no extra summary credits, but the provider may bill API usage, and the summary counts as input in later requests.

A new model defaults to a 128K context window and can be configured up to 2M, though the model's real capability still applies. The usable input space subtracts output reservation and a safety margin, and the smaller of that value and the user input limit wins.

If the system prompt, the message itself or an attachment already exceeds the limit, a summary cannot fix it; shorten the content, split it, or change [model settings](/en/docs/channels-models#limits).`,
      },
      {
        id: "troubleshoot",
        title: "4. Troubleshooting",
        body: `- **\`/wx sessions\` gets no reply**: send \`/wx help\` first to confirm the command channel. If that also gets no reply, check the WeChat link following [connection troubleshooting](/en/docs/wechat-connection#reconnect). If commands work but the list fails, retry later.
- **Switching by number says invalid**: numbers refer only to the session list most recently shown for the current WeChat link. Send \`/wx sessions\` again, read the number, then switch. Sessions keep their numbers for cleanup after a plugin is disabled or deleted.
- **Cannot find an archived session**: archiving is not deleting. Relist sessions in WeChat to see archived items; switching restores them. On the web, restore from “Archived”.
- **Can a deleted session be recovered?**: no. Deleting removes platform messages, context and matching cloud task content; copies in the WeChat client and remote Agent are not deleted. A new session is not created automatically; use \`/wx new\` or \`/use\`.
- **Session slots are full**: delete unneeded sessions in web “Session history”, or send \`/wx delete number\`. Archiving and clearing do not free a slot.
- **After switching models it feels like a different assistant**: \`/wx model number\` switches models and continues that model's most recent active session; context is kept separate across models, plugins and sessions. To start over, send \`/wx new\`; to clear only the current context, send \`/wx reset\`.
- **Web history is empty or will not open**: web session history is a Plus feature. Check the plan and the current account; Free can still use WeChat commands. The current session of each WeChat link is independent; use \`/wx status\` to confirm the link.
- **Xiaowei task records disappeared**: clearing or deleting a session deletes the matching task text and results on the platform, while billing records remain. Remote execution history and memory are not deleted.`,
      },
    ],
  },
  attachments: {
    intro:
      "To read an image, summarize a document or organize a table in WeChat, send the attachment first, then tell the AI what you want. Wechatai stages the attachment and passes it to the selected model or attachment-capable plugin with your instructions. Images and files require Plus; voice questions alone do not, but WeChat must include a transcript. Up to four attachments per batch, staged for 15 minutes.",
    sections: [
      {
        id: "send",
        title: "1. Send the attachment first, then the instructions",
        body: `Choose a normal chat model, DS Chat or [Xiaowei](/en/docs/cloud-agent) before sending. To analyze an image, use a model with vision input; text-only models cannot read images.

1. Send one or more images or files in WeChat. Sending only attachments does not create a task, call a model or charge credits.
2. Wait for “Staged N attachments” (“已暂存 N 个附件”) and the retention note, then send text or a voice message with your instructions, such as “Summarize this file” or “Compare these two images”.
3. Wechatai submits the batch with your instructions. Attachment text counts as model input, and the result returns in the current conversation.

**Staging does not call a model or charge credits.** Processing is billed by actual use, and provider API fees are separate. Send \`/wx cancel\` to clear staged attachments.

Each batch's timer restarts at the last successful addition and keeps attachments for **15 minutes**. From sending an attachment to adding instructions, stay on the same WeChat link, session and mode. If staging expires, or you switch models, plugins or sessions, send the attachments again.`,
      },
      {
        id: "formats",
        title: "2. What can I send?",
        body: `- **Images**: the model must support vision input; Xiaowei accepts up to **2 MB** per image.
- **Documents**: PDF, Word (DOCX), TXT, Markdown, CSV, JSON, logs and common code text files. PDFs up to **100 pages**; save legacy \`.doc\` files as \`.docx\` first.
- **Voice**: Wechatai reads the transcript WeChat attaches to the voice message. Without a transcript, convert it to text first; the audio itself is not recognized.

**Up to four attachments per batch**, each up to **5 MB**, with a combined **8 MB** per batch. Extracted text is limited to **100,000 characters** per file. Xiaowei still caps images at 2 MB each and its assembled task text at 50,000 characters.

These are the attachment rules for normal models, DS Chat and Xiaowei. Support on Muse, Hermes and OpenClaw follows their own connection guides.`,
        details: [
          {
            title: "A PDF or Word file will not read. What now?",
            body: `Run text recognition on scanned PDFs first, or send the needed pages as images. Save legacy Word \`.doc\` files as \`.docx\`.

Wechatai mainly extracts body text and does not guarantee preserving layout, charts or embedded images. A single file extracts up to 100,000 characters and is also bounded by the [model input limit](/en/docs/channels-models#limits); split long files. Xiaowei's assembled task text is capped at 50,000 characters; see [Xiaowei attachment limits](/en/docs/cloud-agent#limits).`,
          },
          {
            title: "I want to convert formats or generate an image from a reference?",
            body: `**To generate Word, PDF and other files or convert formats, use [Xiaowei](/en/docs/cloud-agent#setup).** Enter Xiaowei first, then send the attachment and full instructions. Normal chat models can analyze content but do not reliably produce and return files.

The [AI image plugin](/en/docs/image-generation) currently generates images from text descriptions and does not accept reference images or files. If you only want an image, send \`/wx cancel\` to clear staging, then send the description. To analyze an attachment, switch to a chat model and resend the attachment and instructions.`,
          },
          {
            title: "After a failure, must I resend the attachment?",
            body: `- **Temporary errors such as downloads**: resend only the instructions as the reply suggests.
- **The attachment is too large, too long or the wrong format**: send \`/wx cancel\`, then send the processed file and instructions. Sending the file again appends it to the existing batch.
- **Staging expired, or you switched or reset the session**: resend the attachment, then add the instructions.
- **Xiaowei accepted a task, then it failed, was cancelled or asked for more information**: that batch was cleared. Send the attachment and complete instructions again; sending only text does not attach the original file.

Check Xiaowei's status and results on [Cloud tasks](/app/tasks).`,
          },
        ],
      },
      {
        id: "voice",
        title: "3. You can also speak your instructions",
        body: `Record and send a voice message directly, for questions or attachment instructions. Wechatai reads the **transcript WeChat attaches to the voice message**.`,
        illustration: "voice-example",
        afterIllustration: `If the reply says “No transcript” (“没有转写内容”), convert the voice to text in WeChat first and send the text. The AI currently returns text, images or files and does not send voice replies; voice questions are billed normally based on the transcript.`,
      },
      {
        id: "troubleshoot",
        title: "4. Common errors",
        body: `- **It says attachments require Plus**: image and file processing is a Plus benefit; text chat and some voice transcription still work. After upgrading, resend the attachment, not only the instructions.
- **The image was sent but not understood**: confirm the current model supports vision input and test with a clear image. Text-only models read text, not pictures.
- **Unsupported format or empty text**: use PDF, DOCX, TXT, Markdown and other supported formats. Run text recognition on scanned PDFs; encrypted or damaged files cannot be extracted.
- **Too large, too many or too many pages**: compress images, split files, or keep each batch within four files; each up to 5 MB, combined up to 8 MB, and PDFs up to 100 pages.
- **Staging expired**: attachments last only 15 minutes, and switching models, plugins or sessions clears them. Resend the attachments, then the full instructions.
- **Resending created more attachments**: new attachments append to the existing batch. To replace or compress, send \`/wx cancel\` first, then send the new file.
- **A Xiaowei task failed**: staging was cleared when the task was accepted, so retry by sending the attachments and full instructions again. Provider API fees already incurred follow the provider's bill. Check status on [Cloud tasks](/app/tasks).`,
      },
    ],
  },
  credits: {
    intro:
      "Credits are Wechatai's platform usage allowance and are separate from model provider API balances. Free lets you start chatting; Plus adds a larger daily allowance, more WeChat links and advanced features. Model, search and image APIs are billed separately by their providers.",
    sections: [
      {
        id: "plans",
        title: "1. Free or Plus?",
        body: `Start with Free to configure a model and connect WeChat. Choose Plus when you need attachments, Xiaowei or multiple WeChat links.`,
        illustration: "membership-plans",
        afterIllustration: `Plus monthly and yearly plans have the same benefits, and **neither includes model API fees**. Xiaowei uses the model you configure; see [Xiaowei limits](/en/docs/cloud-agent#limits) for execution counts and current availability.

Compare [all plans](/pricing), or buy and renew under [Membership & credits](/app/billing).`,
        details: [
          {
            title: "When do daily grants refresh, and how is upgrade day counted?",
            body: `The daily allowance refreshes at **midnight Beijing time**; unused grants do not carry over. On upgrade day, the balance is topped up to the Plus daily limit rather than adding a full extra grant.

When you hold several allowances, the earliest expiry is used first, so daily grants are usually consumed before permanent top-ups and referral rewards.`,
          },
          {
            title: "Does it renew automatically, and is my data kept after expiry?",
            body: `Membership is currently a one-time purchase and renews manually; buying early extends the expiry. Users who previously enabled auto-renewal can cancel under “Manage subscription” (“管理订阅”) in [Membership & credits](/app/billing).

After Plus expires, the account returns to Free. Configuration and records are kept; links and plugins beyond the Free allowance and Plus-only features are paused, including Xiaowei. Renewing restores them.`,
          },
        ],
      },
      {
        id: "metering",
        title: "2. How many credits does one use cost?",
        body: `**Text is billed by input and reply length**, rounded up to 0.001 credit:

\`credits = (input tokens + output tokens × ${OUTPUT_TOKEN_WEIGHT}) ÷ ${TOKENS_PER_CREDIT.toLocaleString("en-US")}\`

A token is a unit of text the model processes; it is not the same as a character count. Input also includes the system prompt actually sent, conversation history and attachment text.`,
        illustration: "credit-example",
        afterIllustration: `- **Image billing**: AI image generation and images returned by Xiaowei cost ${IMAGE_CREDITS} credits each; prompts and reply text are billed separately. Uploading images, previews and repeated delivery are not charged as result images, and related model API fees remain with the provider.
- **No credits charged**: attachment staging, platform commands such as status and session switching, and the notification webhook. Real tests of models and plugins are billed normally.

Want an estimate for your usage? Try the [usage estimator](/pricing#estimate).`,
        details: [
          {
            title: "How are Agents, Xiaowei and failed requests billed?",
            body: `Agents such as Muse, Hermes and OpenClaw are metered by content passed in and final returned text; internal model and tool calls do not consume additional Wechatai credits.

Xiaowei bills input and final reply text, plus ${IMAGE_CREDITS} credits per returned image; non-image files are not charged extra. Failed tasks, tasks needing clarification and confirmed cancellations are not charged for successful results; a failure after acceptance still counts toward execution attempts. If you request a stop but the task completes first, the valid result is still billed. See [Xiaowei billing and task rules](/en/docs/cloud-agent#limits).

Wechatai's automatic summaries and internal retries do not consume extra platform credits. **No platform charge does not mean the upstream was free**: model, search or image providers may already have billed API usage.`,
          },
          {
            title: "Why do token counts differ from the model provider's?",
            body: `Wechatai uses its own text metering (cl100k_base) and does not adopt the provider's reported usage directly. Different models tokenize text differently, so check Wechatai credits and the provider bill separately.`,
          },
        ],
      },
      {
        id: "balance",
        title: "3. Check your balance and top up",
        body: `Send \`/wx balance\` in WeChat, or open [Credits](/app/credits) to see consumption records.

If credits run low, wait for the next daily grant, [buy credits](/app/billing), or invite friends. **Top-up credits remain valid long-term but do not upgrade you to Plus.**

**Why can the balance go negative?** Requests are not pre-charged. A request can start whenever the balance is above zero and is settled by actual use afterwards, so the balance may go negative. New paid requests pause when the balance is zero or below.

Daily grants, top-ups and referral rewards first offset any debt but **do not zero it directly**; if the balance is still zero or below after that, requests remain paused.`,
        details: [
          {
            title: "What credit packs are available?",
            body: `${BILLING_OFFERS.filter((offer) => offer.kind === "credits")
              .map(
                (offer) =>
                  `- **${offer.credits.toLocaleString("en-US")} credits**: ¥${offer.amount / 100}`,
              )
              .join("\n")}

Choose a pack under [Membership & credits](/app/billing). Top-ups only add credits and do not change membership benefits.`,
          },
          {
            title: "How can I reduce long-conversation usage?",
            body: `When changing topics, use \`/wx new\` to create a session; old records remain. You can also use \`/wx reset\` to reset the current context without deleting chat records.

Adjust input, output and per-turn credit limits in [model settings](/en/docs/channels-models#limits). **The per-turn credits limit only caps Wechatai charges; it does not cap the provider API bill.**`,
          },
        ],
      },
      {
        id: "invites",
        title: "4. Invite friends for permanent credits",
        body: `1. Open [Invite friends](/app/invite) and copy your personal link.
2. Your friend registers through the link, connects WeChat and completes a first successful AI conversation.
3. After the reply is fully delivered, **you and your friend each receive ${REFERRAL_CREDITS} credits, valid permanently**. Track progress and rewards on the invite page.`,
        details: [
          {
            title: "My friend registered but I have not received the reward?",
            body: `Registering or scanning alone is not enough. A successful WeChat AI conversation must complete and the reply must be fully delivered. Platform commands, web model tests and failed replies do not count.

Email, Google and GitHub sign-ups all support invites. Existing accounts cannot add an invite later, self-invites are not allowed, and each new account and WeChat can participate only once. If a reward is being issued, check the invite page again later.`,
          },
        ],
      },
    ],
  },
  "ds-chat": {
    intro:
      "Want to ask about the weather or look up the latest information in WeChat and see sources? DS Chat is Wechatai's web-answer plugin; it connects a search service to the answer model you choose. Bring your own model and search APIs; the answer model must support tool calls. Free supports one plugin; Plus has no plugin limit.",
    sections: [
      {
        id: "configure",
        title: "1. Configure the model and search service",
        illustration: "plugin-search",
        body: `Finish [model configuration](/en/docs/channels-models) and [connect WeChat](/en/docs/wechat-connection) first. Then open the [plugins page](/app/plugins) and click “Configure plugin” (“配置插件”) on “DS Chat”:

1. **Answer model** (“回答模型”): choose a text model that supports tool calls. It decides whether to search, organizes results and answers. Do not choose a search model here.
2. **Search service** (“搜索服务”): choose DeepSeek native search, Tavily, Exa or SearXNG, then enter the matching address and key. The official DeepSeek address is prefilled, and the search model ID can be left empty.
3. **Attempt limits** (“次数上限”): set up to 1–5 searches and 0–8 page reads per turn as needed. These are per-turn caps, not a promise that every turn uses them.
4. **Shortcut name**: keep the default \`ds\` or use your own alias, then save and enable. “Test” (“测试”) on the plugins page calls the answer model; a simple question may be answered directly without searching. When the test succeeds, Wechatai bills input and final output, and the provider bills API usage separately.

**The answer model and search service are independent configurations.** They can come from different providers, and each bills separately. Wechatai provides no built-in search allowance.`,
        details: [
          {
            title: "Which other search services are supported?",
            body: `DeepSeek native search, Tavily, Exa and SearXNG are supported. SearXNG must expose a JSON search API and usually needs no key; for the others, enter the key and address of the chosen service.

When the DeepSeek search model ID is empty, \`deepseek-flash\` is used. A custom ID must support native Web Search. DS Chat is built on the open-source DeepSeek-Harness project; the answer model does not have to come from DeepSeek.`,
          },
          {
            title: "What goes in the address and key fields?",
            body: `“Search address” (“搜索地址”) takes the service's full public HTTPS endpoint, including the path; do not enter a web page that redirects. DeepSeek uses its official endpoint; Tavily, Exa and SearXNG use their own search addresses.

The search key is submitted only when saving; afterwards the page shows only whether it is configured. The answer model's key belongs to the channel configuration and is not entered here.`,
          },
        ],
      },
      {
        id: "use",
        title: "2. Ask in WeChat",
        body: `Send \`/use ds\` to enter the plugin, then ask, for example “Look up today's weather in Shanghai and include sources.” DS Chat first decides whether the web is needed: greetings, translations, rewrites or questions with enough existing material may be answered directly. Not searching does not mean the configuration failed.

For a one-off question, send \`@ds question\`; the current mode does not change. Send \`/exit\` to return to the normal model; \`/wx new\` starts a new topic. When the answer uses web material, the platform appends the real source links; the model cannot invent sources.

Images and files require Plus. Follow the [attachment guide](/en/docs/attachments): send the attachment first, then the instructions. Switching models, plugins or sessions clears staged attachments.`,
      },
      {
        id: "limits",
        title: "3. Search scope and costs",
        body: `Page reading suits public web pages. It does not support content behind a login, text that requires scripts to render, or reading PDF web pages directly; paste the text or send the PDF as an attachment. Search and reading may be limited by the target site; if some requests fail, the reply notes that it relied only on the material it obtained.

Wechatai bills input and final output; internal search and tool loops do not consume extra platform allowance. Model and search API fees are separate. More searching means longer material sent to the answer model, which may increase token charges on the provider side. [Learn about credits](/en/docs/credits#metering).`,
        details: [
          {
            title: "Why did it not search, and how do I control search count?",
            body: `Set up to 1–5 searches and 0–8 page reads per question. The model decides whether to call tools based on the question; not every message searches. Results also depend on model capability, the search API and balance. The model's input and output limits still apply.

If you definitely need current information, write “look up the latest information and include sources” in the question. If it still does not search, confirm the answer model supports tool calls.`,
          },
          {
            title: "Can configurations still be used after Plus expires?",
            body: `Free allows at most one plugin across all plugin configurations on the account. After Plus expires, the earliest-created configuration remains usable; the rest are kept but paused. Deleting an earlier configuration frees a slot; disabling alone does not. Renew to restore more plugins.`,
          },
        ],
      },
      {
        id: "troubleshoot",
        title: "4. Common errors",
        body: `- **The reply has no source numbers**: first check whether the question really needs the web. The model may answer from common knowledge or existing material; when you need external facts, ask explicitly to search and include sources. Without a tool call, the reply naturally has no sources.
- **It says no usable web material was found**: check the search service, address, key and balance. SearXNG must allow JSON search; a custom DeepSeek search model must support native Web Search. This usually does not charge credits for a successful result, but the model or search service may already have billed usage.
- **The answer model reports a tool-call error**: if the provider explicitly rejects native tool calls on the first request, DS Chat tries a compatibility mode that asks the model to return actions in a specified JSON format. If that also fails, switch to a text model that supports native tool calls or reliably outputs JSON.
- **Search or read attempts ran out**: only that tool is limited; the turn does not end. The model can still answer from existing material and can still use the other tool if attempts remain. Counts reset next turn; adjust per-turn limits in the plugin configuration.
- **A web page cannot be read**: logged-in pages, text requiring scripts and PDF web pages are unsupported; paste the text or use an attachment. HTTP pages, private network addresses and nonexistent addresses also cannot be read.
- **How do I confirm a test used search**: ask a time-sensitive question under “Test” (“测试”), such as “Search for today's latest Shanghai weather and include sources”, then check whether the reply ends with platform-added “Sources” (“来源”) links. A direct answer without sources does not prove the search service works; if it reports a search failure, follow the prompt to check the search address, key and balance.`,
      },
    ],
  },
  "image-generation": {
    intro:
      "Wechatai's AI image plugin connects your own image-generation API to WeChat: write a description and receive the generated image. Free can choose AI image generation as its one plugin; Plus has no plugin limit. One image per generation, prompt text is billed as input, and platform originals are kept for 30 days.",
    sections: [
      {
        id: "configure",
        title: "1. Configure an image service",
        body: `1. In [Channels & models](/app/channels), add the provider's address and API key, then add a model whose type is “Image generation” (“生图”). The provider must support the \`/v1/images/generations\` endpoint; a normal text model cannot generate images directly. [See how to add a model](/en/docs/channels-models#import).
2. Open the [plugins page](/app/plugins), find “AI image generation” (“AI 生图”), click “Configure plugin” (“配置插件”), and choose the model you just added under “Image model” (“生图模型”). The plugin reuses the channel's saved address and key; you do not enter them again.
3. Set the WeChat shortcut name (default “画图”, Draw), optionally enable or edit the “Waiting message” (“等待提示”) sent after submission, then save and enable. If WeChat is not connected yet, finish [scanning first](/en/docs/wechat-connection).
4. “Test” (“测试”) on the plugins page generates a real image and consumes **${IMAGE_CREDITS} credits** plus input charges for the description, and may incur provider API fees. Test results are also kept for 30 days.

After saving, the plugin card shows the image channel address, whether it uses the channel's saved key, one image per generation and the waiting message. After updating the bound channel address or API key, test again directly on the plugin card; renaming the channel does not affect calls. A saved plugin cannot change models. To switch models (including the model ID), create a new plugin configuration.`,
        details: [
          {
            title: "There is no “Image generation” type in the model list. What now?",
            body: `Add an image-generation model under the channel first, then return to the plugin configuration and select it. The plugin calls only the channel's saved root address and key, sends requests to \`/v1/images/generations\`, and does not reuse a chat protocol.

The provider must actually offer that endpoint and allow your key to call it. Being compatible with the OpenAI chat protocol does not imply image-generation support. Check the provider's documentation for exact model IDs, sizes and parameters.`,
          },
        ],
      },
      {
        id: "draw",
        title: "2. Describe the image and aspect ratio",
        illustration: "plugin-setup",
        body: `Send \`/use 画图\` in WeChat, then describe the subject, scene, style and aspect ratio, for example “Draw a portrait of a woman on a city street, 3:4”. You can also send \`@画图 description\` once without switching modes; \`/exit\` returns to the normal model.

**Each generation produces one image and processes the prompt independently.** Reference images, image-to-image and iterative edits based on the previous image are not supported. If you only want an image, send \`/wx cancel\` to clear staging, then send the description. To analyze an attachment, switch to a chat model and resend the attachment and instructions.

More specific descriptions tend to give better results: include subject and action, environment, lighting, style and framing, and avoid conflicting style requests in one prompt. For example, “An orange cat sitting by the window reading, afternoon light, watercolor illustration, 3:4” is more stable than “a cat”; if you are unhappy, change one condition and retry.`,
        details: [
          {
            title: "How do I specify landscape, portrait and the waiting message?",
            body: `Write \`1:1\`, \`3:4\`, \`4:3\`, \`2:3\`, \`3:2\`, \`9:16\`, \`16:9\`, \`4:5\`, \`5:4\`, \`21:9\` or \`9:21\` in the prompt; Wechatai converts it to a common size parameter. Without one, the provider default applies, and the final size depends on upstream support. An unsupported ratio returns the list of supported ratios.

The waiting message after submission can be edited or disabled in the plugin configuration. It only means the request is waiting upstream, not that the image exists. If generation is slow, wait for the reply or check later instead of submitting repeatedly.`,
          },
        ],
      },
      {
        id: "results",
        title: "3. Save images and billing",
        body: `On success, the image is sent straight to WeChat; save it promptly. Plus members can also view it in [Session history](/app/sessions). Platform originals are kept for 30 days and cannot be downloaded afterwards.

Each image costs **${IMAGE_CREDITS} credits**; the description is billed as input, and the image API is billed by the provider. Wechatai charges no credits for a failed generation, while upstream charges follow the provider's bill. Model input and per-turn credit limits still apply. [Learn about billing](/en/docs/credits#metering).

Save or forward the image in WeChat after receiving it. If you miss it, Plus members can download it from session history. Platform originals expire after 30 days; failed or timed-out tasks produce no downloadable file, and retries are billed as new requests.`,
      },
      {
        id: "troubleshoot",
        title: "4. Common errors",
        body: `Read the error in the WeChat reply first, then confirm the channel address, key and image model ID under [Channels & models](/app/channels). You can also send a shorter description to test.

- **Authentication failed or permission denied**: check that the API key is valid and allowed to use the image model; regenerate the key in the provider console if needed.
- **Endpoint or model not found**: confirm the provider supports \`/v1/images/generations\` and the model ID matches the provider console. A chat model cannot replace an image model.
- **Not enough Wechatai credits**: wait for the daily allowance to refresh, or top up under [Billing](/app/billing).
- **Per-turn credits limit too low**: each turn needs at least ${IMAGE_CREDITS} credits plus the description's input charges. Raise the image model's per-turn limit in [model settings](/en/docs/channels-models#limits).
- **Upstream image service out of balance or quota**: check the provider account balance and billing status; this is separate from Wechatai credits.
- **Too many requests**: wait a while and retry instead of submitting repeatedly.
- **Timeout, invalid response or upstream error**: usually no Wechatai credits are charged; retry later or switch channels. The upstream may already have billed usage.
- **The image did not arrive in WeChat**: check the WeChat connection and reply window. Plus users can look in [Session history](/app/sessions); platform originals are kept only 30 days.
- **The ratio had no effect**: use a supported ratio or let the provider use its default size; the final framing is decided upstream.`,
      },
    ],
  },
  roleplay: {
    intro:
      "Add a chat companion with personality to WeChat, or co-write a story. Wechatai's roleplay plugin works through WeChat ClawBot and supports built-in characters, V2 character-card imports, world books and plot summaries. Replies come from the text model you configure. Free supports one plugin; Plus has no plugin limit.",
    sections: [
      {
        id: "play",
        title: "How can I play?",
        body: `You decide who the other person is, what your relationship is and where the story starts:

- **Everyday chat with a consistent voice.** Share small moments with Wanqing, the bookshop owner, or trade complaints with the witty Zhiyao. Personality, tone and how you treat each other are all editable.
- **Write a story together, one decision at a time.** Find an unidentified map at a rooftop coffee stall; choose to ask questions, set out or stay, and the character responds as the story unfolds.
- **The same character, a different opening.** Rewrite your identity, your relationship and the first meeting, then create a session to start another storyline.

Characters are played by AI. Their settings help keep the persona consistent, but actual behavior depends on the selected model. On your first try, a built-in character is enough; you do not need character cards or world books yet.`,
      },
      {
        id: "character",
        title: "1. Choose a character and save the configuration",
        illustration: "plugin-roleplay",
        body: `Configure a [text model](/en/docs/channels-models) and [connect WeChat](/en/docs/wechat-connection) first, then open “Roleplay” (“角色扮演”) on the [plugins page](/app/plugins):

1. Choose the answer model, preview a built-in character you like and click “Use this character” (“使用这个角色”).
2. Edit the persona, relationship, story scene and opening as needed, or create your own from scratch.
3. Save and enable it, and note the shortcut name. The example below uses Xingye's shortcut “星野”.

Other built-in characters are Shen Yan, Su Wanqing, Xu Zhiyao, Cen Wu and Ju Deng. To make the relationship fit better, start with “Your identity and relationship” (“你的身份与关系”) and the opening; you do not have to fill in everything at once.`,
        details: [
          {
            title: "I want to write my own character. What is the minimum?",
            body: `On the “Character” (“角色”) page, fill in the name, shortcut, dialogue model and character setting. The “Story and dialogue” (“故事与对话”) page can add your identity, scene and opening. For example:

- **Character setting:** Lu Xingye, a surveyor who runs a rooftop coffee stall. Humorous, adventurous, speaks briefly and never decides for me.
- **Your identity and relationship:** I am a regular who often comes for coffee, and we relate as equals.
- **Story scene:** At closing time, an unfamiliar old map appears on the table.
- **Opening:** “Why does this map show the rooftop under our feet? Have you seen it before?”

The opening shapes where the story starts and how replies sound. “Dialogue examples” (“对话示例”) can add one or two exchanges in the voice you like; they demonstrate style and are not treated as events that already happened.`,
          },
        ],
      },
      {
        id: "story",
        title: "2. Start and continue the story",
        body: `Send \`/use 星野\` and chat directly. \`/wx new\` starts an independent plot; \`/exit\` returns to the normal model.

You can speak directly or write your own actions, for example “I spread the map out and point at the mark in the corner: what is this place?” The character replies based on its settings and context.

Long conversations are automatically condensed into a **plot summary** that helps carry forward relationships, important events and unresolved clues. To start over, prefer \`/wx new\` for a separate story; \`/wx reset\` resets the current session's context and summary while keeping chat records.`,
        details: [
          {
            title: "What is the difference between a one-off call and an independent plot?",
            body: `\`/use 星野\` enters that character's own active session; \`@星野 content\` is a one-off call that uses the **current session context** and does not switch to the character's independent history. To continue one plot, use \`/use\`.

Plus members can view and edit the “plot summary” (“剧情摘要”) in [Session history](/app/sessions). The summary preserves scenes, relationships and important facts but can still miss things; put important settings in the persona or world book.`,
          },
        ],
      },
      {
        id: "cards",
        title: "3. What is a character card, and how do I import one?",
        body: `**A character card is an importable “persona package”.** It usually bundles name, personality, background, story scene, opening and dialogue examples, and sometimes a world book. With a card you like, you do not start from a blank page, and you can edit the imported version.

1. On the character selection page or in the editor, click “Import character card” (“导入角色卡”) and choose a **V2 JSON** file or an original PNG containing character data.
2. Review the imported persona and opening, choose your dialogue model and shortcut, then save and enable.
3. In WeChat, use \`/use your-shortcut\` to start chatting.

**An ordinary avatar or screenshot is not a character card**; a PNG must embed \`chara\` data. A card stores settings, not your previous chat records. “Export V2 JSON” (“导出 V2 JSON”) saves and shares the persona you edited.`,
        details: [
          {
            title: "Import failed, or it behaves differently from the original tool?",
            body: `Files can be up to 5 MB and character text up to 64 KB. Character Card V2 is supported; export other versions from the original tool as V2 first. For PNG, use the original card file, because screenshots, compression or re-saving may strip embedded settings.

Wechatai uses text settings only and does not store the PNG cover. Alternate greetings are not loaded automatically. Only \`{{char}}\` and \`{{user}}\` are substituted; scripts and other macros are not executed, so not every SillyTavern extension is compatible. Check the page prompts after importing, then save; unknown extension fields are preserved in exported data.

For formats, field mapping and export rules, see [Character card import and compatibility](/wechat-character-card).`,
          },
        ],
      },
      {
        id: "lore",
        title: "4. What is a world book, and how do I configure one?",
        illustration: "roleplay-lore",
        body: `**A world book is the “setting collection” you prepare for the story.** Write background for a person, place, organization or object and set trigger keywords; when the chat mentions a related word, Wechatai adds the matching entry to the model context.

For example, add a rule for Xingye's coffee stall: keywords “rooftop, coffee stall”, content “The rooftop coffee stall opens only on sunny days and closes when it rains.” When the chat mentions the stall on a rainy day, the model can use that setting without an explanation every time.

In the editor, open “World book” (“世界书”), click “Add world book entry” (“添加世界书条目”), enter keywords and content, enable the entry and save. Start with one or two entries; important identity and speaking style still belong in “Character setting” (“角色设定”).`,
        afterIllustration: `The character card decides “who is talking to you”, the world book supplies “what background exists in the story”, and the plot summary organizes “what you have been through”. World books are written by you or imported from a card and do not learn from chat automatically; adding them to context does not guarantee the model applies them correctly every time.`,
        details: [
          {
            title: "Does a world book save credits? Why did a keyword match have no effect?",
            body: `Splitting rarely used background into entries avoids sending the whole setting every turn; actual usage depends on which entries trigger and their length. Included settings still count as input and are not free memory.

Wechatai scans the current message and the last three, up to 32K characters. After a keyword matches, the entry must be enabled and fit within the world-book budget and the model's remaining input space. The default budget is 1,000 tokens, up to 4,000; 0 disables inclusion, and entries that do not fit are skipped whole.

Any one trigger keyword of an entry is enough; when secondary keywords are set, one of them must also match. Priority, constant entries and an English case-sensitivity option are supported. Up to 50 entries; recursive triggers, regex, probability, scripts and custom insertion positions are not.`,
          },
          {
            title: "Learn more about character cards and world books",
            body: `These are common concepts in AI character-chat tools. See SillyTavern's official [character design guide](https://docs.sillytavern.app/usage/core-concepts/characterdesign/) and [world info guide](https://docs.sillytavern.app/usage/core-concepts/worldinfo/). They describe SillyTavern; what Wechatai currently supports is defined by this page and the editor prompts.`,
          },
        ],
      },
      {
        id: "credits",
        title: "5. How is roleplay billed?",
        body: `The character setting, world book, summary, history and current question all count as input, and the final reply counts as output, billed by normal text rules. The model's input/output and per-turn credit limits still apply.

The first opening message is free, but later copies sent with context count as input. Internal summary generation does not consume extra Wechatai credits, though the model provider may bill API usage.`,
      },
    ],
  },
  "personal-assistant": {
    intro:
      "Jot down an expense or a to-do, or have WeChat remind you at the right time. Wechatai's personal assistant saves notes, expenses, to-dos and reminders to your account for later lookup and organization. It needs a text model that supports tool calls, and Free can choose it as its one plugin.",
    sections: [
      {
        id: "configure",
        title: "1. Configure and start",
        illustration: "plugin-assistant",
        body: `Finish [model configuration](/en/docs/channels-models) and [connect WeChat](/en/docs/wechat-connection), then configure “Personal assistant” (“个人助理”) on the [plugins page](/app/plugins):

1. Choose an answer model that supports tool calls, a default expense currency and the record-sharing mode.
2. If you need scheduled reminders, choose the receiving WeChat; when records are isolated by link, reminders return to the link that created them.
3. Set the shortcut to “助理” (Assistant), save and enable. In WeChat, send \`/use 助理\`, then say what you want.

Try: “Lunch cost 32 yuan today”, “Add a to-do: mail the package”, “How much did I spend on food this month?”

For one-off use, send \`@助理 lunch cost 32 yuan today\`; \`/exit\` returns to the normal model. The assistant asks again when the amount or time is unclear; check the record after saving.`,
        details: [
          {
            title: "How do I choose the record-sharing mode?",
            body: `**Share across all WeChat links** (“所有微信链接共享”): WeChat links using the same assistant configuration share records, and reminders go to the receiving WeChat selected in the configuration. **Isolate by WeChat link** (“按微信链接隔离”): each link reads and writes only its own notes, to-dos, expenses and reminders.

Switching modes does not copy or merge records; old records stay in their original scope, and you can switch the view under “My records → Record scope” (“我的记录 → 记录范围”). Existing reminders keep their original receiving link; sessions that used this assistant reset their context, while chat records remain.`,
          },
          {
            title: "What is the difference between a to-do, a reminder and an expense?",
            body: `“Add a to-do” (“添加待办”) records a task you can check off; “Remind me” (“提醒我”) only schedules a reminder and does not create a to-do. If you need both, ask for both explicitly.

Expenses are totaled separately per currency and are not converted automatically. Voice messages with a WeChat transcript can also create notes; images require Plus and a vision-capable model, as described in the [attachment guide](/en/docs/attachments).`,
          },
        ],
      },
      {
        id: "reminders",
        title: "2. Schedule reminders",
        body: `Say “Remind me to submit the documents at 9 tomorrow morning”, or set a daily or weekly repeat. All times are **Beijing time**.

Scheduled pushes do not call a model or charge credits; when you create or query reminders in WeChat, normal conversation usage applies. Free users can use reminders in an available personal assistant configuration.

**WeChat pushes are limited by the 24-hour reply window after the latest interaction.** Keep the connection active before the due time and send a message in the original WeChat conversation; the free \`/wx help\` command refreshes the window. For important schedules, also set a system alarm.`,
        details: [
          {
            title: "Why did I not receive a reminder?",
            body: `Check the status under “My records → Reminders” (“我的记录 → 提醒”), and verify the receiving WeChat, reply window, plugin status and plan allowance. Reminders pause when the link is offline, the plugin is disabled or the plan allowance is exceeded.

One-time reminders more than 24 hours late are not resent; repeating reminders skip missed occurrences and keep the next one. After changing the bound WeChat or receiving link, set the reminder times again.`,
          },
        ],
      },
      {
        id: "daily-tasks",
        title: "3. Review today's to-dos",
        body: `Say “Today I need to: mail the package, organize the meeting notes”, and the assistant records today's to-dos. Under “My records → Notes → To-do list” (“我的记录 → 笔记 → 待办清单”), switch to “Today's to-dos” (“今日待办”) and check items off, or say “Done: mail the package” in WeChat.

To receive a daily summary, say “Remind me of today's to-dos at 9 every morning”, or enable “Daily to-do reminder” (“每日待办提醒”) above the list. It reads the latest unfinished items for the day and **sends nothing when there are none**.`,
        details: [
          {
            title: "How do I change or disable the daily summary?",
            body: `Say “Change the daily to-do reminder to 8 pm” or “Turn off the daily to-do reminder”, or adjust it on the web. Each assistant configuration has one daily summary; changing the time updates the existing setting.

Only items planned for today and unfinished are included; completed, deleted or other-day items are excluded, and missed dates are not resent. Long lists show the first 20 items and note how many remain. Pushes are also limited by the WeChat reply window, an active connection and the plugin allowance.`,
          },
        ],
      },
      {
        id: "records",
        title: "4. Manage records on the web",
        body: `Open “My records” (“我的记录”) from the personal assistant card on the [plugins page](/app/plugins) to view notes, reminders and the ledger, search, filter by date, export CSV or see income and expense statistics. Exports are limited to 1,000 records at a time, and each configuration stores up to 10,000 records.

Web editing and exporting cost no credits; WeChat conversation and model API usage are billed normally. After Plus expires, existing records can still be viewed, exported and deleted.

**Clearing chat does not delete assistant records; deleting the plugin configuration deletes all its records and cancels reminders permanently.** Export important records first.`,
        details: [
          {
            title: "Does a plugin test save real records or send reminders?",
            body: `No. A test only demonstrates; it saves no records and sends no reminders. It does call the model, consuming conversation credits and possibly incurring provider API charges.`,
          },
        ],
      },
    ],
  },
  faq: {
    intro:
      "Confirm the current WeChat connection, model and plugin before troubleshooting a specific service. Send /wx status in WeChat to see the configuration in use.",
    sections: EN_FAQ_SECTIONS,
  },
  "cloud-agent": {
    intro:
      "Send a file to WeChat and let Xiaowei organize it, convert it or process a task. Xiaowei runs in the Wechatai cloud with no installation; it requires Plus and your own model API key, and current service availability is shown on the plugins page.",
    sections: [
      {
        id: "setup",
        title: "1. Enable Xiaowei and assign your first task",
        illustration: "plugin-cloud",
        body: `First time? Follow the [Xiaowei tutorial](/en/docs/wechat-ai-assistant) through a Markdown-to-Word conversion, then return here for quotas and task rules.

Finish [model configuration](/en/docs/channels-models) and [connect WeChat](/en/docs/wechat-connection) first. The model must support tool calls. Before buying membership, confirm the ClawBot entry exists in WeChat.

1. Open the [plugins page](/app/plugins), find “Xiaowei” (“小薇”), add a configuration and enable it.
2. It follows the current WeChat text model by default, or you can pin one; keep the shortcut “小薇”.
3. Send \`/use 小薇\` in WeChat, then state the task. For files, **send the attachment first, wait for staging to succeed, then send the full instructions**, for example “Convert this Markdown to Word and keep the heading levels”.

For a single use, send \`@小薇 full instructions\`; \`/exit\` returns to the normal model. Enabling the plugin or scanning does not enter Xiaowei automatically; if you changed the shortcut, use your own name.`,
      },
      {
        id: "tasks",
        title: "2. Check progress, results and stop a task",
        body: `Tasks run in the background and try to send the result and files back to the original WeChat when done. While waiting, open [Cloud tasks](/app/tasks) to check progress and download results.

To stop, send \`/wx stop\` or click “Stop” (“停止”) on the tasks page. **Stopping requires cloud confirmation**; if the task already completed, the valid result is still billed. \`/wx cancel\` only clears staged attachments and does not stop a task.

**To retry an attachment task, resend the attachments and the full instructions.** Staging for that batch is cleared when the task is accepted; after a failure, cancellation or follow-up, sending only text does not attach the original file.`,
        details: [
          {
            title: "No result arrived in WeChat, or I switched sessions?",
            body: `Check the status on the [tasks page](/app/tasks) first. If the WeChat reply window has expired, send the free \`/wx status\` command in the **original WeChat conversation** and follow the prompt to restore delivery; sending an ordinary message may create another task.

After switching sessions or plugins, the old task continues, but its result is not sent to the new session automatically. Resetting, archiving, clearing or deleting the original session, unbinding WeChat or disabling the plugin requests a stop and cancels automatic delivery.

After Plus expires or new tasks pause, retained tasks can still be viewed and stopped. Creating a session alone does not submit a task, charge credits or consume an execution attempt.`,
          },
        ],
      },
      {
        id: "limits",
        title: "3. Files, storage and costs",
        body: `Text, images, PDFs with extractable text, DOCX, text files and voice with a WeChat transcript are supported. Up to four attachments per task; images need a vision model. See the [attachment guide](/en/docs/attachments) for formats and sizes. PDF and Word conversion reflows the extracted text and **does not preserve the original layout**.

A task returns up to four files, each up to 2 MiB, kept for 30 days; download them promptly for long-term storage. The account has **500 MiB** of cloud storage by default, shared by Xiaowei configurations on the same account; actual usage and quota are shown on the [tasks page](/app/tasks). Total storage is not the per-file limit.

Wechatai bills input and final valid output; internal tool calls are not charged separately. Returned images cost **${IMAGE_CREDITS} credits each**; PDF, Word and other non-image files are not charged extra. Failed, partial, clarification or confirmed-cancelled tasks are not billed for successful results; model API usage during execution is still billed by your provider. [See the full billing rules](/en/docs/credits#metering).`,
        details: [
          {
            title: "Task attempts, execution time limit and support scope",
            body: `Each account can have one active task at a time. Daily attempts and the execution time limit are shown on the plugins page, and attempts refresh at Beijing time. Submitting requires Plus, a positive credit balance and an available attempt; buying credits alone does not unlock Plus.

A failure or cancellation after acceptance still counts as an execution attempt; a validation failure before submission, an explicit non-submission or a cloud rejection releases the reserved attempt. Execution attempts and credits are two separate rules.

Xiaowei supports memory and file processing within the account space. It does not support browsers, untranscribed voice, human approval or autonomous scheduled tasks. Think of it as a cloud assistant similar to OpenClaw or WorkBuddy; this page defines its actual capabilities.`,
          },
          {
            title: "Long files, model limits and failed file receipt",
            body: `Attachment text plus instructions is capped at 50,000 characters and is also bounded by the model context and input limits; tasks that cannot fit are rejected. For scanned PDFs, run text recognition first or send the relevant pages as images.

Each turn's input also includes the system prompt, history, images and tool information. Without a native counting API, each image reserves 16,000 tokens for budget estimation, which is not exact billing. If over the limit, create a session, reduce attachments or adjust [model limits](/en/docs/channels-models#limits). Output limits apply per turn, and the per-turn credits limit does not cap the upstream API bill. Platform settlement is not pre-charged, so a negative balance can appear after success.

Returned images support PNG, JPEG, WebP, GIF and SVG; corrupt or unsupported results fail the task without charging credits. Temporary file-read failures are retried for up to 10 minutes; you can cancel file receipt on the tasks page or send \`/wx stop\`; after a confirmed cancellation this run is not charged credits, and upstream charges follow the provider bill.`,
          },
        ],
      },
      {
        id: "data",
        title: "4. Data and deletion",
        body: `Task content is sent to the cloud AGT execution service and the model provider you choose; channel configuration and keys are synced to the execution service encrypted. Account spaces are isolated, while cloud sessions on the same account may share memory.

**Creating or resetting a session does not clear cloud memory.** Clearing or deleting a session deletes the related task text and results in Wechatai, so files can no longer be downloaded, while billing records remain. It does not automatically delete remote AGT history, memory or WeChat copies. See the [privacy policy](/privacy).`,
      },
    ],
  },
  notifications: {
    intro:
      "Wechatai's notification plugin sends order statuses, monitoring alerts and script results to your WeChat through a webhook. One HTTP request is enough, with no model API; Free can use it, and pushes cost no credits.",
    sections: EN_NOTIFICATION_SECTIONS,
  },
};
