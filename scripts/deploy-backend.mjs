import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectArtifact } from "./backend-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (command, args, capture = false) => {
  const result = spawnSync(command, args, {
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return result.stdout?.trim();
};

try {
  const args = process.argv.slice(2);
  if (args.some((v) => !["--dry-run"].includes(v)))
    throw new Error("Usage: pnpm deploy:backend [--dry-run]");
  const arch = process.env.WECHATAI_BUILD_ARCH || "amd64";
  if (!["amd64", "arm64"].includes(arch)) throw new Error("Invalid WECHATAI_BUILD_ARCH");
  const directory = resolve(root, "backend/dist", `linux-${arch}`);
  const manifest = await inspectArtifact(directory, { release: !args.includes("--dry-run") });
  const {
    WECHATAI_VPS_HOST: host,
    WECHATAI_VPS_USER: user,
    WECHATAI_SSH_KEY_FILE: key,
    WECHATAI_SSH_KNOWN_HOSTS_FILE: known,
  } = process.env;
  if (
    !host ||
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(host) ||
    !user ||
    !/^[a-z_][a-z0-9_-]{0,31}$/.test(user)
  )
    throw new Error("Set WECHATAI_VPS_HOST and WECHATAI_VPS_USER");
  for (const [name, path] of [
    ["WECHATAI_SSH_KEY_FILE", key],
    ["WECHATAI_SSH_KNOWN_HOSTS_FILE", known],
  ]) {
    if (!path || !(await stat(path)).isFile())
      throw new Error(`${name} must name an existing file`);
  }
  if ((await stat(key)).mode & 0o077) throw new Error("SSH key file permissions must be 0600");
  const options = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    `UserKnownHostsFile=${resolve(known)}`,
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "ConnectTimeout=15",
    "-i",
    resolve(key),
  ];
  const target = `${user}@${host}`;
  if (args.includes("--dry-run")) {
    console.log(
      JSON.stringify(
        {
          commit: manifest.commit,
          target,
          actions: [
            "Upload binary and manifest to a private temporary directory",
            "Run installed /usr/local/libexec/wechatai-release",
            "Verify the configured deployment mode, account directory and running version",
            "Activate release without changing account routing",
          ],
        },
        null,
        2,
      ),
    );
  } else {
    const incoming = run(
      "ssh",
      [...options, target, "mktemp -d /tmp/wechatai-release.XXXXXXXXXX"],
      true,
    );
    if (!/^\/tmp\/wechatai-release\.[a-zA-Z0-9]{10}$/.test(incoming))
      throw new Error("Unexpected remote staging directory");
    try {
      run("scp", [
        ...options,
        resolve(directory, "wechatai"),
        resolve(directory, "manifest.json"),
        `${target}:${incoming}/`,
      ]);
      run("ssh", [...options, target, `sudo -n /usr/local/libexec/wechatai-release ${incoming}`]);
    } finally {
      try {
        run("ssh", [
          ...options,
          target,
          `rm -f ${incoming}/wechatai ${incoming}/manifest.json && rmdir ${incoming}`,
        ]);
      } catch {
        console.error("Could not remove remote staging directory; inspect it before retrying");
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
