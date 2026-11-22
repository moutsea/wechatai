import { AppError } from "./config";

const HOUR = 3_600_000;
type Attempt = { id: string; channel: string; started: number; failedAt?: number };

// At most twelve recent attempts. Keeping the window in settings also preserves
// it through hibernation and existing Worker/VPS account backups.
function attempts(sql: SqlStorage): Attempt[] {
  const row = sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='modelTestAttempts'")
    .toArray()[0];
  return row ? JSON.parse(row.value) : [];
}
function save(sql: SqlStorage, values: Attempt[]) {
  sql.exec(
    "INSERT INTO settings(key,value) VALUES('modelTestAttempts',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    JSON.stringify(values),
  );
}
export function reserveModelTest(sql: SqlStorage, id: string, channel: string, now: number) {
  const recent = attempts(sql).filter((row) => row.started > now - HOUR);
  const local = recent.filter((row) => row.channel === channel);
  if (recent.length >= 12 || local.length >= 6)
    throw new AppError("model_test_limit", "过去一小时的模型测试次数已用完，请稍后再试。", 429);
  const firstSuccess = local.findIndex((row) => !row.failedAt);
  const failures = firstSuccess < 0 ? local.length : firstSuccess;
  if (failures && now < local[0].failedAt! + Math.min(300_000, 15_000 * 2 ** (failures - 1)))
    throw new AppError("model_test_cooldown", "该渠道刚刚测试失败，请稍后再试。", 429);
  save(sql, [{ id, channel, started: now }, ...recent]);
}
export function failModelTest(sql: SqlStorage, id: string) {
  const recent = attempts(sql);
  const attempt = recent.find((row) => row.id === id);
  if (attempt) {
    attempt.failedAt = Date.now();
    save(sql, recent);
  }
}
