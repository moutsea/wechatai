export function membershipExpiry(value: number, includeTime = false, locale = "zh-CN") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? ({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const) : {}),
  }).format(value);
}
