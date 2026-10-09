import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, rename, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const output = resolve("public/downloads");
await mkdir(output, { recursive: true });
// Published plugins must contain JavaScript runtime output; TypeScript-only
// entries are accepted only in local source checkouts by current OpenClaw.
for (const name of ["index", "transport"]) {
  const source = await readFile(`integrations/openclaw/${name}.ts`, "utf8");
  await writeFile(
    `integrations/openclaw/${name}.js`,
    stripTypeScriptTypes(source, { mode: "transform" }),
  );
}
const result = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", output], {
    cwd: resolve("integrations/openclaw"),
    encoding: "utf8",
  }),
);
await rename(resolve(output, result[0].filename), resolve(output, "wechatai-openclaw-1.0.1.tgz"));
console.log("Built OpenClaw channel download (compiled runtime and manifest).");

const checksum = createHash("sha256")
  .update(await readFile(resolve(output, "wechatai-openclaw-1.0.1.tgz")))
  .digest("hex");
const installer = (await readFile("integrations/openclaw/connect.mjs", "utf8")).replace(
  "__WECHATAI_ARCHIVE_SHA256__",
  checksum,
);
await writeFile(resolve(output, "wechatai-connect.mjs"), installer);
