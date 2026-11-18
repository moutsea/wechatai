import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const backendProtocol = "wechatai-rpc-v1";

export async function inspectArtifact(directory, { release = true } = {}) {
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  if (
    manifest.format !== 1 ||
    !/^[a-f0-9]{40}$/.test(manifest.commit) ||
    manifest.protocol !== backendProtocol ||
    !["amd64", "arm64"].includes(manifest.arch) ||
    manifest.os !== "linux" ||
    manifest.binary !== "wechatai" ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    typeof manifest.dirty !== "boolean" ||
    manifest.version !== manifest.commit + (manifest.dirty ? "-dirty" : "")
  )
    throw new Error("Invalid backend artifact manifest");
  if (release && manifest.dirty) throw new Error("Commit the reviewed changes before deploying");
  const binary = resolve(directory, "wechatai");
  const info = await stat(binary);
  if (!info.isFile() || info.size < 1 || info.size > 256 * 1024 * 1024)
    throw new Error("Invalid backend binary size");
  const bytes = await readFile(binary);
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256)
    throw new Error("Backend binary checksum mismatch");
  return manifest;
}
