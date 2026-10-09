import { rmSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "dist");
for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && (entry.name.startsWith(".dev.vars") || entry.name.startsWith(".env"))) {
    rmSync(resolve(entry.parentPath, entry.name));
  }
}
