import { forwardBackendExecution } from "./backend-executor";
import { backendOrigin, signedRequest } from "./backend-signature";
import { z } from "zod";
import { referralRecipient } from "./referral-reward";
import { openClawRelease } from "../shared/openclaw-release";
import contract from "../../backend/contract/contract.json";
import { AppError } from "./config";

const encoder = new TextEncoder();
const commandSchema = z
  .object({
    version: z.literal(contract.protocol),
    accountId: z.string().regex(/^[a-f0-9]{64}$/),
    ownerId: z.string().max(128).optional(),
    routeEpoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    principal: z
      .object({
        scope: z.enum([
          "user",
          "admin",
          "billing",
          "connector",
          "receiver",
          "executor",
          "notification",
          "cloud_callback",
          "referral",
          "migration",
        ]),
        userId: z.string().max(128).optional(),
        adminUntil: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
      })
      .strict(),
    method: z
      .string()
      .refine((method) => contract.methods.includes(method) || method === "imageAsset"),
    params: z.array(z.unknown()),
  })
  .strict();

export type BackendCommand = z.infer<typeof commandSchema>;
export type BackendPrincipal = BackendCommand["principal"];
export type BackendTarget = Pick<BackendCommand, "accountId" | "ownerId" | "routeEpoch">;

function validateIdentity(command: BackendCommand) {
  const { scope, userId } = command.principal;
  if (
    (["user", "admin"].includes(scope) && !userId) ||
    (["user", "admin", "billing", "migration", "referral"].includes(scope) && !command.ownerId) ||
    (scope === "user" && userId !== command.ownerId)
  )
    throw new Error("Invalid trusted backend identity");
}

// Only server code constructs commands from authenticated identities and trusted
// routing records. Never sign an incoming browser-provided command wholesale.
export async function backendRequest(
  origin: string,
  secret: string,
  input: BackendCommand,
  options: {
    now?: number;
    requestId?: string;
    signal?: AbortSignal;
    referralDB?: D1Database;
  } = {},
) {
  const command = commandSchema.parse(input);
  validateIdentity(command);
  if (command.method === "applyReferralReward") {
    const [inviteeId, role] = command.params;
    if (
      !options.referralDB ||
      command.principal.scope !== "referral" ||
      command.params.length !== 2 ||
      typeof inviteeId !== "string" ||
      !inviteeId ||
      (role !== "invitee" && role !== "inviter")
    )
      throw new AppError("invalid_referral", "邀请奖励缺少可核对的资格", 403);
    const recipient = await referralRecipient(options.referralDB, inviteeId, role);
    if (recipient.owner !== command.ownerId)
      throw new AppError("invalid_referral", "邀请奖励收款账户不匹配", 403);
    command.params = [inviteeId, role, recipient.inviterId];
  }
  const url = new URL("/internal/v1/commands", backendOrigin(origin));
  // Only the deployed edge knows which installer it currently serves.
  const notice =
    command.method === "connectorUpdateNotice" || command.method === "readConnectorUpdateNotice";
  // A stale tab must still pass backend authorization. An empty release can
  // never match a published installer, including on an older Go binary.
  if (
    command.method === "readConnectorUpdateNotice" &&
    command.params.length === 1 &&
    typeof command.params[0] === "string" &&
    command.params[0] !== openClawRelease.version
  )
    command.params = [""];
  const body = JSON.stringify(
    notice ? { ...command, connectorRelease: openClawRelease.version } : command,
  );
  const bytes = encoder.encode(body);
  if (bytes.byteLength > contract.limits.commandBytes)
    throw new AppError("body_too_large", "内部请求内容过大", 413);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
  return signedRequest(url, secret, hash, bytes, options);
}

async function boundedJSON(response: Response, max = contract.limits.commandBytes) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing backend response");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw new Error("Backend response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

const envelope = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.string().max(100),
    message: z.string().max(1000),
    status: z.number().int().min(400).max(599),
  }),
]);

export async function callBackend(
  origin: string,
  secret: string,
  command: BackendCommand,
  options: { signal?: AbortSignal; transport?: typeof fetch; referralDB?: D1Database } = {},
): Promise<unknown> {
  // No transparent retries: payment/job IDs, not HTTP request IDs, authorize
  // replay. A timeout after an external effect must retain its unknown outcome.
  const timeout = AbortSignal.timeout(30_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  try {
    if (command.method === "executionRequest" && command.principal.scope === "executor") {
      const [action, payload] = command.params;
      if (action === "claim" || action === "complete") {
        commandSchema.parse(command);
        if (command.params.length !== 2 || payload === undefined)
          throw new AppError("invalid_request", "执行器参数无效", 400);
        const response = await forwardBackendExecution(
          origin,
          secret,
          command,
          action,
          Response.json(payload).body!,
          { signal, transport: options.transport },
        );
        if (!response.ok) {
          const result = envelope.parse(await boundedJSON(response));
          if (!result.ok && result.status === response.status)
            throw new AppError(result.error, result.message, result.status);
          throw new Error("Invalid executor response");
        }
        // The response includes the claim metadata around a full-size input.
        const result = await boundedJSON(
          response,
          contract.limits.executionBytes + contract.limits.commandBytes,
        );
        return z.object({ data: z.unknown() }).parse(result).data;
      }
    }
    const request = await backendRequest(origin, secret, command, {
      signal,
      referralDB: options.referralDB,
    });
    const response = await (options.transport ?? fetch)(request);
    const result = envelope.parse(await boundedJSON(response));
    if (!result.ok) {
      if (response.status !== result.status) throw new Error("Inconsistent backend status");
      throw new AppError(result.error, result.message, result.status);
    }
    if (!response.ok) throw new Error("Invalid backend success status");
    // An older Go binary may still derive the release from its build.
    if (
      command.method === "connectorUpdateNotice" &&
      result.data != null &&
      (result.data as { version?: unknown }).version !== openClawRelease.version
    )
      return null;
    return result.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("backend_unavailable", "后端服务暂时不可用，请稍后重试", 503);
  }
}
