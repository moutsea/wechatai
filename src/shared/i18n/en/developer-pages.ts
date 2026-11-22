import type { TranslationPage } from "../index";
import { MUSE_FAQ_EN } from "./data/developer-content-en";

/**
 * English metadata for the four developer HTML pages. The bodies are hand-written
 * components, so these entries carry no `content` and only publish the URL.
 * The SEO layer imports this same table to keep page metadata and JSON-LD aligned.
 */
export const DEVELOPER_PAGES_EN = {
  "/developers/plugins": {
    title: "Plugin protocol developer docs: API, JSON Schema and examples | Wechatai",
    name: "Plugin protocol and developer docs",
    description:
      "Wechatai plugin protocol V1: invocation and result formats, metering and permission boundaries. Public Markdown, JSON API and JSON Schema help AI agents build adapters. Third-party execution and code upload are not open yet.",
    updatedAt: "2026-11-22",
  },
  "/developers/openclaw": {
    title: "OpenClaw WeChat integration: scheduled tasks and background pushes | Wechatai",
    name: "OpenClaw connection guide",
    description:
      "Connect your own OpenClaw Agent to WeChat through the Wechatai Channel. Setup, session isolation, scheduled tasks and proactive pushes, plus protocol notes for AI agents.",
    updatedAt: "2026-11-22",
  },
  "/developers/muse": {
    title: "Muse WeChat integration: hosted assistant and message replies | Wechatai",
    name: "Muse connection guide",
    description:
      "Connect an existing hosted Muse assistant to Wechatai through a hook. Send text tasks from WeChat, receive final replies and authorized proactive notifications.",
    updatedAt: "2026-11-22",
    article: true,
    faq: MUSE_FAQ_EN,
  },
  "/developers/hermes": {
    title: "Hermes WeChat integration: scheduled tasks and background pushes | Wechatai",
    name: "Hermes connection guide",
    description:
      "Connect your own Hermes Agent to WeChat through the Wechatai Channel. Setup, session isolation, scheduled tasks and proactive pushes, plus protocol notes for AI agents.",
    updatedAt: "2026-11-22",
  },
} as const;

const pages: readonly TranslationPage[] = Object.entries(DEVELOPER_PAGES_EN).map(
  ([path, page]) => ({
    path,
    title: page.title,
    description: page.description,
    updatedAt: page.updatedAt,
  }),
);

export default pages;
