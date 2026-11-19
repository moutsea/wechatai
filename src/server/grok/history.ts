// Bound the ordered turn lookup before expanding each turn into one or two
// messages. Text is read from the owning conversation so clearing it takes effect.
const recentMessages = `WITH recent AS MATERIALIZED (
  SELECT userMessage,answerMessage,outcome FROM grok_tasks
  WHERE routeId=? AND userMessage<? AND outcome IS NOT NULL
  ORDER BY userMessage DESC LIMIT 10)
  SELECT m.id,m.role,substr(m.content,1,3001) AS text,r.outcome
  FROM recent r JOIN messages m ON m.id IN (r.userMessage,r.answerMessage)
  ORDER BY r.userMessage DESC,m.id DESC LIMIT 10`;

const historyBudget = 30_000;
type Message = { id: number; role: string; text: string; outcome: string };
type HistoryEntry = { role: string; text: string; taskStatus?: "failed"; truncated?: true };

export function readGrokHistory(sql: SqlStorage, routeId: string, before: number) {
  const rows = sql.exec<Message>(recentMessages, routeId, before).toArray();
  const latestFailure = rows.find((row) => row.outcome !== "completed");
  const entries = new Map<number, HistoryEntry>();
  let remaining = historyBudget;
  function include(row: Message, limit: number) {
    if (!remaining) return;
    const chars = Array.from(row.text);
    const take = Math.min(limit, remaining, chars.length);
    entries.set(row.id, {
      role: row.role,
      text: chars.slice(0, take).join(""),
      ...(row.outcome !== "completed" ? { taskStatus: "failed" as const } : {}),
      ...(take < chars.length ? { truncated: true as const } : {}),
    });
    remaining -= take;
  }
  if (latestFailure) {
    if (latestFailure.text.length >= 3001)
      latestFailure.text = sql
        .exec<{ text: string }>(
          "SELECT substr(content,1,?) AS text FROM messages WHERE id=?",
          historyBudget + 1,
          latestFailure.id,
        )
        .one().text;
    include(latestFailure, historyBudget);
  }
  for (const row of rows) if (row !== latestFailure) include(row, 3000);
  return rows.reverse().flatMap((row) => entries.get(row.id) ?? []);
}
