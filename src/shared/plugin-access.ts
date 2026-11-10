export const PLUGIN_LIMITS = { free: 1, plus: null } as const;

export type PluginAccessIssue = {
  code: "membership_expired" | "plugin_limit" | "plugin_disabled";
  message: string;
};

export function pluginLimitIssue(planUntil: number, now = Date.now()): PluginAccessIssue {
  const expired = planUntil > 0 && planUntil <= now;
  return {
    code: expired ? "membership_expired" : "plugin_limit",
    message:
      (expired ? "Plus 会员已到期，当前恢复为 Free。" : "") +
      `Free 用户最多配置 ${PLUGIN_LIMITS.free} 个插件，此配置超出名额，已暂停。配置与绑定仍保留；可续费 Plus，或删除不用的配置释放名额。仅停用不会释放名额。请到「会员与 credits」查看。`,
  };
}

export function canAddPlugin(plan: "free" | "plus", count: number) {
  const limit = PLUGIN_LIMITS[plan];
  return limit === null || count < limit;
}

// Reuse this set when checking a whole list instead of searching it for each ID.
export function availablePluginIds(plan: "free" | "plus", plugins: readonly { id: string }[]) {
  const limit = PLUGIN_LIMITS[plan];
  return new Set((limit === null ? plugins : plugins.slice(0, limit)).map((plugin) => plugin.id));
}

// Configurations are ordered by creation in the account store. Disabled entries
// still occupy a slot; downgrading preserves data without granting extra slots.
export function pluginAvailable(
  plan: "free" | "plus",
  plugins: readonly { id: string }[],
  id: string,
) {
  const index = plugins.findIndex((plugin) => plugin.id === id);
  const limit = PLUGIN_LIMITS[plan];
  return index >= 0 && (limit === null || index < limit);
}
