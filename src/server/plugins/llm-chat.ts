import {
  llmChatManifest,
  PLUGIN_PROTOCOL_VERSION,
  type PluginInvocation,
} from "../../shared/plugins";
import type { Assistant } from "../../shared/types";
import { modelInputBudget } from "../../shared/context";
import { callModel, modelImages, type ModelMessage } from "../llm";
import { invokePlugin, pluginOutputBudget } from "./gateway";
import { AppError } from "../config";

export { llmChatManifest } from "../../shared/plugins";

// The host injects only the selected model connection; no wallet or database is exposed.
export async function invokeLlmChat(
  env: Env,
  model: Assistant,
  key: string,
  messages: ModelMessage[],
  output: number,
  timeout: number,
  runId: string,
  sessionId: string | null,
  creditCap: number | null,
) {
  const request: PluginInvocation = {
    protocolVersion: PLUGIN_PROTOCOL_VERSION,
    runId,
    sessionId,
    instanceId: model.id,
    pluginId: llmChatManifest.id,
    pluginVersion: llmChatManifest.version,
    messages: [
      { role: "system", content: [{ type: "text", text: model.systemPrompt }] },
      ...messages.map((m, i) => ({
        role: m.role,
        content: [
          { type: "text" as const, text: m.content },
          ...modelImages(m).map((_, j) => ({ type: "image" as const, assetId: `input:${i}:${j}` })),
        ],
      })),
    ],
    limits: {
      inputTokens: modelInputBudget(model, output),
      outputTokens: output,
      outputImages: 0,
      creditUnits: creditCap,
    },
  };
  const outcome = await invokePlugin(request, async (invocation) => {
    const maxOutput = pluginOutputBudget(invocation);
    if (maxOutput < 1)
      throw new AppError("budget_too_small", "单轮 credits 上限不足以生成回复，请提高上限", 422);
    const system = invocation.messages[0].content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const input = invocation.messages.slice(1).map((m, i): ModelMessage => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(""),
      ...(modelImages(messages[i]).length ? { images: modelImages(messages[i]) } : {}),
    }));
    const reply = await callModel(
      env,
      { ...model, systemPrompt: system },
      key,
      input,
      maxOutput,
      timeout,
    );
    return {
      protocolVersion: PLUGIN_PROTOCOL_VERSION,
      runId: invocation.runId,
      status: "completed",
      content: [{ type: "text", text: reply.text }],
    };
  });
  return {
    text: outcome.result.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(""),
    ...outcome.meter,
    truncated: outcome.truncated,
    estimated: false,
  };
}
