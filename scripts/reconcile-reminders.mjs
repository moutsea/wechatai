import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { productionConfigPath } from "./production.mjs";
import { getPlatformProxy, unstable_readConfig } from "wrangler";

// Only Cloudflare account operators can invoke this internal service binding.
// No public administrative endpoint or extra application secret is created.
const config = unstable_readConfig({ config: productionConfigPath(), env: "production" });
const directory = await mkdtemp(join(tmpdir(), "wechatai-reminders-"));
let platform;
try {
  const configPath = join(directory, "wrangler.jsonc");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "wechatai-reminder-maintenance",
      account_id: config.account_id,
      compatibility_date: "2026-10-10",
      services: [
        {
          binding: "REMINDER_OPS",
          service: config.durable_objects.bindings.find((binding) => binding.name === "REMINDERS")
            .script_name,
          remote: true,
        },
      ],
      d1_databases: config.d1_databases.map((database) => ({ ...database, remote: true })),
    }),
    { mode: 0o600 },
  );
  platform = await getPlatformProxy({ configPath, persist: false, remoteBindings: true });
  let cursor = "",
    count = 0,
    active = 0;
  for (;;) {
    const { results } = await platform.env.DB.prepare(
      'SELECT id FROM "user" WHERE id > ? ORDER BY id LIMIT 50',
    )
      .bind(cursor)
      .all();
    if (!results.length) break;
    const response = await platform.env.REMINDER_OPS.fetch("https://reminders.internal/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(results.map((row) => row.id)),
    });
    if (!response.ok) throw new Error(`Reminder reconciliation HTTP ${response.status}`);
    const schedules = await response.json();
    const failed = schedules.filter((result) => !result.ok);
    if (failed.length)
      throw new Error(
        `${failed.length}/${schedules.length} reminder accounts could not be reconciled: ${failed[0].error}`,
      );
    for (const result of schedules) {
      if (result.nextAt !== null && (result.alarmAt === null || !result.schedule))
        throw new Error("An active reminder is missing its scheduler alarm");
      if (result.nextAt !== null) active++;
    }
    count += results.length;
    cursor = results.at(-1).id;
    console.log(
      JSON.stringify({ event: "reminders.reconciled", accounts: count, activeSchedules: active }),
    );
  }
  console.log(
    JSON.stringify({
      event: "reminders.reconciliation_complete",
      accounts: count,
      activeSchedules: active,
    }),
  );
} finally {
  await platform?.dispose();
  await rm(directory, { recursive: true, force: true });
}
