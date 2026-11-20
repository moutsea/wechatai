import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-agent",
  kind: "product",
  title: "Connect an agent to WeChat and let it message you",
  description:
    "An existing hosted Muse assistant, OpenClaw, or Hermes can connect to WeChat without configuring another model in Wechatai. This guide covers the ClawBot connection, runtime, background replies, and fees.",
  eyebrow: "Agent × WeChat",
  h1: "Connect an agent to WeChat, not just a model",
  lede: "A model waits for your question; an agent does the work. Once it is connected to WeChat, the difference comes down to one thing: when the task finishes, it messages you first.",
  answer:
    "Wechatai can connect an existing hosted Muse assistant, or OpenClaw or Hermes running on your own device. The agent manages its own models, tools, and memory, so you do not configure another model in Wechatai. Bind through the WeChat ClawBot QR code first, then pair the agent using its guide; scanning does not automatically switch the current chat entry.",
  primaryKeyword: "connect an agent to WeChat",
  secondaryKeywords: [
    "WeChat AI agent",
    "WeChat agent integration",
    "OpenClaw WeChat",
    "Hermes WeChat",
    "Muse WeChat",
  ],
  highlights: [
    "Scheduled tasks and proactive pushes",
    "Several agents can coexist",
    "Agent-side fees and credits are separate",
  ],
  steps: [
    {
      title: "Confirm the agent environment",
      text: "Muse needs an existing hosted assistant with the hook feature; OpenClaw or Hermes must run on your own computer or server. First confirm the agent can complete its tasks on its own.",
    },
    {
      title: "Connect it to WeChat",
      text: "Bind WeChat through the WeChat ClawBot QR code, then add the agent on the plugins page and generate the connection command. Send the Muse command to your Muse main chat; run OpenClaw and Hermes commands in the terminal of the device running them. No separate model configuration in Wechatai is needed.",
    },
    {
      title: "Verify the first task and reply",
      text: "Once the connector is online, send /use with the shortcut name in WeChat to confirm you entered that agent, then send a short text task. For scheduled or background pushes, configure them separately in the agent's guide.",
    },
  ],
  sections: [
    {
      id: "agent-vs-model",
      title: "How an agent differs from connecting a model",
      body: `Connect a model to WeChat and you get a contact that chats: you ask, it answers.

Connect an agent to WeChat and you get an executor that **has tools, memory, and acts on its own**:

- It can read and write files, run commands, and call APIs. What it can do depends on the tools you give it.
- It can be triggered on a schedule without you speaking first.
- It can push results back to WeChat instead of waiting for your question.

So the question is not "how good are its answers" but **whether you have tasks that should run automatically**: scheduled summaries, monitoring alerts, batch processing, long-running follow-ups. Without such needs, a model is enough and an agent only adds operational burden.`,
    },
    {
      id: "paths",
      title: "Choose a hosted Muse environment or your own device",
      body: `**Existing hosted Muse assistant:** Add Muse on the Wechatai plugins page, send the connection command to your Muse main chat, and let Muse install and enable the hook in its hosted environment. Do not run it in a local terminal, and do not enter a model key in Wechatai. See the [Muse guide](/developers/muse).

**OpenClaw and Hermes:** You install and run these. Wechatai forwards WeChat messages and does not host either agent in the cloud. Choose the runtime device by how you use it:

| | Your own computer | A server you deploy |
| --- | --- | --- |
| Where it runs | The agent process on your computer | The agent process on the server |
| When the computer is off | Tasks cannot run until the computer is back online | Tasks keep running while the server and agent stay online |
| Files and tools it can reach | Files and tools authorized on the computer | Files and tools authorized on the server |
| Maintenance | You install, upgrade, and keep the process running | You install, upgrade, and maintain the server |

Run it on your computer to work with files there; deploy to an always-on server to keep receiving tasks. Wechatai's ordinary model chat does not need your computer to be online, but once OpenClaw or Hermes is connected, the device running the agent must stay online.

**Running locally does not mean messages stay local.** Through Wechatai, the original request and final reply pass through WeChat and Wechatai, and Wechatai temporarily stores pending requests; it does not forward only a summary. When the agent uses a cloud model or an external tool, the related content also goes to the provider you configured. Where files live and where tools run are separate from which services the messages pass through; see the [privacy policy](/privacy) for details.

Run the connection command on the device that actually runs the agent. Steps are in the [OpenClaw guide](/developers/openclaw) and the [Hermes guide](/developers/hermes). If you need to write your own adapter, see the [plugin protocol](/developers/plugins).`,
    },
    {
      id: "push",
      title: "Proactive pushes: the most valuable part of an agent in WeChat",
      body: `A model only answers when asked; an agent can reach you first. This is where the experience changes most after connecting to WeChat.

Three typical uses:

1. **Scheduled tasks.** Every morning, have the agent summarize your to-dos, run a data job, or check a price change, then send the result to WeChat. Create the task on the agent side and tell it to send the result back to the current conversation.
2. **Background result delivery.** Long tasks do not need constant supervision. Switching to another plugin does not affect them; when the task finishes, the result arrives with a source marker.
3. **Event alerts.** Your own service pushes orders, exceptions, or build results to WeChat over an HTTP webhook. This push **does not consume credits**, which makes it a low-cost channel for high-frequency events. See [notifications](/docs/notifications).

OpenClaw and Hermes need "receive scheduled tasks and background result pushes" enabled, with the device and process online. When the device is offline, it cannot run new tasks or produce results; processing resumes when it is back online. The notification webhook is an independent channel and does not depend on the local agent.`,
    },
    {
      id: "multi",
      title: "Several agents in one WeChat account",
      body: `Connecting several agents is common: one for work, one for personal life, one for crawlers. Wechatai gives each agent a different shortcut name and separates calls with patch-style syntax:

- \`/use shortcut\` switches the current agent; later messages go to it.
- \`@shortcut task\` calls it once without switching the current plugin.
- \`/exit\` returns to ordinary model chat.
- \`/wx status\` shows which plugin is current.

Free can bind 1 WeChat link and Plus up to 10, which is enough to keep a work account and a personal account separate. For detailed multi-agent setup, see [using multiple OpenClaw instances in WeChat](/docs/multiple-openclaw-in-wechat).`,
    },
    {
      id: "cost",
      title: "Fees: who pays for the agent's internal calls",
      body: `This is the most misunderstood part, so state it plainly:

- **Wechatai credits** cover only the text sent into the plugin and the final reply; proactive pushes are charged on output only. No matter how many times the agent calls a model internally, Wechatai does not meter it again.
- **Model fees inside the agent** are billed by your own API provider by usage. The more complex the agent's work, the higher this part: one task may call a model dozens of times.
- **The input and output limits in plugin settings** control the text entering and returning on the WeChat side, not the model usage inside the agent.

So "agents are expensive" usually means expensive on the model side, not the relay side. To control cost, improve the agent's task design rather than worrying about credits.`,
    },
  ],
  faq: [
    {
      question: "Does a WeChat agent need my computer on all the time?",
      answer:
        "Muse uses an existing hosted environment, so your computer can stay off; the Muse hook must be running. If OpenClaw or Hermes runs on your computer, tasks stop when the computer shuts down or sleeps. To keep tasks available, deploy to an always-on server. Wechatai does not host OpenClaw or Hermes.",
    },
    {
      question: "Do ordinary users need to connect an agent?",
      answer:
        "Usually not. For questions, translation, writing, and image generation, a model plus plugins is enough. An agent is valuable for automatic task execution and proactive pushes, so it suits people with clear automation needs.",
    },
    {
      question: "Can an agent message me proactively?",
      answer:
        "Yes. Create a scheduled or long-running task on the agent side and tell it to send the result to the current conversation, and confirm that receive scheduled tasks and background result pushes is enabled in plugin settings. Results still arrive after you switch to another plugin.",
    },
    {
      question: "Can I connect several agents at once?",
      answer:
        "Yes. Give each agent a different shortcut name, use /use to switch, and @shortcut for one-off calls. Plus supports binding 10 WeChat links, so different purposes can stay fully separate.",
    },
    {
      question: "Does an agent's internal model usage deduct credits again?",
      answer:
        "No. Wechatai charges only the text sent into the plugin and the final reply; proactive pushes are charged on output only. The provider bills the agent's internal model calls separately.",
    },
  ],
  related: [
    { label: "Muse hosted assistant guide", href: "/developers/muse" },
    { label: "Connect Muse to WeChat", href: "/wechat-muse" },
    { label: "OpenClaw guide", href: "/developers/openclaw" },
    { label: "Hermes guide", href: "/developers/hermes" },
    { label: "Using multiple OpenClaw instances in WeChat", href: "/docs/multiple-openclaw-in-wechat" },
    { label: "Notification webhooks", href: "/docs/notifications" },
    { label: "Compare the ways to use AI in WeChat", href: "/wechat-ai-options" },
    { label: "Plugin protocol and developer docs", href: "/developers/plugins" },
  ],
  updatedAt: "2026-11-19",
};

export default [
  {
    path: "/wechat-agent",
    title: "Connect an Agent to WeChat | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
