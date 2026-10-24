import { describe, expect, it } from "vitest";
import { inferModelKind } from "../src/shared/model-kind";

describe("non-chat model discovery", () => {
  it.each([
    "gemini-2.5-flash-image",
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
    "gemini-2.0-flash-exp-image-generation",
    "models/gemini-2.5-flash-image",
    "models/gemini-3-pro-image-preview",
    "google/gemini-2.5-flash-image",
    "google/gemini-3-pro-image-preview:free",
  ])("recognizes Gemini image model %s without modality metadata", (id) =>
    expect(inferModelKind(id, { object: "model", owned_by: "google" })).toBe("image"),
  );
  it("keeps ordinary Gemini models and explicit user classifications intact", () => {
    for (const id of [
      "gemini-2.5-pro",
      "models/gemini-2.5-flash",
      "google/gemini-3-pro-preview",
      "my-gemini-3-pro-image-chat",
      "gemini-3-pro-imagery",
    ])
      expect(inferModelKind(id)).toBe("text");
    expect(inferModelKind("gemini-2.5-flash-image", { kind: "chat" })).toBe("text");
  });
  it.each([
    "grok-imagine-image",
    "grok-imagine-image-2.0",
    "grok-imagine-image-quality",
    "grok-2-image-1212",
    "x-ai/grok-imagine-image",
  ])("recognizes xAI image model %s without modality metadata", (id) =>
    expect(inferModelKind(id, { object: "model", owned_by: "xai", image_price: 200000000 })).toBe(
      "image",
    ),
  );
  it.each([
    "omni-moderation-latest",
    "text-moderation-stable",
    "gpt-realtime",
    "gpt-4o-realtime-preview",
    "gpt-4o-mini-transcribe",
    "gpt-4o-transcribe-diarize",
    "gpt-3.5-turbo-instruct",
    "davinci-002",
    "babbage-002",
    "text-embedding-3-small",
    "whisper-1",
    "tts-1",
    "provider/omni-moderation-latest",
    "grok-imagine-video",
    "grok-imagine-video-1.5",
  ])("keeps %s out of text conversations", (id) => expect(inferModelKind(id)).toBe("other"));

  it("uses explicit non-chat metadata even for unrecognized model IDs", () => {
    expect(inferModelKind("my-model", { type: "moderation" })).toBe("other");
    expect(inferModelKind("my-model", { kind: "transcription" })).toBe("other");
    expect(inferModelKind("my-model", { output_modalities: ["audio"] })).toBe("other");
    expect(inferModelKind("my-model", { architecture: { output_modalities: ["video"] } })).toBe(
      "other",
    );
    expect(inferModelKind("my-model", { output_modalities: ["text", "audio"] })).toBe("text");
  });

  it("retains image models, custom chat models and explicit catalog classifications", () => {
    for (const id of ["deepseek-chat", "gpt-4.1-mini", "gemini-2.5-pro", "custom-conversation"])
      expect(inferModelKind(id)).toBe("text");
    expect(inferModelKind("qwen-image-3.0")).toBe("image");
    expect(
      inferModelKind("custom", { architecture: { output_modalities: ["image", "text"] } }),
    ).toBe("image");
    expect(inferModelKind("qwen-image-3.0", { kind: "chat" })).toBe("text");
    expect(inferModelKind("custom", { output_modalities: [] })).toBe("text");
    expect(inferModelKind("custom", { architecture: null })).toBe("text");
  });
});
