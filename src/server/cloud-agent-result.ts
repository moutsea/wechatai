import { PLUGIN_PROTOCOL_VERSION, type PlatformMeter } from "../shared/plugins";
import { hasCompleteCloudAnswer, type AgentJobView } from "./cloud-agent-client";
import { cloudAgentMeteringFailure } from "./cloud-agent-metering";
import { cloudAgentFailureMessage, cloudAgentRetryMessage } from "./cloud-agent-failure";
import {
  cloudTaskStopReason,
  cloudTaskTerminal,
  type CloudAgentStore,
  type CloudTask,
} from "./cloud-agent-store";
import { AppError } from "./config";
import { invokePlugin } from "./plugins/gateway";
import type { ResolveOutputAsset } from "./plugins/gateway";

type FrozenResult = { text: string; meter: PlatformMeter; truncated: boolean };
export type PreparedCloudAgentResult = {
  state: "completed" | "failed" | "cancelled";
  result: string;
  error: string;
  /** null means no bill, including no input charge. */
  meter: PlatformMeter | null;
  truncated: boolean;
};

function unsuccessful(job: AgentJobView, task: CloudTask): PreparedCloudAgentResult {
  let result = "";
  for (const part of [job.text, job.refusal, job.task?.question]) {
    if (typeof part === "string" && part.trim() && !result.includes(part.trim()))
      result += `${result ? "\n\n" : ""}${part.trim()}`;
  }
  if (job.invalidAttachments) result = "";
  const reason = cloudTaskStopReason(task)
    .replace(/，正在请求停止。?$/, "。")
    .trim();
  const error =
    job.status === "cancelled"
      ? [reason, "云端任务已停止，本次未扣 credits。"].filter(Boolean).join("\n\n")
      : job.status === "failed"
        ? [reason, cloudAgentFailureMessage(job.failureCode, Boolean(task.imageIds?.length))]
            .filter(Boolean)
            .join("\n\n")
        : job.refusal
          ? "云端 Agent 未能完成本次请求，本次未扣 credits。请调整请求后重试。"
          : job.task?.question || job.task?.outcome === "clarification_required"
            ? "任务需要补充信息，本次未扣 credits。请补充后重新发送。"
            : job.task?.outcome === "partial"
              ? "任务只完成了部分工作，本次未扣 credits。"
              : job.finishReason && job.finishReason !== "stop"
                ? "云端未返回完整结果，本次未扣 credits。可缩小任务范围或调整请求后重试。"
                : "云端任务没有返回可用结果，本次未扣 credits。";
  return {
    state: job.status === "cancelled" ? "cancelled" : "failed",
    result: result.slice(0, 64_000),
    error: cloudAgentRetryMessage(
      job.invalidAttachments
        ? "云端返回的文件信息无效或超过限制，本次未扣 credits。请减少文件数量或调整要求后重试；已发生的模型 API 费用以服务商账单为准。"
        : result.length > 64_000
          ? `${error}\n返回内容较长，仅保留前 64,000 字符。`
          : error,
      task,
    ),
    meter: null,
    truncated: result.length > 64_000,
  };
}

/**
 * Prepare only the verified terminal outcome already persisted by the poller.
 * Freeze platform-metered text before settlement; retries reuse it without AGT
 * requests, repricing, or dependence on new-task configuration/eligibility.
 *
 * This helper never completes a task or charges a wallet. The host must reread
 * terminal/hidden state and atomically commit billing, history and reply work
 * after awaiting it. null means the task is already terminal or has no outcome.
 */
export async function prepareCloudAgentResult(
  store: CloudAgentStore,
  taskId: string,
  resolveAsset?: ResolveOutputAsset,
): Promise<PreparedCloudAgentResult | null> {
  const current = () => {
    const task = store.get(taskId);
    if (!task) throw new AppError("cloud_task_missing", "云端任务不存在", 404);
    return task;
  };
  let task = current();
  if (cloudTaskTerminal(task.state) || !task.outcome) return null;
  const job = task.outcome;
  if (!["completed", "failed", "cancelled"].includes(job.status))
    throw new AppError("cloud_outcome_pending", "云端任务尚未结束，暂缓结算", 503);
  const hidden = (): PreparedCloudAgentResult => ({
    state:
      job.status === "completed"
        ? "completed"
        : job.status === "cancelled"
          ? "cancelled"
          : "failed",
    result: "",
    error: "",
    meter: null,
    truncated: false,
  });
  if (task.hidden) return hidden();
  if (task.fileCancelled)
    return {
      state: "cancelled",
      result: "",
      error: cloudAgentRetryMessage(
        "已取消生成文件的接收，本次未扣 credits；已发生的模型 API 费用以服务商账单为准。",
        task,
      ),
      meter: null,
      truncated: false,
    };
  if (task.fileError)
    return {
      state: "failed",
      result: "",
      error: cloudAgentRetryMessage(task.fileError, task),
      meter: null,
      truncated: false,
    };
  if (!hasCompleteCloudAnswer(job)) return unsuccessful(job, task);
  if (job.attachments?.length && task.outputFiles?.length !== job.attachments.length)
    throw new AppError("cloud_files_pending", "生成文件尚未保存，暂缓结算。", 503);
  if (!task.frozen) {
    const invocation = task.invocation;
    if (!invocation || invocation.runId !== task.id)
      throw new AppError("cloud_invocation_missing", "原始云端调用记录缺失或不匹配，暂缓结算", 503);
    let frozen: FrozenResult | null = null;
    let failure = "";
    try {
      // The adapter returns only the verified result. It never re-executes AGT
      // and does not forward upstream usage or internal model/tool consumption.
      const outcome = await invokePlugin(
        invocation,
        async (request) => ({
          protocolVersion: PLUGIN_PROTOCOL_VERSION,
          runId: request.runId,
          status: "completed",
          content: [
            { type: "text", text: job.text ?? "" },
            ...(task.outputFiles ?? []).map((file) => ({
              type: file.mime.startsWith("image/") ? "image" : "file",
              assetId: file.id,
            })),
          ],
        }),
        resolveAsset,
      );
      frozen = {
        text: outcome.result.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join(""),
        meter: outcome.meter,
        truncated: outcome.truncated,
      };
    } catch (error) {
      const message = cloudAgentMeteringFailure(error);
      if (!message) throw error;
      failure = message;
    }
    task = current();
    if (cloudTaskTerminal(task.state)) return null;
    if (task.hidden) return hidden();
    // A concurrent preparation may already have frozen the result. The first
    // durable snapshot wins; never replace it with a fresh calculation.
    if (!task.frozen) {
      if (!frozen)
        return {
          state: "failed",
          result: "",
          error: cloudAgentRetryMessage(failure, task),
          meter: null,
          truncated: false,
        };
      task = store.patch(task, { frozen: JSON.stringify(frozen) });
    }
  }
  const frozen = JSON.parse(task.frozen) as FrozenResult;
  return {
    state: "completed",
    result: frozen.text,
    error: frozen.truncated
      ? "结果超过本次输出或 credits 上限，已截取；按本次输入和截取后结果计费。"
      : "",
    meter: frozen.meter,
    truncated: frozen.truncated,
  };
}
