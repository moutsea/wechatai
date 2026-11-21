import { createHash, timingSafeEqual } from "node:crypto";
import { AppError, secret } from "./config";
import type { WechatOutbound } from "./wechat";

export const SENDER_TAG = "wechat-sender";

type SenderPolicy = { account: string; token: string; enabled: boolean };
const accountId = /^[a-f0-9]{64}$/;

export function senderAccount(env: Env) {
  const id = secret(env, "WECHAT_SENDER_ACCOUNT", false);
  return accountId.test(id) ? id : "";
}

function senderPolicies(env: Env): SenderPolicy[] {
  const primary = senderAccount(env);
  const token = secret(env, "WECHAT_SENDER_SECRET", false);
  const policies: SenderPolicy[] = [];
  if (primary && token.length >= 32)
    policies.push({
      account: primary,
      token,
      enabled: secret(env, "WECHAT_SENDER_ENABLED", false) === "true",
    });

  const raw = secret(env, "WECHAT_SENDER_PILOTS", false);
  if (!raw) return policies;
  // Reject the additional group on ambiguity, preserving the original account.
  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    return policies;
  }
  if (!Array.isArray(entries)) return policies;
  const accounts = new Set([primary]);
  const tokens = new Set([token]);
  for (const p of entries) {
    if (
      !p ||
      typeof p.account !== "string" ||
      !accountId.test(p.account) ||
      typeof p.token !== "string" ||
      p.token.length < 32 ||
      p.token.trim() !== p.token ||
      typeof p.enabled !== "boolean" ||
      accounts.has(p.account) ||
      tokens.has(p.token)
    )
      return policies;
    accounts.add(p.account);
    tokens.add(p.token);
  }
  return policies.concat(entries);
}

export function authenticatedSenderAccount(env: Env, authorization: string) {
  if (!authorization.startsWith("Bearer ")) return undefined;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  const received = digest(authorization.slice(7));
  return senderPolicies(env).find((p) => timingSafeEqual(digest(p.token), received))?.account;
}

type Result = { id: string; status?: number; body?: string; downloadParam?: string };
type Pending = { socket: WebSocket; finish: (result?: Result) => void };
const unavailable = () => new AppError("wechat_sender_unavailable", "微信发送出口暂时不可用", 503);

export class WechatSender {
  private pending = new Map<string, Pending>();

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  private policy() {
    return senderPolicies(this.env).find((p) => p.account === this.ctx.id.toString());
  }
  enabled() {
    return this.policy()?.enabled === true;
  }
  private socket() {
    return this.ctx.getWebSockets(SENDER_TAG).find((ws) => ws.readyState === WebSocket.OPEN);
  }
  connect() {
    if (!this.policy()) return new Response(null, { status: 403 });
    for (const old of this.ctx.getWebSockets(SENDER_TAG)) {
      this.disconnected(old);
      old.close(1012, "replaced");
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [SENDER_TAG]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async status() {
    const connected = !!this.socket();
    const ready =
      connected &&
      (await this.exchange({ operation: "probe" }, 5000).then(
        (r) => r.status === 204,
        () => false,
      ));
    return { enabled: this.enabled(), connected, ready };
  }
  message(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 192 * 1024) {
      socket.close(1009, "invalid reply");
      return;
    }
    let result: Result;
    try {
      result = JSON.parse(message);
    } catch {
      socket.close(1008, "invalid reply");
      return;
    }
    if (!result || typeof result.id !== "string") return;
    const entry = this.pending.get(result.id);
    if (entry?.socket === socket) entry.finish(result);
  }
  disconnected(socket: WebSocket) {
    for (const entry of this.pending.values()) if (entry.socket === socket) entry.finish();
  }
  private async exchange(payload: object, timeout: number): Promise<Result> {
    const socket = this.socket();
    if (!socket || this.pending.size >= 16) throw unavailable();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const finish = (result?: Result) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (
          result &&
          Number.isInteger(result.status) &&
          result.status! >= 200 &&
          result.status! <= 599
        )
          resolve(result);
        else reject(unavailable());
      };
      const timer = setTimeout(finish, timeout);
      this.pending.set(id, { socket, finish });
      try {
        socket.send(JSON.stringify({ ...payload, id, deadline: Date.now() + timeout }));
      } catch {
        finish();
      }
    });
  }
  readonly send: WechatOutbound = async (operation, url, body, headers, timeout) => {
    // Once handed to the VPS the delivery may have reached WeChat, even if the
    // socket drops. Only the existing durable delivery job owns retries/client_id.
    const result = await this.exchange(
      {
        operation,
        url,
        headers,
        body: typeof body === "string" ? body : Buffer.from(body).toString("base64"),
      },
      timeout,
    );
    return new Response(result.body || null, {
      status: result.status,
      headers: result.downloadParam ? { "x-encrypted-param": result.downloadParam } : undefined,
    });
  };
}
