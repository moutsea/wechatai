import { modelEndpoint, modelsEndpoint } from "./model-endpoint";
import type { ChannelInput, Protocol } from "./types";

export type ChannelProvider = {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  setupUrl: string;
  codingPlan?: boolean;
  note?: string;
};

// Keep plan-specific routes separate: a failed Coding Plan request must never
// fall back to a pay-as-you-go endpoint. These presets only fill user-owned config.
export const CHANNEL_PROVIDERS: readonly ChannelProvider[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    protocol: "chat-completions",
    baseUrl: "https://api.deepseek.com",
    setupUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "kimi",
    name: "Kimi（月之暗面）",
    protocol: "chat-completions",
    baseUrl: "https://api.moonshot.cn/v1",
    setupUrl: "https://platform.kimi.com/docs/get-api-key",
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    protocol: "chat-completions",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    setupUrl: "https://docs.bigmodel.cn/cn/api/introduction",
  },
  {
    id: "qwen",
    name: "通义千问（阿里云百炼）",
    protocol: "chat-completions",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    setupUrl: "https://help.aliyun.com/zh/model-studio/base-url",
    note: "默认使用华北 2（北京）地域；其他地域或专属空间地址请选择「自定义」。",
  },
  {
    id: "volcengine",
    name: "豆包（火山方舟）",
    protocol: "chat-completions",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    setupUrl: "https://docs.volcengine.com/docs/ark/base-url-and-authentication?lang=zh",
  },
  {
    id: "minimax",
    name: "MiniMax",
    protocol: "chat-completions",
    baseUrl: "https://api.minimax.cn/v1",
    setupUrl: "https://platform.minimax.cn/docs/api-reference/text-openai-api",
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    protocol: "chat-completions",
    baseUrl: "https://api.siliconflow.cn/v1",
    setupUrl: "https://docs.siliconflow.cn/docs/userguide/quickstart",
  },
  {
    id: "openai",
    name: "OpenAI",
    protocol: "responses",
    baseUrl: "https://api.openai.com/v1",
    setupUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Claude（Anthropic）",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    setupUrl: "https://platform.claude.com/settings/keys",
  },
  {
    id: "gemini",
    name: "Gemini（Google）",
    protocol: "chat-completions",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    setupUrl: "https://ai.google.dev/gemini-api/docs/openai",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "chat-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    setupUrl: "https://openrouter.ai/settings/keys",
  },
  {
    id: "xai",
    name: "Grok（xAI）",
    protocol: "responses",
    baseUrl: "https://api.x.ai/v1",
    setupUrl: "https://console.x.ai/",
  },
  {
    id: "zhipu-coding",
    name: "智谱 Coding Plan",
    protocol: "chat-completions",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    setupUrl: "https://docs.bigmodel.cn/cn/coding-plan/quick-start",
    codingPlan: true,
  },
  {
    id: "qwen-coding",
    name: "百炼 Coding Plan",
    protocol: "chat-completions",
    baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
    setupUrl: "https://help.aliyun.com/zh/model-studio/base-url",
    codingPlan: true,
  },
  {
    id: "volcengine-coding",
    name: "火山方舟 Coding Plan",
    protocol: "chat-completions",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    setupUrl: "https://docs.volcengine.com/docs/ark/coding-plan-personal-faq?lang=zh",
    codingPlan: true,
  },
];

export const DEFAULT_CHANNEL_PROVIDER = "deepseek";
export const channelProvider = (id: string) => CHANNEL_PROVIDERS.find((p) => p.id === id);

type Connection = Pick<ChannelInput, "baseUrl" | "protocol">;

function connectionEndpoint(connection: Connection) {
  try {
    return modelEndpoint(connection.baseUrl.trim(), connection.protocol);
  } catch {
    return null;
  }
}

function connectionKeyScope(connection: Connection) {
  try {
    // Canonicalize the API root independently of the chosen inference protocol.
    // This is only an identifier, not a request to the provider's model catalog.
    // The origin and gateway/plan prefix remain part of the credential boundary.
    const url = new URL(modelsEndpoint(connection.baseUrl.trim()));
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function detectChannelProvider(connection: Connection): string {
  const endpoint = connectionEndpoint(connection);
  return (
    CHANNEL_PROVIDERS.find(
      (p) => p.protocol === connection.protocol && connectionEndpoint(p) === endpoint,
    )?.id ?? "custom"
  );
}

export function selectChannelProvider(form: ChannelInput, providerId: string): ChannelInput {
  const provider = channelProvider(providerId);
  if (!provider) return form; // Custom mode keeps the exact configuration for editing.
  const previous = channelProvider(detectChannelProvider(form));
  return {
    ...form,
    name: !form.name.trim() || form.name === previous?.name ? provider.name : form.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    // Never carry a typed credential into another provider or plan.
    apiKey: channelNeedsApiKey(form, provider) ? "" : form.apiKey,
  };
}

export function channelNeedsApiKey(previous: Connection | undefined, next: Connection): boolean {
  return (
    !previous ||
    !connectionKeyScope(next) ||
    connectionKeyScope(previous) !== connectionKeyScope(next)
  );
}
