import { z } from "zod";
import { pluginManifestSchema } from "./plugins";

export const searchProviderLabels = {
  deepseek: "DeepSeek 原生搜索",
  tavily: "Tavily",
  exa: "Exa",
  searxng: "SearXNG",
} as const;
export const DEEPSEEK_SEARCH_DEFAULT_MODEL = "deepseek-flash";
export const searchEndpointHints = {
  tavily: "https://api.tavily.com/search",
  exa: "https://api.exa.ai/search",
  searxng: "https://你的搜索服务/search",
  deepseek: "https://api.deepseek.com/anthropic/v1/messages",
} as const;
export const webResearchInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  shortcut: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[\p{L}\p{N}_-]+$/u),
  modelId: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  searchProvider: z.enum(["tavily", "exa", "searxng", "deepseek"]),
  searchEndpoint: z.string().trim().min(1).max(1000),
  searchModel: z.string().trim().max(120).default(""),
  apiKey: z.string().trim().max(2000).optional(),
  maxSearches: z.number().int().min(1).max(5).default(3),
  maxReads: z.number().int().min(0).max(8).default(3),
});
export type WebResearchInput = z.infer<typeof webResearchInputSchema>;
export type WebResearchPlugin = Omit<WebResearchInput, "apiKey"> & {
  id: string;
  pluginId: "wechatai/web-research";
  version: "1.3.0";
  createdAt: number;
  hasKey: boolean;
};
export const webResearchManifest = pluginManifestSchema.parse({
  protocolVersion: "1.0",
  id: "wechatai/web-research",
  version: "1.3.0",
  name: "DS Chat",
  author: "Wechatai",
  runtime: "builtin",
  capabilities: {
    input: ["text", "image"],
    output: ["text"],
    sessions: "platform",
    streaming: false,
    cancellation: false,
    approvals: false,
  },
  configSchema: {
    type: "object",
    required: ["name", "shortcut", "modelId", "searchProvider", "searchEndpoint"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 40 },
      shortcut: {
        type: "string",
        minLength: 1,
        maxLength: 24,
        description:
          "Unique across this account's model and plugin shortcuts; letters, numbers, underscores and hyphens only.",
      },
      modelId: { type: "string" },
      enabled: { type: "boolean", default: true },
      searchProvider: { enum: Object.keys(searchProviderLabels) },
      searchEndpoint: {
        type: "string",
        format: "uri",
        description:
          "Full public HTTPS endpoint, including its path. The UI prefills DeepSeek's official endpoint; no platform credential or fallback service is provided.",
      },
      searchModel: {
        type: "string",
        maxLength: 120,
        default: "",
        description: `Optional for DeepSeek native Web Search. Omit or leave blank to use ${DEEPSEEK_SEARCH_DEFAULT_MODEL}; an override must support the web_search tool. Independent of the answer model.`,
      },
      apiKey: {
        type: "string",
        writeOnly: true,
        maxLength: 2000,
        description:
          "User-supplied search credential, encrypted by the host. Required except for unauthenticated SearXNG.",
      },
      maxSearches: { type: "integer", minimum: 1, maximum: 5, default: 3 },
      maxReads: { type: "integer", minimum: 0, maximum: 8, default: 3 },
    },
  },
  // The host binds the configured search origin; page reads additionally validate
  // every public HTTPS destination. No arbitrary third-party runtime is enabled.
  permissions: { modelAccess: true, networkOrigins: [], storage: false },
});
