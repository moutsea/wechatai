import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, rename, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { OPENCLAW_CONNECTOR_VERSION } from "../integrations/openclaw/version.ts";

const output = resolve("public/downloads");
await mkdir(output, { recursive: true });
// Published plugins must contain JavaScript runtime output; TypeScript-only
// entries are accepted only in local source checkouts by current OpenClaw.
for (const name of ["index", "transport", "reply", "version"]) {
  const source = await readFile(`integrations/openclaw/${name}.ts`, "utf8");
  await writeFile(
    `integrations/openclaw/${name}.js`,
    stripTypeScriptTypes(source, { mode: "transform" }),
  );
}
for (const file of ["package.json", "openclaw.plugin.json"]) {
  const manifest = JSON.parse(await readFile(`integrations/openclaw/${file}`, "utf8"));
  if (manifest.version !== OPENCLAW_CONNECTOR_VERSION)
    throw new Error(`Connector version mismatch: ${file}`);
}
const filename = `wechatai-openclaw-${OPENCLAW_CONNECTOR_VERSION}.tgz`;
const result = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", output], {
    cwd: resolve("integrations/openclaw"),
    encoding: "utf8",
  }),
);
await rename(resolve(output, result[0].filename), resolve(output, filename));
console.log("Built OpenClaw channel download (compiled runtime and manifest).");

const checksum = createHash("sha256")
  .update(await readFile(resolve(output, filename)))
  .digest("hex");
const installer = (await readFile("integrations/openclaw/connect.mjs", "utf8"))
  .replace("__WECHATAI_ARCHIVE_SHA256__", checksum)
  .replace("__WECHATAI_CONNECTOR_VERSION__", OPENCLAW_CONNECTOR_VERSION);
await writeFile(resolve(output, "wechatai-connect.mjs"), installer);
