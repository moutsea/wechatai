import { nativeCommand, nativeCommandLane } from "../shared/command-routing";
import { remoteAgentName, type RemoteAgentPlugin } from "../shared/remote-agent";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "./config";
import { countTextTokens, limitTextTokens } from "./tokenizer";
import { creditUnits } from "./wallet";
import { openClawAgentsSchema, type OpenClawAgent } from "../shared/openclaw";
import { connectorVersionPattern } from "../shared/openclaw-release";

export type ClawRoute = {
  id: string;
  pluginId: string;
  sessionId: string;
  connectionId: string;
  generation: string;
  epoch: number;
};
type Job = {
  id: string;
  routeId: string;
  pluginId: string;
  text: string;
  state: string;
  createdAt: number;
  inputTokens: number;
  outputLimit: number;
  runnerId: string;
  command: string;
  lane: "message" | "control";
};
type Hooks = {
  wake?: (pluginId: string) => void;
  plugin: (id: string) => RemoteAgentPlugin;
  validateRoute: (route: ClawRoute) => void;
  balance: () => number;
  selectAgent: (pluginId: string, agentId: string) => void;
  deliver: (event: {
    id: string;
    route: ClawRoute;
    text: string;
    inputTokens: number;
    outputTokens: number;
    units: number;
    failed: boolean;
    proactive: boolean;
    command: string;
  }) => void;
};
const eventSchema = z.object({
  eventId: z.string().uuid(),
  routeId: z.string().uuid(),
  jobId: z.string().max(300).optional(),
  runnerId: z.string().uuid().optional(),
  status: z.enum(["completed", "failed"]).default("completed"),
  text: z.string().max(64000).default(""),
});
const pollSchema = z.object({
  runnerId: z.string().uuid(),
  nativeCommands: z.boolean().default(false),
  lane: z.enum(["message", "control"]).default("message"),
  waitMs: z.number().int().min(0).max(15000).default(0),
});
export const clawPairExchangeSchema = z.object({
  proof: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  agents: openClawAgentsSchema,
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

// All job claims, billing and outbox writes are synchronous transactions in the
// owning account DO. A claimed job is never reassigned: agent tools have effects.
export class OpenClawRelay {
  // Transient wakeups only: jobs remain durable and are re-read after each wait.
  private pollWaiters = new Map<string, () => void>();
  constructor(
    private storage: DurableObjectStorage,
    private hooks: Hooks,
  ) {}
  private get sql() {
    return this.storage.sql;
  }
  init() {
    this.sql
      .exec(`CREATE TABLE IF NOT EXISTS claw_connectors (pluginId TEXT PRIMARY KEY, tokenHash TEXT NOT NULL, lastSeen INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS claw_routes (id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, sessionId TEXT NOT NULL, connectionId TEXT NOT NULL, generation TEXT NOT NULL, epoch INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS claw_jobs (id TEXT PRIMARY KEY, routeId TEXT NOT NULL, pluginId TEXT NOT NULL, text TEXT NOT NULL, state TEXT NOT NULL, createdAt INTEGER NOT NULL, inputTokens INTEGER NOT NULL, outputLimit INTEGER NOT NULL, runnerId TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS claw_jobs_plugin ON claw_jobs(pluginId,state,createdAt);
      CREATE TABLE IF NOT EXISTS claw_pairings (pluginId TEXT PRIMARY KEY, secretHash TEXT NOT NULL, expiresAt INTEGER NOT NULL, claimHash TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS claw_agents (pluginId TEXT PRIMARY KEY, agents TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS claw_events (id TEXT PRIMARY KEY, pluginId TEXT NOT NULL, receipt TEXT NOT NULL, createdAt INTEGER NOT NULL);`);
    if (
      !this.sql
        .exec<{ name: string }>("PRAGMA table_info(claw_jobs)")
        .toArray()
        .some((c) => c.name === "runnerId")
    )
      this.sql.exec("ALTER TABLE claw_jobs ADD COLUMN runnerId TEXT NOT NULL DEFAULT ''");
    for (const [table, column, definition] of [
      ["claw_jobs", "command", "TEXT NOT NULL DEFAULT ''"],
      ["claw_jobs", "lane", "TEXT NOT NULL DEFAULT 'message'"],
      ["claw_connectors", "nativeCommands", "INTEGER NOT NULL DEFAULT 0"],
      ["claw_connectors", "connectorVersion", "TEXT NOT NULL DEFAULT ''"],
      ["claw_connectors", "versionSeenAt", "INTEGER NOT NULL DEFAULT 0"],
    ]) {
      if (
        !this.sql
          .exec<{ name: string }>(`PRAGMA table_info(${table})`)
          .toArray()
          .some((c) => c.name === column)
      )
        this.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  status(pluginId: string) {
    const row = this.sql
      .exec<{
        lastSeen: number;
        nativeCommands: number;
        connectorVersion: string;
        versionSeenAt: number;
      }>(
        "SELECT lastSeen,nativeCommands,connectorVersion,versionSeenAt FROM claw_connectors WHERE pluginId = ?",
        pluginId,
      )
      .toArray()[0];
    const agents = this.sql
      .exec<{ agents: string }>("SELECT agents FROM claw_agents WHERE pluginId = ?", pluginId)
      .toArray()[0];
    const pairing = this.sql
      .exec<{ claimHash: string; expiresAt: number }>(
        "SELECT claimHash,expiresAt FROM claw_pairings WHERE pluginId = ?",
        pluginId,
      )
      .toArray()[0];
    return {
      pairingClaimed: Boolean(pairing?.claimHash),
      hasKey: Boolean(row),
      nativeCommands: Boolean(row?.nativeCommands),
      lastSeen: row?.lastSeen ?? 0,
      connectorVersion: row?.connectorVersion || null,
      versionSeenAt: row?.versionSeenAt ?? 0,
      agents: agents ? (JSON.parse(agents.agents) as OpenClawAgent[]) : [],
    };
  }
  rotate(pluginId: string, accountId: string) {
    this.hooks.plugin(pluginId);
    const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    this.storage.transactionSync(() => {
      this.revoke(pluginId);
      this.sql.exec(
        "INSERT INTO claw_connectors (pluginId,tokenHash,lastSeen) VALUES (?,?,0)",
        pluginId,
        hash(secret),
      );
    });
    return `${accountId}.${pluginId}.${secret}`;
  }
  createPairing(pluginId: string, accountId: string) {
    this.hooks.plugin(pluginId);
    const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    this.sql.exec(
      "INSERT INTO claw_pairings VALUES (?,?,?,'') ON CONFLICT(pluginId) DO UPDATE SET secretHash=excluded.secretHash, expiresAt=excluded.expiresAt, claimHash=''",
      pluginId,
      hash(secret),
      expiresAt,
    );
    return { unsigned: `${accountId}.${pluginId}.${secret}`, expiresAt };
  }
  pair(pluginId: string, secret: string, raw: unknown, connectorSecret: string) {
    const { proof, agents } = clawPairExchangeSchema.parse(raw);
    return this.storage.transactionSync(() => {
      const plugin = this.hooks.plugin(pluginId);
      const row = this.sql
        .exec<{ secretHash: string; expiresAt: number; claimHash: string }>(
          "SELECT * FROM claw_pairings WHERE pluginId = ?",
          pluginId,
        )
        .toArray()[0];
      if (
        !row ||
        row.expiresAt <= Date.now() ||
        !timingSafeEqual(Buffer.from(row.secretHash), Buffer.from(hash(secret)))
      )
        throw new AppError("pair_expired", "连接命令已过期或被替换，请回到网页重新生成", 401);
      if (row.claimHash) {
        if (!timingSafeEqual(Buffer.from(row.claimHash), Buffer.from(hash(proof))))
          throw new AppError("pair_used", "此连接命令已使用，请回到网页重新生成", 409);
        this.authenticate(pluginId, connectorSecret);
        return { agentId: plugin.agentId };
      }
      // A reconnect retains the selected agent if it still exists. First pairing
      // always uses the installation's actual default (which need not be main).
      const selected =
        this.status(pluginId).agents.length && agents.find((a) => a.id === plugin.agentId);
      const agentId = (selected || agents.find((a) => a.isDefault) || agents[0]).id;
      this.clearRoutes(pluginId);
      this.sql.exec(
        "INSERT INTO claw_connectors (pluginId,tokenHash,lastSeen) VALUES (?,?,0) ON CONFLICT(pluginId) DO UPDATE SET tokenHash=excluded.tokenHash,lastSeen=0,nativeCommands=0,connectorVersion='',versionSeenAt=0",
        pluginId,
        hash(connectorSecret),
      );
      this.recordAgents(pluginId, agents);
      this.hooks.selectAgent(pluginId, agentId);
      this.sql.exec(
        "UPDATE claw_pairings SET claimHash = ? WHERE pluginId = ?",
        hash(proof),
        pluginId,
      );
      return { agentId };
    });
  }
  private recordAgents(pluginId: string, agents: OpenClawAgent[], retainNames = false) {
    if (retainNames) {
      const previous = this.status(pluginId).agents;
      // CLI discovery can include workspace identity names absent from runtime config.
      agents = agents.map((a) => ({
        ...a,
        name: a.name === a.id ? (previous.find((p) => p.id === a.id)?.name ?? a.name) : a.name,
      }));
    }
    this.sql.exec(
      "INSERT INTO claw_agents VALUES (?,?) ON CONFLICT(pluginId) DO UPDATE SET agents=excluded.agents",
      pluginId,
      JSON.stringify(agents),
    );
  }
  revoke(pluginId: string) {
    this.sql.exec("DELETE FROM claw_pairings WHERE pluginId = ?", pluginId);
    this.sql.exec("DELETE FROM claw_agents WHERE pluginId = ?", pluginId);
    this.sql.exec("DELETE FROM claw_connectors WHERE pluginId = ?", pluginId);
    this.clearRoutes(pluginId);
  }
  clearRoutes(pluginId: string) {
    this.sql.exec(
      "UPDATE inbox SET state = 'done', payload = '{}', reply = '' WHERE id LIKE ?",
      `claw:${pluginId}:%`,
    );
    this.sql.exec("DELETE FROM claw_routes WHERE pluginId = ?", pluginId);
    this.sql.exec(
      "UPDATE claw_jobs SET state = 'cancelled', text = '' WHERE pluginId = ? AND state IN ('pending','claimed')",
      pluginId,
    );
    this.pollWaiters.get(`${pluginId}:message`)?.();
    this.pollWaiters.get(`${pluginId}:control`)?.();
    this.hooks.wake?.(pluginId);
  }
  cancelSession(sessionId: string) {
    this.sql.exec(
      "UPDATE claw_jobs SET state = 'cancelled', text = '' WHERE routeId IN (SELECT id FROM claw_routes WHERE sessionId = ?) AND state IN ('pending','claimed')",
      sessionId,
    );
    this.sql.exec("DELETE FROM claw_routes WHERE sessionId = ?", sessionId);
  }
  authenticate(pluginId: string, secret: string) {
    const row = this.sql
      .exec<{ tokenHash: string }>(
        "SELECT tokenHash FROM claw_connectors WHERE pluginId = ?",
        pluginId,
      )
      .toArray()[0];
    if (!row || !timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(hash(secret))))
      throw new AppError("unauthorized", "连接凭证无效或已撤销", 401);
    return this.hooks.plugin(pluginId);
  }
  enqueue(id: string, pluginId: string, route: Omit<ClawRoute, "id" | "pluginId">, text: string) {
    const plugin = this.hooks.plugin(pluginId);
    if (!this.status(pluginId).hasKey)
      throw new AppError(
        "claw_unpaired",
        `请先在网页的 ${remoteAgentName(plugin.pluginId)} 插件中生成并执行连接命令`,
      );
    const previous = this.sql.exec<Job>("SELECT * FROM claw_jobs WHERE id = ?", id).toArray()[0];
    if (previous) return previous;
    const command = nativeCommand(text) ?? "";
    if (command && !this.status(pluginId).nativeCommands)
      throw new AppError(
        "connector_upgrade_required",
        `请在网页的 ${remoteAgentName(plugin.pluginId)} 配置中重新生成并执行连接命令，升级连接器后即可使用 Agent 原生命令`,
        409,
      );
    const lane = nativeCommandLane(text);
    const control = lane === "control";
    if (!control && this.hooks.balance() <= 0)
      throw new AppError("insufficient_credits", "Credits 不足，请补充后再使用", 402);
    const inputTokens = countTextTokens(text);
    if (inputTokens > plugin.maxInputTokens)
      throw new AppError(
        "input_limit_exceeded",
        `消息超过 ${remoteAgentName(plugin.pluginId)} 插件的输入上限，请缩短内容`,
        422,
      );
    if (
      this.sql
        .exec<{ n: number }>(
          "SELECT count(*) n FROM claw_jobs WHERE pluginId = ? AND lane = ? AND state IN ('pending','claimed')",
          pluginId,
          lane,
        )
        .one().n >= (control ? 2 : 20)
    )
      throw new AppError(
        "claw_queue_full",
        `${remoteAgentName(plugin.pluginId)} 待处理任务较多，请等待本机处理后再发送`,
        429,
      );
    const existing = this.sql
      .exec<ClawRoute>(
        "SELECT * FROM claw_routes WHERE pluginId = ? AND sessionId = ? AND connectionId = ? AND generation = ? AND epoch = ?",
        pluginId,
        route.sessionId,
        route.connectionId,
        route.generation,
        route.epoch,
      )
      .toArray()[0];
    const target: ClawRoute = existing ?? { ...route, id: crypto.randomUUID(), pluginId };
    this.hooks.validateRoute(target);
    this.sql.exec(
      "INSERT OR IGNORE INTO claw_routes VALUES (?,?,?,?,?,?)",
      target.id,
      pluginId,
      route.sessionId,
      route.connectionId,
      route.generation,
      route.epoch,
    );
    this.sql.exec(
      "INSERT INTO claw_jobs (id,routeId,pluginId,text,state,createdAt,inputTokens,outputLimit,command,lane) VALUES (?,?,?,?, 'pending',?,?,?,?,?)",
      id,
      target.id,
      pluginId,
      text,
      Date.now(),
      inputTokens,
      plugin.maxOutputTokens,
      command,
      lane,
    );
    this.pollWaiters.get(`${pluginId}:message`)?.();
    this.pollWaiters.get(`${pluginId}:control`)?.();
    this.hooks.wake?.(pluginId);
    return { id, routeId: target.id };
  }
  async poll(pluginId: string, secret: string, raw: unknown) {
    const input = pollSchema.parse(raw);
    const first = this.handle(pluginId, secret, "poll", input);
    if (first.jobs.length || !input.waitMs) return first;
    const waiterKey = `${pluginId}:${input.lane}`;
    await new Promise<void>((resolve) => {
      // One wait per lane; /stop can arrive while a normal task is running.
      this.pollWaiters.get(waiterKey)?.();
      const finish = () => {
        clearTimeout(timer);
        if (this.pollWaiters.get(waiterKey) === finish) this.pollWaiters.delete(waiterKey);
        resolve();
      };
      const timer = setTimeout(finish, input.waitMs);
      this.pollWaiters.set(waiterKey, finish);
    });
    // Re-authenticate after waking; revoked or disabled connectors must not receive jobs.
    return this.handle(pluginId, secret, "poll", input);
  }
  handle(pluginId: string, secret: string, action: string, raw: unknown) {
    const plugin = this.authenticate(pluginId, secret);
    return this.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE claw_connectors SET lastSeen = ? WHERE pluginId = ?",
        Date.now(),
        pluginId,
      );
      if (action === "poll") {
        const { runnerId, waitMs, nativeCommands, lane } = pollSchema.parse(raw);
        // Expired jobs cannot execute later, but retain the tombstone for dedupe.
        this.sql.exec(
          "UPDATE claw_jobs SET state = 'expired', text = '' WHERE pluginId = ? AND state IN ('pending','claimed') AND createdAt < ?",
          pluginId,
          Date.now() - 86400000,
        );
        const jobs = this.sql
          .exec<Job>(
            "SELECT * FROM claw_jobs WHERE pluginId = ? AND lane = ? AND (? OR command = '') AND state IN ('pending','claimed') ORDER BY createdAt,rowid LIMIT 1",
            pluginId,
            lane,
            nativeCommands ? 1 : 0,
          )
          .toArray();
        return {
          jobs: jobs.flatMap((j) => {
            if (j.state === "claimed" && j.runnerId !== runnerId) return [];
            const route = this.sql
              .exec<ClawRoute>("SELECT * FROM claw_routes WHERE id = ?", j.routeId)
              .toArray()[0];
            try {
              if (!route) throw new Error();
              this.hooks.validateRoute(route);
            } catch {
              this.sql.exec(
                "UPDATE claw_jobs SET state = 'cancelled', text = '' WHERE id = ?",
                j.id,
              );
              return [];
            }
            return [
              {
                id: j.id,
                routeId: j.routeId,
                text: j.text,
                agentId: plugin.agentId,
                state: j.state,
                command: j.command || undefined,
                lane: j.lane,
              },
            ];
          }),
          retryAfterMs: waitMs ? 0 : 5000,
        };
      }
      if (action === "claim") {
        const { id, runnerId, nativeCommands } = z
          .object({
            id: z.string().max(300),
            runnerId: z.string().uuid(),
            nativeCommands: z.boolean().default(false),
          })
          .parse(raw);
        const job = this.sql
          .exec<Job>("SELECT * FROM claw_jobs WHERE id = ? AND pluginId = ?", id, pluginId)
          .toArray()[0];
        if (!job || !["pending", "claimed"].includes(job.state))
          throw new AppError("claw_job_gone", "任务已结束或取消", 409);
        if (job.command && !nativeCommands)
          throw new AppError("connector_upgrade_required", "连接器需要升级才能执行原生命令", 409);
        const route = this.sql
          .exec<ClawRoute>("SELECT * FROM claw_routes WHERE id = ?", job.routeId)
          .toArray()[0];
        if (!route) throw new AppError("claw_route_gone", "会话已重置或断开", 409);
        this.hooks.validateRoute(route);
        if (job.state === "claimed") return { claimed: false };
        this.sql.exec(
          "UPDATE claw_jobs SET state = 'claimed', runnerId = ? WHERE id = ?",
          runnerId,
          id,
        );
        console.info(
          JSON.stringify({
            event: `${plugin.pluginId.split("/")[1]}.claimed`,
            pluginId,
            queueMs: Date.now() - job.createdAt,
          }),
        );
        return { claimed: job.state === "pending" };
      }
      if (action === "heartbeat") {
        const { agents, nativeCommands, connectorVersion } = z
          .object({
            agents: openClawAgentsSchema.optional(),
            nativeCommands: z.boolean().default(false),
            connectorVersion: z.string().regex(connectorVersionPattern).optional(),
          })
          .parse(raw);
        this.sql.exec(
          "UPDATE claw_connectors SET nativeCommands = ?, connectorVersion = ?, versionSeenAt = ? WHERE pluginId = ?",
          nativeCommands ? 1 : 0,
          connectorVersion ?? "",
          connectorVersion ? Date.now() : 0,
          pluginId,
        );
        if (agents) this.recordAgents(pluginId, agents, true);
        return { ok: true };
      }
      if (action !== "event") throw new AppError("not_found", "未知连接操作", 404);
      const event = eventSchema.parse(raw);
      const receiptId = `${pluginId}:${event.eventId}`;
      const previous = this.sql
        .exec<{ receipt: string }>("SELECT receipt FROM claw_events WHERE id = ?", receiptId)
        .toArray()[0];
      if (previous) return JSON.parse(previous.receipt);
      const route = this.sql
        .exec<ClawRoute>(
          "SELECT * FROM claw_routes WHERE id = ? AND pluginId = ?",
          event.routeId,
          pluginId,
        )
        .toArray()[0];
      if (!route)
        throw new AppError(
          "claw_route_gone",
          "会话已重置或微信连接已变更，请从微信重新发起对话",
          409,
        );
      this.hooks.validateRoute(route);
      const job = event.jobId
        ? this.sql
            .exec<Job>(
              "SELECT * FROM claw_jobs WHERE id = ? AND pluginId = ? AND routeId = ?",
              event.jobId,
              pluginId,
              route.id,
            )
            .toArray()[0]
        : undefined;
      if (event.jobId && (!job || job.state !== "claimed" || job.runnerId !== event.runnerId))
        throw new AppError("claw_job_gone", "任务已结束或取消", 409);
      if (!event.jobId && !plugin.allowProactive)
        throw new AppError("claw_push_disabled", "此配置未开启主动推送", 403);
      if (!job && this.hooks.balance() <= 0)
        throw new AppError("insufficient_credits", "Credits 不足，主动推送暂停", 402);
      if (!job && event.status === "failed")
        throw new AppError("invalid_event", "主动推送必须包含文本");
      const failed = event.status === "failed";
      if (!failed && !job && !event.text.trim()) throw new AppError("empty_result", "结果不能为空");
      const text = failed
        ? `${remoteAgentName(plugin.pluginId)} 未完成这次任务，本次未扣费。请检查本机运行状态后重新发送；为避免重复执行工具，中断的任务不会自动重跑。`
        : limitTextTokens(
            event.text.trim(),
            Math.min(
              plugin.maxOutputTokens,
              job?.outputLimit ?? plugin.maxOutputTokens,
              job?.lane === "control" ? 256 : Infinity,
            ),
          );
      const inputTokens = failed ? 0 : (job?.inputTokens ?? 0);
      const outputTokens = failed ? 0 : countTextTokens(text);
      const units = job?.lane === "control" ? 0 : creditUnits(inputTokens, outputTokens);
      const id = `claw:${receiptId}`;
      this.hooks.deliver({
        id,
        route,
        text,
        inputTokens,
        outputTokens,
        units,
        failed,
        proactive: !job,
        command: job?.command ?? "",
      });
      if (job)
        this.sql.exec(
          "UPDATE claw_jobs SET state = ?, text = '' WHERE id = ?",
          failed ? "failed" : "complete",
          job.id,
        );
      const receipt = {
        id,
        status: "queued",
        cost: units / 1000,
        truncated: !failed && text !== event.text.trim(),
      };
      this.sql.exec(
        "INSERT INTO claw_events VALUES (?,?,?,?)",
        receiptId,
        pluginId,
        JSON.stringify(receipt),
        Date.now(),
      );
      console.info(
        JSON.stringify({
          event: `${plugin.pluginId.split("/")[1]}.result`,
          pluginId,
          proactive: !job,
          failed,
          jobDurationMs: job ? Date.now() - job.createdAt : undefined,
        }),
      );
      return receipt;
    });
  }
}
