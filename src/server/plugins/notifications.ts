import type { UserPlugin } from "../../shared/image-generation";
import type { PluginManifest } from "../../shared/plugins";

// Apply to proactive or cross-plugin delivery copies. Guidance is not plugin output and
// must never become billable tokens or part of the model's conversation history.
export function pluginNotificationText(
  manifest: Pick<PluginManifest, "name">,
  instance: Pick<UserPlugin, "name" | "shortcut">,
  text: string,
) {
  const name = instance.name.replace(/\s+/g, " ").trim();
  const source = name === manifest.name ? manifest.name : `${manifest.name}（${name}）`;
  return `消息来自 ${source}插件。\n使用 /use ${instance.shortcut} 进入插件，或发送 @${instance.shortcut} 回复内容。\n\n──────────\n\n${text}`;
}
