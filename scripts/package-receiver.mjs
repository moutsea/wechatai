import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const arch = process.env.WECHATAI_BUILD_ARCH || "amd64";
if (!["amd64", "arm64"].includes(arch)) throw new Error("Unsupported receiver architecture");

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const commit = git("rev-parse", "--short=12", "HEAD");
const dirty = git(
  "status",
  "--porcelain",
  "--",
  "backend",
  "integrations/wechat-receiver",
  "scripts/package-receiver.mjs",
);
const output = join(root, "backend", "dist", "linux-" + arch);
const archive = join(output, "wechatai-receiver-" + commit + (dirty ? "-dirty" : "") + ".tar.gz");
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, ".receiver-"));
try {
  execFileSync(
    "go",
    [
      "build",
      "-mod=readonly",
      "-trimpath",
      "-o",
      join(staging, "receiver-watchdog"),
      "./cmd/receiver-watchdog",
    ],
    {
      cwd: join(root, "backend"),
      env: { ...process.env, CGO_ENABLED: "0", GOOS: "linux", GOARCH: arch },
      stdio: "inherit",
    },
  );
  execFileSync(
    "tar",
    [
      "--format",
      "ustar",
      "-czf",
      join(staging, "release.tgz"),
      "-C",
      staging,
      "receiver-watchdog",
      "-C",
      join(root, "integrations/wechat-receiver"),
      "main.mjs",
      "receiver.mjs",
      "storage.mjs",
      "typing.mjs",
      "wechat-api.mjs",
      "package.json",
      "package-lock.json",
      "wechatai-receiver.service",
      "wechatai-receiver-watchdog.service",
      "session.test.mjs",
      "storage.test.mjs",
      "typing.test.mjs",
    ],
    { env: { ...process.env, COPYFILE_DISABLE: "1" }, stdio: "inherit" },
  );
  await rename(join(staging, "release.tgz"), archive);
  console.log(archive);
} finally {
  await rm(staging, { recursive: true, force: true });
}
