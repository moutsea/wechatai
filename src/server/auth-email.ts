import { z } from "zod";
import { APIError } from "better-auth/api";
import { secret } from "./config";

export type AuthEmailKind = "verify" | "reset" | "recover" | "existing";
const loopback = (url: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);

export function authEmailDelivery(env: Env): "preview" | "email" | "unavailable" {
  if (env.AUTH_EMAIL_MODE === "preview") return loopback(env.APP_URL) ? "preview" : "unavailable";
  return env.AUTH_EMAIL_MODE === "cloudflare" &&
    env.AUTH_EMAIL &&
    z.email().safeParse(secret(env, "AUTH_EMAIL_FROM", false)).success
    ? "email"
    : "unavailable";
}

export function assertAuthEmailConfigured(env: Env) {
  if (authEmailDelivery(env) === "unavailable")
    throw new APIError("SERVICE_UNAVAILABLE", {
      code: "EMAIL_SERVICE_UNAVAILABLE",
      message: "邮件服务暂时不可用，请稍后再试。",
    });
}

export async function reserveAuthEmail(
  env: Env,
  email: string,
  now = Date.now(),
): Promise<boolean> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  const key = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const hour = Math.floor(now / 3_600_000);
  const day = Math.floor(now / 86_400_000);
  // One atomic conditional write: 60 seconds between sends, 5/hour, 20/day.
  const row = await env.DB.prepare(`INSERT INTO auth_email_limit
    (email_hash,last_sent_at,hour_start,hour_count,day_start,day_count) VALUES (?,?,?,1,?,1)
    ON CONFLICT(email_hash) DO UPDATE SET
      last_sent_at=excluded.last_sent_at,
      hour_start=excluded.hour_start,
      hour_count=CASE WHEN hour_start=excluded.hour_start THEN hour_count+1 ELSE 1 END,
      day_start=excluded.day_start,
      day_count=CASE WHEN day_start=excluded.day_start THEN day_count+1 ELSE 1 END
    WHERE last_sent_at<=excluded.last_sent_at-60000
      AND (hour_start<>excluded.hour_start OR hour_count<5)
      AND (day_start<>excluded.day_start OR day_count<20)
    RETURNING email_hash`)
    .bind(key, now, hour, day)
    .first();
  return Boolean(row);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function authEmailContent(kind: AuthEmailKind, url: string, name: string) {
  const verify = kind === "verify";
  const recover = kind === "recover";
  const existing = kind === "existing";
  const title = verify
    ? "验证你的邮箱"
    : recover
      ? "确认邮箱并设置密码"
      : existing
        ? "登录你的微伴账号"
        : "重设你的密码";
  const explanation = verify
    ? "点击下方按钮验证邮箱，然后登录你的工作台。"
    : recover
      ? "这个邮箱已有尚未完成验证的注册记录。请通过下方链接重新设置密码，完成邮箱验证。重新注册时填写的密码不会直接覆盖原密码。"
      : existing
        ? "这个邮箱已经注册并完成验证，可以直接登录。如果忘记密码，请在登录页选择「忘记密码」。本次注册请求没有修改你的密码。"
        : "我们收到了重设密码的请求。点击下方按钮设置新密码。";
  const expiry = existing
    ? ""
    : verify
      ? "链接在 1 小时内有效。"
      : "链接在 30 分钟内有效，且只能使用一次。";
  const ignore = "如果不是你本人操作，请忽略这封邮件。";
  return {
    subject: `${title} · ${name}`,
    text: `${name}\n\n${title}\n${explanation}\n\n${url}\n\n${expiry}\n${ignore}`,
    html: `<!doctype html><html lang="zh-CN"><body style="margin:0;padding:32px 16px;background:#f4f7f5;font-family:Arial,sans-serif;color:#12251c"><div style="max-width:480px;margin:auto;background:#fff;border:1px solid #dfe7e2;border-radius:18px;padding:32px"><div style="color:#00894f;font-size:14px;font-weight:700">${escapeHtml(name)}</div><h1 style="font-size:25px;margin:24px 0 12px">${title}</h1><p style="font-size:14px;line-height:1.8;color:#53665c">${explanation}</p><p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;border-radius:9px;background:#00894f;color:#fff;text-decoration:none">${title}</a></p><p style="font-size:13px;color:#53665c">${expiry}</p><p style="font-size:12px;line-height:1.8;color:#6b7a71">按钮无法打开时，请复制以下链接到浏览器：<br><a href="${escapeHtml(url)}" style="color:#00894f;word-break:break-all">${escapeHtml(url)}</a></p><p style="font-size:12px;color:#6b7a71;margin-top:28px">${ignore}</p></div></body></html>`,
  };
}

export async function sendAuthEmail(env: Env, kind: AuthEmailKind, to: string, url: string) {
  assertAuthEmailConfigured(env);
  const target = new URL(url);
  if (
    target.origin !== new URL(env.APP_URL).origin ||
    (kind === "existing" ? target.pathname !== "/login" : !target.pathname.startsWith("/api/auth/"))
  )
    throw new Error("Invalid authentication email URL");
  if (authEmailDelivery(env) === "preview") {
    // Explicit local-only mode. Never log verification/reset tokens in production.
    console.info(JSON.stringify({ event: "auth.email.preview", kind, to, url }));
    return;
  }
  await env.AUTH_EMAIL.send({
    to,
    from: { email: secret(env, "AUTH_EMAIL_FROM"), name: env.APP_NAME },
    ...authEmailContent(kind, url, env.APP_NAME),
  });
}

export function authEmailSender(env: Env, context?: Pick<ExecutionContext, "waitUntil">) {
  return async (kind: AuthEmailKind, to: string, url: string) => {
    assertAuthEmailConfigured(env);
    const sending = sendAuthEmail(env, kind, to, url).catch(() => {
      // Binding errors can contain addresses or message bodies. Keep them out of logs.
      console.error(JSON.stringify({ event: "auth.email.delivery_failed", kind }));
    });
    if (context) context.waitUntil(sending);
    else await sending;
  };
}
