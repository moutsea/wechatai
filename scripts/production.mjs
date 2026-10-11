// Keep each operator's resource IDs out of the public repository.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function productionConfigPath() {
  const path = process.env.WECHATAI_WRANGLER_CONFIG || "wrangler.production.local.jsonc";
  if (!existsSync(path))
    throw new Error(
      "Create wrangler.production.local.jsonc from wrangler.jsonc first; see docs/deployment.md.",
    );
  return resolve(path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let args = process.argv.slice(2);
    if (!args.length)
      throw new Error("Usage: pnpm cf:production <wrangler arguments> or pnpm deploy:reminders");
    if (args[0] === "reminders") {
      const config = process.env.WECHATAI_REMINDERS_CONFIG || "wrangler.reminders.local.jsonc";
      if (!existsSync(config))
        throw new Error("Create wrangler.reminders.local.jsonc first; see docs/deployment.md.");
      args = ["deploy", "--config", config, ...args.slice(1)];
    } else {
      args.push("--config", productionConfigPath(), "--env", "production");
    }
    const result = spawnSync("pnpm", ["exec", "wrangler", ...args], { stdio: "inherit" });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
