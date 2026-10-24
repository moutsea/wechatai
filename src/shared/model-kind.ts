export type ModelKind = "text" | "image" | "other";
export const modelKindLabels: Record<ModelKind, string> = {
  text: "文本模型",
  image: "生图模型",
  other: "其他模型",
};
export function inferModelKind(id: string, metadata: Record<string, unknown> = {}): ModelKind {
  const kind = String(metadata.kind ?? metadata.type ?? "").toLowerCase();
  if (["image", "image-generation", "image_generation", "text-to-image"].includes(kind))
    return "image";
  if (["text", "chat", "reasoning", "code"].includes(kind)) return "text";
  if (
    [
      "embedding",
      "embeddings",
      "rerank",
      "audio",
      "video",
      "speech",
      "tts",
      "moderation",
      "realtime",
      "transcription",
      "transcribe",
      "completion",
      "completions",
      "decisions",
    ].includes(kind)
  )
    return "other";
  const architecture = metadata.architecture as { output_modalities?: unknown } | undefined;
  const output = metadata.output_modalities ?? architecture?.output_modalities;
  if (Array.isArray(output) && output.includes("image")) return "image";
  if (
    Array.isArray(output) &&
    output.length > 0 &&
    output.every((modality) => typeof modality === "string") &&
    !output.includes("text")
  )
    return "other";
  if (
    /(?:^|[/_.-])(?:qwen-image|gpt-image|grok-(?:imagine|2)-image|dall-e|flux|imagen|stable-diffusion|sdxl|z-image|seedream|cogview)(?:[/_.-]|\d|$)|wan[\d.]*-image/i.test(
      id,
    ) ||
    // Gemini's OpenAI-compatible catalog can omit modality metadata. Match
    // its image family, including models/ and provider prefixes, not all Gemini.
    /(?:^|\/)gemini-\d+(?:\.\d+)?-(?:flash|pro)(?:-(?:exp|lite))?-image(?:[-.:/]|$)/i.test(id)
  )
    return "image";
  if (
    /(?:embed|rerank|whisper|(?:^|[-_])tts(?:[-_]|$))|(?:^|[/_.-])(?:sora|veo|grok-imagine-video|moderation|realtime|transcribe|transcription)(?:[/_.-]|\d|$)/i.test(
      id,
    ) ||
    /(?:^|\/)(?:babbage-002|davinci-002|gpt-3\.5-turbo-instruct)(?:-|$)/i.test(id)
  )
    return "other";
  return "text";
}
export const modelKind = (model: { model: string; kind?: ModelKind }) =>
  model.kind ?? inferModelKind(model.model);
