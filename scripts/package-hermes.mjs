import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const output = resolve("public/downloads");
await mkdir(output, { recursive: true });
const archive = resolve(output, "wechatai-hermes-1.1.2.tgz");
execFileSync(
  "tar",
  ["-czf", archive, "__init__.py", "adapter.py", "transport.py", "plugin.yaml", "README.md", "LICENSE"],
  {
    cwd: resolve("integrations/hermes"),
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  },
);
const hash = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex");
const source = (await readFile("integrations/hermes/connect.py", "utf8")).replace(
  "__WECHATAI_HERMES_ARCHIVE_SHA256__",
  hash,
);
await writeFile(resolve(output, "wechatai-hermes-connect.py"), source);
console.log("Built Hermes channel package and verified installer.");
