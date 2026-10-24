import { modelKind } from "./model-kind";
import type { Assistant } from "./types";

type ModelConnection = Pick<Assistant, "model" | "baseUrl" | "protocol">;

// Explicit aliases and snapshots from the official ResponsesOnlyModel schema.
// Do not infer protocol support from generic "pro" or "codex" name suffixes.
// https://developers.openai.com/api/reference/resources/responses/methods/create
const OPENAI_RESPONSES_ONLY_MODELS = new Set([
  "o1-pro",
  "o1-pro-2025-03-19",
  "o3-pro",
  "o3-pro-2025-06-10",
  "o3-deep-research",
  "o3-deep-research-2025-06-26",
  "o4-mini-deep-research",
  "o4-mini-deep-research-2025-06-26",
  "computer-use-preview",
  "computer-use-preview-2025-03-11",
  "gpt-5.5-pro",
  "gpt-5.5-pro-2026-04-23",
  "gpt-5-codex",
  "gpt-5-pro",
  "gpt-5-pro-2025-10-06",
  "gpt-5.1-codex-max",
  "gpt-daybreak-blue-latest",
  "gpt-daybreak-red-latest",
  "gpt-5.6-cyber",
  "gpt-rosalind-research",
]);

// Only enforce verified restrictions on the official service. Third-party
// gateways can expose the same model name through a different protocol.
// https://developers.openai.com/api/docs/models/gpt-audio-1.5
export function modelProtocolIssue(model: ModelConnection): string | undefined {
  let hostname: string;
  try {
    hostname = new URL(model.baseUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return;
  }
  if (hostname !== "api.openai.com") return;
  if (
    /^gpt-(?:audio(?:-|$)|4o(?:-mini)?-audio-preview(?:-|$))/.test(model.model) &&
    model.protocol !== "chat-completions"
  )
    return "此 OpenAI 模型仅支持 OpenAI Chat Completions。请在渠道的「自定义接口」中切换协议，或新建对应协议的渠道后添加模型。";
  if (OPENAI_RESPONSES_ONLY_MODELS.has(model.model) && model.protocol !== "responses")
    return "此 OpenAI 模型仅支持 OpenAI Responses。请在渠道的「自定义接口」中切换协议，或新建对应协议的渠道后添加模型。";
}

export function isChatModel(model: ModelConnection & Pick<Assistant, "kind">): boolean {
  return modelKind(model) === "text" && !modelProtocolIssue(model);
}
