import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import WebSocket from "ws";
import { loadState, saveState, stateFile, readJsonLimited } from "./storage.mjs";
import { wechatURL, wechatHeaders } from "./wechat-api.mjs";
import { TypingIndicator } from "./typing.mjs";
export { wechatURL } from "./wechat-api.mjs";

export const PING = "wechatai-receiver-ping-v1";
export const PONG = "wechatai-receiver-pong-v1";
const log = (event, data = {}) =>
  console.log(JSON.stringify({ event, ...data, at: new Date().toISOString() }));

export async function receiveLink({
  config,
  accountId,
  directory,
  signal,
  sendBatch,
  sendExpired,
  metrics,
  fetchImpl = fetch,
}) {
  const file = stateFile(directory, accountId, config.id);
  let state = await loadState(file, config);
  const url = wechatURL(config.credentials);
  let failures = 0;
  while (!signal.aborted) {
    if (state.pending) {
      const ack = await sendBatch(state.pending);
      if (ack.stale) return;
      if (typeof ack.cursor !== "string") throw new Error("invalid_ack");
      metrics.forwarded += state.pending.msgs.length;
      log("batch_accepted", {
        accountId,
        connectionId: config.id,
        count: state.pending.msgs.length,
      });
      state = { ...state, cursor: ack.cursor, baseCursor: ack.cursor, pending: null };
      await saveState(file, state);
      continue;
    }
    const started = Date.now();
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        redirect: "manual",
        headers: wechatHeaders(config.credentials),
        body: JSON.stringify({
          get_updates_buf: state.cursor,
          base_info: { channel_version: "2.1.6" },
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`wechat_http_${response.status}`);
      }
      const result = await readJsonLimited(response);
      metrics.polls++;
      if (result.ret === -14 || result.errcode === -14) {
        sendExpired({ type: "expired", connectionId: config.id, generation: config.generation });
        log("wechat_expired", { accountId, connectionId: config.id });
        return;
      }
      if ((result.ret ?? 0) !== 0 || (result.errcode ?? 0) !== 0)
        throw new Error("wechat_api_error");
      if (result.msgs != null && !Array.isArray(result.msgs))
        throw new Error("invalid_wechat_messages");
      const cursor = result.get_updates_buf ?? result.sync_buf ?? state.cursor;
      if (typeof cursor !== "string") throw new Error("invalid_wechat_cursor");
      const nextState = {
        ...state,
        cursor,
        pending: result.msgs?.length
          ? {
              type: "batch",
              id: randomUUID(),
              connectionId: config.id,
              generation: config.generation,
              fromCursor: state.baseCursor,
              cursor,
              msgs: result.msgs,
            }
          : null,
      };
      // Write before forwarding, even if the connection was closed meanwhile.
      // Empty polls update the local cursor without waking the account DO.
      await saveState(file, nextState);
      state = nextState;
      failures = 0;
      if (state.pending) continue;
    } catch (error) {
      if (signal.aborted) return;
      if (error.name !== "TimeoutError") {
        failures++;
        log("wechat_poll_retry", {
          accountId,
          connectionId: config.id,
          failures,
          code: error.message?.startsWith("wechat_") ? error.message : error.name,
        });
        // Yield to the account's existing receive path when this server cannot
        // reach WeChat. A healthy WebSocket alone must not mask a broken poller.
        if (failures >= 3) throw new Error("wechat_unreachable");
      }
    }
    await sleep(Math.max(failures ? 5000 : 1000, 1000 - (Date.now() - started)), undefined, {
      signal,
    }).catch(() => {});
  }
}

