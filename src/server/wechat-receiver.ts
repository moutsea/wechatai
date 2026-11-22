import { createHash, timingSafeEqual } from "node:crypto";
import { decimalId } from "../../integrations/wechat-receiver/message-id.mjs";
import { z } from "zod";
import {
  enrollWatchdog,
  forgetWatchdogSession,
  watchdogBackupMs,
  watchdogEnabled,
} from "./receiver-watchdog";
import { secret } from "./config";
import { decrypt } from "./security";
import type { WxCredentials, WxMessage } from "./wechat";

export const RECEIVER_TAG = "wechat-receiver";
export const RECEIVER_PING = "wechatai-receiver-ping-v1";
export const RECEIVER_PONG = "wechatai-receiver-pong-v1";
export const RECEIVER_LEASE_MS = 60_000;
export const RECEIVER_MAX_BYTES = 1024 * 1024;
export const receiverPoolHeader = "X-Wechatai-Receiver-Pool";

// Discovery and the WebSocket upgrade must agree on the account's sole receiver.
export function receiverPoolMatches(env: Env, accountId: string, pool?: string) {
  const dedicated = secret(env, "WECHAT_RECEIVER_DEDICATED_ACCOUNTS", false)
    .split(",")
    .some((id) => id.trim() === accountId);
  return dedicated ? pool === "dedicated" : !pool;
}

export function receiverAuthorized(env: Env, authorization: string) {
  const expected = secret(env, "WECHAT_RECEIVER_SECRET", false);
  if (expected.length < 32 || !authorization.startsWith("Bearer ")) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(expected), hash(authorization.slice(7)));
}
export function receiverEnabled(env: Env, accountId: string) {
  const accounts = secret(env, "WECHAT_RECEIVER_ACCOUNTS", false)
    .split(",")
    .map((s) => s.trim());
  return (
    secret(env, "WECHAT_RECEIVER_SECRET", false).length >= 32 &&
    (accounts.includes("all") || accounts.includes(accountId))
  );
}

export type ReceiverLink = {
  id: string;
  generation: string;
  cursor?: string;
  encryptedCredentials?: string;
  typingUntil?: number;
  typingContextToken?: string;
};
export type WechatUpdates = { msgs?: WxMessage[]; get_updates_buf?: string; sync_buf?: string };
const configKeyFor = (links: ReceiverLink[]) =>
  // WebSocket attachments have a small size limit. Keep context tickets out of
  // the attachment and use a fixed-size fingerprint even for many active links.
  createHash("sha256")
    .update(
      JSON.stringify(
        links
          .map((l) => [l.id, l.generation, l.typingUntil ?? 0, l.typingContextToken ?? ""])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ),
    )
    .digest("hex");
type Attachment = {
  kind: typeof RECEIVER_TAG;
  connectedAt: number;
  configKey?: string;
  watchdogSession?: string;
  localWatchdog?: boolean;
  watchdogCapable?: boolean;
  retryWatchdogAt?: number;
};
const wireId = z.union([z.number().refine(Number.isInteger), z.string().regex(decimalId)]);
const messageSchema = z
  .object({
    // Older receivers may replay a durable batch containing rounded numbers.
    message_id: wireId.optional(),
    seq: wireId.optional(),
    message_type: z.number().int().optional(),
    from_user_id: z.string().optional(),
    context_token: z.string().optional(),
  })
  .passthrough();
const batchSchema = z.object({
  type: z.literal("batch"),
  id: z.uuid(),
  connectionId: z.string().min(1).max(100),
  generation: z.string().min(1).max(100),
  fromCursor: z.string().max(65536),
  cursor: z.string().max(65536),
  msgs: z.array(messageSchema).max(1000),
});
const expiredSchema = z.object({
  type: z.literal("expired"),
  connectionId: z.string().max(100),
  generation: z.string().max(100),
});

