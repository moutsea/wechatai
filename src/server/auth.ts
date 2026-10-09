// Authentication foundation adapted from AgentFlowing (MIT); see licenses/agentflowing.txt.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { secret, trustedAppOrigins } from "./config";
import { registrationReferrer } from "./referrals";
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
export function createAuth(env: Env) {
  return betterAuth({
    appName: env.APP_NAME,
    baseURL: env.APP_URL,
    secret: secret(env, "BETTER_AUTH_SECRET"),
    trustedOrigins: trustedAppOrigins(env),
    database: drizzleAdapter(drizzle(env.DB), {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
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