export class ReceiverAccount {
  constructor(accountId, options) {
    this.accountId = accountId;
    this.options = options;
    this.stopped = false;
    this.connected = false;
    this.links = new Map();
    this.stopSignal = new AbortController();
  }
  stop() {
    this.stopped = true;
    this.stopSignal.abort();
    this.socket?.terminate();
  }
  async run() {
    let retry = 1000;
    while (!this.stopped) {
      const started = Date.now();
      try {
        await this.session();
      } catch {
        log("account_reconnect", { accountId: this.accountId });
      }
      if (this.stopped) break;
      if (Date.now() - started > 60000) retry = 1000;
      await sleep(retry, undefined, { signal: this.stopSignal.signal }).catch(() => {});
      retry = Math.min(30000, retry * 2);
    }
  }
  async session() {
    const url = new URL(
      `/api/internal/wechat-receiver/connect/${this.accountId}`,
      this.options.endpoint,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = (this.socket = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.options.secret}`,
        "User-Agent": "WeChatAI-Receiver/1.0",
      },
      handshakeTimeout: 15000,
      maxPayload: 1024 * 1024,
      perMessageDeflate: false,
    }));
    const session = new AbortController();
    const acks = new Map();
    let configChain = Promise.resolve();
    let pongAt = Date.now();
    let configured = false;
    const connectedAt = Date.now();
    const ended = new Promise((resolve) => {
      socket.on("error", () => socket.terminate());
      socket.on("close", (code, rawReason) => {
        const reason = rawReason.toString();
        const known = [
          "inactive receiver",
          "invalid batch",
          "batch too large",
          "invalid json",
          "receiver heartbeat expired",
          "receiver replaced",
          "receiver disabled",
        ];
        log("account_disconnected", {
          accountId: this.accountId,
          code,
          ...(known.includes(reason) ? { reason } : {}),
        });
        resolve();
      });
    });
    const sendBatch = (batch) =>
      new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) {
          reject(new Error("socket_closed"));
          return;
        }
        const finish = (error, ack) => {
          clearTimeout(timer);
          acks.delete(batch.id);
          session.signal.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve(ack);
        };
        const abort = () => finish(new Error("socket_closed"));
        const timer = setTimeout(() => finish(new Error("ack_timeout")), 20000);
        acks.set(batch.id, (ack) => finish(null, ack));
        session.signal.addEventListener("abort", abort, { once: true });
        socket.send(JSON.stringify(batch));
      });
    socket.on("open", () => {
      this.connected = true;
      socket.send(PING);
      log("account_connected", { accountId: this.accountId });
    });
    socket.on("message", (raw) => {
      if (raw.toString() === PONG) {
        pongAt = Date.now();
        return;
      }
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        socket.terminate();
        return;
      }
      if (message.type === "ack") {
        acks.get(message.id)?.(message);
        return;
      }
      if (message.type !== "config" || !Array.isArray(message.links)) {
        socket.terminate();
        return;
      }
      configured = true;
      configChain = configChain
        .then(async () => {
          if (session.signal.aborted) return;
          const wanted = new Map(message.links.map((link) => [link.id, link]));
          for (const [id, running] of this.links) {
            if (wanted.get(id)?.generation === running.generation) continue;
            running.abort.abort();
            await Promise.all([running.done, running.typing.stop()]);
            this.links.delete(id);
          }
          for (const config of message.links) {
            if (session.signal.aborted) continue;
            const existing = this.links.get(config.id);
            if (existing) {
              existing.typing.update(config);
              continue;
            }
            const typing = new TypingIndicator(config.credentials, {
              metrics: this.options.metrics,
            });
            typing.update(config);
            const abort = new AbortController();
            const signal = AbortSignal.any([session.signal, abort.signal]);
            const done = receiveLink({
              config,
              accountId: this.accountId,
              directory: this.options.directory,
              signal,
              sendBatch,
              sendExpired: (payload) => socket.send(JSON.stringify(payload)),
              metrics: this.options.metrics,
            }).catch((error) => {
              if (!signal.aborted) {
                const known = ["ack_timeout", "invalid_ack", "socket_closed", "wechat_unreachable"];
                log("link_reconnect", {
                  accountId: this.accountId,
                  connectionId: config.id,
                  code: known.includes(error.message) ? error.message : "receive_failed",
                });
                socket.terminate();
              }
            });
            this.links.set(config.id, { generation: config.generation, abort, done, typing });
          }
          log("account_configured", { accountId: this.accountId, links: this.links.size });
        })
        .catch(() => socket.terminate());
    });
    const heartbeat = setInterval(() => {
      if (Date.now() - pongAt > 45000 || (!configured && Date.now() - connectedAt > 20000))
        socket.terminate();
      else if (socket.readyState === WebSocket.OPEN) socket.send(PING);
    }, 15000);
    try {
      await ended;
    } finally {
      clearInterval(heartbeat);
      this.connected = false;
      session.abort();
      await configChain;
      await Promise.all(
        [...this.links.values()].flatMap((link) => [link.done, link.typing.stop()]),
      );
      this.links.clear();
    }
  }
}

export class ReceiverService {
  constructor(options) {
    this.metrics = { polls: 0, forwarded: 0 };
    this.options = { ...options, metrics: this.metrics };
    this.accounts = new Map();
    this.lastDiscovery = 0;
    this.stopSignal = new AbortController();
  }
  async discover() {
    const wanted = new Set();
    let next = "";
    do {
      const url = new URL("/api/internal/wechat-receiver/accounts", this.options.endpoint);
      if (next) url.searchParams.set("after", next);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.options.secret}`,
          "User-Agent": "WeChatAI-Receiver/1.0",
        },
        redirect: "manual",
        signal: AbortSignal.any([this.stopSignal.signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`discovery_http_${response.status}`);
      }
      const result = await readJsonLimited(response);
      for (const id of result.accounts) {
        if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("invalid_account");
        if (this.options.onlyAccounts?.size && !this.options.onlyAccounts.has(id)) continue;
        wanted.add(id);
      }
      if (result.next && result.next <= next) throw new Error("invalid_pagination");
      next = result.next;
    } while (next);
    if (this.stopSignal.signal.aborted) return;
    this.lastDiscovery = Date.now();
    for (const [id, account] of this.accounts) {
      if (wanted.has(id)) continue;
      account.stop();
      await account.done;
      this.accounts.delete(id);
    }
    for (const id of wanted) {
      if (this.accounts.has(id)) continue;
      const account = new ReceiverAccount(id, this.options);
      this.accounts.set(id, account);
      account.done = account.run();
    }
  }
  async run() {
    while (!this.stopSignal.signal.aborted) {
      try {
        await this.discover();
      } catch (error) {
        log("discovery_retry", {
          code: error.message?.startsWith("discovery_http_") ? error.message : error.name,
        });
      }
      await sleep(30000, undefined, { signal: this.stopSignal.signal }).catch(() => {});
    }
  }
  health() {
    const connected = [...this.accounts.values()].filter((a) => a.connected).length;
    return {
      ok: Date.now() - this.lastDiscovery < 90000 && connected === this.accounts.size,
      accounts: this.accounts.size,
      connected,
      links: [...this.accounts.values()].reduce((n, a) => n + a.links.size, 0),
      ...this.metrics,
      lastDiscovery: this.lastDiscovery,
    };
  }
  async stop() {
    this.stopSignal.abort();
    for (const account of this.accounts.values()) account.stop();
    await Promise.all([...this.accounts.values()].map((account) => account.done));
  }
}
