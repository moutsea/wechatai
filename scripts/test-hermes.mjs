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
for (const file of ["test_http.py", "test_adapter.py"]) {
  const testArgv = [...argv];
  testArgv[at] = testArgv[at].replace(
    entry,
    `runpy.run_path(${JSON.stringify(resolve("integrations/hermes", file))}, run_name='__main__')`,
  );
  const result = spawnSync(testArgv[0], testArgv.slice(1), { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
