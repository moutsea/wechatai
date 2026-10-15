import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { OPENCLAW_CONNECTOR_VERSION } from "./version.ts";

async function runUpgrade({
  safe = true,
  restartFails = false,
  corrupt = false,
  wrongAccount = false,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "wechatai-upgrade-test-"));
  try {
    await mkdir(join(dir, "bin"));
    const accountId = randomUUID();
    const callsPath = join(dir, "calls.jsonl");
    const config = {
      accounts: {
        [accountId]: {
          endpoint: "https://relay.example.com",
          token: "never-print-me",
          agentId: "chosen",
        },
      },
    };
    const cli = `#!/usr/bin/env node
      const fs=require('node:fs');const args=process.argv.slice(2);
      fs.appendFileSync(${JSON.stringify(callsPath)},JSON.stringify(args)+'\\n');
      if(args[0]==='--version')console.log('2026.6.10');
      else if(args.join(' ')==='config validate'){}
      else if(args.join(' ')==='config get channels.wechatai --json')console.log(${JSON.stringify(JSON.stringify(config))});
      else if(args[0]==='plugins'&&args[1]==='install'&&args[3]==='--force'){}
      else if(args.join(' ')==='gateway restart --help')console.log(${JSON.stringify(safe ? "--safe" : "--force")});
      else if(args.join(' ')==='gateway restart --safe')process.exit(${restartFails ? 1 : 0});
      else {console.error('unexpected operation');process.exit(1);}
    `;
    await writeFile(join(dir, "bin", "openclaw"), cli, { mode: 0o700 });
    const archive = Buffer.from("test package");
    const source = (await readFile(new URL("./connect.mjs", import.meta.url), "utf8"))
      .replace("__WECHATAI_ARCHIVE_SHA256__", createHash("sha256").update(archive).digest("hex"))
      .replace("__WECHATAI_CONNECTOR_VERSION__", OPENCLAW_CONNECTOR_VERSION);
    await writeFile(join(dir, "installer.mjs"), source);
    const script = `
      globalThis.fetch=async(url)=>{
        if(url!=='https://relay.example.com/downloads/wechatai-openclaw-${OPENCLAW_CONNECTOR_VERSION}.tgz')throw Error('unexpected endpoint');
        return new Response(${JSON.stringify(corrupt ? "corrupt" : archive.toString())});
      };
      const {upgrade}=await import('./installer.mjs');
      try { console.log(JSON.stringify(await upgrade(${JSON.stringify({ endpoint: "https://relay.example.com", accountId: wrongAccount ? randomUUID() : accountId })}))); }
      catch(e){console.error(e.message);process.exitCode=1;}
    `;
    await writeFile(join(dir, "run.mjs"), script);
    const child = spawn(process.execPath, [join(dir, "run.mjs")], {
      env: {
        ...process.env,
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        OPENCLAW_STATE_DIR: dir,
        OPENCLAW_CONFIG_PATH: join(dir, "unused.json"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    const timer = setTimeout(() => child.kill("SIGTERM"), 10000);
    const exit = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    }).finally(() => clearTimeout(timer));
    const calls = (await readFile(callsPath, "utf8")).trim().split("\n").map(JSON.parse);
    assert(!output.includes("never-print-me"));
    assert(!calls.some((args) => args[0] === "config" && ["patch", "set"].includes(args[1])));
    assert(!calls.some((args) => args.includes("--force") && args[0] === "gateway"));
    return { exit, output, calls };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("upgrades the installed connector without pairing or config writes and requests only a safe restart", async () => {
  const result = await runUpgrade();
  assert.equal(result.exit, 0, result.output);
  assert(result.calls.some((a) => a[0] === "plugins" && a[1] === "install"));
  assert.deepEqual(
    result.calls.filter((a) => a[0] === "gateway"),
    [
      ["gateway", "restart", "--help"],
      ["gateway", "restart", "--safe"],
    ],
  );
  assert.match(result.output, /"restartRequested":true/);
});
for (const options of [{ safe: false }, { restartFails: true }]) {
  test(`does not force a restart when safe restart is unavailable: ${JSON.stringify(options)}`, async () => {
    const result = await runUpgrade(options);
    assert.equal(result.exit, 0, result.output);
    assert.match(result.output, /尚未确认加载/);
    assert.match(result.output, /"restartRequested":false/);
    assert(!result.calls.some((a) => a.join(" ") === "gateway restart"));
  });
}
for (const options of [{ corrupt: true }, { wrongAccount: true }]) {
  test(`rejects an unsafe upgrade before installing: ${JSON.stringify(options)}`, async () => {
    const result = await runUpgrade(options);
    assert.equal(result.exit, 1);
    assert(!result.calls.some((a) => a[0] === "plugins" || a[0] === "gateway"));
  });
}
