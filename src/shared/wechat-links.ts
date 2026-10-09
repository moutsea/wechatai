export const WECHAT_LINK_LIMITS = { free: 1, plus: 10 } as const;
export const DEFAULT_WECHAT_LINK = "default";

// Keep the first link's keys compatible with existing accounts.
export function wechatLinkKey(id: string, key: string) {
  return id === DEFAULT_WECHAT_LINK ? key : `wechat:${id}:${key}`;
}
