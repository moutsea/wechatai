import { countTokens, encode, decode, setMergeCacheSize } from "gpt-tokenizer/encoding/cl100k_base";

// Keep only the static vocabulary across requests, never cache users' text.
setMergeCacheSize(0);
const options = { disallowedSpecial: new Set<string>() };
export const countTextTokens = (text: string) => countTokens(text, options);

export function limitTextTokens(text: string, limit: number) {
  if (countTextTokens(text) <= limit) return text;
  const tokens = encode(text, options);
  let end = Math.min(tokens.length, Math.max(0, Math.floor(limit)));
  while (end > 0) {
    const prefix = decode(tokens.slice(0, end));
    // A token may end in the middle of a Unicode code point.
    if (text.startsWith(prefix) && countTextTokens(prefix) <= limit) return prefix;
    end--;
  }
  return "";
}
