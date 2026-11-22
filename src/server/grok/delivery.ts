import type { ChatSession } from "../../shared/types";
import type { GrokPlugin } from "../../shared/grok-bot";

// Only the WeChat delivery copy gets navigation. Keep the persisted answer and billing unchanged.
export function grokSessionReplyText(
  session: ChatSession,
  plugin: Pick<GrokPlugin, "id" | "name" | "shortcut" | "enabled"> | undefined,
  savedName: string | undefined,
  historySite: string | undefined,
  text: string,
) {
  const name = plugin?.name ?? savedName;
  const source = name && name !== "Grok Bot" ? `Grok Bot（${name}）` : "Grok Bot";
  const status = !plugin ? "配置已删除。" : !plugin.enabled ? "配置已停用。" : "";
  let notice = `这条 ${source} 回复来自会话「${session.title.replace(/\s+/g, " ").trim()}」。${status}`;
  if (historySite) {
    const url = new URL("/app/sessions", historySite);
    url.searchParams.set("id", session.id);
    notice += `\n[查看原会话](${url.href})`;
  }
  if (!plugin?.enabled) return `${notice}\n\n${text}`;
  const followUp =
    session.pluginInstanceId === plugin.id ? "" : `切回后用 @${plugin.shortcut} 追问。`;
  return `${notice}\n在微信发送 /wx sessions 查看编号，再用 /wx switch 编号 切回。${followUp}\n\n${text}`;
}
