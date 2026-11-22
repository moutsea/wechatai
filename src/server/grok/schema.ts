export function initGrokTasks(storage: DurableObjectStorage) {
  const sql = storage.sql;
  storage.transactionSync(() => {
    sql.exec(`CREATE TABLE IF NOT EXISTS grok_tasks (
        ref TEXT PRIMARY KEY, jobId TEXT NOT NULL UNIQUE, userMessage INTEGER NOT NULL,
        answerMessage INTEGER, attempts INTEGER NOT NULL DEFAULT 0, due INTEGER, expires INTEGER NOT NULL,
        routeId TEXT, outcome TEXT, claimId TEXT, claimedOutputLimit INTEGER, claimable INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS grok_tasks_due ON grok_tasks(due) WHERE due IS NOT NULL;
        CREATE INDEX IF NOT EXISTS grok_route_jobs ON claw_jobs(routeId,state);
        CREATE TRIGGER IF NOT EXISTS grok_task_cancelled AFTER UPDATE OF state ON claw_jobs
        WHEN NEW.state IN ('cancelled','expired') BEGIN UPDATE grok_tasks SET due=NULL WHERE jobId=NEW.id; END;`);
    const columns = sql
      .exec("PRAGMA table_info(grok_tasks)")
      .toArray()
      .map((col) => col.name);
    if (!columns.includes("routeId")) {
      // Old rows recorded an attempt count but no durable dispatch decision.
      // A Routine from any earlier attempt may still claim until expiry.
      sql.exec(`ALTER TABLE grok_tasks ADD COLUMN routeId TEXT;
          ALTER TABLE grok_tasks ADD COLUMN outcome TEXT;
          UPDATE grok_tasks AS t SET (routeId,outcome) = (
            SELECT j.routeId, CASE WHEN j.state='failed' THEN 'failed'
              WHEN j.state='complete' AND t.answerMessage IS NOT NULL THEN 'completed' END
            FROM claw_jobs j WHERE j.id=t.jobId);
          UPDATE grok_tasks SET due=expires WHERE attempts>0 AND due IS NOT NULL AND due<>expires`);
    }
    if (!columns.includes("claimId")) sql.exec("ALTER TABLE grok_tasks ADD COLUMN claimId TEXT");
    if (!columns.includes("claimedOutputLimit")) {
      // Previous keyed claims saved their exact limit on the relay job. For older
      // unkeyed claims that value was never recorded, so retain their legacy cap.
      sql.exec(`ALTER TABLE grok_tasks ADD COLUMN claimedOutputLimit INTEGER;
        UPDATE grok_tasks SET claimedOutputLimit=(SELECT outputLimit FROM claw_jobs WHERE id=grok_tasks.jobId)
        WHERE due IS NOT NULL AND claimId IS NOT NULL`);
    }
    if (!columns.includes("claimable")) {
      // Preserve outstanding legacy wakes on their original deadlines.
      sql.exec(`ALTER TABLE grok_tasks ADD COLUMN claimable INTEGER NOT NULL DEFAULT 0;
        UPDATE grok_tasks SET claimable=1 WHERE attempts>0 AND due=expires`);
    }
    sql.exec(`CREATE INDEX IF NOT EXISTS grok_recent_turns ON grok_tasks(routeId,userMessage) WHERE outcome IS NOT NULL;
        CREATE INDEX IF NOT EXISTS grok_active_turns ON grok_tasks(routeId,userMessage) WHERE due IS NOT NULL`);
  });
}
