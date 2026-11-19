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
type Outcome = "completed" | "failed" | "expired";
type Message = { id: number; role: string; text: string; outcome: Outcome };
type HistoryEntry = {
  role: string;
  text: string;
  taskStatus?: "failed" | "expired";
  truncated?: true;
};

export function readGrokHistory(sql: SqlStorage, routeId: string, before: number) {
  const rows = sql.exec<Message>(recentMessages, routeId, before).toArray();
  const latestUnsuccessful = rows.find((row) => row.outcome !== "completed");
  const entries: HistoryEntry[] = [];
  let remaining = historyBudget;
  // Allocate newest first. A failed request can use the space left after
  // newer turns and keeps the full budget for an immediate retry.
  for (const row of rows) {
    if (!remaining) break;
    const limit = row === latestUnsuccessful ? remaining : Math.min(remaining, 3000);
    let chars = Array.from(row.text);
    if (limit > 3000 && chars.length > 3000) {
      const { text } = sql
        .exec<{ text: string }>(
          "SELECT substr(content,1,?) AS text FROM messages WHERE id=?",
          limit + 1,
          row.id,
        )
        .one();
      chars = Array.from(text);
    }
    entries.push({
      role: row.role,
      text: chars.slice(0, limit).join(""),
      ...(row.outcome !== "completed" ? { taskStatus: row.outcome } : {}),
      ...(chars.length > limit ? { truncated: true } : {}),
    });
    remaining -= Math.min(chars.length, limit);
  }
  return entries.reverse();
}
