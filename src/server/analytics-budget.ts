import { shanghaiDay } from "../shared/analytics";
import { secret } from "./config";

type Lease = { day: string; limit: number; remaining: number; busy: boolean; retryAt: number };

// Isolates can disappear with unused permits. Under-counting optional telemetry
// is preferable to overspending or waiting on I/O owned by another request.
export class AnonymousAnalyticsBudget {
  private leases = new WeakMap<D1Database, Lease>();

  async take(db: D1Database, limit: number, now = Date.now()): Promise<boolean> {
    if (!limit) return false;
    const day = shanghaiDay(new Date(now));
    let lease = this.leases.get(db);
    if (!lease || lease.day !== day || lease.limit !== limit) {
      lease = { day, limit, remaining: 0, busy: false, retryAt: 0 };
      this.leases.set(db, lease);
    }
    if (lease.remaining > 0) {
      lease.remaining--;
      return true;
    }
    if (lease.busy || now < lease.retryAt) return false;
    lease.busy = true;
    try {
      const batch = Math.min(16, limit);
      const grant = await db
        .prepare(`INSERT INTO anonymous_analytics_budget (day,reserved,last_grant)
        VALUES (?1,?2,?2) ON CONFLICT(day) DO UPDATE SET
        last_grant=min(?2,?3-reserved),reserved=min(?3,reserved+?2)
        WHERE reserved < ?3 RETURNING last_grant`)
        .bind(day, batch, limit)
        .first<number>("last_grant");
      if (!grant) {
        lease.retryAt = Infinity; // Replaced automatically on the next Beijing day.
        return false;
      }
      lease.remaining = grant - 1;
      return true;
    } catch {
      lease.retryAt = now + 60_000;
      return false;
    } finally {
      lease.busy = false;
    }
  }
}
const budget = new AnonymousAnalyticsBudget();
export function allowAnonymousAnalytics(env: Env) {
  const setting = secret(env, "ANALYTICS_DAILY_EVENT_BUDGET", false);
  const limit = setting ? Number(setting) : 10_000;
  return budget.take(env.DB, Number.isSafeInteger(limit) && limit >= 0 ? limit : 0);
}
