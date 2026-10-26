// Authentication foundation adapted from AgentFlowing (MIT); see licenses/agentflowing.txt.
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { z } from "zod";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { secret, trustedAppOrigins } from "./config";
import { registrationReferrer } from "./referrals";
import { authEmailSender } from "./auth-email";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../shared/auth";
import { authReturnPath } from "../shared/auth";
import { ANALYTICS_SESSION_HEADER } from "../shared/analytics";
import { analyticsSessionIdSchema } from "../shared/analytics-schema";
import { recordServerFunnelEvent, recordSignupConversion } from "./analytics";
import {
  issuePasswordRecovery,
  passwordRecoveryRequired,
  recoveryReturnTo,
  requirePasswordRecovery,
  resetPasswordAtomically,
} from "./auth-recovery";
const dates = () => ({
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});
const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  referrerId: text("referrerId"),
  ...dates(),
});
const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  ...dates(),
});
const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  ...dates(),
});
const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  ...dates(),
});
function socialProviders(env: Env) {
  const googleId = secret(env, "GOOGLE_CLIENT_ID", false);
  const googleSecret = secret(env, "GOOGLE_CLIENT_SECRET", false);
  const githubId = secret(env, "GITHUB_CLIENT_ID", false);
  const githubSecret = secret(env, "GITHUB_CLIENT_SECRET", false);
  return {
    google:
      googleId && googleSecret
        ? { clientId: googleId, clientSecret: googleSecret, prompt: "select_account" as const }
        : undefined,
    github:
      githubId && githubSecret ? { clientId: githubId, clientSecret: githubSecret } : undefined,
  };
}
export function availableAuthProviders(env: Env): ("google" | "github")[] {
  const configured = socialProviders(env);
  return (["google", "github"] as const).filter((provider) => Boolean(configured[provider]));
}
export function createAuth(env: Env, context?: Pick<ExecutionContext, "waitUntil">) {
  const send = authEmailSender(env, context);
  const recordVerification = async (userId: string, request?: Request) => {
    const recording = recordServerFunnelEvent(env, {
      name: "verify_done",
      key: userId,
      request,
      path: "/verify-email",
    });
    if (context) context.waitUntil(recording);
    else await recording;
  };
  const recover = async (user: { id: string; email: string }, request?: Request) => {
    await requirePasswordRecovery(env, user.id);
    const url = await issuePasswordRecovery(env, user.id, await recoveryReturnTo(env, request));
    await send("recover", user.email, url);
  };
  return betterAuth({
    appName: env.APP_NAME,
    baseURL: env.APP_URL,
    secret: secret(env, "BETTER_AUTH_SECRET"),
    trustedOrigins: trustedAppOrigins(env),
    database: drizzleAdapter(drizzle(env.DB), {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => send("reset", user.email, url),
      onExistingUserSignUp: async ({ user }, request) => {
        if (!user.emailVerified) await recover(user, request);
        else await send("existing", user.email, `${env.APP_URL}/login`);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      afterEmailVerification: (user, request) => recordVerification(user.id, request),
      sendVerificationEmail: async ({ user, url }, request) => {
        // Resends can be requested without knowing the originally chosen password.
        // Only the first signup's email takes the ordinary verification path.
        if (
          request &&
          new URL(request.url).pathname.replace(/\/+$/, "") !== "/api/auth/sign-up/email"
        )
          await recover(user, request);
        else await send("verify", user.email, url);
      },
      beforeEmailVerification: async (user, request) => {
        if (!(await passwordRecoveryRequired(env, user.id))) return;
        const callback = request ? new URL(request.url).searchParams.get("callbackURL") : null;
        const returnTo = authReturnPath(
          callback ? new URL(callback, env.APP_URL).searchParams.get("returnTo") : null,
        );
        throw new APIError("FOUND", undefined, {
          location: `/verify-email?error=PASSWORD_RESET_REQUIRED&returnTo=${encodeURIComponent(returnTo)}`,
        });
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/reset-password") return;
        if (
          ctx.request &&
          !trustedAppOrigins(env).includes(ctx.request.headers.get("origin") || "")
        )
          throw new APIError("FORBIDDEN", { code: "INVALID_ORIGIN", message: "请求来源无效" });
        const body = z
          .object({ newPassword: z.string(), token: z.string().optional() })
          .safeParse(ctx.body);
        if (!body.success)
          throw new APIError("BAD_REQUEST", {
            code: "INVALID_PASSWORD",
            message: "请填写新密码。",
          });
        const token = body.data.token || ctx.query?.token;
        if (typeof token !== "string" || !token || token.length > 512)
          throw new APIError("BAD_REQUEST", {
            code: "INVALID_TOKEN",
            message: "链接无效或已过期。",
          });
        if (body.data.newPassword.length < PASSWORD_MIN_LENGTH)
          throw new APIError("BAD_REQUEST", {
            code: "PASSWORD_TOO_SHORT",
            message: "密码至少需要 10 个字符。",
          });
        if (body.data.newPassword.length > PASSWORD_MAX_LENGTH)
          throw new APIError("BAD_REQUEST", {
            code: "PASSWORD_TOO_LONG",
            message: "密码不能超过 128 个字符。",
          });
        const verifiedId = await resetPasswordAtomically(
          env,
          token,
          await ctx.context.password.hash(body.data.newPassword),
        );
        if (verifiedId) await recordVerification(verifiedId, ctx.request);
        return ctx.json({ status: true });
      }),
    },
    user: {
      additionalFields: {
        referrerId: { type: "string", required: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => ({
            data: { ...user, referrerId: await registrationReferrer(env, context?.headers) },
          }),
          after: async (_user, context) => {
            // 仅真实的新账户触发；重复邮箱注册、登录、账号关联均不记为注册。
            // 不保存账户 ID，OAuth 会话号使用框架校验过的 state 传递。
            try {
              const headers = context?.headers;
              if (
                ["1", "yes"].includes(headers?.get("dnt") ?? "") ||
                headers?.get("sec-gpc") === "1"
              )
                return;
              const sessionId =
                context?.path === "/sign-up/email"
                  ? headers?.get(ANALYTICS_SESSION_HEADER)
                  : context?.path.startsWith("/callback/")
                    ? (await getOAuthState())?.analyticsSessionId
                    : undefined;
              const parsed = analyticsSessionIdSchema.safeParse(sessionId);
              if (!parsed.success) return;
              await recordSignupConversion(env, {
                payload: { eventId: crypto.randomUUID(), sessionId: parsed.data },
                userAgent: headers?.get("user-agent") ?? "",
              });
            } catch {
              // 统计故障（包括迁移尚未执行）不能影响注册，也不记录身份或请求内容。
              console.error(JSON.stringify({ event: "analytics.signup_failed" }));
            }
          },
        },
      },
    },
    socialProviders: socialProviders(env),
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: true,
        allowDifferentEmails: false,
      },
    },
    onAPIError: { errorURL: `${env.APP_URL}/login` },
    rateLimit: { enabled: true },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      defaultCookieAttributes: {
        sameSite: "lax",
        httpOnly: true,
        secure: env.APP_URL.startsWith("https://"),
      },
    },
  });
}
