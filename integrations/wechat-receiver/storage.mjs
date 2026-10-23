import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export function stateFile(directory, accountId, connectionId) {
  return join(
    directory,
    createHash("sha256").update(`${accountId}:${connectionId}`).digest("hex") + ".json",
  );
}
export async function saveState(file, value) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, file);
  // A restart must not lose a received batch or an acknowledged cursor.
  const directory = await open(dirname(file), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
export async function loadState(file, config) {
  let saved;
  try {
    saved = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    saved?.generation === config.generation &&
    (saved.pending || saved.baseCursor === config.cursor)
  )
    return saved;
  return {
    generation: config.generation,
    baseCursor: config.cursor,
    cursor: config.cursor,
    pending: null,
  };
}

export async function readJsonLimited(response, limit = 1024 * 1024) {
  if (!response.body) throw new Error("empty_body");
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("response_too_large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
