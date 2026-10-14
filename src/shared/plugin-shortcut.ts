import { z } from "zod";

// Escaped hyphen also works in HTML input patterns (which use the v flag).
export const PLUGIN_SHORTCUT_PATTERN = String.raw`^(?!\p{N}+$)[\p{L}\p{N}_\-]+$`;
export const PLUGIN_SHORTCUT_HINT =
  "别名限 1–24 个字，可用中文、字母、数字、下划线或短横线，不能是纯数字";
export const pluginShortcutSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(new RegExp(PLUGIN_SHORTCUT_PATTERN, "u"), PLUGIN_SHORTCUT_HINT);
export const pluginShortcutJsonSchema = z.toJSONSchema(pluginShortcutSchema, { io: "input" });

export const LEGACY_NUMERIC_SHORTCUT_HINT =
  "此旧别名是纯数字，可以保留并保存其他设置；使用 /use 前请改成含中文或字母的别名。";
export const isLegacyNumericShortcut = (value?: string): value is string =>
  !!value && value.length <= 24 && /^\p{N}+$/u.test(value);

// The exception comes only from the persisted configuration, never the submitted form.
// Creation and changed aliases still use the strict public protocol schema.
export const pluginShortcutForEdit = (previous?: string) =>
  isLegacyNumericShortcut(previous)
    ? pluginShortcutSchema.or(z.literal(previous))
    : pluginShortcutSchema;

export const pluginShortcutPatternForEdit = (previous?: string) =>
  isLegacyNumericShortcut(previous)
    ? `^(?:${previous}|${PLUGIN_SHORTCUT_PATTERN})$`
    : PLUGIN_SHORTCUT_PATTERN;
