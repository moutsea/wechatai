import type { DocContent } from "../../../docs";

export const EN_TUTORIAL_CONTENT: Record<
  "wechat-ai-assistant" | "deepseek-in-wechat" | "multiple-openclaw-in-wechat" | "hermes-in-wechat",
  DocContent
> = {
  "wechat-ai-assistant": {
    intro:
      "Want an AI assistant to get things done without learning install commands, renting a server or keeping a computer on? Xiaowei is an AI Agent assistant running in the Wechatai cloud. You assign a task in WeChat; it uses your configured model and cloud tools, then sends back text or a file.",
    sections: [
      {
        id: "what-is-xiaowei",
        title: "What can an AI assistant in WeChat do for you?",
        body: `Besides answering questions, Xiaowei can generate downloadable files. For example:

- **Convert documents**: turn Markdown or text into Word or PDF.
- **Organize material**: extract decisions and action items from meeting notes and produce a document.
- **Rewrite into a draft**: turn scattered notes into a draft with headings and sections, then export it.

You provide the material and state the requirements clearly. You do not deploy OpenClaw or maintain a device running an Agent. The walkthrough below converts Markdown to Word.`,
      },
      {
        id: "prepare",
        title: "Before you start: membership, model and WeChat",
        body: `Xiaowei currently requires **Plus membership**, plus the following:

1. **A usable model API key**: first connect a provider under [Channels & models](/app/channels) and import a text model that supports tool calls. [See the setup guide](/en/docs/channels-models).
2. **The WeChat ClawBot entry**: on your phone, open WeChat **Me → Settings → Plugins → WeChat ClawBot** (“我 → 设置 → 插件 → 微信 ClawBot”). If it is missing, update WeChat first. [See the scan steps](/en/docs/wechat-connection#connect).

**Plus does not include model API fees**; the provider needs available balance or quota. Before paying, confirm the ClawBot entry exists in your WeChat and check Xiaowei's availability on the [plugins page](/app/plugins). [See plans](/pricing).`,
      },
      {
        id: "setup",
        title: "Step 1: enable Xiaowei",
        body: `1. Open the [plugins page](/app/plugins), find “Xiaowei” (“小薇”) and click “Configure plugin” (“配置插件”).
2. Keep “Use default model” (“使用默认模型”) under “Execution model” (“执行模型”) to follow the normal text model currently selected in WeChat, or pin a model that supports tool calls.
3. Keep the WeChat shortcut “小薇”, set the status to “Enabled” (“启用”), and click “Save configuration” (“保存配置”).

Complete scanning following [Connect WeChat](/en/docs/wechat-connection); an already-connected WeChat can be used directly. If you are reading this on your phone, display the QR code on a computer or another device, then scan it with phone WeChat.`,
      },
      {
        id: "first-task",
        title: "Step 2: convert Markdown to Word in WeChat",
        illustration: "plugin-cloud",
        body: `In the WeChat conversation bound to Wechatai, follow this order:

1. Send \`/use 小薇\` and confirm you are in Xiaowei. If you changed the shortcut, use your own name.
2. Send the \`.md\` file to convert. **Wait for the “attachment staged” confirmation, then send the full instructions.**
3. Tell it what file to produce, for example:

\`\`\`text
请把刚才暂存的 Markdown 转成 Word（.docx），保留标题层级和列表，按正文重新排版，并把生成的文件发给我。
\`\`\`

The prompt asks Xiaowei to convert the staged Markdown into Word (.docx), keep the heading hierarchy and lists, reflow the body, and send back the generated file.

Staging an attachment does not submit a task or charge credits; the task is created only after you send processing instructions. Xiaowei reflows the extracted text and **does not preserve the original layout**. For images and scans, see the [attachment guide](/en/docs/attachments).`,
        afterIllustration: `The illustration shows configuration and chat; actual output depends on the file and selected model. You can also replace the request with “Turn this text into a PDF” or “Extract decisions and action items from the meeting and generate a Word document.”`,
      },
      {
        id: "results",
        title: "Step 3: check progress and receive the result",
        body: `After the task is accepted, Xiaowei runs it in the background and tries to send the result and files back to the original WeChat conversation. While waiting, open [Cloud tasks](/app/tasks) to check status and download results; you do not need to watch the chat.

**If a task fails and you retry, resend the attachment, wait for staging, then send the full instructions.** Staging is cleared when the task is accepted, so adding only “try again” does not attach the original file.

To stop, send \`/wx stop\` or click “Stop” (“停止”) on the tasks page. Stopping needs cloud confirmation; if the task already completed, the valid result is still billed. Send \`/exit\` to return to normal model chat; this does not stop an accepted task.`,
      },
      {
        id: "faq",
        title: "What you may want to know before using it",
        body: `Xiaowei suits users who do not want to maintain a runtime and want to handle files and text from WeChat. See [Xiaowei plugin details](/en/docs/cloud-agent) for quotas, file limits and data rules.`,
        details: [
          {
            title: "Is Xiaowei just a cloud version of OpenClaw?",
            body: `Xiaowei is Wechatai's cloud execution assistant and a different option from deploying OpenClaw yourself. It currently supports text tasks, file processing and memory within the account space. It does not support browser control, autonomous scheduled tasks or direct access to files on your computer; capabilities follow [plugin details](/en/docs/cloud-agent#limits).

To use tools on your own device, an existing OpenClaw configuration or scheduled tasks, [connect an existing OpenClaw](/developers/openclaw).`,
          },
          {
            title: "Besides Plus, what costs are there?",
            body: `Wechatai charges credits for task input and the final valid reply. Non-image files such as Word and PDF are free; image results are charged separately. The selected model's API usage is billed by its provider.

Failed or confirmed-cancelled tasks are not charged credits for successful results, but model API usage already incurred may still apply; a failure or cancellation after acceptance still counts as an execution attempt. Daily attempt limits and execution time limits follow the plugins page. [See billing](/en/docs/cloud-agent#limits).`,
          },
          {
            title: "WeChat did not receive the file, or it is too large?",
            body: `Check the [tasks page](/app/tasks) for completion and try downloading the result. If it says the WeChat reply window is invalid, send \`/wx status\` in the original WeChat conversation and follow the prompt to restore delivery.

One input can have at most four attachments and is also bounded by task text and model input limits. Each generated file is at most 2 MiB and kept for 30 days, so download promptly. The account provides 500 MiB of cloud storage by default; total storage is not the per-file limit. [See all file limits](/en/docs/cloud-agent#limits).`,
          },
          {
            title: "Where is uploaded material sent?",
            body: `Task content is sent to the Wechatai cloud execution service and the model provider you choose; the selected model's channel configuration and key are synced to the execution service encrypted. Creating or resetting a session does not clear cloud memory. See [Xiaowei data notes](/en/docs/cloud-agent#data) and the [privacy policy](/privacy) for deletion rules.`,
          },
        ],
      },
    ],
  },
  "deepseek-in-wechat": {
    intro:
      "Put DeepSeek into the WeChat app you open every day for questions, copy edits and organizing thoughts. Wechatai connects your own model API; you do not install or keep a local program running.",
    sections: [
      {
        id: "before-setup",
        title: "Before starting, confirm two things",
        body: `**Basic text chat is available on Free; model API fees are separate.** Image and file input require Plus and depend on model capability.

Phone WeChat needs **Me → Settings → Plugins → WeChat ClawBot** (“我 → 设置 → 插件 → 微信 ClawBot”). If it is missing, update WeChat first; see [Connect WeChat](/en/docs/wechat-connection#connect) for the interface.`,
      },
      {
        id: "prepare",
        title: "Prepare a DeepSeek API key",
        body: `Go to the [DeepSeek platform](https://platform.deepseek.com/) to create an API key and confirm it has balance, then open the Wechatai [workspace](/app). **An API key is not a chat-site login password, and a web membership is not an API balance.**

If you already bought third-party DeepSeek API access, use that provider's address and key; you do not need an official key.`,
        details: [
          {
            title: "Do I need to install OpenClaw?",
            body: `Not for normal model chat in this tutorial. The model runs at the API provider you choose, and Wechatai handles the WeChat connection. If you have an existing OpenClaw and want to connect it, see [DeepSeek connection options](/wechat-deepseek).`,
          },
        ],
      },
      {
        id: "channel",
        title: "Step 1: add a DeepSeek channel and model",
        illustration: "channel-form",
        body: `1. Open [Channels & models](/app/channels) and click “Add channel” (“添加渠道”).
2. Choose **DeepSeek** as the provider, enter the API key and click “Save and fetch models” (“保存并获取模型”). The address and protocol are filled in automatically.`,
        afterIllustration: `Once the text model is imported, click the **lightning icon “Test connection”** (“测试连接”) on its row. Continue to connect WeChat only after the test succeeds.

**Testing consumes a small amount of credits and may incur provider API fees.**`,
        details: [
          {
            title: "Models did not sync, or the test failed?",
            body: `The channel is usually already saved; do not create it again. Click “Fetch available models” (“获取可用模型”) to retry. If the model is still missing, click “Add model” (“添加模型”) and enter the model ID from the provider.

If the test fails, check the key, balance and model permissions first, then the protocol, address and model ID. See [Sync and test models](/en/docs/channels-models#import).`,
          },
          {
            title: "How do I configure a third-party DeepSeek API?",
            body: `Choose the matching channel in the provider list. If there is no preset, choose “Custom (third-party channel / other protocol)” (“自定义（第三方渠道 / 其他协议）”) and enter the protocol, Base URL and API key as the provider documents. Do not put a third-party key into DeepSeek's official preset address.

Save, then fetch or add the model ID manually, then test. See the [custom channel guide](/en/docs/channels-models#configure).`,
            illustration: "custom-channel",
          },
        ],
      },
      {
        id: "connect",
        title: "Step 2: connect WeChat and send your first message",
        illustration: "tutorial-deepseek-chat",
        body: `1. Open [WeChat connection](/app/wechat), choose an existing link or click “Create link” (“创建链接”), then get the QR code. There is no need to scan again if it is already connected.
2. Follow [Connect WeChat](/en/docs/wechat-connection#connect) and scan with phone WeChat ClawBot, then confirm. If you are browsing on your phone, display the QR code on a computer or another device.
3. After the page shows “Connected” (“已连接”), select DeepSeek under “Switch channel and model” (“切换渠道与模型”), then send a question in the matching WeChat conversation.`,
        afterIllustration: `To check the current configuration, send the free \`/wx status\` command. Do not rely only on the model's answer about its own name.`,
      },
      {
        id: "sessions",
        title: "Step 3: change topics or switch models",
        body: `- **Start another topic:** send \`/wx new\`; the original chat records remain.
- **Continue an earlier topic:** send \`/wx sessions\`, then \`/wx switch number\`.
- **Change models:** switch the channel and model on the WeChat connection page; **no new scan is needed**.

To make the model reconsider the current question, use \`/wx reset\` to reset the context; chat records are not deleted. See the [command reference](/en/docs/commands) and [sessions](/en/docs/sessions).`,
      },
      {
        id: "search",
        title: "Optional: web search for DeepSeek",
        body: `A normal model does not browse the web automatically after connecting to WeChat. To look up current information, follow the [DS Chat guide](/en/docs/ds-chat#configure) to choose an answer model and configure a separate search service.

After saving the shortcut \`ds\`, send \`/use ds\` and ask “Look up today's weather in Shanghai and include sources.” For one question, use \`@ds question\`; send \`/exit\` to return to the normal model.

You provide the model and search service, and their API fees are separate. Whether it searches depends on the question, the model's judgment and API availability.`,
      },
      {
        id: "faq",
        title: "Costs and common questions",
        body: `Wechatai charges credits for actual input and replies; model provider API fees are separate. History may also count as input. Send \`/wx balance\` to check the balance, or see [billing and usage estimates](/en/docs/credits#metering).`,
        details: [
          {
            title: "It is connected, so why no reply?",
            body: `Send the free \`/wx help\` command first. If there is no reply, check [WeChat connection](/en/docs/wechat-connection#reconnect). If commands reply, test the model on the channels page and check the key, provider balance and model ID. After the model test passes, use \`/wx status\` to confirm you are not inside another plugin.`,
          },
          {
            title: "Can I send images, files or voice?",
            body: `Image and file input require Plus. Reading an image also needs a vision-capable model; models synced from a DeepSeek channel may not have that capability. Follow the [attachment guide](/en/docs/attachments): send the attachment first, then the instructions.

Voice does not require Plus but must include WeChat's transcript; without one, send text instead.`,
          },
          {
            title: "Is this an official DeepSeek or WeChat product?",
            body: `No. Wechatai is an independent product that connects to DeepSeek through the API you configure. It is not officially affiliated with WeChat, Tencent or DeepSeek.`,
          },
        ],
      },
    ],
  },
  "multiple-openclaw-in-wechat": {
    intro:
      "One WeChat conversation, two OpenClaw assistants for work and life. Wechatai gives each configuration its own shortcut name; models, tools and memory stay managed by your own OpenClaw.",
    sections: [
      {
        id: "choose",
        title: "First decide where the two assistants come from",
        body: `Both options work:

- **One OpenClaw on each of two devices:** run the connection command on the matching device.
- **Multiple Agents in one OpenClaw:** run each generated connection command on the same device, then choose the assistant each time.

An Agent here is an assistant inside OpenClaw. After connecting, Wechatai shows the available assistants, so you do not type an Agent ID; see the [OpenClaw multi-agent documentation](https://docs.openclaw.ai/concepts/multi-agent) to create one.`,
      },
      {
        id: "prepare",
        title: "Before you start",
        body: `This tutorial creates two plugin configurations and **requires Wechatai Plus**. Free can connect one plugin to try it.

First confirm OpenClaw can chat normally on your computer or server and its Gateway is running. Configure the model and API key in OpenClaw; you do not add them again in Wechatai. **The host must stay online; after shutdown or sleep it cannot process messages.**

The current connection supports text and voice with a WeChat transcript. Images and files are not supported yet.

If OpenClaw is not installed, see the environment requirements and install entry in the [OpenClaw connection guide](/developers/openclaw).`,
      },
      {
        id: "first",
        title: "Step 1: connect the work assistant",
        illustration: "agent-pairing-openclaw",
        body: `1. Open OpenClaw on the [plugins page](/app/plugins), click “Configure plugin” (“配置插件”), then “Connect OpenClaw” (“连接 OpenClaw”).
2. Copy the connection command and paste it into the **terminal of the device running OpenClaw**. For a server install, use the server terminal.
3. When the page shows “Connected” (“已连接”) and the dialog closes, open “View configuration → Edit configuration” (“查看配置 → 修改配置”). If several Agents exist, choose the work assistant, change the name to “Work assistant” (“工作助手”) and the shortcut to \`work\` under “More settings” (“更多设置”), then save.`,
        afterIllustration: `**The command is valid for ten minutes; do not share it.** Installation restarts the Gateway, so wait until current tasks finish. If the connection fails, read the terminal output first, then check the status on the web page.`,
      },
      {
        id: "second",
        title: "Step 2: add the life assistant without replacing the first",
        illustration: "openclaw-configs",
        body: `1. Open OpenClaw's “View configuration” (“查看配置”) and click **“Add another configuration”** (“添加另一组配置”) at the bottom to generate another connection command.
2. Run it on the device with the life assistant; for another Agent in the same OpenClaw, run it on the same device.
3. After connecting, choose the life assistant if several Agents exist; with only one, it is detected automatically. Set the name to “Life assistant” (“生活助手”), the shortcut to \`life\`, and save.

**Use “Add another configuration” for a new assistant.** “Reconnect” (“重新连接”) replaces the current connection and does not add an assistant.`,
      },
      {
        id: "switch",
        title: "Step 3: switch assistants in WeChat",
        illustration: "tutorial-openclaw-chat",
        body: `First complete scanning following [Connect WeChat](/en/docs/wechat-connection#connect). An existing WeChat connection can be used directly; **no new scan per assistant**.

Send \`/use work\` to enter the work assistant and \`/use life\` to switch to the life assistant, then send messages directly. Shortcut names follow the configurations you saved.`,
        afterIllustration: `For a one-off request to the work assistant, send \`@work organize my project progress\`; the default assistant does not change. \`/wx plugins\` lists shortcuts, \`/wx status\` shows the current configuration, and \`/exit\` returns to the normal model.`,
        details: [
          {
            title: "How do I tell OpenClaw and Wechatai commands apart?",
            body: `After entering OpenClaw, \`/help\`, \`/new\` and similar commands go to OpenClaw; Wechatai commands use \`/wx help\` and \`/wx new\`. \`/use\` and \`/exit\` always switch plugins in Wechatai.

\`/wx new\` creates a Wechatai session and a remote conversation; it does not delete OpenClaw's files or long-term memory. See [commands](/en/docs/commands#agent-commands) for details.`,
          },
        ],
      },
      {
        id: "notifications",
        title: "Optional: receive scheduled reminders and background results",
        body: `First send a message to the matching assistant in WeChat to establish a return channel. Enable “Receive scheduled tasks and background result pushes” (“接收定时任务和后台结果推送”) under the plugin's “More settings”, then ask it to create a task and say “send the result back to the current wechatai conversation”.

After switching to the life assistant, the work assistant can still send results, and the message notes its source. Follow up with \`@work follow-up question\`, or send \`/use work\` for an ongoing chat.

**WeChat pushes are limited by the 24-hour reply window after the latest interaction.** After it expires, send \`/wx help\` in the original conversation to refresh the window; expired results are not guaranteed to be resent. See the [OpenClaw connection guide](/developers/openclaw) for delivery settings.`,
      },
      {
        id: "faq",
        title: "Costs and common questions",
        body: `Wechatai charges credits only for the text sent to the plugin and the final reply; proactive pushes count output only. Model costs inside OpenClaw are billed by your provider. See [billing](/en/docs/credits#metering).`,
        details: [
          {
            title: "No reply for a long time. Where do I check first?",
            body: `Under “View configuration → Edit configuration”, check the connection status and recent deliveries, then confirm the device is online and the Gateway is running. Test on the OpenClaw host first to separate a model problem from a Wechatai connection problem.

Pending messages are kept for at most 24 hours. If the device restarts during a task, interrupted tasks are not rerun automatically, to avoid duplicate actions; check the local task status before resending.`,
          },
          {
            title: "Do the two assistants share memory?",
            body: `Wechatai keeps chat sessions separate, but the same OpenClaw Agent may still share files, long-term memory and tools. To isolate work and life, configure separate Agents and working directories, or use two independent installs. Changing only a shortcut does not isolate memory.`,
          },
          {
            title: "Can I send images, files or voice?",
            body: `Currently text and voice with a WeChat transcript are supported; images and files are not. Voice without a transcript should be sent as text. Tool actions that require approval still need confirmation in OpenClaw.`,
          },
        ],
      },
    ],
  },
  "hermes-in-wechat": {
    intro:
      "Connect an existing Hermes to WeChat to assign tasks and receive results anytime. Hermes keeps running on your computer or server with its existing model, tools and memory; you do not configure the model again in Wechatai.",
    sections: [
      {
        id: "prepare",
        title: "Step 1: prepare Hermes",
        body: `Free can configure one plugin; Plus has no plugin limit. First confirm Hermes is installed and answers questions locally. If it is not installed, initialize it following the [official Hermes installation guide](https://hermes-agent.nousresearch.com/docs/getting-started/installation).

**The Wechatai connection command installs only the connection channel, not Hermes itself.** macOS, Linux and WSL are supported and Python 3 is required; see the [connection guide](/developers/hermes) for versions. With multiple profiles, run it in the profile environment you want to connect.

The current connection supports text and voice with a WeChat transcript; images and files are not supported yet. The host must stay online and the Gateway must keep running; after shutdown or sleep it cannot process messages.`,
      },
      {
        id: "pair",
        title: "Step 2: run the one-command connection",
        illustration: "agent-pairing-hermes",
        body: `1. Open Hermes on the [plugins page](/app/plugins), click “Configure plugin” (“配置插件”), then “Connect Hermes” (“连接 Hermes”).
2. Copy the connection command and paste it into the **terminal of the computer or server running Hermes**. Do not send it to WeChat or a Hermes chat box.
3. Return to the web page; when it shows “Connected” (“已连接”), the dialog closes automatically.

**The command is valid for ten minutes; do not share it.** It installs the Wechatai channel and restarts the Hermes Gateway, so wait until current tasks finish.`,
        details: [
          {
            title: "The command ran, but the page still waits for connection?",
            body: `Check the terminal error first; if the command expired, generate a new one on the web page. If the Gateway fails to start automatically, run this in a terminal for the same profile:

\`\`\`sh
hermes gateway run
\`\`\`

When using a server, generate the command from the production site. A localhost address cannot be reached by another server. See the [Hermes connection guide](/developers/hermes) for more troubleshooting.`,
          },
        ],
      },
      {
        id: "chat",
        title: "Step 3: send messages in WeChat",
        illustration: "tutorial-hermes-chat",
        body: `First scan following [Connect WeChat](/en/docs/wechat-connection#connect); an existing WeChat connection can be used directly.

In the matching WeChat conversation, send \`/use hermes\`, then assign a task, for example “Help me sort today's to-dos by priority”. \`hermes\` is the default shortcut; if you changed it, use your own.`,
        afterIllustration: `For a one-off question, send \`@hermes question\`; the current plugin does not change. Switch plugins with \`/use other-shortcut\`, and return to the normal model with \`/exit\`. Send \`/wx status\` if you forget the current mode.`,
      },
      {
        id: "commands",
        title: "Tell Hermes and Wechatai commands apart",
        body: `After entering Hermes, commands are distinguished by prefix:

| What you want | What to send |
| --- | --- |
| Hermes help | \`/help\` |
| Start another topic in Hermes | \`/new\` |
| Wechatai help | \`/wx help\` |
| Create a Wechatai session and remote conversation | \`/wx new\` |

**Cleaning up a Wechatai chat does not delete files or long-term memory on the Hermes host.** New sessions in the same profile may still use shared memory. See [commands](/en/docs/commands#agent-commands).`,
        details: [
          {
            title: "It says a native Hermes command is unsupported?",
            body: `Native commands require connector 1.1.0 or newer. Regenerate and run the connection command in Wechatai to upgrade. Which commands Hermes supports is defined by its own \`/help\`.`,
          },
        ],
      },
      {
        id: "notifications",
        title: "Optional: receive background results and scheduled reminders",
        body: `Send Hermes a message in WeChat first, then enable “Receive scheduled tasks and background result pushes” (“接收定时任务和后台结果推送”) under the plugin's “More settings”. Ask it to create a task and say “send the result back to the current wechatai conversation”. Task capability depends on the tools configured in Hermes.

After switching to another plugin, Hermes can still send results; the message notes its source and does not switch the current plugin automatically.

**WeChat pushes are limited by the 24-hour reply window after the latest interaction.** After it expires, send \`/wx help\` in the original conversation; expired results are not guaranteed to be resent. See the [Hermes connection guide](/developers/hermes) for delivery settings.`,
      },
      {
        id: "faq",
        title: "Costs and common questions",
        body: `Wechatai charges credits for the text sent and the final reply; proactive pushes count output only. Model calls inside Hermes do not consume Wechatai credits and are billed by your provider. Send \`/wx balance\` for the balance, and see [billing](/en/docs/credits#metering) for rules.`,
        details: [
          {
            title: "I got a waiting message but no reply for a long time?",
            body: `Ask Hermes a question locally first. If it does not reply locally either, check the model balance and errors. If it works locally, check the Gateway logs, web connection status and recent deliveries. Some tool actions require your approval in Hermes.

The plugin's input and output limits only bound the text passed to and returned from WeChat this time; they do not limit model usage inside Hermes.`,
          },
          {
            title: "Can I send images, files or voice?",
            body: `Currently text and voice with a WeChat transcript are supported; images and files are not. When voice has no transcript, convert it to text in WeChat and send that, or type the request directly.`,
          },
        ],
      },
    ],
  },
};
