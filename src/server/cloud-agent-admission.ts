import { createHash } from "node:crypto";
import { CLOUD_AGENT_PLUGIN_ID, CLOUD_AGENT_VERSION } from "../shared/cloud-agent";
import { PLUGIN_PROTOCOL_VERSION, pluginInvocationSchema } from "../shared/plugins";
import type { ChatSession } from "../shared/types";
import type { ResolvedModel } from "./channels";
import { modelInputBudget } from "../shared/context";
import { cloudCallbackSecret, cloudCallbackVersion } from "./cloud-agent-callback";
import { CloudAgentStore, type CloudTask } from "./cloud-agent-store";
import { AppError, cloudAgentConfig, publicSiteUrl } from "./config";
import { pluginOutputBudget } from "./plugins/gateway";
import { dayWindow, Wallet } from "./wallet";
import type { ModelMessage } from "./llm";
import { CLOUD_AGENT_POLICY_V2 } from "./cloud-agent-client";

/** Read by the account host immediately before admission, never from a browser DTO. */
export type CloudAgentAdmissionContext = {
  planUntil: number;
  isAdmin?: boolean;
  model?: ResolvedModel;
  plugin: { id: string; pluginId: string; name: string; enabled: boolean } | null;
  session: (ChatSession & { contextStart: number }) | null;
  connection: { id: string; generation: string; currentSessionId: string; enabled: boolean };
};

/**
 * Accept one source message in initialized account storage, outside an enclosing
 * transaction. For a new source, context refreshes the wallet and reads live
 * eligibility before the task transaction. Wallet grants/repayments must survive
 * refusal or a later task write failure. There is no await between that snapshot,
 * eligibility checks and commit, so another account event cannot interleave.
 *
 * Task/source message/run/inbox/session changes commit atomically in commit;
 * failure rolls back those writes only. Both hooks must be synchronous. Duplicates
 * reuse durable identity without rerunning either hook or current eligibility.
 *
 * This helper never calls AGT, arms an alarm or charges credits. After either a
 * new or duplicate return the host must arm its shared alarm, so a retried source
 * can repair scheduling too. CloudAgentRuntime owns submit/recovery work.
 */
