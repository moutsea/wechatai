// Include disabled and suspended configurations: their aliases are still reserved.
// Use the same case folding as the gateway, without changing existing aliases.
export function conflictingShortcuts(items: readonly { shortcut: string }[]): Set<string> {
  const seen = new Set<string>();
  const conflicts = new Set<string>();
  for (const { shortcut } of items) {
    if (!shortcut) continue;
    const alias = shortcut.toLowerCase();
    if (seen.has(alias)) conflicts.add(alias);
    seen.add(alias);
  }
  return conflicts;
}
