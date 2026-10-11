import type { RemoteAgentKind } from "../shared/remote-agent";
import { createHmac, timingSafeEqual } from "node:crypto";
import { secret } from "./config";

export function signOpenClawToken(env: Env, token: string, kind: RemoteAgentKind = "openclaw") {
  return `${token}.${createHmac("sha256", secret(env, "ENCRYPTION_KEY")).update(`wechatai-${kind}-v1:${token}`).digest("base64url")}`;
}
// Verify at the edge before selecting/creating a DO from client-supplied IDs.
export function parseOpenClawToken(
  env: Env,
  authorization: string,
  kind: RemoteAgentKind = "openclaw",
) {
  const match =
    /^Bearer (([a-f0-9]{64})\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43}))\.([A-Za-z0-9_-]{43})$/.exec(
      authorization,
    );
  if (!match) return null;
  const signature = signOpenClawToken(env, match[1], kind).split(".").at(-1)!;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(match[5]))) return null;
  return { accountId: match[2], pluginId: match[3], secret: match[4] };
}

// Pairing credentials cannot authenticate relay calls (different prefix and purpose).
export function signOpenClawPairing(
  env: Env,
  unsigned: string,
  kind: RemoteAgentKind = "openclaw",
) {
  const value = `${kind === "hermes" ? "hermes-pair1" : "pair1"}.${unsigned}`;
  return `${value}.${createHmac("sha256", secret(env, "ENCRYPTION_KEY")).update(value).digest("base64url")}`;
}
export function parseOpenClawPairing(
  env: Env,
  authorization: string,
  kind: RemoteAgentKind = "openclaw",
) {
  const prefix = kind === "hermes" ? "hermes-pair1" : "pair1";
  const match = new RegExp(
    `^Bearer (${prefix}\\.(([a-f0-9]{64})\\.([a-f0-9-]{36})\\.([A-Za-z0-9_-]{43})))\\.([A-Za-z0-9_-]{43})$`,
  ).exec(authorization);
  if (!match) return null;
  const signature = signOpenClawPairing(env, match[2], kind).split(".").at(-1)!;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(match[6]))) return null;
  return { accountId: match[3], pluginId: match[4], secret: match[5] };
}
export function deriveOpenClawSecret(
  env: Env,
  pluginId: string,
  pairingSecret: string,
  proof: string,
  kind: RemoteAgentKind = "openclaw",
) {
  // Same installer can safely retry a lost response, without storing plaintext credentials.
  return createHmac("sha256", secret(env, "ENCRYPTION_KEY"))
    .update(
      `${kind === "hermes" ? "wechatai-hermes-pair-exchange-v1" : "wechatai-pair-exchange-v1"}:${pluginId}:${pairingSecret}:${proof}`,
    )
    .digest("base64url");
}
export function openClawConnectCommand(endpoint: string, code: string) {
  const origin = new URL(endpoint).origin;
  const options = JSON.stringify({ endpoint: origin, code });
  const script = `(async()=>{const r=await fetch(${JSON.stringify(`${origin}/downloads/wechatai-connect.mjs`)},{redirect:"error",signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error("无法下载安装程序");const m=await import("data:text/javascript;base64,"+Buffer.from(await r.text()).toString("base64"));await m.connect(${options})})().catch(e=>{console.error(e.message);process.exitCode=1})`;
  // POSIX single-quoted argument; Windows users run inside WSL.
  return `node -e '${script.replace(/'/g, `'"'"'`)}'`;
}

export function hermesConnectCommand(endpoint: string, code: string) {
  const origin = new URL(endpoint).origin;
  const options = JSON.stringify({ endpoint: origin, code });
  const script = `import urllib.request; u=${JSON.stringify(origin + "/downloads/wechatai-hermes-connect.py")}; h=type("NoRedirect",(urllib.request.HTTPRedirectHandler,),{"redirect_request":lambda *args:None})(); q=urllib.request.Request(u,headers={"User-Agent":"Wechatai-Hermes/1.1.1"}); r=urllib.request.build_opener(h).open(q,timeout=30); b=r.read(262145); r.close(); assert len(b)<=262144,"安装脚本过大"; exec(compile(b,u,"exec")); connect(${options})`;
  return `python3 -c '${script.replace(/'/g, `'"'"'`)}'`;
}
