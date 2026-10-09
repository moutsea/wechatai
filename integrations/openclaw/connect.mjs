import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

// Filled by the release packager. The installer and archive come from the same site.
const ARCHIVE_SHA256 = "__WECHATAI_ARCHIVE_SHA256__";
export function normalizeAgents(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new Error("没有找到可用助手，请先完成 OpenClaw 初始化。");
  const agents = value.map((a) => ({
    id: a.id,
    name: String(a.identityName || a.name || a.id)
      .trim()
      .slice(0, 80),
    isDefault: a.isDefault === true,
  }));
  if (
    agents.some((a) => !/^[a-zA-Z0-9_-]{1,64}$/.test(a.id) || !a.name) ||
    new Set(agents.map((a) => a.id)).size !== agents.length
  )
    throw new Error("OpenClaw 助手列表格式不受支持，请更新 OpenClaw 后再试。");
  if (!agents.some((a) => a.isDefault)) agents[0].isDefault = true;
  return agents;
}
export function connectionPatch(pair, endpoint, allow) {
  const plugins = { entries: { wechatai: { enabled: true } } };
  if (Array.isArray(allow)) plugins.allow = [...new Set([...allow, "wechatai"])];
  return {
    plugins,
    channels: {
      wechatai: {
        accounts: {
          [pair.accountId]: {
            endpoint,
            token: pair.token,
            agentId: pair.agentId,
            enabled: true,
          },
        },
      },
    },
  };
}
async function boundedBody(response, max) {
  if (!response.ok) throw new Error(`服务暂时不可用（HTTP ${response.status}），请稍后重试。`);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > max) throw new Error("下载内容超出预期，请重新生成连接命令。");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function origin(value) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw new Error("连接地址必须是 HTTPS；本地开发可使用 localhost。");
  return url.origin;
}
function cli(args, input, optional = false) {
  const result = spawnSync("openclaw", args, {
    input,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    // Do not print captured output: a third-party plugin may echo config secrets.
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.error || result.status !== 0) {
    if (optional) return null;
    throw new Error(
      `OpenClaw 操作未完成（${args.slice(0, 2).join(" ")}）。请检查 OpenClaw 安装与运行状态后重新执行连接命令。`,
    );
  }
  return result.stdout.trim();
}
export async function connect({ endpoint, code }) {
  endpoint = origin(endpoint);
  if (!/^pair1\.[a-f0-9]{64}\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(code))
    throw new Error("连接命令无效，请在微伴重新生成。");
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 19))
    throw new Error("请先更新到 Node.js 22.19 或更新版本。");
  if (process.platform === "win32") throw new Error("请在运行 OpenClaw 的 WSL 终端中执行此命令。");
  const version = cli(["--version"]).match(/\b(\d{4})\.(\d+)\.(\d+)/);
  if (
    !version ||
    Number(version[1]) * 10000 + Number(version[2]) * 100 + Number(version[3]) < 20260610
  )
    throw new Error("请先将 OpenClaw 更新到 2026.6.10 或更新版本。");
  cli(["config", "validate"]);
  const agents = normalizeAgents(JSON.parse(cli(["agents", "list", "--json"])));
  const configLine = cli(["config", "file"]).split("\n").at(-1).trim();
  const configFile = configLine.startsWith("~/")
    ? join(homedir(), configLine.slice(2))
    : configLine;
  if (!configFile || !/^(\/|[A-Za-z]:[\\/])/.test(configFile))
    throw new Error("无法识别当前 OpenClaw 配置文件。");
  const pendingDir = join(dirname(configFile), "wechatai", "pairing");
  await mkdir(pendingDir, { recursive: true, mode: 0o700 });
  const pendingFile = join(pendingDir, createHash("sha256").update(code).digest("hex") + ".json");
  let proof;
  try {
    proof = JSON.parse(await readFile(pendingFile, "utf8")).proof;
    if (!/^[A-Za-z0-9_-]{43}$/.test(proof)) throw new Error("invalid proof");
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("本地连接重试记录异常，请在微伴重新生成命令。");
    proof = randomBytes(32).toString("base64url");
    await writeFile(pendingFile, JSON.stringify({ proof }), { mode: 0o600, flag: "wx" });
  }
  const temp = await mkdtemp(join(tmpdir(), "wechatai-connect-"));
  try {
    console.log("1/3 正在安装微伴渠道…");
    const archive = await boundedBody(
      await fetch(`${endpoint}/downloads/wechatai-openclaw-1.0.1.tgz`, {
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      }),
      5 * 1024 * 1024,
    );
    if (createHash("sha256").update(archive).digest("hex") !== ARCHIVE_SHA256)
      throw new Error("渠道包校验失败，请重新生成连接命令。");
    const file = join(temp, "wechatai.tgz");
    await writeFile(file, archive, { mode: 0o600 });
    cli(["plugins", "install", file, "--force"]);
    const rawAllow = cli(["config", "get", "plugins.allow", "--json"], undefined, true);
    const allow = rawAllow === null ? undefined : JSON.parse(rawAllow);
    if (allow !== undefined && (!Array.isArray(allow) || allow.some((a) => typeof a !== "string")))
      throw new Error("OpenClaw 插件允许列表无效，请先修复配置。");
    console.log("2/3 正在连接账号并识别默认助手…");
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(`${endpoint}/api/openclaw/pair`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: { authorization: `Bearer ${code}`, "content-type": "application/json" },
          body: JSON.stringify({ proof, agents }),
        });
        if (response.status < 500 || attempt === 2) break;
        await response.body?.cancel();
      } catch {
        if (attempt === 2)
          throw new Error("暂时无法连接微伴。可以重新执行同一命令；若已过期，请在网页重新生成。");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
    if ([401, 409].includes(response.status)) {
      await response.body?.cancel();
      throw new Error("连接命令已过期或已使用，请在微伴重新生成。");
    }
    if (response.status === 403) {
      await response.body?.cancel();
      throw new Error("请确认微伴 Plus 会员有效，且 OpenClaw 插件已启用。");
    }
    const pair = JSON.parse((await boundedBody(response, 32000)).toString());
    if (
      !/^[a-f0-9-]{36}$/.test(pair.accountId) ||
      !agents.some((a) => a.id === pair.agentId) ||
      typeof pair.token !== "string" ||
      !/^[a-f0-9]{64}\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(pair.token)
    )
      throw new Error("连接响应异常，请在微伴重新生成命令。");
    // Native recursive patch retains other channels, agent/provider configs and accounts.
    // Credentials go through stdin, never command arguments or terminal output.
    cli(["config", "patch", "--stdin"], JSON.stringify(connectionPatch(pair, endpoint, allow)));
    cli(["config", "validate"]);
    await rm(pendingFile, { force: true });
    console.log("3/3 配置已保存，正在重启 OpenClaw Gateway…");
    if (cli(["gateway", "restart"], undefined, true) === null) {
      console.log(
        "配置已保存。Gateway 未能自动重启，请按你原来的运行方式重新启动，或执行：openclaw gateway restart",
      );
      return { configured: true, restarted: false };
    }
    console.log("配置完成！请回到微伴，页面会在渠道上线后自动显示连接成功。");
    return { configured: true, restarted: true };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
