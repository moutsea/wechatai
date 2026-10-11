export const DEFAULT_CONTEXT_TOKENS = 128_000;
export const DEFAULT_INPUT_TOKENS = 128_000;
export const DEFAULT_OUTPUT_TOKENS = 8_192;
export const MAX_CONTEXT_TOKENS = 2_000_000;
export const CONTEXT_SUMMARY_THRESHOLD = 0.8;

export function inputBudget(window: number, output: number) {
  return Math.floor(window - output - Math.max(64, window * 0.05));
}

export function modelInputBudget(
  model: { contextTokens: number; maxInputTokens?: number; maxOutputTokens: number },
  output = model.maxOutputTokens,
) {
  return Math.min(
    model.maxInputTokens ?? model.contextTokens,
    inputBudget(model.contextTokens, output),
  );
}