export function admitCloudAgentTask(
  env: Env,
  storage: DurableObjectStorage,
  accountId: string,
  input: {
    sourceId: string;
    prompt: string;
    displayPrompt?: string;
    images?: ModelMessage["images"];
    hasAttachments?: boolean;
    inputFiles?: CloudTask["inputFiles"];
  },
  context: () => CloudAgentAdmissionContext,
  commit: (task: Readonly<CloudTask>) => undefined,
): { task: CloudTask; created: boolean } {
  if (!input.sourceId || input.sourceId.length > 200)
    throw new AppError("invalid_cloud_source", "云端任务来源标识无效", 422);
  const store = new CloudAgentStore(storage);
  const previous = store.source(input.sourceId);
  if (previous) return { task: previous, created: false };

  // Wallet.daily/reap own their commits. Never wrap them in the task transaction:
  // even an insufficient balance must retain today's repayment of existing debt.
  const current = context();
  return storage.transactionSync(() => {
    const { planUntil, plugin, session, connection } = current;
    const now = Date.now();
    if (!(planUntil > now))
      throw new AppError(
        "cloud_plus_required",
        planUntil > 0
          ? "你的 Plus 已到期，云端 Agent 已暂停。续费后可提交新任务，已有任务记录仍可查看。"
          : "云端 Agent 是 Plus 会员功能，开通后可提交任务。",
        403,
      );
    if (!plugin) throw new AppError("plugin_missing", "云端 Agent 配置已删除", 404);
    if (plugin.pluginId !== CLOUD_AGENT_PLUGIN_ID)
      throw new AppError("plugin_type", "不是云端 Agent 配置", 422);
    if (!plugin.enabled)
      throw new AppError("plugin_disabled", "云端 Agent 已停用，请在插件页面重新启用。", 403);
    if (!connection.enabled)
      throw new AppError("connection_disabled", "微信链接已停用或删除，请重新连接后再试。", 403);
    if (
      !session ||
      session.archived ||
      (session.connectionId && session.connectionId !== connection.id)
    )
      throw new AppError("cloud_session_unavailable", "原会话已不可用，请开始新会话后重试。", 409);
    const config = cloudAgentConfig(env, current.isAdmin);
    if (!config)
      throw new AppError("cloud_agent_unavailable", "云端 Agent 服务尚未就绪，请稍后再试。", 503);
    const model = current.model;
    if (!model?.hasKey || !model.encryptedKey)
      throw new AppError(
        "cloud_model_required",
        "云端 Agent 的执行模型不可用，请检查所用文本模型及渠道的 API Key。",
        422,
      );
    if (new Wallet(storage).balance() <= 0)
      throw new AppError(
        "insufficient_credits",
        "credits 余额需大于 0 才能开始云端任务。请等待每日额度刷新或补充 credits 后重试。",
        402,
      );
    // A stop request cannot replenish today's accepted execution count. Report
    // this blocker before concurrency so users do not cancel work pointlessly.
    if (store.countSince(dayWindow(now).start) >= config.dailyLimit)
      throw new AppError(
        "cloud_agent_daily_limit",
        `今日云端任务次数（${config.dailyLimit} 次）已用完，将于北京时间次日 0 点重置。本次未创建任务。`,
        429,
      );
    if (store.active().length >= config.maxActive)
      throw new AppError(
        "cloud_agent_busy",
        "当前已有云端任务尚未结束，请在云端任务页查看进度，等待结束后再提交。本次未创建任务。",
        429,
      );
    if (!input.prompt.trim())
      throw new AppError("invalid_cloud_prompt", "请发送文字任务，或带微信转写文本的语音。", 422);
    // AGT's job API bounds the complete message, including extracted file text.
    if (input.prompt.length > 50_000)
      throw new AppError(
        "cloud_input_too_long",
        "组装后的任务文字最多 50,000 字符，请拆分文件或缩短要求。本次未创建任务。",
        422,
      );
    if ((input.images?.length ?? 0) > 4)
      throw new AppError("cloud_image_count", "云端任务一次最多处理 4 张图片。", 422);
    const images = (input.images ?? []).map((image) => {
      const data = Buffer.from(image.data, "base64");
      if (!data.length || data.length > 2 * 1024 * 1024)
        throw new AppError(
          "cloud_image_size",
          "云端 Agent 单张图片最大 2 MB，请压缩后重新发送。本次未创建任务。",
          422,
        );
      return { id: `img_${createHash("sha256").update(data).digest("hex")}`, data };
    });
    // Check the irreducible AGT message shape, not just prompt.length: quoted
    // file text expands again inside the serialized context. AGT checks the
    // complete runtime context (including memory/tools) before each model call.
    const requiredContext = [
      ...(model.systemPrompt ? [{ role: "system", content: model.systemPrompt }] : []),
      {
        role: "user",
        content: input.prompt,
        ...(images.length ? { images: images.map(({ id }) => ({ id })) } : {}),
      },
    ];
    if (JSON.stringify(requiredContext).length > CLOUD_AGENT_POLICY_V2.maxContextChars)
      throw new AppError(
        "cloud_input_too_long",
        "任务文字、文件正文和系统提示词超出云端上下文长度上限，请拆分文件或缩短内容。本次未创建任务。",
        422,
      );

    const id = crypto.randomUUID();
    const invocation = pluginInvocationSchema.parse({
      protocolVersion: PLUGIN_PROTOCOL_VERSION,
      runId: id,
      instanceId: plugin.id,
      pluginId: CLOUD_AGENT_PLUGIN_ID,
      pluginVersion: CLOUD_AGENT_VERSION,
      sessionId: session.id,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: input.prompt },
            ...images.map((image) => ({ type: "image", assetId: image.id })),
          ],
        },
      ],
      limits: {
        inputTokens: modelInputBudget(model),
        outputTokens: model.maxOutputTokens,
        outputImages: 4,
        creditUnits: model.maxCredits > 0 ? Math.floor(model.maxCredits * 1000) : null,
      },
    });
    // Reject impossible inputs before reserving an execution or provisioning AGT.
    pluginOutputBudget(invocation);
    const callbackVersion = cloudCallbackVersion(env);
    let callbackOrigin: string;
    try {
      const value = publicSiteUrl(env).replace(/\/+$/, "");
      const url = new URL(value);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (
        url.origin !== value ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
        !/^[a-zA-Z0-9_-]{1,32}$/.test(callbackVersion)
      )
        throw new Error("Invalid callback configuration");
      cloudCallbackSecret(env, accountId, id, callbackVersion);
      callbackOrigin = url.origin;
    } catch {
      throw new AppError(
        "cloud_agent_unavailable",
        "云端 Agent 回调配置尚未就绪，请稍后再试。",
        503,
      );
    }
    const conversation = [
      model.id,
      model.model,
      plugin.id,
      connection.id,
      connection.generation,
      session.id,
      session.resetAt,
      session.contextStart,
    ];
    const task: CloudTask = {
      id,
      sourceId: input.sourceId,
      origin: config.origin,
      appId: config.appId,
      tenantId: config.tenantId,
      profileId: config.agentId,
      model: model.model,
      modelConnection: {
        id: model.id,
        model: model.model,
        protocol: model.protocol,
        baseUrl: model.baseUrl,
        encryptedKey: model.encryptedKey,
        keyContext: model.keyContext,
        systemPrompt: model.systemPrompt,
        contextTokens: model.contextTokens,
        maxInputTokens: modelInputBudget(model),
        maxOutputTokens: model.maxOutputTokens,
      },
      workspaceName: `${config.workspacePrefix}-${accountId.slice(0, 32)}`,
      callbackVersion,
      callbackOrigin,
      invocation,
      request: "",
      submittedAt: 0,
      outcome: null,
      reconcileCursor: "",
      reconcileCandidates: [],
      hidden: 0,
      deliveryStatus: "pending",
      pluginContext: session.pluginInstanceId ?? null,
      currentSessionId: connection.currentSessionId,
      pluginId: plugin.id,
      pluginName: plugin.name,
      sessionId: session.id,
      connectionId: connection.id,
      generation: connection.generation,
      contextStart: session.contextStart,
      resetAt: session.resetAt,
      conversationId: `cloud-${createHash("sha256").update(JSON.stringify(conversation)).digest("hex")}`,
      prompt: input.prompt,
      displayPrompt: input.displayPrompt ?? input.prompt,
      ...(input.inputFiles?.length ? { inputFiles: input.inputFiles } : {}),
      ...(images.length ? { imageIds: images.map((image) => image.id) } : {}),
      ...(input.hasAttachments || images.length ? { hasAttachments: true } : {}),
      idempotencyKey: `wechatai-${crypto.randomUUID()}`,
      state: "submitting",
      upstreamStatus: "",
      jobId: "",
      createdAt: now,
      updatedAt: now,
      deadline: now + config.deadlineMs,
      nextAt: now,
      attempts: 0,
      stopRequested: 0,
      settled: 0,
      stale: 0,
      delivered: 0,
      result: "",
      error: "",
      units: 0,
      frozen: "",
      unconfirmed: 0,
    };
    store.save(task);
    if (images.length) store.saveImages(task.id, images);
    commit(task);
    return { task, created: true };
  });
}
