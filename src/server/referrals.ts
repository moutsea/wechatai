import { parseSigned, serializeSigned } from "hono/utils/cookie";
import { secret } from "./config";
import { REFERRAL_CREDITS, type ReferralStatus, type ReferralSummary } from "../shared/referrals";

const COOKIE = "wechatai_referral";
const WINDOW_MS = 30 * 86400000;
const validCode = (code: string) => /^[a-f0-9]{32}$/.test(code);
export type ReferralRow = {
  invitee_id: string;
  inviter_id: string;
  status: ReferralStatus;
};

async function cookieCode(env: Env, cookie: string) {
  const signed = await parseSigned(cookie, secret(env, "BETTER_AUTH_SECRET"), COOKIE);
  const value = signed[COOKIE];
  if (typeof value !== "string") return null;
  const [code, expiry] = value.split(":");
  return validCode(code) && Number(expiry) > Date.now() && Number(expiry) <= Date.now() + WINDOW_MS
    ? code
    : null;
}

export async function registrationReferrer(env: Env, headers?: Headers) {
  const code = await cookieCode(env, headers?.get("cookie") || "");
  if (!code) return null;
  const row = await env.DB.prepare("SELECT user_id FROM referral_code WHERE code = ?")
    .bind(code)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function acceptReferral(env: Env, code: string, request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  const exists =
    validCode(code) &&
    (await env.DB.prepare("SELECT user_id FROM referral_code WHERE code = ?").bind(code).first());
  headers.set("Location", `${env.APP_URL}/register?invitation=${exists ? "accepted" : "invalid"}`);
  // First valid invitation wins for 30 days, including the trip through an OAuth provider.
  if (exists && !(await cookieCode(env, request.headers.get("cookie") || ""))) {
    headers.append(
      "Set-Cookie",
      await serializeSigned(
        COOKIE,
        `${code}:${Date.now() + WINDOW_MS}`,
        secret(env, "BETTER_AUTH_SECRET"),
        {
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure: env.APP_URL.startsWith("https:"),
          maxAge: WINDOW_MS / 1000,
        },
      ),
    );
  }
  return new Response(null, { status: 303, headers });
}

export async function wechatIdentityHash(userId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`wechatai:referral:${userId}`),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function claimWechatIdentity(env: Env, userId: string, hash: string) {
  await env.DB.prepare("INSERT OR IGNORE INTO referral_wechat_identity VALUES (?, ?, ?)")
    .bind(hash, userId, Date.now())
    .run();
  const claim = await env.DB.prepare(
    "SELECT user_id FROM referral_wechat_identity WHERE identity_hash = ?",
  )
    .bind(hash)
    .first<{ user_id: string }>();
  return claim?.user_id === userId;
}

export async function qualifyReferral(env: Env, userId: string, hash: string) {
  const owner = await claimWechatIdentity(env, userId, hash);
  let row = await env.DB.prepare(
    "SELECT invitee_id, inviter_id, status FROM referral WHERE invitee_id = ?",
  )
    .bind(userId)
    .first<ReferralRow>();
  if (!row || row.status !== "pending") return row;
  const inviterHash = await env.ACCOUNTS.getByName(row.inviter_id).referralWechatIdentity();
  const eligible = owner && inviterHash !== hash && row.inviter_id !== userId;
  await env.DB.prepare(
    "UPDATE referral SET status = ?, qualified_at = ?, reason = ? WHERE invitee_id = ? AND status = 'pending'",
  )
    .bind(
      eligible ? "qualified" : "ineligible",
      eligible ? Date.now() : null,
      eligible ? null : "wechat_already_used",
      userId,
    )
    .run();
  row = await env.DB.prepare(
    "SELECT invitee_id, inviter_id, status FROM referral WHERE invitee_id = ?",
  )
    .bind(userId)
    .first<ReferralRow>();
  return row;
}

export async function referralSummary(env: Env, userId: string): Promise<ReferralSummary> {
  await env.DB.prepare("INSERT OR IGNORE INTO referral_code VALUES (?, ?, ?)")
    .bind(userId, crypto.randomUUID().replaceAll("-", ""), Date.now())
    .run();
  const code = await env.DB.prepare("SELECT code FROM referral_code WHERE user_id = ?")
    .bind(userId)
    .first<{ code: string }>();
  const account = env.ACCOUNTS.getByName(userId);
  const hash = await account.referralWechatIdentity();
  if (hash) await claimWechatIdentity(env, userId, hash);
  const stats = await env.DB.prepare(
    "SELECT COUNT(*) AS registered, COALESCE(SUM(status = 'rewarded'), 0) AS completed FROM referral WHERE inviter_id = ?",
  )
    .bind(userId)
    .first<{ registered: number; completed: number }>();
  const received = await env.DB.prepare("SELECT status FROM referral WHERE invitee_id = ?")
    .bind(userId)
    .first<{ status: ReferralStatus }>();
  const recent = await env.DB.prepare(
    "SELECT r.invitee_id AS id, u.name, r.status, r.created_at AS createdAt FROM referral r JOIN user u ON u.id = r.invitee_id WHERE r.inviter_id = ? ORDER BY r.created_at DESC, r.invitee_id LIMIT 30",
  )
    .bind(userId)
    .all<{ id: string; name: string; status: ReferralStatus; createdAt: number }>();
  return {
    url: `${env.APP_URL}/invite/${code!.code}`,
    reward: REFERRAL_CREDITS,
    registered: stats!.registered,
    completed: stats!.completed,
    earned:
      stats!.completed * REFERRAL_CREDITS +
      (received?.status === "rewarded" ? REFERRAL_CREDITS : 0),
    received: received?.status ?? null,
    recent: recent.results.map((row) => ({
      ...row,
      name: `${Array.from(row.name)[0] || "好"}***`,
    })),
  };
}
