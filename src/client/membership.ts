export function membershipExpiry(value: number, includeTime = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? ({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const) : {}),
  }).format(value);
}
