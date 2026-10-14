export const PLUGIN_LIMITS = { free: 1, plus: null } as const;

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
