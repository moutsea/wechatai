import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export type ReminderSchedule = { revision: number; nextAt: number | null };
type Schedule = ReminderSchedule & { accountId: string; failures: number; kind?: "notification" };

// Production runs this class in a separate Worker. Only internal DO bindings can
// register schedules; this service has no public routes or user credentials.
export class ReminderScheduler extends DurableObject<Pick<Env, "ACCOUNTS" | "REMINDERS">> {
  async status() {
    return {
      schedule: (await this.ctx.storage.get<Schedule>("schedule")) ?? null,
      alarmAt: await this.ctx.storage.getAlarm(),
    };
  }
  async synchronize(accountId: string, schedule: ReminderSchedule): Promise<void> {
    await this.saveSchedule(accountId, schedule, false);
  }
  async synchronizeNotifications(accountId: string, schedule: ReminderSchedule): Promise<void> {
    if (!this.ctx.id.equals(this.env.REMINDERS!.idFromName(`${accountId}:notifications`)))
      throw new Error("Notification scheduler scope mismatch");
    await this.saveSchedule(accountId, schedule, false, "notification");
  }
  private async dispatch(accountId: string, kind?: "notification"): Promise<ReminderSchedule> {
    const account = this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromString(accountId));
    return kind === "notification"
      ? account.dispatchNotifications()
      : account.dispatchPersonalReminders();
  }
  private async saveSchedule(
    accountId: string,
    schedule: ReminderSchedule,
    fromAlarm: boolean,
    kind?: "notification",
  ) {
    if (
      !/^[0-9a-f]{64}$/.test(accountId) ||
      !Number.isSafeInteger(schedule.revision) ||
      schedule.revision < 0 ||
      (schedule.nextAt !== null && (!Number.isSafeInteger(schedule.nextAt) || schedule.nextAt < 0))
    )
      throw new Error("Invalid reminder schedule");
    await this.ctx.storage.transaction(async (tx) => {
      const previous = await tx.get<Schedule>("schedule");
      if (previous && previous.accountId !== accountId) throw new Error("Account mismatch");
      if (previous && previous.kind !== kind) throw new Error("Scheduler scope mismatch");
      if (previous && previous.revision > schedule.revision) return;
      // Lost acknowledgements may replay a sync. Do not reset a delivery retry.
      if (!fromAlarm && previous?.revision === schedule.revision && (await tx.getAlarm()) !== null)
        return;
      await tx.put<Schedule>("schedule", {
        accountId,
        ...schedule,
        failures: 0,
        ...(kind ? { kind } : {}),
      });
      if (schedule.nextAt === null) await tx.deleteAlarm();
      else await tx.setAlarm(Math.max(Date.now(), schedule.nextAt));
    });
  }

  async alarm(): Promise<void> {
    const schedule = await this.ctx.storage.get<Schedule>("schedule");
    if (!schedule || schedule.nextAt === null) return;
    // Persist a retry before RPC. An application deployment can interrupt that
    // RPC, but cannot restart this scheduler or erase the original deadline.
    await this.ctx.storage.setAlarm(Date.now() + 5000);
    try {
      const next = await this.dispatch(schedule.accountId, schedule.kind);
      await this.saveSchedule(schedule.accountId, next, true, schedule.kind);
      console.info(JSON.stringify({ event: "reminder.scheduler_completed", nextAt: next.nextAt }));
    } catch (error) {
      await this.ctx.storage.transaction(async (tx) => {
        const current = await tx.get<Schedule>("schedule");
        // A concurrent edit/cancellation owns its newer deadline.
        if (!current || current.revision !== schedule.revision) return;
        const failures = current.failures + 1;
        await tx.put<Schedule>("schedule", { ...current, failures });
        await tx.setAlarm(Date.now() + Math.min(60000, 2000 * 2 ** Math.min(failures - 1, 5)));
      });
      console.warn(
        JSON.stringify({
          event: "reminder.scheduler_retry",
          code: error instanceof Error ? error.name : "unknown",
        }),
      );
    }
  }
}

// Operations are available through an internal service binding only. This also
// lets deployments reconcile pre-existing reminders without accessing secrets.
export default class ReminderService extends WorkerEntrypoint<Pick<Env, "ACCOUNTS" | "REMINDERS">> {
  async reconcileUsers(userIds: string[]) {
    if (
      !Array.isArray(userIds) ||
      userIds.length > 100 ||
      userIds.some((id) => typeof id !== "string" || !id || id.length > 128)
    )
      throw new Error("Invalid user batch");
    const results = [];
    for (const id of userIds) {
      try {
        const account = this.env.ACCOUNTS.getByName(id);
        const schedule = await account.registerPersonalReminders();
        const scheduler = (
          this.env.REMINDERS as DurableObjectNamespace<ReminderScheduler>
        ).getByName(account.id.toString());
        results.push({ ok: true, ...schedule, ...(await scheduler.status()) });
      } catch (error) {
        results.push({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown reconciliation error",
        });
      }
    }
    return results;
  }
  async fetch(request: Request) {
    // HTTP over an authenticated Cloudflare service binding keeps the complete
    // reconciliation call alive across the local operations proxy's RPC hops.
    if (request.method === "POST" && new URL(request.url).pathname === "/reconcile")
      return Response.json(await this.reconcileUsers(await request.json()));
    return new Response("Not found", { status: 404 });
  }
}
