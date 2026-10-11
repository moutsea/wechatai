import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { PersonalRunStore, type PersonalRunInput } from "../src/server/personal-runs";

it("persists multi-megabyte Unicode checkpoints in account-local chunks and erases them on privacy clear", async () => {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  const another = env.ACCOUNTS.getByName(crypto.randomUUID());
  const input: PersonalRunInput = {
    original: [{ role: "user", content: "附件中文😀".repeat(160000) }],
  };
  await runInDurableObject(stub, (_, state) => {
    const store = new PersonalRunStore(state.storage);
    store.save("large", {
      version: 1,
      modelId: "m",
      pluginId: "p",
      modelConfig: "{}",
      pluginConfig: "{}",
      sessionId: "s",
      connectionId: "default",
      generation: "g",
      contextStart: 0,
      resetAt: 0,
      startedAt: Date.now(),
      deadline: Date.now() + 10000,
      resumes: 0,
      outputLimit: 100,
      reminderTarget: null,
    });
    state.storage.sql.exec(
      "INSERT INTO runs (id,status,createdAt) VALUES ('large','running',?)",
      Date.now(),
    );
    state.storage.sql.exec(
      "INSERT INTO inbox (id,payload,createdAt) VALUES ('large','{}',?)",
      Date.now(),
    );
    store.write("large", "input", input);
    expect(
      state.storage.sql.exec("SELECT count(*) n FROM personal_run_data").one().n,
    ).toBeGreaterThan(8);
  });
  await abortAllDurableObjects();
  const fresh = env.ACCOUNTS.get(stub.id);
  await runInDurableObject(fresh, async (_, state) => {
    expect(new PersonalRunStore(state.storage).read("large", "input")).toEqual(input);
    await state.storage.deleteAlarm();
  });
  await runInDurableObject(another, (_, state) => {
    expect(new PersonalRunStore(state.storage).read("large", "input")).toBeUndefined();
  });
  expect(JSON.parse(await fresh.api("privacy.clear")).ok).toBe(true);
  await runInDurableObject(fresh, (_, state) => {
    expect(state.storage.sql.exec("SELECT count(*) n FROM personal_run_data").one().n).toBe(0);
    expect(state.storage.sql.exec("SELECT count(*) n FROM personal_runs").one().n).toBe(0);
  });
});
