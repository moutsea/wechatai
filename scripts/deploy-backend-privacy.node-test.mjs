import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("deployment reports the stage without printing the target or transport output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backend-privacy-"));
  try {
    const scripts = join(dir, "scripts");
    const dist = join(dir, "backend/dist/linux-amd64");
    await mkdir(scripts);
    await mkdir(dist, { recursive: true });
    for (const name of ["backend-artifact.mjs", "deploy-backend.mjs"])
      await copyFile(new URL(name, import.meta.url), join(scripts, name));
    const commit = "c".repeat(40);
    await writeFile(join(dist, "wechatai"), "binary");
    await writeFile(
      join(dist, "manifest.json"),
      JSON.stringify({
        format: 1,
        protocol: "wechatai-rpc-v1",
        commit,
        version: commit,
        dirty: false,
        arch: "amd64",
        os: "linux",
        binary: "wechatai",
        sha256: createHash("sha256").update("binary").digest("hex"),
      }),
    );
    const canary = randomUUID();
    const key = join(dir, "key");
    await writeFile(key, "fixture", { mode: 0o600 });
    for (const command of ["ssh", "scp"]) {
      const file = join(dir, command);
      await writeFile(
        file,
        [
          "#!/bin/sh",
          'echo "$CANARY" >&2',
          'case "$*" in *mktemp*) echo /tmp/wechatai-release.ABCDE12345; exit 0;; esac',
          'echo "$CANARY"',
          'if [ "$FAIL_STAGE" = "$(basename "$0")" ]; then exit 42; fi',
        ].join("\n"),
      );
      await chmod(file, 0o700);
    }
    const host = `host-${canary}.invalid`;
    const user = "private_test_user";
    for (const [args, failStage, expected] of [
      [["--dry-run"], "", /Upload binary/],
      [[], "", /Backend release activated/],
      [[], "scp", /Upload backend artifact failed/],
      [[], "ssh", /Activate backend release failed/],
    ]) {
      const result = spawnSync(process.execPath, [join(scripts, "deploy-backend.mjs"), ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: dir + ":" + process.env.PATH,
          CANARY: canary,
          FAIL_STAGE: failStage,
          WECHATAI_BUILD_ARCH: "amd64",
          WECHATAI_VPS_HOST: host,
          WECHATAI_VPS_USER: user,
          WECHATAI_SSH_KEY_FILE: key,
          WECHATAI_SSH_KNOWN_HOSTS_FILE: key,
        },
      });
      const output = result.stdout + result.stderr;
      assert.equal(result.status, failStage ? 1 : 0);
      for (const value of [canary, user, host])
        assert.ok(!output.includes(value), "private output escaped");
      assert.match(output, expected);
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
