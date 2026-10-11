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
  if (["embedding", "rerank", "audio", "video", "speech", "tts"].includes(kind)) return "other";
  const architecture = metadata.architecture as { output_modalities?: unknown } | undefined;
  const output = metadata.output_modalities ?? architecture?.output_modalities;
  if (Array.isArray(output) && output.includes("image")) return "image";
  if (
    /(?:^|[/_.-])(?:qwen-image|gpt-image|dall-e|flux|imagen|stable-diffusion|sdxl|z-image|seedream|cogview)(?:[/_.-]|\d|$)|wan[\d.]*-image/i.test(
      id,
    )
  )
    return "image";
  if (
    /(?:embed|rerank|whisper|(?:^|[-_])tts(?:[-_]|$))|(?:^|[/_.-])(?:sora|veo)(?:[/_.-]|\d|$)/i.test(
      id,
    )
  )
    return "other";
  return "text";
}
export const modelKind = (model: { model: string; kind?: ModelKind }) =>
  model.kind ?? inferModelKind(model.model);
