import { ArrowRight, ArrowUpRight } from "lucide-react";
import { CHANNEL_PROVIDERS } from "../../shared/channel-providers";

const providerDetails: Record<string, { logo: string; description: string }> = {
  deepseek: {
    logo: "/images/channels/deepseek.png",
    description: "DeepSeek 官方 API，支持日常问答、推理与代码任务。",
  },
  kimi: {
    logo: "/images/channels/kimi.png",
    description: "月之暗面官方模型，支持长文本理解与工具调用。",
  },
  zhipu: {
    logo: "/images/channels/zhipu.png",
    description: "智谱官方 GLM 系列，覆盖对话、代码与 Agent 任务。",
  },
  qwen: {
    logo: "/images/channels/qwen.png",
    description: "阿里云百炼平台，提供通义千问系列及多种模型。",
  },
  volcengine: {
    logo: "/images/channels/volcengine.png",
    description: "火山引擎模型平台，可接入豆包等系列模型。",
  },
  minimax: {
    logo: "/images/channels/minimax.webp",
    description: "MiniMax 官方 API，提供文本与多模态模型。",
  },
  siliconflow: {
    logo: "/images/channels/siliconflow.png",
    description: "聚合多种开源模型，通过同一 API 渠道调用。",
  },
  openai: {
    logo: "/images/channels/openai.png",
    description: "OpenAI 官方 GPT 系列，可用于问答、写作和代码任务。",
  },
  anthropic: {
    logo: "/images/channels/claude.png",
    description: "Anthropic 官方 Claude 系列，可用于文本分析、写作和编程。",
  },
  gemini: {
    logo: "/images/channels/gemini.png",
    description: "Google 官方 Gemini 系列，提供文本与多模态模型。",
  },
  openrouter: {
    logo: "/images/channels/openrouter.webp",
    description: "聚合多家模型供应商，用统一 API 接入不同模型。",
  },
  xai: {
    logo: "/images/channels/xai.png",
    description: "xAI 官方 Grok 系列，支持推理、编程与工具调用。",
  },
};

export function DocModelProviders() {
  return (
    <ul className="docs-provider-list" aria-label="支持的模型服务商">
      <li className="docs-provider-card">
        <div className="docs-provider-logo">
          <img src="/images/channels/kimiseek.svg" alt="" width="40" height="40" loading="lazy" />
        </div>
        <div className="docs-provider-info">
          <h3>KimiSeek</h3>
          <p>微伴官方合作伙伴，国产模型聚合平台，5 折起。</p>
          <a href="#kimiseek">
            一键导入说明
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
          <p>Claude、GPT、Gemini 御三家聚合平台。</p>
          <a
            href="https://www.codebyai.net/zh"
            target="_blank"
            rel="noreferrer"
            aria-label="查看 CodeByAi 平台与文档（新窗口打开）"
          >
            平台与文档
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </li>
      {CHANNEL_PROVIDERS.filter((provider) => !provider.codingPlan).map((provider) => {
        const details = providerDetails[provider.id];
        return (
          <li className="docs-provider-card" key={provider.id}>
            <div className="docs-provider-logo">
              <img src={details.logo} alt="" width="40" height="40" loading="lazy" />
            </div>
            <div className="docs-provider-info">
              <h3>{provider.name}</h3>
              <p>{details.description}</p>
              <a
                href={provider.setupUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`查看 ${provider.name} 平台与文档（新窗口打开）`}
              >
                平台与文档
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
