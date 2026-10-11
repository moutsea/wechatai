/** Only the message's leading slash token is a command; arguments remain untouched. */
export function slashCommand(text: string) {
  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match ? { name: match[1].toLowerCase(), args: match[2] ?? "" } : null;
}

/** Split only a leading mention. Delimiters never participate in shortcut lookup. */
export function leadingMention(text: string) {
  const match = /^[@＠]([^\s,，:：]*)([\s\S]*)$/.exec(text.trimStart());
  if (!match) return null;
  return {
    handle: match[1],
    // Consume one punctuation separator; preserve punctuation inside the request.
    content: match[2].replace(/^[,，:：]/, "").trim(),
  };
}

/** null means pass through to the selected model/plugin, without a second host parse. */
export function platformCommand(text: string, nativeCommands: boolean): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const command = slashCommand(trimmed);
  if (command?.name === "wx") {
    const body = command.args.trim();
    return body ? `/${body.replace(/^\//, "")}` : "/help";
  }
  if (command && ["use", "exit"].includes(command.name))
    return `/${command.name}${command.args ? ` ${command.args}` : ""}`;
  return nativeCommands ? null : trimmed;
}

export function nativeCommand(text: string): string | null {
  return text.trimStart().startsWith("/") ? (slashCommand(text)?.name ?? "unknown") : null;
}

export const nativeCommandLane = (text: string) =>
  text.trim().toLowerCase() === "/stop" ? ("control" as const) : ("message" as const);
