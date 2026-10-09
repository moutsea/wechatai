import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
const fallback = resolve(homedir(), ".local/bin/hermes");
const cli = process.env.HERMES_CLI || (existsSync(fallback) ? fallback : "hermes");
const argv = JSON.parse(execFileSync(cli, ["--print-runtime-command"], { encoding: "utf8" }));
const at = argv.indexOf("-c") + 1;
const entry = "runpy.run_module('hermes_cli.main', run_name='__main__', alter_sys=True)";
if (!at || !argv[at]?.includes(entry))
  throw new Error("Unsupported Hermes launcher; use the current official Hermes CLI.");
argv[at] = argv[at].replace(
  entry,
  `runpy.run_path(${JSON.stringify(resolve("integrations/hermes/test_adapter.py"))}, run_name='__main__')`,
);
const result = spawnSync(argv[0], argv.slice(1), { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
