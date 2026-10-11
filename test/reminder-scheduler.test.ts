import {
  env,
  runInDurableObject,
  runDurableObjectAlarm,
  abortAllDurableObjects,
} from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReminderScheduler, ReminderSchedule } from "../src/server/reminder-scheduler";

const namespace = env.REMINDERS as DurableObjectNamespace<ReminderScheduler>;
const schedulers: DurableObjectStub<ReminderScheduler>[] = [];
function setup() {
  const account = env.ACCOUNTS.getByName(crypto.randomUUID());
  const owner = account.id.toString();
  const scheduler = namespace.getByName(owner);
  schedulers.push(scheduler);
  return { account, owner, scheduler };
}
afterEach(async () => {
  for (const stub of schedulers.splice(0)) {
    await runInDurableObject(namespace.get(stub.id), async (_, state) => {
      await state.storage.deleteAlarm();
    });
  }
  vi.restoreAllMocks();
});

describe("independent reminder scheduler", () => {
  it("persists deadlines across restart and ignores stale or duplicate schedule updates", async () => {
    const { owner, scheduler } = setup();
    const dueAt = Date.now() + 300000;
    await scheduler.synchronize(owner, { revision: 2, nextAt: dueAt });
    await scheduler.synchronize(owner, { revision: 1, nextAt: dueAt + 60000 });
    await scheduler.synchronize(owner, { revision: 2, nextAt: dueAt });
    await abortAllDurableObjects();
    expect((await namespace.get(scheduler.id).status()).alarmAt).toBe(dueAt);
    await namespace.get(scheduler.id).synchronize(owner, { revision: 3, nextAt: null });
    await namespace.get(scheduler.id).synchronize(owner, { revision: 2, nextAt: dueAt });
    expect((await namespace.get(scheduler.id).status()).alarmAt).toBeNull();
  });
  it("rejects owner changes and invalid schedules", async () => {
    const { owner, scheduler } = setup();
    await runInDurableObject(scheduler, async (object) => {
      const instance = object as ReminderScheduler;
      await expect(instance.synchronize("bad-owner", { revision: 1, nextAt: 1 })).rejects.toThrow();
      await expect(
        instance.synchronize(owner, { revision: 1, nextAt: Infinity }),
      ).rejects.toThrow();
      await instance.synchronize(owner, { revision: 1, nextAt: Date.now() + 60000 });
      await expect(
        instance.synchronize("f".repeat(64), { revision: 2, nextAt: null }),
      ).rejects.toThrow("Account mismatch");
    });
  });
  it("retries interrupted application RPC without losing the original deadline", async () => {
    const { owner, scheduler } = setup();
    const dueAt = Date.now() + 60000;
    // Mock only the RPC boundary, keeping real durable storage and alarms.
    await runInDurableObject(scheduler, async (object, state) => {
      const instance = object as ReminderScheduler;
      const dispatch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Application deployment"))
        .mockResolvedValue({ revision: 2, nextAt: null });
      const get = vi
        .spyOn(
          instance as unknown as { dispatch(id: string): Promise<ReminderSchedule> },
          "dispatch",
        )
        .mockImplementation(dispatch);
      try {
        await instance.synchronize(owner, { revision: 1, nextAt: dueAt });
        await instance.alarm();
        const failed = await instance.status();
        expect(failed.schedule?.nextAt).toBe(dueAt);
        expect(failed.schedule?.failures).toBe(1);
        expect(failed.alarmAt).toBeLessThanOrEqual(Date.now() + 2000);
        const retry = failed.alarmAt;
        await instance.synchronize(owner, { revision: 1, nextAt: dueAt });
        expect(await state.storage.getAlarm()).toBe(retry);
        await instance.alarm();
        expect(dispatch).toHaveBeenCalledTimes(2);
        expect(await state.storage.getAlarm()).toBeNull();
      } finally {
        get.mockRestore();
      }
    });
  });
  it("does not let an in-flight delivery response overwrite a newer cancellation", async () => {
    const { owner, scheduler } = setup();
    await runInDurableObject(scheduler, async (object, state) => {
      const instance = object as ReminderScheduler;
      const get = vi
        .spyOn(
          instance as unknown as { dispatch(id: string): Promise<ReminderSchedule> },
          "dispatch",
        )
        .mockImplementation(async () => {
          await instance.synchronize(owner, { revision: 3, nextAt: null });
          return { revision: 2, nextAt: Date.now() + 60000 };
        });
      try {
        await instance.synchronize(owner, { revision: 1, nextAt: Date.now() + 60000 });
        await instance.alarm();
        expect((await instance.status()).schedule?.revision).toBe(3);
        expect(await state.storage.getAlarm()).toBeNull();
      } finally {
        get.mockRestore();
      }
    });
  });
  it("reads the account through the real RPC binding", async () => {
    const { account, owner, scheduler } = setup();
    const current = await account.registerPersonalReminders();
    await scheduler.synchronize(owner, { ...current, nextAt: Date.now() + 60000 });
    await runDurableObjectAlarm(scheduler);
    expect(await scheduler.status()).toEqual({
      schedule: { accountId: owner, revision: current.revision, nextAt: null, failures: 0 },
      alarmAt: null,
    });
  });
});
