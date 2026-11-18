import type {
  AdminAccountStats,
  AdminGiftInput,
  AdminGiftResult,
  AdminMembership,
} from "../shared/admin";
import { Buffer } from "node:buffer";
import { z } from "zod";
import type { ConnectorUpdateNotice } from "../shared/connector-update";
import { assetDownload, missingAsset, validAssetId } from "./asset-download";
import { callBackend, type BackendPrincipal } from "./backend-client";
import { connectorPresentation } from "./connector-presentation";
import { receiverEnabled } from "./wechat-receiver";
import { backendOrigin, signedUpgrade } from "./backend-signature";
import { AppError } from "./config";
import type { KimiseekCommand } from "./kimiseek";
import contract from "../../backend/contract/contract.json";

type AccountStub = ReturnType<Env["ACCOUNTS"]["get"]>;

type UserAccount = {
  api(action: string, payload?: unknown): Promise<string>;
  kimiseek(command: KimiseekCommand): Promise<string>;
  connectorUpdateNotice(): Promise<ConnectorUpdateNotice | null>;
  readConnectorUpdateNotice(version: string): Promise<boolean>;
  imageAsset(id: string): Promise<Response>;
};

const descriptor = z
  .object({
    mime: z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:[ \t]*;[\x20-\x7e]+)?$/i),
    bytes: z.number().int().nonnegative(),
    name: z.string(),
  })
  .nullable();

type Route = { owner_id: string; account_id: string; location: string; route_epoch: number };

async function lookupRoute(env: Env, key: "owner_id" | "account_id", value: string) {
  return env.DB.prepare(
    `SELECT owner_id,account_id,location,route_epoch FROM account_backend_routes WHERE ${key}=?`,
  )
    .bind(value)
    .first<Route>();
}

function backendConnection(env: Env, route: Route) {
  if (
    route.location !== "go" ||
    route.account_id !== env.ACCOUNTS.idFromName(route.owner_id).toString()
  )
    throw new AppError("account_unavailable", "账户正在迁移，请稍后重试", 503);
  const { WECHATAI_BACKEND_ORIGIN: origin, WECHATAI_RPC_SECRET: secret } = env as Env & {
    WECHATAI_BACKEND_ORIGIN?: string;
    WECHATAI_RPC_SECRET?: string;
  };
  if (!origin || !secret)
    throw new AppError("backend_unavailable", "后端服务暂时不可用，请稍后重试", 503);
  return { origin, secret };
}

function routedCommand(env: Env, route: Route, principal: BackendPrincipal) {
  const { origin, secret } = backendConnection(env, route);
  return (method: string, params: unknown[]) =>
    callBackend(
      origin,
      secret,
      {
        version: contract.protocol,
        accountId: route.account_id,
        ownerId: route.owner_id,
        routeEpoch: route.route_epoch,
        principal,
        method,
        params,
      },
      { referralDB: env.DB },
    );
}

export type AdminGrant = { userId: string; adminUntil: number };

export async function accountForAdmin(env: Env, ownerId: string, grant: AdminGrant) {
  if (!grant.userId || grant.adminUntil <= Date.now())
    throw new AppError("admin_required", "此页面仅对管理员开放", 403);
  const route = await lookupRoute(env, "owner_id", ownerId);
  if (!route) return env.ACCOUNTS.getByName(ownerId);
  const call = routedCommand(env, route, { scope: "admin", ...grant });
  return {
    adminStats: async () => (await call("adminStats", [])) as AdminAccountStats,
    adminMembership: async () => (await call("adminMembership", [])) as AdminMembership,
    adminGiftPlus: async (actor: string, payload: AdminGiftInput) =>
      (await call("adminGiftPlus", [actor, payload])) as AdminGiftResult & { ok: true },
  };
}

export async function applyAccountPayment(
  env: Env,
  ownerId: string,
  event: Parameters<AccountStub["applyPayment"]>[0],
) {
  const route = await lookupRoute(env, "owner_id", ownerId);
  if (!route) return env.ACCOUNTS.getByName(ownerId).applyPayment(event);
  await routedCommand(env, route, { scope: "billing" })("applyPayment", [event]);
}

export async function accountForReferral(env: Env, ownerId: string) {
  const route = await lookupRoute(env, "owner_id", ownerId);
  if (!route) return env.ACCOUNTS.getByName(ownerId);
  const call = routedCommand(env, route, { scope: "referral" });
  return {
    referralWechatIdentity: async () =>
      z
        .string()
        .nullable()
        .parse(await call("referralWechatIdentity", [])),
    applyReferralReward: async (inviteeId: string, role: "inviter" | "invitee") => {
      await call("applyReferralReward", [inviteeId, role]);
    },
  };
}

