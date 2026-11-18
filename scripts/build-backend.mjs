import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backendProtocol, inspectArtifact } from "./backend-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status}): ${result.stderr || ""}`);
  return result.stdout?.trim() || "";
}

try {
  const arch = process.env.WECHATAI_BUILD_ARCH || "amd64";
  if (!["amd64", "arm64"].includes(arch))
    throw new Error("WECHATAI_BUILD_ARCH must be amd64 or arm64");
  const commit = run("git", ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid source commit");
  const dirty = run("git", ["status", "--porcelain", "--untracked-files=normal"]) !== "";
  const version = commit + (dirty ? "-dirty" : "");
  const output = resolve(root, "backend/dist", `linux-${arch}`);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const temporary = resolve(output, `.wechatai-${randomUUID()}`);
  try {
    run(
      "go",
      [
        "build",
        "-trimpath",
        "-buildvcs=false",
        "-ldflags",
        `-s -w -X main.version=${version}`,
        "-o",
        temporary,
        "./cmd/wechatai",
      ],
      {
        cwd: resolve(root, "backend"),
        env: { ...process.env, CGO_ENABLED: "0", GOOS: "linux", GOARCH: arch },
        stdio: "inherit",
      },
    );
    const bytes = await readFile(temporary);
    const manifest = {
      format: 1,
      protocol: backendProtocol,
      commit,
      version,
      dirty,
      os: "linux",
      arch,
      binary: "wechatai",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    await chmod(temporary, 0o755);
    await rename(temporary, resolve(output, "wechatai"));
    await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", {
      mode: 0o600,
    });
    await inspectArtifact(output, { release: false });
    console.log(`Backend ${version}: ${output}`);
  } finally {
    await rm(temporary, { force: true });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
