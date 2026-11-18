import { stripTypeScriptTypes } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OPENCLAW_CONNECTOR_VERSION } from "../integrations/openclaw/version.ts";

export async function writeOpenClawRuntime(directory) {
  // Published plugins must contain JavaScript runtime output; TypeScript-only
  // entries are accepted only in local source checkouts by current OpenClaw.
  for (const name of ["index", "transport", "reply"]) {
    const source = await readFile(`integrations/openclaw/${name}.ts`, "utf8");
    await writeFile(
      join(directory, `${name}.js`),
      stripTypeScriptTypes(source, { mode: "transform" }),
    );
  }
  // The published connector is standalone. Embed the same release used by the
  // website and Go service without a runtime dependency on the repository.
  await writeFile(
    join(directory, "version.js"),
    `export const OPENCLAW_CONNECTOR_VERSION = ${JSON.stringify(OPENCLAW_CONNECTOR_VERSION)};\n`,
  );
}
