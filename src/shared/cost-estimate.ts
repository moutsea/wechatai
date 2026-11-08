import { OUTPUT_TOKEN_WEIGHT, TOKENS_PER_CREDIT } from "./credits";

/** 单轮按 0.001 credit 向上取整，与文字结算精度一致。价格由用户输入。 */
export function estimateTextCost(
  input: number,
  output: number,
  rounds: number,
  inputPrice: number,
  outputPrice: number,
) {
  const values = [input, output, rounds, inputPrice, outputPrice];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  if (![input, output, rounds].every(Number.isSafeInteger)) return null;
  const result = {
    credits:
      (Math.ceil(((input + output * OUTPUT_TOKEN_WEIGHT) * 1000) / TOKENS_PER_CREDIT) * rounds) /
      1000,
    modelYuan: ((input * inputPrice + output * outputPrice) * rounds) / 1_000_000,
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}
