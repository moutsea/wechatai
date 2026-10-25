export const TOKENS_PER_CREDIT = 5000;
export const OUTPUT_TOKEN_WEIGHT = 8;
/**
 * 每日赠送额度的默认值。服务端可用 FREE_DAILY_CREDITS / PLUS_DAILY_CREDITS 覆盖，
 * 这里同时作为「公开价格页」的展示来源，避免文案和实际发放额度各写一份而漂移。
 */
export const DAILY_CREDIT_DEFAULTS = { free: 100, plus: 1000 } as const;
