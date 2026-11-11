import { createHash } from "node:crypto";
import { cloudCallbackSecret, verifyCloudCallback } from "./cloud-agent-callback";
import { cloudAgentScope } from "./cloud-agent-provision";
import type { CloudAgentStore } from "./cloud-agent-store";
import { AppError } from "./config";

export type CloudCallbackReceipt =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 404 | 409 | 413; error: string };

/**
 * Account-side receipt after the outer route validates the routing token and
 * bounds the body stream. Uses the task's frozen key version even when new jobs
 * are disabled. Only identity/hash and a recovery wakeup are persisted: neither
 * callback status nor result can confirm a submission or authorize billing.
 * The host must schedule its shared alarm after every success, including retries.
 */
export function receiveCloudAgentCallback(
  env: Env,
  store: CloudAgentStore,
  accountId: string,
  taskId: string,
  rawBody: string,
  headers: Parameters<typeof verifyCloudCallback>[2],
): CloudCallbackReceipt {
  const task = store.get(taskId);
  if (!task) return { ok: false, status: 404, error: "task_missing" };
  const verified = verifyCloudCallback(
    cloudCallbackSecret(env, accountId, taskId, task.callbackVersion),
    rawBody,
    headers,
  );
  if (!verified.ok) return verified;

  const event = verified.body;
  const provision = store.provision();
  if (
    !provision?.workspaceId ||
    !provision.appUserId ||
    provision.externalId !== `wechatai:${accountId}` ||
    provision.scope !== cloudAgentScope(task) ||
    event.workspaceId !== provision.workspaceId ||
    event.tenantId !== task.tenantId ||
    (event.jobId && event.jobId !== event.callbackJobId) ||
    (event.appId !== undefined && event.appId !== task.appId) ||
    (event.appUserId !== undefined && event.appUserId !== provision.appUserId)
  )
    return { ok: false, status: 409, error: "identity_mismatch" };
  const owner = store.byJobId(event.callbackJobId);
  if ((task.jobId && task.jobId !== event.callbackJobId) || (owner && owner.id !== task.id))
    return { ok: false, status: 409, error: "job_mismatch" };

  try {
    store.receiveCallback(
      verified.deliveryId,
      taskId,
      createHash("sha256").update(rawBody).digest("hex"),
      event.callbackJobId,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "cloud_callback_conflict")
      return { ok: false, status: 409, error: error.code };
    // A storage failure must remain retryable, never acknowledge a lost receipt.
    throw error;
  }
  return { ok: true };
}