// Operator authorization and receiver-pool assignment are checked by the HTTP entry.
export async function receiverConnection(env: Env, accountId: string, legacyHeaders: HeadersInit) {
  const route = await lookupRoute(env, "account_id", accountId);
  if (!route)
    return env.ACCOUNTS.get(env.ACCOUNTS.idFromString(accountId)).fetch(
      "https://account.internal/wechat-receiver",
      { headers: legacyHeaders },
    );
  const { origin, secret } = backendConnection(env, route);
  const url = new URL(
    `/internal/v1/receiver/${accountId}/${route.route_epoch}`,
    backendOrigin(origin),
  );
  return fetch(await signedUpgrade(url, secret));
}

export async function receiverStatus(env: Env, accountId: string) {
  const route = await lookupRoute(env, "account_id", accountId);
  if (!route) return env.ACCOUNTS.get(env.ACCOUNTS.idFromString(accountId)).receiverStatus();
  const status = await routedCommand(env, route, { scope: "receiver" })("receiverStatus", []);
  return { ...z.object({}).passthrough().parse(status), enabled: receiverEnabled(env, accountId) };
}

// The public entry authenticates the account and task in the AGT routing token.
export async function receiveAccountCallback(
  env: Env,
  accountId: string,
  taskId: string,
  raw: string,
  headers: { event?: string; delivery?: string; timestamp?: string; signature?: string },
) {
  const route = await lookupRoute(env, "account_id", accountId);
  if (!route)
    return env.ACCOUNTS.get(env.ACCOUNTS.idFromString(accountId)).agtCallback(taskId, raw, headers);
  // A 1 MiB JSON callback must fit the signed 2 MiB RPC envelope even if it
  // consists mostly of quotes or backslashes. Preserve its exact signed bytes.
  const call = routedCommand(env, route, { scope: "cloud_callback" });
  return z
    .discriminatedUnion("ok", [
      z.object({ ok: z.literal(true) }),
      z.object({
        ok: z.literal(false),
        status: z.union([
          z.literal(400),
          z.literal(401),
          z.literal(404),
          z.literal(409),
          z.literal(413),
        ]),
        error: z.string(),
      }),
    ])
    .parse(
      await call("agtCallback", [taskId, Buffer.from(raw, "utf8").toString("base64"), headers]),
    );
}

// Only call this after verifying the signature on the notification token.
export async function accountForNotification(env: Env, accountId: string) {
  const route = await lookupRoute(env, "account_id", accountId);
  if (!route) return env.ACCOUNTS.get(env.ACCOUNTS.idFromString(accountId));
  const call = routedCommand(env, route, { scope: "notification" });
  return {
    notificationCredentialValid: async (plugin: string, credential: string) =>
      z.boolean().parse(await call("notificationCredentialValid", [plugin, credential])),
    notificationRequest: async (
      plugin: string,
      credential: string,
      action: "status" | "send",
      payload: unknown,
      key: string,
    ) =>
      z
        .string()
        .parse(await call("notificationRequest", [plugin, credential, action, payload, key])),
  };
}

export async function accountForUser(
  env: Env,
  ownerId: string,
  identify = false,
): Promise<UserAccount> {
  const route = await lookupRoute(env, "owner_id", ownerId);
  if (!route) {
    const stub = env.ACCOUNTS.getByName(ownerId);
    if (identify) await stub.identify(ownerId);
    return stub;
  }
  const call = routedCommand(env, route, { scope: "user", userId: ownerId });
  return {
    api: async (action, payload = {}) =>
      connectorPresentation(
        action,
        payload,
        z.string().parse(await call("api", [action, payload])),
        env.APP_URL,
      ),
    kimiseek: async (command) => z.string().parse(await call("kimiseek", [command])),
    connectorUpdateNotice: async () =>
      (await call("connectorUpdateNotice", [])) as ConnectorUpdateNotice | null,
    readConnectorUpdateNotice: async (version) =>
      z.boolean().parse(await call("readConnectorUpdateNotice", [version])),
    async imageAsset(id) {
      if (!validAssetId(id)) return new Response("Not found", { status: 404 });
      const lookup = async () => descriptor.parse(await call("imageAsset", [id]));
      if (!(await lookup())) return missingAsset();
      const stored = await env.MEDIA.get(`generated/${route.account_id}/${id}`);
      if (!stored) return missingAsset();
      try {
        // The owner may have cleared this session while R2 was reading the object.
        const fresh = await lookup();
        if (fresh) return assetDownload(id, fresh, stored.body);
      } catch (error) {
        await stored.body.cancel();
        throw error;
      }
      await stored.body.cancel();
      return missingAsset();
    },
  };
}
