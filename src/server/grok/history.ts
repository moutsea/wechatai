// Bound the ordered turn lookup before expanding each turn into one or two
// messages. Text is read from the owning conversation so clearing it takes effect.
const recentMessages = `WITH recent AS MATERIALIZED (
  SELECT ref,jobId,userMessage,answerMessage,outcome FROM grok_tasks
  WHERE routeId=? AND userMessage<? AND outcome IS NOT NULL
  ORDER BY userMessage DESC LIMIT 10),
  transcript AS (
    SELECT m.id,m.role,m.content,r.userMessage,r.outcome,
      CASE WHEN m.id=r.answerMessage AND m.content LIKE '【回复已截断】%' AND EXISTS (
        SELECT 1 FROM claw_jobs j JOIN claw_events e ON e.id=j.pluginId || ':' || r.ref
        WHERE j.id=r.jobId AND json_extract(e.receipt,'$.truncated')=1
      ) THEN instr(m.content,char(10)||char(10))+2 ELSE 1 END AS bodyStart
    FROM recent r JOIN messages m ON m.id IN (r.userMessage,r.answerMessage))
  SELECT id,role,substr(content,bodyStart,3001) AS text,bodyStart>1 AS outputTruncated,outcome
  FROM transcript ORDER BY userMessage DESC,id DESC LIMIT 10`;

const historyBudget = 30_000;
type Outcome = "completed" | "failed" | "expired";
type Message = {
  id: number;
  role: string;
  text: string;
  outcome: Outcome;
  outputTruncated: number;
};
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
      ...(chars.length > limit || row.outputTruncated ? { truncated: true } : {}),
    });
    remaining -= Math.min(chars.length, limit);
  }
  return entries.reverse();
}
