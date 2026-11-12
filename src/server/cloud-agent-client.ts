import { AppError } from "./config";
import { readJson } from "./security";
import { cloudAgentFailureCode, type CloudAgentFailureCode } from "./cloud-agent-failure";
import { createHash } from "node:crypto";

export type CloudAgentClientConfig = {
  origin: string;
  appId: string;
  appKey: string;
  tenantId: string;
  agentId: string;
  model?: string;
};

/** The subset of an AGT job this integration reads. Unknown fields are ignored. */
export type AgentJobView = {
  id: string;
  status: (typeof JOB_STATUSES)[number];
  workspaceId: string;
  conversationId?: string;
  tenantId?: string;
  appId?: string;
  appUserId?: string;
  usage?: Record<string, unknown>;
  text?: string;
  finishReason?: (typeof FINISH_REASONS)[number];
  refusal?: string;
  failureCode?: CloudAgentFailureCode;
  task?: Record<string, unknown>;
  attachments?: { path: string; name: string; contentType: string; size: number }[];
  invalidAttachments?: true;
};

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 2_000_000;

/** Stable content-addressed workspace copy, also usable by sandbox_compute. */
export const cloudImagePath = (id: string) => `attachments/images/${id}`;

// Version this policy together with config.agentId; never edit a deployed profile in place.
export const CLOUD_AGENT_POLICY_V2 = {
  maxSteps: 12,
  maxToolCalls: 24,
  maxConcurrentJobs: 1,
  maxContextChars: 60_000,
  modelTimeoutMs: 120_000,
  toolTimeoutMs: 60_000,
  compactionMode: "off",
  conversationHistoryMessages: 40,
  skillLearningMode: "off",
  allowTools: [
    "memory_search",
    "remember_memory",
    "read_file",
    "write_file",
    "list_files",
    "sandbox_compute",
    "return_file",
  ],
} as const;

export function cloudJobBody(input: {
  workspaceId: string;
  agentId: string;
  model: string;
  conversationId: string;
  message: string;
  systemPrompt?: string;
  images?: { id: string }[];
  callback: { url: string; secret: string };
}) {
  return {
    ...input,
    skillLearningMode: "off",
    policy: CLOUD_AGENT_POLICY_V2,
    callback: { ...input.callback, includeResult: false },
  };
}

/**
 * Server-only AGT client. The origin is fixed by configuration and every path is
 * built here, so neither a message nor a client request can name a different
 * host, workspace or tenant. Callers pass the already-mapped workspace.
 */
export class CloudAgentClient {
  private config: CloudAgentClientConfig;

