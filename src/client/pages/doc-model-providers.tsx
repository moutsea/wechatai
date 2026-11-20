import { ArrowRight, ArrowUpRight } from "lucide-react";
import { CHANNEL_PROVIDERS } from "../../shared/channel-providers";
import { useLocale } from "../locale";

const englishProviderNames: Record<string, string> = {
  zhipu: "Zhipu GLM",
  qwen: "Qwen (Alibaba Cloud Bailian)",
  volcengine: "Doubao (Volcano Ark)",
  siliconflow: "SiliconFlow",
};

const providerDetails: Record<string, { logo: string; description: { zh: string; en: string } }> = {
  deepseek: {
    logo: "/images/channels/deepseek.png",
    description: {
      zh: "DeepSeek 官方 API，支持日常问答、推理与代码任务。",
      en: "The official DeepSeek API for everyday questions, reasoning and coding tasks.",
    },
  },
  kimi: {
    logo: "/images/channels/kimi.png",
    description: {
      zh: "月之暗面官方模型，支持长文本理解与工具调用。",
      en: "Moonshot's official models, with long-text understanding and tool calls.",
    },
  },
  zhipu: {
    logo: "/images/channels/zhipu.png",
    description: {
      zh: "智谱官方 GLM 系列，覆盖对话、代码与 Agent 任务。",
      en: "Zhipu's official GLM family for chat, code and Agent tasks.",
    },
  },
  qwen: {
    logo: "/images/channels/qwen.png",
    description: {
      zh: "阿里云百炼平台，提供通义千问系列及多种模型。",
      en: "Alibaba Cloud Bailian, with the Qwen family and many other models.",
    },
  },
  volcengine: {
    logo: "/images/channels/volcengine.png",
    description: {
      zh: "火山引擎模型平台，可接入豆包等系列模型。",
      en: "The Volcengine model platform, including the Doubao family.",
    },
  },
  minimax: {
    logo: "/images/channels/minimax.webp",
    description: {
      zh: "MiniMax 官方 API，提供文本与多模态模型。",
      en: "MiniMax's official API for text and multimodal models.",
    },
  },
  siliconflow: {
    logo: "/images/channels/siliconflow.png",
    description: {
      zh: "聚合多种开源模型，通过同一 API 渠道调用。",
      en: "Aggregates many open models behind one API channel.",
    },
  },
  openai: {
    logo: "/images/channels/openai.png",
    description: {
      zh: "OpenAI 官方 GPT 系列，可用于问答、写作和代码任务。",
      en: "OpenAI's official GPT family for questions, writing and code.",
    },
  },
  anthropic: {
    logo: "/images/channels/claude.png",
    description: {
      zh: "Anthropic 官方 Claude 系列，可用于文本分析、写作和编程。",
      en: "Anthropic's official Claude family for analysis, writing and programming.",
    },
  },
  gemini: {
    logo: "/images/channels/gemini.png",
    description: {
      zh: "Google 官方 Gemini 系列，提供文本与多模态模型。",
      en: "Google's official Gemini family for text and multimodal models.",
    },
  },
  openrouter: {
    logo: "/images/channels/openrouter.webp",
    description: {
      zh: "聚合多家模型供应商，用统一 API 接入不同模型。",
      en: "Aggregates multiple providers so different models share one API.",
    },
  },
  xai: {
    logo: "/images/channels/xai.png",
    description: {
      zh: "xAI 官方 Grok 系列，支持推理、编程与工具调用。",
      en: "xAI's official Grok family, with reasoning, coding and tool calls.",
    },
  },
};

export function DocModelProviders() {
  const en = useLocale().locale === "en";
  return (
    <ul
      className="docs-provider-list"
      aria-label={en ? "Supported model providers" : "支持的模型服务商"}
    >
      <li className="docs-provider-card">
        <div className="docs-provider-logo">
          <img src="/images/channels/kimiseek.svg" alt="" width="40" height="40" loading="lazy" />
        </div>
        <div className="docs-provider-info">
          <h3>KimiSeek</h3>
          <p>
            {en
              ? "An official Wechatai partner: a Chinese model aggregation platform with discounts of up to 50% off."
              : "微伴官方合作伙伴，国产模型聚合平台，5 折起。"}
          </p>
          <a href="#kimiseek">
            {en ? "One-click import guide" : "一键导入说明"}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </li>
      <li className="docs-provider-card">
        <div className="docs-provider-logo">
          <img src="/images/channels/codebyai.png" alt="" width="40" height="40" loading="lazy" />
        </div>
        <div className="docs-provider-info">
          <h3>CodeByAi</h3>
          <p>
            {en
              ? "An aggregation platform for Claude, GPT and Gemini."
              : "Claude、GPT、Gemini 御三家聚合平台。"}
          </p>
          <a
            href="https://www.codebyai.net/zh"
            target="_blank"
            rel="noreferrer"
            aria-label={
              en
                ? "View the CodeByAi platform and documentation (opens in a new tab)"
                : "查看 CodeByAi 平台与文档（新窗口打开）"
            }
          >
            {en ? "Platform and docs" : "平台与文档"}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </li>
      {CHANNEL_PROVIDERS.filter((provider) => !provider.codingPlan).map((provider) => {
        const details = providerDetails[provider.id];
        const providerName = (en ? englishProviderNames[provider.id] : undefined) ?? provider.name;
        return (
          <li className="docs-provider-card" key={provider.id}>
            <div className="docs-provider-logo">
              <img src={details.logo} alt="" width="40" height="40" loading="lazy" />
            </div>
            <div className="docs-provider-info">
              <h3>{providerName}</h3>
              <p>{details.description[en ? "en" : "zh"]}</p>
              <a
                href={provider.setupUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={
                  en
                    ? `View the ${providerName} platform and documentation (opens in a new tab)`
                    : `查看 ${providerName} 平台与文档（新窗口打开）`
                }
              >
                {en ? "Platform and docs" : "平台与文档"}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
