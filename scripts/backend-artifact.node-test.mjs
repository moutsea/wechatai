import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { inspectArtifact } from "./backend-artifact.mjs";

test("release validation rejects modified artifacts and uncommitted builds", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "wechatai-artifact-"));
  const binary = Buffer.from("fake binary for manifest validation");
  const commit = "a".repeat(40);
  const manifest = {
    format: 1,
    protocol: "wechatai-rpc-v1",
    commit,
    version: commit,
    dirty: false,
    os: "linux",
    arch: "amd64",
    binary: "wechatai",
    sha256: createHash("sha256").update(binary).digest("hex"),
  };
  const save = () => writeFile(resolve(directory, "manifest.json"), JSON.stringify(manifest));
  try {
    await writeFile(resolve(directory, "wechatai"), binary);
    await save();
    assert.equal((await inspectArtifact(directory)).commit, commit);
    await writeFile(resolve(directory, "wechatai"), "modified");
    await assert.rejects(inspectArtifact(directory), /checksum mismatch/);
    await writeFile(resolve(directory, "wechatai"), binary);
    manifest.dirty = true;
    manifest.version += "-dirty";
    await save();
    await assert.rejects(inspectArtifact(directory), /Commit the reviewed changes/);
    assert.equal((await inspectArtifact(directory, { release: false })).dirty, true);
    manifest.binary = "../../other";
    await save();
    await assert.rejects(inspectArtifact(directory, { release: false }), /Invalid.*manifest/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