  constructor(config: CloudAgentClientConfig) {
    let origin: URL;
    try {
      origin = new URL(config.origin);
    } catch {
      throw new AppError("cloud_agent_config", "云端 Agent 服务地址无效", 503);
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (
      origin.origin !== config.origin.replace(/\/+$/, "") ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback))
    )
      throw new AppError("cloud_agent_config", "云端 Agent 服务地址无效", 503);
    this.config = { ...config, origin: origin.origin };
  }

  private async call(
    method: "GET" | "POST" | "PATCH" | "PUT",
    path: string,
    options: {
      body?: unknown;
      rawBody?: string | ArrayBuffer;
      contentType?: string;
      timeoutMs?: number;
      externalId?: string;
      idempotencyKey?: string;
      acceptStatuses?: number[];
    } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.config.appKey}`,
      accept: "application/json",
    };
    if (options.body !== undefined || options.rawBody !== undefined)
      headers["content-type"] = options.contentType ?? "application/json";
    // AGT resolves `X-App-User` against the registered external id, never the internal id.
    if (options.externalId) headers["x-app-user"] = options.externalId;
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    let response: Response;
    try {
      response = await fetch(`${this.config.origin}${path}`, {
        method,
        headers,
        ...(method !== "GET"
          ? {
              body:
                options.rawBody ??
                (options.body === undefined ? undefined : JSON.stringify(options.body)),
            }
          : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      throw new AppError(
        "cloud_agent_unreachable",
        "云端 Agent 暂时无法连接。",
        ["TimeoutError", "AbortError"].includes(name) ? 504 : 502,
      );
    }
    if (!response.ok) {
      // Never log or expose provider bodies: they can echo messages and secrets.
      await response.body?.cancel();
      throw new AppError(
        response.status === 409 ? "cloud_agent_conflict" : "cloud_agent_failed",
        `云端 Agent 请求失败（${response.status}）。`,
        response.status === 429 ? 429 : 502,
        response.status,
      );
    }
    if (options.acceptStatuses && !options.acceptStatuses.includes(response.status)) {
      await response.body?.cancel();
      throw new AppError("cloud_agent_response", "云端 Agent 返回了意外状态", 502);
    }
    return readJson(response, MAX_RESPONSE_BYTES);
  }

  private json(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new AppError("cloud_agent_response", "云端 Agent 返回格式无效", 502);
    return payload as Record<string, unknown>;
  }

  async modelChannels(): Promise<{ id: string; name: string }[]> {
    const body = this.json(
      await this.call("GET", `/api/apps/${encodeURIComponent(this.config.appId)}/model-channels`),
    );
    if (!Array.isArray(body.channels))
      throw new AppError("cloud_agent_response", "云端模型渠道返回格式无效", 502);
    return body.channels.map((value) => {
      const channel = this.json(value);
      if (typeof channel.id !== "string" || typeof channel.name !== "string")
        throw new AppError("cloud_agent_response", "云端模型渠道返回格式无效", 502);
      return { id: channel.id, name: channel.name };
    });
  }

  /** AGT deduplicates immutable image bytes inside this app user's workspace. */
  async uploadImage(workspaceId: string, data: Uint8Array, externalId: string): Promise<string> {
    const body = this.json(
      await this.call("POST", `/api/workspaces/${encodeURIComponent(workspaceId)}/images`, {
        rawBody: Uint8Array.from(data).buffer,
        contentType: "application/octet-stream",
        externalId,
        acceptStatuses: [200, 201],
        timeoutMs: 15_000,
      }),
    );
    const expected = `img_${createHash("sha256").update(data).digest("hex")}`;
    if (body.id !== expected || body.size !== data.byteLength)
      throw new AppError("cloud_image_identity", "云端图片校验失败，请稍后重试。", 502);
    return expected;
  }

  async uploadFile(
    workspaceId: string,
    path: string,
    data: string | Uint8Array,
    externalId: string,
  ) {
    await this.call(
      "PUT",
      `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${path.split("/").map(encodeURIComponent).join("/")}`,
      {
        rawBody: typeof data === "string" ? data : Uint8Array.from(data).buffer,
        contentType:
          typeof data === "string" ? "text/plain; charset=utf-8" : "application/octet-stream",
        externalId,
      },
    );
  }

  async downloadFile(
    workspaceId: string,
    attachment: NonNullable<AgentJobView["attachments"]>[number],
    externalId: string,
  ) {
    const response = await fetch(
      `${this.config.origin}/api/workspaces/${encodeURIComponent(workspaceId)}/files/${attachment.path.slice(1).split("/").map(encodeURIComponent).join("/")}`,
      {
        headers: { authorization: `Bearer ${this.config.appKey}`, "x-app-user": externalId },
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      if ([404, 410].includes(response.status))
        throw new AppError("cloud_file_missing", "云端生成文件已不存在。", 502);
      if (response.status < 500 && ![408, 425, 429].includes(response.status))
        throw new AppError(
          "cloud_file_rejected",
          "云端文件读取被拒绝，请联系运营方检查文件访问权限。",
          502,
        );
      throw new AppError("cloud_file_unavailable", "生成文件暂时无法读取，正在重试。", 502);
    }
    if (Number(response.headers.get("content-length")) > 16 * 1024 * 1024) {
      await response.body?.cancel();
      throw new AppError("cloud_file_size", "生成文件超过 16 MB。", 502);
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16 * 1024 * 1024) {
            await reader.cancel();
            throw new AppError("cloud_file_size", "生成文件超过 16 MB。", 502);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    const data = Buffer.concat(chunks);
    if (
      data.length !== attachment.size ||
      createHash("sha256").update(data).digest("hex") !== attachment.path.split("/").at(-1)
    )
      throw new AppError("cloud_file_identity", "生成文件校验失败，暂缓结算。", 502);
    return data;
  }

  async saveModelChannel(body: unknown, id?: string): Promise<string> {
    const path = `/api/apps/${encodeURIComponent(this.config.appId)}/model-channels`;
    const result = this.json(
      await this.call(id ? "PATCH" : "POST", id ? `${path}/${encodeURIComponent(id)}` : path, {
        body,
      }),
    );
    const channel = this.json(result.channel);
    if (
      typeof channel.id !== "string" ||
      !/^mch_[a-f0-9]{32}$/.test(channel.id) ||
      (id && channel.id !== id)
    )
      throw new AppError("cloud_agent_response", "云端模型渠道标识无效", 502);
    return channel.id;
  }

  /** Idempotent on (app, externalId) inside AGT; re-registering returns the same user. */
  async ensureAppUser(externalId: string): Promise<string> {
    const body = this.json(
      await this.call("POST", `/api/apps/${encodeURIComponent(this.config.appId)}/users`, {
        body: { externalId },
        acceptStatuses: [200, 201],
      }),
    );
    const appUser = this.json(body.appUser);
    const id = typeof appUser.id === "string" ? appUser.id : "";
    if (!id) throw new AppError("cloud_agent_response", "云端 Agent 未返回应用用户", 502);
    if (
      appUser.appId !== this.config.appId ||
      appUser.tenantId !== this.config.tenantId ||
      appUser.externalId !== externalId
    )
      throw new AppError(
        "cloud_agent_identity",
        "云端应用用户归属校验失败，请运营方检查应用、tenant 与凭据配置。",
        502,
      );
    return id;
  }

  /** `ensure` reuses an identically named restricted workspace created by this owner. */
  async ensureWorkspace(name: string): Promise<string> {
    const body = this.json(
      await this.call("POST", "/api/workspaces/ensure", {
        body: { name, accessMode: "restricted" },
        acceptStatuses: [200, 201],
      }),
    );
    const workspace = this.json(body.workspace);
    const id = typeof workspace.id === "string" ? workspace.id : "";
    if (!id) throw new AppError("cloud_agent_response", "云端 Agent 未返回工作区", 502);
    if (
      workspace.tenantId !== this.config.tenantId ||
      workspace.name !== name ||
      workspace.accessMode !== "restricted"
    )
      throw new AppError(
        "cloud_agent_identity",
        "云端工作区归属或隔离设置校验失败，请运营方检查 AGT 配置。",
        502,
      );
    return id;
  }

  /**
   * A fixed, versioned profile keeps every job's limits identical. The policy
   * closes delegation, scheduling and self-installed tools for the first version.
   */
  async configureAgent(workspaceId: string): Promise<void> {
    await this.call(
      "POST",
      `/api/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(this.config.agentId)}`,
      {
        body: {
          id: this.config.agentId,
          name: "微伴云端 Agent",
          description: "由微伴托管的通用助手",
          enabled: true,
          model: this.config.model,
          tags: ["wechatai"],
          policy: CLOUD_AGENT_POLICY_V2,
          systemPrompt:
            "你是微伴云端 Agent。用户上传的文件正文会随任务提供，提取的文字也会保存为任务列出的 UTF-8 工作区文件。图片同时提供视觉输入及任务列出的原始图片工作区路径；转换、裁剪或插入 PDF 时，将这些路径放入 sandbox_compute 的 inputFiles，使用 Pillow 读取图片，不要用 read_file 把图片当作文本读取。用户要求转换或生成文件时，直接用 read_file、write_file 和 sandbox_compute 完成，再用 return_file 把实际存在的产物交给微伴，微伴会发送文件到当前微信并提供下载。不要要求用户重贴已提供的正文或重新上传图片，不要用手动转换教程代替可完成的文件任务；工具失败时如实说明。生成 PDF 可用 Python ReportLab，中文字体 /usr/share/fonts/truetype/wqy/wqy-zenhei.ttc。每次最多返回 4 个文件；隔离计算生成的文件每个不超过 2 MiB。返回图片请使用 PNG、JPEG、WebP、GIF 或 SVG。输出文件保存到 /outbound/ 下；sandbox_compute 中使用相对路径，声明 inputFiles 与 outputFiles。只有 return_file 成功后才说明文件已生成，避免承诺尚未发生的微信投递。",
          delegation: {
            visibility: "private",
            allowFrom: [],
            allowFromWorkspaces: [],
            allowFromTenants: [],
          },
          sessionAccess: { visibility: "self", sendTo: [] },
        },
      },
    );
  }

  async submit(rawBody: string, externalId: string, idempotencyKey: string): Promise<AgentJobView> {
    return parseJob(
      await this.call("POST", "/api/agent/jobs", {
        rawBody,
        externalId,
        idempotencyKey,
        acceptStatuses: [200, 202],
      }),
    );
  }

  async getJob(workspaceId: string, jobId: string, externalId: string): Promise<AgentJobView> {
    return parseJob(
      this.json(
        await this.call(
          "GET",
          `/api/agent/${encodeURIComponent(workspaceId)}/jobs/${encodeURIComponent(jobId)}`,
          { externalId },
        ),
      ),
    );
  }

  async cancelJob(workspaceId: string, jobId: string, externalId: string): Promise<boolean> {
    const body = this.json(
      await this.call(
        "POST",
        `/api/agent/${encodeURIComponent(workspaceId)}/jobs/${encodeURIComponent(jobId)}/cancel`,
        { externalId },
      ),
    );
    return body.cancelled === true;
  }

  /** Each call reads one page; the caller persists the continuation cursor. */
  async listJobs(
    workspaceId: string,
    externalId: string,
    after?: string,
  ): Promise<{ jobs: AgentJobView[]; hasMore: boolean; nextCursor?: string }> {
    const body = this.json(
      await this.call(
        "GET",
        `/api/agent/${encodeURIComponent(workspaceId)}/jobs?page=1${after ? `&after=${encodeURIComponent(after)}` : ""}`,
        {
          externalId,
        },
      ),
    );
    if (
      !Array.isArray(body.jobs) ||
      typeof body.hasMore !== "boolean" ||
      (body.hasMore && (typeof body.nextCursor !== "string" || !body.nextCursor))
    )
      throw new AppError("cloud_agent_response", "云端 Agent 返回的任务列表格式无效", 502);
    const jobs = body.jobs.map((job) => parseJob(job));
    return {
      jobs,
      hasMore: body.hasMore === true,
      nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : undefined,
    };
  }
}

const JOB_STATUSES = [
  "queued",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
] as const;

const FINISH_REASONS = [
  "stop",
  "tool_calls",
  "length",
  "content_filter",
  "error",
  "unknown",
] as const;

/** A completed job can still contain truncated output, a refusal or a clarification. */
export function hasCompleteCloudAnswer(
  job: AgentJobView,
): job is AgentJobView & { status: "completed" } {
  return (
    job.status === "completed" &&
    (!!job.text?.trim() || !!job.attachments?.length) &&
    !job.invalidAttachments &&
    !job.refusal &&
    // Older AGT model adapters do not return a finish reason.
    (job.finishReason === undefined || job.finishReason === "stop") &&
    !job.task?.question &&
    job.task?.outcome !== "clarification_required" &&
    job.task?.outcome !== "partial"
  );
}

export function parseJob(payload: unknown): AgentJobView {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new AppError("cloud_agent_response", "云端 Agent 返回的任务格式无效", 502);
  const job = payload as Record<string, unknown>;
  const id = typeof job.id === "string" ? job.id : "";
  const status = JOB_STATUSES.find((s) => s === job.status);
  const workspaceId = typeof job.workspaceId === "string" ? job.workspaceId : "";
  if (!id || !status || !workspaceId)
    throw new AppError("cloud_agent_response", "云端 Agent 返回的任务格式无效", 502);
  const result = job.result as Record<string, unknown> | undefined;
  const text = result && typeof result.text === "string" ? result.text : undefined;
  const finishReason =
    result?.finishReason == null
      ? undefined
      : (FINISH_REASONS.find((reason) => reason === result.finishReason) ?? "unknown");
  const failureCode = status === "failed" ? cloudAgentFailureCode(job) : undefined;
  let attachments: AgentJobView["attachments"];
  let invalidAttachments = false;
  if (result?.attachments !== undefined) {
    try {
      attachments = parseAttachments(result.attachments);
    } catch {
      invalidAttachments = true;
    }
  }
  return {
    id,
    status,
    workspaceId,
    ...(typeof job.tenantId === "string" ? { tenantId: job.tenantId } : {}),
    ...(typeof job.appId === "string" ? { appId: job.appId } : {}),
    ...(typeof job.appUserId === "string" ? { appUserId: job.appUserId } : {}),
    ...(result?.usage && typeof result.usage === "object"
      ? { usage: result.usage as Record<string, unknown> }
      : {}),
    ...(typeof job.conversationId === "string" ? { conversationId: job.conversationId } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(attachments?.length ? { attachments } : {}),
    ...(invalidAttachments ? { invalidAttachments: true as const } : {}),
    ...(finishReason !== undefined ? { finishReason } : {}),
    ...(failureCode ? { failureCode } : {}),
    ...(typeof result?.refusal === "string" ? { refusal: result.refusal } : {}),
    ...(result && result.task && typeof result.task === "object"
      ? { task: result.task as Record<string, unknown> }
      : {}),
  };
}

function parseAttachments(value: unknown): NonNullable<AgentJobView["attachments"]> {
  if (!Array.isArray(value) || value.length > 4)
    throw new AppError("cloud_agent_response", "云端文件列表无效或超过 4 个。", 502);
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !/^\/outbound\/results\/[a-f0-9]{64}$/.test(item.path) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 160 ||
      // Reject untrusted names before persisting or creating download headers.
      // eslint-disable-next-line no-control-regex
      /[\\/\x00-\x1f\x7f]/.test(item.name) ||
      typeof item.contentType !== "string" ||
      !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(item.contentType) ||
      !Number.isSafeInteger(item.size) ||
      item.size < 1 ||
      item.size > 16 * 1024 * 1024
    )
      throw new AppError("cloud_agent_response", "云端返回了无效的文件信息。", 502);
    return { path: item.path, name: item.name, contentType: item.contentType, size: item.size };
  });
}
