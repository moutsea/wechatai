import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { IMAGE_CREDITS } from "../../credits";

const content: SeoPage = {
  path: "/wechat-ai-image",
  kind: "tutorial",
  title: "AI image generation in WeChat: setup and per-image billing",
  description: `Wechatai's AI image plugin sends a text prompt to the image model you configure and returns the generated image to WeChat. This guide covers setup, shortcut triggers, aspect ratios such as 3:4, billing at ${IMAGE_CREDITS} credits per image, and what it cannot do.`,
  eyebrow: "AI images × WeChat",
  h1: "Generate images in WeChat: setup and billing",
  lede: "Send a description in WeChat, receive an image. That part is simple; the complexity is where the model comes from, what it costs, and what it cannot do.",
  answer: `To generate images in WeChat, first add a service channel and model that support image generation in Wechatai, then enable the AI images plugin, bind the model, and set a shortcut name. After that, describe the picture with @shortcut in WeChat, or enter image mode with /use shortcut, and the generated image returns directly to WeChat. The plugin generates images from text at ${IMAGE_CREDITS} credits per image, with prompt text billed separately by weighted tokens.`,
  primaryKeyword: "WeChat AI image generation",
  secondaryKeywords: ["AI drawing in WeChat", "WeChat AI stickers", "generate images in WeChat"],
  highlights: ["Configure the model yourself", `${IMAGE_CREDITS} credits per image`, "Results stay in the conversation"],
  sections: [
    {
      id: "how-it-works",
      title: "It generates images from text; it is not an editor",
      body: `State the boundary first, because it determines what the plugin can and cannot do.

**Can do:** you send a text description, the plugin submits it to the image model you bound, the model generates one image, and the image returns to the current WeChat conversation.

**Cannot do:** image-to-image, editing the previous image, or using a photo as a style reference. Each generation is independent, the prompt is processed on its own, and the previous image is not carried in as input. For "change this one" workflows, use a dedicated image editor.

Free users can save generated images directly in WeChat. Only Plus users can view generated images in web conversation history for 30 days after generation. They can also copy the prompt there and try again.`,
    },
    {
      id: "setup",
      title: "Setup: channel first, plugin second",
      body: `The order matters: the plugin is only a shell, and the model you enter does the drawing.

1. Add a channel under Channels & models, entering the image service's API endpoint and API key. The upstream must support the \`/v1/images/generations\` interface.
2. Add an image model under that channel, using the model name from the provider docs.
3. Open the plugins page, choose AI images, and select that model.
4. Set a shortcut name, such as \`draw\`; you can also change the waiting message so the plugin replies with fixed text while generating.
5. Save it, then trigger it in WeChat.

Wechatai does not supply an image API and has no built-in image quota. The upstream image API charges through your provider, and this site charges only the credits for relay. Channel details are in [channels and models](/docs/channels-models).`,
    },
    {
      id: "trigger",
      title: "How to trigger it in WeChat",
      body: `Once configured, there are two ways to use it:

- \`@draw an orange cat sitting on a windowsill 3:4\` calls it once without changing the current conversation mode, which suits occasional images.
- \`/use draw\` enters image mode, where every message becomes a prompt; \`/exit\` returns to ordinary model chat.

**How to specify an aspect ratio:** put \`16:9\`, \`9:16\`, or \`3:4\` in the prompt, and the plugin turns it into a size description the model understands. Without one, the model's default applies, and defaults differ by model.

**One image per call:** each call generates a single image. For more, send again or split the prompt into variants.

**Stickers and similar:** these also use text generation; describe the picture and composition clearly. If the image must contain accurate Chinese characters, most models are unreliable, and the plugin should not be expected to fix that.`,
    },
    {
      id: "cost",
      title: "Billing: 5 credits per image, text separate",
      body: `Billing has two parts, paid to different parties:

| Item | How it is calculated |
| --- | --- |
| The image | 5 credits per image |
| Prompt text | Counted by weighted tokens: 5,000 weighted tokens = 1 credit, output weighted ×8 |
| Model fees | Charged by your own API provider, not through Wechatai |

So "5 credits per image" is not the total cost; it is only Wechatai's relay fee. One generation costs 5 credits plus the prompt text fee (usually small).

On allowance: Free includes 100 credits per day, enough for about 20 images before subtracting chat usage that day; Plus includes 1,000 credits per day and unlimited plugins. Note that the per-request credit limit and the model's input limit also apply.

Credit and balance rules are in [credits](/docs/credits), and plan differences are in [pricing](/pricing).`,
    },
    {
      id: "limits",
      title: "Common pitfalls",
      body: `- **No channel, no generation:** if the saved plugin reports a missing model, check in plugin settings that an image model is selected rather than a text model.
- **An unsupported upstream errors out:** if the endpoint is not OpenAI-compatible or the model does not support \`/v1/images/generations\`, the call returns an error. That is upstream, not Wechatai; change the provider or model.
- **Images expire:** generated originals are kept for 30 days. Download anything you want to keep; after the link expires it cannot be retrieved from the platform.
- **Generation is slow:** image generation is generally slower than chat, and the waiting message in plugin settings exists for that period. Do not resend repeatedly.
- **WeChat side is one-to-one only:** plugin calls happen in your one-to-one chat with WeChat ClawBot and do not work in group chats.`,
    },
  ],
  faq: [
    {
      question: "Is AI image generation in WeChat free?",
      answer:
        "Wechatai charges 5 credits per image; Free includes 100 credits per day, about 20 images. The image model's own fees are paid to your provider outside this site and do not pass through Wechatai.",
    },
    {
      question: "What model is needed to generate images?",
      answer:
        "An image model whose upstream supports the /v1/images/generations interface. Add a channel and model for it first, then select it in the AI images plugin. A text chat model cannot generate images.",
    },
    {
      question: "Can I edit the previous image in WeChat?",
      answer:
        "Not currently. AI images generates from text, each generation is independent, there is no image-to-image, and it cannot continue from the previous image; use a dedicated image editing tool for iterative changes.",
    },
    {
      question: "How long are generated images kept?",
      answer:
        "Wechatai keeps originals for 30 days. Only Plus users can view them in web conversation history during those 30 days. Free users can save generated images directly in WeChat. After 30 days, the link expires and the original cannot be retrieved from Wechatai, so save a copy right away if you want to keep it.",
    },
    {
      question: "Can the image plugin be used in group chats?",
      answer:
        "No. Wechatai handles only one-to-one messages with WeChat ClawBot; @shortcut and /use work only in one-to-one chats, and there is no group-chat switch.",
    },
  ],
  related: [
    { label: "What a WeChat AI assistant can do", href: "/wechat-ai" },
    { label: "How to use your own API key", href: "/bring-your-own-api-key" },
    { label: "Model and channel configuration", href: "/wechat-clawbot-models" },
    { label: "How credits are calculated", href: "/docs/credits" },
    { label: "Pricing and plans", href: "/pricing" },
  ],
  updatedAt: "2026-10-25",
};

export default [
  {
    path: "/wechat-ai-image",
    title: "AI Image Generation in WeChat: Setup and Billing | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
