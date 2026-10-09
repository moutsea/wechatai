import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { OpenClawPluginApi, OpenClawConfig } from "openclaw/plugin-sdk/plugin-entry";
import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import {
  defineChannelMessageAdapter,
  createMessageReceiptFromOutboundResults,
} from "openclaw/plugin-sdk/channel-outbound";
import {
  accountFingerprint,
  executeJob,
  flush,
  Journal,
  relay,
  type Account,
  type Job,
} from "./transport.js";

type ChannelConfig = { accounts?: Record<string, Partial<Account>> };
const settings = (cfg: OpenClawConfig) => (cfg.channels?.wechatai ?? {}) as ChannelConfig;
function resolveAccount(cfg: OpenClawConfig, accountId?: string | null): Account {
  const ids = Object.keys(settings(cfg).accounts ?? {});
  const id = accountId ?? (ids.length === 1 ? ids[0] : "");
  const a = settings(cfg).accounts?.[id] ?? {};
  return {
    accountId: id,
    endpoint: a.endpoint ?? "https://wechatai.app",
    token: a.token ?? "",
    agentId: a.agentId ?? "main",
    enabled: a.enabled !== false,
  };
}

export function createWechataiChannel(
  api: Pick<OpenClawPluginApi, "runtime">,
): ChannelPlugin<Account> {
  const stores = new Map<string, Journal>();
  const turns = new AsyncLocalStorage<{ routeId: string; sent: boolean; active: boolean }>();
  const journalFor = (a: Account) => {
    const key = accountFingerprint(a);
    let store = stores.get(key);
    if (!store) {
      store = new Journal(join(api.runtime.state.resolveStateDir(), "wechatai", `${key}.sqlite`));
      stores.set(key, store);
    }
    return store;
  };
  const send = async ({
    cfg,
    accountId,
    to,
    text,
  }: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    to: string;
    text: string;
  }) => {
    const a = resolveAccount(cfg, accountId);
    if (!a.enabled || !a.token) throw new Error("Wechatai account is disabled or unconfigured");
    const routeId = to.replace(/^wechatai:/, "");
    if (!/^[a-f0-9-]{36}$/.test(routeId)) throw new Error("Invalid Wechatai destination");
    const messageId = journalFor(a).push(routeId, text);
    const turn = turns.getStore();
    if (turn?.active && turn.routeId === routeId) turn.sent = true;
    // Receipt means durable local acceptance; cloud and WeChat delivery are async.
    return {
      messageId,
      receipt: createMessageReceiptFromOutboundResults({
        results: [{ channel: "wechatai", messageId, conversationId: routeId }],
        kind: "text",
      }),
    };
  };
  return {
    id: "wechatai",
    meta: {
      id: "wechatai",
      label: "Wechatai",
      selectionLabel: "Wechatai (personal WeChat)",
      docsPath: "https://wechatai.app/developers/openclaw",
      blurb: "Personal WeChat through an outbound relay",
    },
    capabilities: {
      chatTypes: ["direct"],
      media: false,
      blockStreaming: false,
      nativeCommands: false,
    },
    config: {
      listAccountIds: (cfg) => Object.keys(settings(cfg).accounts ?? {}),
      resolveAccount,
      isEnabled: (a) => a.enabled,
      isConfigured: (a) => Boolean(a.token),
      describeAccount: (a) => ({
        accountId: a.accountId,
        enabled: a.enabled,
        configured: Boolean(a.token),
      }),
    },
    configSchema: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          accounts: {
            type: "object",
            additionalProperties: {
              type: "object",
              additionalProperties: false,
              required: ["endpoint", "token", "agentId"],
              properties: {
                endpoint: { type: "string" },
                token: { type: "string" },
                agentId: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
                enabled: { type: "boolean" },
              },
            },
          },
        },
      },
      uiHints: { "accounts.*.token": { sensitive: true } },
    },
    reload: { configPrefixes: ["channels.wechatai"] },
    messaging: {
      normalizeTarget: (target) => target.replace(/^wechatai:/, ""),
      targetResolver: {
        looksLikeId: (target) => /^[a-f0-9-]{36}$/.test(target.replace(/^wechatai:/, "")),
        hint: "Use the route ID from a Wechatai session",
      },
    },
    outbound: {
      deliveryMode: "direct",
      textChunkLimit: 64000,
      sendText: async (ctx) => ({ channel: "wechatai", ...(await send(ctx)) }),
    },
    message: defineChannelMessageAdapter({
      id: "wechatai",
      send: { text: send },
      durableFinal: {
        capabilities: { text: true },
        // A crash at the handoff boundary must not result in an automatic second
        // notification. The local journal continues flushing the original.
        reconcileUnknownSend: () => ({
          status: "unresolved",
          retryable: false,
          error:
            "Inspect the Wechatai delivery status; an accepted local outbox item may still be pending",
        }),
      },
    }),
    gateway: {
      startAccount: async (ctx) => {
        const a = ctx.account;
        const runtime = ctx.channelRuntime as typeof api.runtime.channel | undefined;
        if (!runtime) throw new Error("OpenClaw channel runtime is required (2026.6.10+)");
        if (!a.token || !a.enabled) throw new Error("Wechatai is not configured");
        const configuredAgents = ctx.cfg.agents?.list?.length
          ? ctx.cfg.agents.list
          : [{ id: "main" }];
        const defaultId = (configuredAgents.find((agent) => agent.default) ?? configuredAgents[0])
          .id;
        const agents = configuredAgents.map((agent) => ({
          id: agent.id,
          name: (agent.name || agent.identity?.name || agent.id).slice(0, 80),
          isDefault: agent.id === defaultId,
        }));
        const journal = journalFor(a);
        let outboxBusy = false;
        let outboxRetryAt = 0;
        const drainOutbox = () => {
          if (
            outboxBusy ||
            ctx.abortSignal.aborted ||
            Date.now() < outboxRetryAt ||
            !journal.pending().length
          )
            return;
          outboxBusy = true;
          // Durable acceptance does not wait on the network, but delivery starts
          // immediately even while another Agent turn or poll is still running.
          void flush(journal, a, ctx.abortSignal)
            .then(() => {
              outboxRetryAt = 0;
            })
            .catch(() => {
              outboxRetryAt = Date.now() + 5000;
            })
            .finally(() => {
              outboxBusy = false;
            });
        };
        const unsubscribe = journal.onQueued(drainOutbox);
        // The CLI may write the same journal from another process. Check SQLite,
        // not the network, so its messages also avoid the 20-second heartbeat delay.
        const outboxTimer = setInterval(drainOutbox, 1000);
        ctx.setStatus({ accountId: a.accountId, running: true, lastStartAt: Date.now() });
        let heartbeatBusy = false;
        const timer = setInterval(() => {
          if (heartbeatBusy || ctx.abortSignal.aborted) return;
          heartbeatBusy = true;
          void relay(a, "heartbeat", { agents }, ctx.abortSignal)
            .catch(() => {})
            .finally(() => {
              heartbeatBusy = false;
            });
        }, 20000);
        try {
          while (!ctx.abortSignal.aborted) {
            let retryAfterMs = 5000;
            try {
              await flush(journal, a, ctx.abortSignal);
              if (!ctx.getStatus().connected)
                await relay(a, "heartbeat", { agents }, ctx.abortSignal);
              const pollStarted = Date.now();
              const result = await relay<{ jobs: Job[]; retryAfterMs?: number }>(
                a,
                "poll",
                { runnerId: journal.runnerId, waitMs: 15000 },
                ctx.abortSignal,
              );
              // Long polls return immediately when work arrives. Keep a small floor
              // for empty immediate responses (e.g. another runner) to avoid a hot loop.
              retryAfterMs = Math.max(
                result.jobs.length || Date.now() - pollStarted >= 1000 ? 0 : 1000,
                Math.min(30000, Math.max(0, result.retryAfterMs ?? 5000)),
              );
              for (const job of result.jobs) {
                await executeJob(
                  job,
                  journal,
                  a,
                  async () =>
                    turns.run({ routeId: job.routeId, sent: false, active: true }, async () => {
                      if (!agents.some((agent) => agent.id === job.agentId))
                        throw new Error("Selected Agent no longer exists in OpenClaw");
                      const sessionKey = `agent:${job.agentId}:wechatai:${a.accountId}:direct:${job.routeId}`;
                      const payload = runtime.reply.finalizeInboundContext({
                        Body: job.text,
                        RawBody: job.text,
                        BodyForAgent: job.text,
                        CommandBody: job.text,
                        From: `wechatai:${job.routeId}`,
                        To: job.routeId,
                        SenderId: job.routeId,
                        AccountId: a.accountId,
                        SessionKey: sessionKey,
                        MessageSid: job.id,
                        ChatType: "direct",
                        Provider: "wechatai",
                        Surface: "wechatai",
                        OriginatingChannel: "wechatai",
                        OriginatingTo: job.routeId,
                        CommandAuthorized: false,
                      });
                      const chunks: string[] = [];
                      let failed = false;
                      await runtime.inbound.dispatchReply({
                        cfg: ctx.cfg,
                        channel: "wechatai",
                        accountId: a.accountId,
                        agentId: job.agentId,
                        routeSessionKey: sessionKey,
                        storePath: runtime.session.resolveStorePath(ctx.cfg.session?.store, {
                          agentId: job.agentId,
                        }),
                        ctxPayload: payload,
                        recordInboundSession: runtime.session.recordInboundSession,
                        dispatchReplyWithBufferedBlockDispatcher:
                          runtime.reply.dispatchReplyWithBufferedBlockDispatcher,
                        record: {
                          updateLastRoute: {
                            sessionKey,
                            channel: "wechatai",
                            to: job.routeId,
                            accountId: a.accountId,
                          },
                        },
                        replyOptions: { disableBlockStreaming: true },
                        delivery: {
                          durable: false,
                          deliver: async (p, info) => {
                            if (p.isError) failed = true;
                            if (info.kind === "final" && p.text) chunks.push(p.text);
                            if (p.mediaUrl || p.mediaUrls?.length)
                              chunks.push("此渠道暂不支持附件，请在 OpenClaw 查看生成的文件。");
                          },
                          onError: () => {
                            failed = true;
                          },
                        },
                      });
                      if (failed) throw new Error("Agent dispatch failed");
                      const turn = turns.getStore()!;
                      turn.active = false;
                      return chunks.length ? chunks.join("\n\n") : turn.sent ? null : "";
                    }),
                  ctx.abortSignal,
                );
              }
              await flush(journal, a, ctx.abortSignal);
              ctx.setStatus({
                accountId: a.accountId,
                running: true,
                connected: true,
                lastEventAt: Date.now(),
                lastError: null,
              });
            } catch {
              retryAfterMs = 5000;
              if (!ctx.abortSignal.aborted)
                ctx.setStatus({
                  accountId: a.accountId,
                  running: true,
                  connected: false,
                  lastError: "Wechatai connection or Agent dispatch unavailable; retrying",
                });
            }
            if (retryAfterMs)
              await delay(retryAfterMs, undefined, { signal: ctx.abortSignal }).catch(() => {});
          }
        } finally {
          unsubscribe();
          clearInterval(outboxTimer);
          clearInterval(timer);
          ctx.setStatus({ accountId: a.accountId, running: false, connected: false });
        }
      },
    },
  };
}

export default {
  id: "wechatai",
  name: "Wechatai Channel",
  description: "Personal WeChat relay with proactive deliveries",
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: createWechataiChannel(api) });
  },
};