// Only receive transport lives here. Account state, sender validation, deduplication,
// replies, billing and reminder delivery remain in the owning PersonalAccount.
export class WechatReceiver {
  private syncing: Promise<void> | null = null;
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
    private hooks: {
      links(): ReceiverLink[];
      getRegistered(): boolean | null;
      setRegistered(value: boolean): void;
      ingest(
        id: string,
        generation: string,
        fromCursor: string,
        updates: WechatUpdates,
        credentials: WxCredentials,
      ): string | null | false;
      expired(id: string, generation: string): void;
      wake(): void;
      schedule(): Promise<void>;
    },
  ) {}
  enabled() {
    return receiverEnabled(this.env, this.ctx.id.toString());
  }
  socket() {
    if (!this.enabled()) return undefined;
    return this.ctx.getWebSockets(RECEIVER_TAG).find((socket) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      const attachment = socket.deserializeAttachment() as Attachment;
      const seen =
        this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime() ?? attachment.connectedAt;
      if (seen + RECEIVER_LEASE_MS > Date.now()) return true;
      socket.close(1012, "receiver heartbeat expired");
      return false;
    });
  }
  supervised(socket: WebSocket) {
    const a = socket.deserializeAttachment() as Attachment;
    return (
      !!a.watchdogSession && !a.localWatchdog && watchdogEnabled(this.env, this.ctx.id.toString())
    );
  }
  checkAt(socket: WebSocket) {
    const seen =
      this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime() ??
      (socket.deserializeAttachment() as Attachment).connectedAt;
    return seen + (this.supervised(socket) ? watchdogBackupMs : RECEIVER_LEASE_MS);
  }
  private async enrollIfReady(socket: WebSocket) {
    const a = socket.deserializeAttachment() as Attachment;
    if (
      !a.watchdogCapable ||
      (a.watchdogSession && !a.localWatchdog) ||
      (a.retryWatchdogAt ?? 0) > Date.now() ||
      !watchdogEnabled(this.env, this.ctx.id.toString())
    )
      return;
    socket.serializeAttachment({ ...a, retryWatchdogAt: Date.now() + RECEIVER_LEASE_MS });
    const session = crypto.randomUUID();
    try {
      if (
        (await enrollWatchdog(this.env.DB, this.ctx.id.toString(), session)) &&
        this.socket() === socket
      )
        socket.serializeAttachment({
          ...socket.deserializeAttachment(),
          watchdogSession: session,
          localWatchdog: false,
          configKey: undefined,
        });
    } catch {
      console.warn(JSON.stringify({ event: "wechat.watchdog_enroll_failed" }));
    }
  }
  async recoverWatchdog(session: string) {
    const live = this.ctx
      .getWebSockets(RECEIVER_TAG)
      .filter((ws) => ws.readyState === WebSocket.OPEN);
    const socket = live.find(
      (ws) => (ws.deserializeAttachment() as Attachment)?.watchdogSession === session,
    );
    if (!socket && live.length) return;
    if (socket) {
      const attachment = socket.deserializeAttachment() as Attachment;
      socket.serializeAttachment({
        ...attachment,
        localWatchdog: true,
        retryWatchdogAt: Date.now() + RECEIVER_LEASE_MS,
        configKey: undefined,
      });
    }
    await this.hooks.schedule();
  }
  async disconnected(socket: WebSocket) {
    const session = (socket.deserializeAttachment() as Attachment | null)?.watchdogSession;
    await this.hooks.schedule();
    // The account has already rescheduled. Remove this session's registration
    // so a normal reconnect does not cause another recovery RPC a minute later.
    if (session)
      await forgetWatchdogSession(this.env.DB, session).catch(() => {
        console.warn(JSON.stringify({ event: "wechat.watchdog_cleanup_retry" }));
      });
  }
  async connect(supportsWatchdog = false) {
    if (!this.enabled()) return new Response("Receiver disabled", { status: 403 });
    // Close before accepting: there is one receiver per account, across restarts.
    for (const old of this.ctx.getWebSockets(RECEIVER_TAG)) old.close(1012, "receiver replaced");
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [RECEIVER_TAG]);
    pair[1].serializeAttachment({
      kind: RECEIVER_TAG,
      connectedAt: Date.now(),
      watchdogCapable: supportsWatchdog,
    } satisfies Attachment);
    this.hooks.wake();
    await this.sync();
    await this.hooks.schedule();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async sync() {
    const work = (this.syncing ?? Promise.resolve()).catch(() => {}).then(() => this.syncNow());
    this.syncing = work;
    try {
      await work;
    } finally {
      if (this.syncing === work) this.syncing = null;
    }
  }
  private async syncNow() {
    const links = this.hooks.links();
    const active = this.enabled() && links.length > 0;
    // Disabled installations do not need the optional registry migration.
    if (
      (this.enabled() || this.hooks.getRegistered() === true) &&
      this.hooks.getRegistered() !== active
    ) {
      await this.env.DB.prepare(
        "INSERT INTO wechat_receivers(account_id,active,updated_at) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET active=excluded.active,updated_at=excluded.updated_at",
      )
        .bind(this.ctx.id.toString(), active ? 1 : 0, Date.now())
        .run();
      // Re-evaluate on the next schedule if a concurrent edit changed the links.
      this.hooks.setRegistered(active);
    }
    if (!this.enabled()) {
      for (const socket of this.ctx.getWebSockets(RECEIVER_TAG))
        socket.close(1012, "receiver disabled");
      return;
    }
    const socket = this.socket();
    if (!socket) return;
    await this.enrollIfReady(socket);
    if (this.socket() !== socket) return;
    const attachment = socket.deserializeAttachment() as Attachment;
    const configKey = configKeyFor(links);
    if (attachment.configKey === configKey) return;
    const configs = await Promise.all(
      links.map(async (link) => ({
        id: link.id,
        generation: link.generation,
        cursor: link.cursor || "",
        typingUntil: link.typingUntil ?? 0,
        typingContextToken: link.typingContextToken ?? "",
        credentials: JSON.parse(
          await decrypt(this.env, link.encryptedCredentials!, `${this.ctx.id}:wechat`),
        ) as WxCredentials,
      })),
    );
    // Decryption yields. A disconnect, plan change or newer configuration wins.
    if (socket !== this.socket() || configKey !== configKeyFor(this.hooks.links())) return;
    const current = socket.deserializeAttachment() as Attachment;
    socket.send(
      JSON.stringify({
        type: "config",
        links: configs,
        watchdogSession: current.localWatchdog ? undefined : current.watchdogSession,
      }),
    );
    socket.serializeAttachment({ ...current, configKey });
  }
  async message(socket: WebSocket, raw: string | ArrayBuffer) {
    if (socket !== this.socket()) {
      socket.close(1008, "inactive receiver");
      return;
    }
    if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > RECEIVER_MAX_BYTES) {
      socket.close(1009, "batch too large");
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      socket.close(1008, "invalid json");
      return;
    }
    const expired = expiredSchema.safeParse(payload);
    if (expired.success) {
      this.hooks.expired(expired.data.connectionId, expired.data.generation);
      await this.hooks.schedule();
      return;
    }
    const parsed = batchSchema.safeParse(payload);
    if (!parsed.success) {
      socket.close(1008, "invalid batch");
      return;
    }
    const batch = parsed.data;
    const link = this.hooks
      .links()
      .find((l) => l.id === batch.connectionId && l.generation === batch.generation);
    if (!link) {
      socket.send(JSON.stringify({ type: "ack", id: batch.id, stale: true }));
      return;
    }
    const credentials = JSON.parse(
      await decrypt(this.env, link.encryptedCredentials!, `${this.ctx.id}:wechat`),
    ) as WxCredentials;
    if (socket !== this.socket()) return;
    const cursor = this.hooks.ingest(
      link.id,
      link.generation,
      batch.fromCursor,
      { msgs: batch.msgs as WxMessage[], get_updates_buf: batch.cursor },
      credentials,
    );
    // Schedule before acknowledgement. A lost ack can safely replay the batch;
    // account SQL writes and its alarm are durably committed before output.
    await this.hooks.schedule();
    socket.send(
      JSON.stringify({
        type: "ack",
        id: batch.id,
        ...(cursor === null
          ? { stale: true }
          : cursor === false
            ? { retryAfterMs: 5000 }
            : { cursor }),
      }),
    );
  }
}
