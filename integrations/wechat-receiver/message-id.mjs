// WeChat sends int64 identifiers as JSON numbers. Read their original digits
// before V8 rounds the value. Ordinary fields retain normal JSON semantics.
export const decimalId = /^-?(?:0|[1-9]\d{0,19})$/;
export function parseWechatJson(text) {
  return JSON.parse(text, (key, value, context) => {
    if (key !== "message_id" && key !== "seq") return value;
    if (typeof value === "number" && !Number.isSafeInteger(value)) {
      if (!context?.source || !decimalId.test(context.source)) throw new Error("invalid_wechat_id");
      return context.source;
    }
    if (typeof value === "string" && !decimalId.test(value)) throw new Error("invalid_wechat_id");
    return value;
  });
}
