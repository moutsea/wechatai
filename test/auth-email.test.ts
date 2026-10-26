import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import authMigration from "../migrations/0001_auth.sql?raw";
import referralMigration from "../migrations/0003_referrals.sql?raw";
import emailMigration from "../migrations/0007_auth_email_limits.sql?raw";
import funnelMigration from "../migrations/0016_funnel_events.sql?raw";
import worker from "../src/server/index";
import {
  authEmailContent,
  authEmailDelivery,
  reserveAuthEmail,
  sendAuthEmail,
} from "../src/server/auth-email";
import { passwordValidationError } from "../src/shared/auth";

let messages: EmailMessageBuilder[] = [];
const send = vi.fn(async (message: EmailMessage | EmailMessageBuilder) => {
  if (!("subject" in message)) throw new Error("Expected composed email");
  messages.push(message);
  return { messageId: "test-message" };
});
const bindings = {
  ...env,
  AUTH_EMAIL_MODE: "cloudflare",
  AUTH_EMAIL_FROM: "verify@example.test",
  AUTH_EMAIL: { send },
};
let ip = 0;
const cookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
async function rawRequest(path: string, init: RequestInit = {}, config: Env = bindings) {
  const context = createExecutionContext();
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", env.APP_URL);
  if (!headers.has("cf-connecting-ip"))
    headers.set("cf-connecting-ip", `198.19.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`);
  const response = await worker.fetch(
    new Request(new URL(path, env.APP_URL), { ...init, headers }),
    config,
    context,
  );
  await waitOnExecutionContext(context);
  return response;
}
async function request(
  path: string,
  body?: Record<string, unknown>,
  extra: Record<string, string> = {},
  config: Env = bindings,
) {
  return rawRequest(
    path,
    {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    config,
  );
}
const email = () => `auth-${crypto.randomUUID()}@example.test`;
const password = "test-only-password-long";
async function signup(address = email()) {
  const response = await request("/api/auth/sign-up/email", {
    name: "Email Test",
    email: address,
    password,
    callbackURL: "/verify-email?verified=1&returnTo=%2Fapp%2Fbilling",
  });
  expect(response.status).toBe(200);
  const data = await response.json<{
    user: { id: string; emailVerified: boolean };
    token: string | null;
  }>();
  return { address, response, data, link: mailLink() };
}
function mailLink() {
  const link = messages.at(-1)?.text?.match(/https?:\/\/[^\s]+/)?.[0];
  if (!link) throw new Error("No link in captured mail");
  return link;
}
async function unlock() {
  await env.DB.prepare("UPDATE auth_email_limit SET last_sent_at=0").run();
}
async function requestReset(address: string) {
  await unlock();
  expect(
    (
      await request("/api/auth/request-password-reset", {
        email: address,
        redirectTo: "/reset-password",
      })
    ).status,
  ).toBe(200);
  return new URL(mailLink()).pathname.split("/").at(-1)!;
}
beforeAll(async () => {
  for (const migration of [authMigration, referralMigration, emailMigration, funnelMigration])
    await env.DB.exec(migration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
});
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM funnel_events").run();
  messages = [];
  send.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unexpected external request"))),
  );
});

const verificationEvents = async () =>
  (await env.DB.prepare("SELECT * FROM funnel_events WHERE name='verify_done'").all()).results;

describe("verification success analytics", () => {
  it("records real verification once across concurrent requests and replay", async () => {
    const registered = await signup();
    expect(await verificationEvents()).toEqual([]);
    await Promise.all([request(registered.link), request(registered.link)]);
    expect(await verificationEvents()).toHaveLength(1);
    await request(registered.link);
    const events = await verificationEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "verify_done", path: "/verify-email" });
    expect(JSON.stringify(events)).not.toContain(registered.data.user.id);
    expect(JSON.stringify(events)).not.toContain(registered.address);
  });

  it("counts recovery after a resend, but not failed resets or resetting an already verified account", async () => {
    const registered = await signup();
    await unlock();
    expect(
      (await request("/api/auth/send-verification-email", { email: registered.address })).status,
    ).toBe(200);
    const token = new URL(mailLink()).pathname.split("/").at(-1)!;
    expect(
      (await request("/api/auth/reset-password", { token: "bad", newPassword: password })).status,
    ).toBe(400);
    expect(await verificationEvents()).toEqual([]);
    expect(
      (await request("/api/auth/reset-password", { token, newPassword: password })).status,
    ).toBe(200);
    expect(
      await env.DB.prepare("SELECT emailVerified FROM user WHERE id=?")
        .bind(registered.data.user.id)
        .first("emailVerified"),
    ).toBe(1);
    expect(await verificationEvents()).toHaveLength(1);
    expect(
      (await request("/api/auth/reset-password", { token, newPassword: password })).status,
    ).toBe(400);
    const nextToken = await requestReset(registered.address);
    expect(
      (await request("/api/auth/reset-password", { token: nextToken, newPassword: password }))
        .status,
    ).toBe(200);
    expect(await verificationEvents()).toHaveLength(1);
  });

  it.each([
    ["email", "dnt"],
    ["email", "sec-gpc"],
    ["recovery", "dnt"],
    ["recovery", "sec-gpc"],
  ])("honours %s verification opt-out via %s", async (path, header) => {
    const registered = await signup();
    const response =
      path === "email"
        ? await request(registered.link, undefined, { [header]: "1" })
        : await request(
            "/api/auth/reset-password",
            { token: await requestReset(registered.address), newPassword: password },
            { [header]: "1" },
          );
    expect(response.status).toBe(path === "email" ? 302 : 200);
    expect(await verificationEvents()).toEqual([]);
  });

  it.each(["email", "recovery"])(
    "does not let unavailable analytics break %s verification",
    async (path) => {
      const registered = await signup();
      const token = path === "recovery" ? await requestReset(registered.address) : "";
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      await env.DB.prepare("DROP TABLE funnel_events").run();
      try {
        const response =
          path === "email"
            ? await request(registered.link)
            : await request("/api/auth/reset-password", { token, newPassword: password });
        expect(response.status).toBe(path === "email" ? 302 : 200);
        expect(
          await env.DB.prepare("SELECT emailVerified FROM user WHERE id=?")
            .bind(registered.data.user.id)
            .first("emailVerified"),
        ).toBe(1);
        expect(log).toHaveBeenCalledWith(
          JSON.stringify({ event: "analytics.server_event_failed", name: "verify_done" }),
        );
      } finally {
        await env.DB.exec(funnelMigration.replace(/^--.*$/gm, "").replace(/\n/g, " "));
        log.mockRestore();
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("verified email registration and recovery", () => {
  it("creates no session before verification, verifies once, then permits login", async () => {
    const registered = await signup();
    expect(registered.data).toMatchObject({ token: null, user: { emailVerified: false } });
    expect(cookie(registered.response)).not.toContain("session_token=");
    expect(send).toHaveBeenCalledTimes(1);
    expect(messages[0]).toMatchObject({
      to: registered.address,
      from: { email: bindings.AUTH_EMAIL_FROM },
    });
    const login = () => request("/api/auth/sign-in/email", { email: registered.address, password });
    expect(await (await login()).json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(send).toHaveBeenCalledTimes(1); // Login does not implicitly send more mail.
    const verified = await request(registered.link);
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe(
      "/verify-email?verified=1&returnTo=%2Fapp%2Fbilling",
    );
    expect(cookie(verified)).toContain("session_token=");
    expect(verified.headers.get("cache-control")).toBe("no-store");
    expect(verified.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await request("/api/me", undefined, { cookie: cookie(verified) })).status).toBe(200);
    const replay = await request(registered.link);
    expect(cookie(replay)).not.toContain("session_token=");
    expect((await login()).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["short", "p".repeat(129)])("enforces password length on the server", async (value) => {
    const response = await request("/api/auth/sign-up/email", {
      name: "Test",
      email: email(),
      password: value,
    });
    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects malformed email and ignores browser attempts to assert verification", async () => {
    const bad = await request("/api/auth/sign-up/email", {
      name: "Test",
      email: "not-an-email",
      password,
    });
    expect(bad.status).toBe(400);
    const forged = await request("/api/auth/sign-up/email", {
      name: "Test",
      email: email(),
      password,
      emailVerified: true,
    });
    if (forged.status === 200)
      expect(await forged.json()).toMatchObject({ token: null, user: { emailVerified: false } });
    else expect(forged.status).toBe(400);
  });
  it("provides the same duplicate-account response without replacing the password", async () => {
    const first = await signup();
    await request(first.link);
    await unlock();
    const duplicate = await request("/api/auth/sign-up/email", {
      name: "Other",
      email: first.address,
      password: "different-password-long",
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ token: null });
    expect(send).toHaveBeenCalledTimes(2);
    expect(messages.at(-1)?.text).toContain("已经注册并完成验证");
    expect(mailLink()).toBe(`${env.APP_URL}/login`);
    expect(
      (await request("/api/auth/sign-in/email", { email: first.address, password })).status,
    ).toBe(200);
    expect(
      (
        await request("/api/auth/sign-in/email", {
          email: first.address,
          password: "different-password-long",
        })
      ).status,
    ).toBe(401);
  });
  it("recovers a duplicate unverified registration without activating the original password", async () => {
    const registered = await signup();
    const originalAccount = await env.DB.prepare("SELECT password FROM account WHERE userId=?")
      .bind(registered.data.user.id)
      .first();
    await unlock();
    const duplicate = await request("/api/auth/sign-up/email", {
      name: "Mailbox Owner",
      email: registered.address,
      password: "owner-registration-password",
      callbackURL: "/verify-email?verified=1&returnTo=%2Fapp%2Fbilling",
    });
    expect(duplicate.status).toBe(200);
    expect(cookie(duplicate)).not.toContain("session_token=");
    expect(send).toHaveBeenCalledTimes(2);
    expect(messages.at(-1)?.text).toContain("重新设置密码");
    const recoveryLink = mailLink();
    // A registration request must not overwrite any existing credential.
    expect(
      await env.DB.prepare("SELECT password FROM account WHERE userId=?")
        .bind(registered.data.user.id)
        .first(),
    ).toEqual(originalAccount);
    // Neither the original verification link nor a resend may activate it.
    const old = await request(registered.link);
    expect(old.headers.get("location")).toContain("PASSWORD_RESET_REQUIRED");
    expect(cookie(old)).not.toContain("session_token=");
    expect(
      (await request("/api/auth/sign-in/email", { email: registered.address, password })).status,
    ).toBe(403);
    const landing = await request(recoveryLink);
    const target = new URL(landing.headers.get("location")!, env.APP_URL);
    expect(target.pathname).toBe("/reset-password");
    expect(target.searchParams.get("recovery")).toBe("1");
    expect(target.searchParams.get("returnTo")).toBe("/app/billing");
    expect(
      (
        await request("/api/auth/reset-password", {
          token: target.searchParams.get("token"),
          newPassword: "mailbox-owner-confirmed-password",
        })
      ).status,
    ).toBe(200);
    for (const previous of [password, "owner-registration-password"])
      expect(
        (
          await request("/api/auth/sign-in/email", {
            email: registered.address,
            password: previous,
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await request("/api/auth/sign-in/email", {
          email: registered.address,
          password: "mailbox-owner-confirmed-password",
        })
      ).status,
    ).toBe(200);
    expect(cookie(await request(registered.link))).not.toContain("session_token=");
  });
  it("resending an unverified mailbox also requires a password chosen by its owner", async () => {
    const registered = await signup();
    await unlock();
    expect(
      (
        await request("/api/auth/send-verification-email", {
          email: registered.address,
          callbackURL: "/verify-email?verified=1",
        })
      ).status,
    ).toBe(200);
    expect(mailLink()).toContain("/api/auth/reset-password/");
    expect((await request(registered.link)).headers.get("location")).toContain(
      "PASSWORD_RESET_REQUIRED",
    );
    expect(
      (await request("/api/auth/sign-in/email", { email: registered.address, password })).status,
    ).toBe(403);
  });
  it("revokes all older reset tokens, without touching another user or unrelated verification", async () => {
    const first = await signup();
    await request(first.link);
    const other = await signup();
    await request(other.link);
    const oldToken = await requestReset(first.address);
    const newToken = await requestReset(first.address);
    const otherToken = await requestReset(other.address);
    await env.DB.prepare(`INSERT INTO verification (id,identifier,value,expiresAt,createdAt,updatedAt)
      VALUES ('unrelated','oauth-state:test',?,unixepoch()+1800,unixepoch(),unixepoch())`)
      .bind(first.data.user.id)
      .run();
    expect(
      (
        await request("/api/auth/reset-password", {
          token: newToken,
          newPassword: "new-owner-password",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/api/auth/reset-password", {
          token: oldToken,
          newPassword: "older-link-password",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/auth/reset-password", {
          token: otherToken,
          newPassword: "other-owner-password",
        })
      ).status,
    ).toBe(200);
    expect(
      await env.DB.prepare("SELECT id FROM verification WHERE id='unrelated'").first(),
    ).not.toBeNull();
  });
  it("allows only one of two different reset tokens to succeed concurrently", async () => {
    const registered = await signup();
    const oldSession = await request(registered.link);
    const tokens = [await requestReset(registered.address), await requestReset(registered.address)];
    const attempts = await Promise.all(
      tokens.map((token, n) =>
        request("/api/auth/reset-password", {
          token,
          newPassword: `concurrent-password-${n}`,
        }),
      ),
    );
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 400]);
    const winner = attempts.findIndex((r) => r.status === 200);
    expect(
      (
        await request("/api/auth/sign-in/email", {
          email: registered.address,
          password: `concurrent-password-${winner}`,
        })
      ).status,
    ).toBe(200);
    expect((await request("/api/me", undefined, { cookie: cookie(oldSession) })).status).toBe(401);
    for (const token of tokens)
      expect(
        (await request("/api/auth/reset-password", { token, newPassword: password })).status,
      ).toBe(400);
  });
  it("rolls back the password, session revocation and token consumption together on a database failure", async () => {
    const registered = await signup();
    const oldSession = await request(registered.link);
    const token = await requestReset(registered.address);
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    await env.DB.exec(
      "CREATE TRIGGER reset_failure BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
    );
    try {
      expect(
        (await request("/api/auth/reset-password", { token, newPassword: "new-password-for-test" }))
          .status,
      ).toBe(500);
    } finally {
      await env.DB.exec("DROP TRIGGER reset_failure");
    }
    expect((await request("/api/me", undefined, { cookie: cookie(oldSession) })).status).toBe(200);
    expect(
      (await request("/api/auth/sign-in/email", { email: registered.address, password })).status,
    ).toBe(200);
    expect(
      (await request("/api/auth/reset-password", { token, newPassword: "new-password-for-test" }))
        .status,
    ).toBe(200);
    logs.mockRestore();
  });
  it("rejects cross-origin resets without consuming the token and supports accounts without a password", async () => {
    const registered = await signup();
    await request(registered.link);
    await env.DB.prepare("DELETE FROM account WHERE userId=? AND providerId='credential'")
      .bind(registered.data.user.id)
      .run();
    const token = await requestReset(registered.address);
    expect(
      (
        await request(
          "/api/auth/reset-password",
          { token, newPassword: password },
          { origin: "https://untrusted.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("/api/auth/reset-password", { token, newPassword: password })).status,
    ).toBe(200);
    expect(
      (await request("/api/auth/sign-in/email", { email: registered.address, password })).status,
    ).toBe(200);
  });
  it("resends verification with recipient cooldown shared across reset and registration", async () => {
    const registered = await signup();
    for (const path of [
      "/send-verification-email",
      "/send-verification-email/",
      "/request-password-reset",
      "/sign-up/email",
    ]) {
      const response = await request(`/api/auth${path}`, {
        name: "Test",
        email: registered.address.toUpperCase(),
        password,
      });
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("60");
    }
    expect(send).toHaveBeenCalledTimes(1);
    await unlock();
    const sent = await request("/api/auth/send-verification-email", {
      email: registered.address,
      callbackURL: "/verify-email?verified=1",
    });
    expect(sent.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    const unknown = await request("/api/auth/send-verification-email", { email: email() });
    expect(await unknown.json()).toEqual(await sent.json());
    expect(send).toHaveBeenCalledTimes(2);
  });
  it.each(["new", "unverified", "verified"])(
    "rejects form submissions for %s accounts without sending mail or changing accounts",
    async (state) => {
      const address = email();
      if (state !== "new") {
        const registered = await signup(address);
        if (state === "verified") await request(registered.link);
      }
      const mailCount = send.mock.calls.length;
      const accountBefore = await env.DB.prepare("SELECT * FROM user WHERE email=?")
        .bind(address)
        .first();
      for (const path of ["sign-up/email", "send-verification-email", "request-password-reset"]) {
        for (const suffix of ["", "/"]) {
          const response = await rawRequest(`/api/auth/${path}${suffix}`, {
            method: "POST",
            body: new URLSearchParams({ name: "Form Test", email: address, password }),
          });
          expect(response.status).toBe(415);
          expect(await response.json()).toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
        }
      }
      expect(send).toHaveBeenCalledTimes(mailCount);
      expect(
        await env.DB.prepare("SELECT * FROM user WHERE email=?").bind(address).first(),
      ).toEqual(accountBefore);
      if (state === "new") expect(accountBefore).toBeNull();
    },
  );
  it("rejects missing, ambiguous, or non-JSON media types on mail endpoints", async () => {
    const body = new TextEncoder().encode(
      JSON.stringify({ name: "Test", email: email(), password }),
    );
    for (const path of ["sign-up/email", "send-verification-email", "request-password-reset"]) {
      for (const mediaType of [
        null,
        "text/plain",
        "multipart/form-data; boundary=test",
        "application/problem+json",
        "application/jsonp",
        "application/x-www-form-urlencoded; application/json",
      ]) {
        const response = await rawRequest(`/api/auth/${path}`, {
          method: "POST",
          headers: mediaType ? { "content-type": mediaType } : {},
          body,
        });
        expect(response.status).toBe(415);
      }
    }
    expect(send).not.toHaveBeenCalled();
  });
  it("accepts JSON charset and casing variants while enforcing the same recipient limit", async () => {
    const address = email();
    const headers = { "content-type": "Application/JSON; charset=UTF-8" };
    const registered = await request(
      "/api/auth/sign-up/email",
      { name: "JSON Test", email: address, password },
      headers,
    );
    expect(registered.status).toBe(200);
    for (const path of ["sign-up/email", "send-verification-email", "request-password-reset"]) {
      const response = await request(
        `/api/auth/${path}`,
        { name: "JSON Test", email: address.toUpperCase(), password },
        headers,
      );
      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ code: "AUTH_EMAIL_RATE_LIMITED" });
    }
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed JSON on mail endpoints without sending mail", async () => {
    for (const path of ["sign-up/email", "send-verification-email", "request-password-reset"]) {
      const response = await rawRequest(`/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"email":',
      });
      expect(response.status).toBe(400);
    }
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects expired and tampered verification links without creating a session", async () => {
    const registered = await signup();
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ email: registered.address, exp: Math.floor(Date.now() / 1000) - 10 }),
    ).toString("base64url");
    const unsigned = `${header}.${payload}`;
    const expired = `${unsigned}.${createHmac("sha256", env.BETTER_AUTH_SECRET).update(unsigned).digest("base64url")}`;
    for (const token of [expired, "invalid-link"]) {
      const response = await request(
        `/api/auth/verify-email?token=${token}&callbackURL=%2Fverify-email`,
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toMatch(/error=(TOKEN_EXPIRED|INVALID_TOKEN)/);
      expect(cookie(response)).not.toContain("session_token=");
    }
    const row = await env.DB.prepare("SELECT emailVerified FROM user WHERE id=?")
      .bind(registered.data.user.id)
      .first();
    expect(row).toMatchObject({ emailVerified: 0 });
  });
  it("resets password once, verifies the email and revokes all previous sessions", async () => {
    const registered = await signup();
    const verified = await request(registered.link);
    const second = await request("/api/auth/sign-in/email", {
      email: registered.address,
      password,
    });
    await env.DB.prepare("UPDATE user SET emailVerified=0 WHERE id=?")
      .bind(registered.data.user.id)
      .run();
    await unlock();
    const reset = await request("/api/auth/request-password-reset", {
      email: registered.address,
      redirectTo: "/reset-password?returnTo=%2Fapp%2Fbilling",
    });
    expect(reset.status).toBe(200);
    const link = mailLink();
    const landing = await request(link);
    expect(landing.status).toBe(302);
    const location = new URL(landing.headers.get("location")!, env.APP_URL);
    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.get("returnTo")).toBe("/app/billing");
    const token = location.searchParams.get("token");
    expect(
      (await request("/api/auth/reset-password", { token, newPassword: "short" })).status,
    ).toBe(400);
    const done = await request("/api/auth/reset-password", {
      token,
      newPassword: "new-password-for-testing",
    });
    expect(done.status).toBe(200);
    for (const old of [verified, second])
      expect((await request("/api/me", undefined, { cookie: cookie(old) })).status).toBe(401);
    expect(
      (await request("/api/auth/sign-in/email", { email: registered.address, password })).status,
    ).toBe(401);
    expect(
      (
        await request("/api/auth/sign-in/email", {
          email: registered.address,
          password: "new-password-for-testing",
        })
      ).status,
    ).toBe(200);
    expect(
      (await request("/api/auth/reset-password", { token, newPassword: password })).status,
    ).toBe(400);
    const unknown = await request("/api/auth/request-password-reset", {
      email: email(),
      redirectTo: "/reset-password",
    });
    expect(await unknown.json()).toEqual(await reset.json());
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("does not accept an expired reset token or redirect mail to another origin", async () => {
    const registered = await signup();
    await unlock();
    const redirect = await request("/api/auth/request-password-reset", {
      email: registered.address,
      redirectTo: "https://evil.example/reset",
    });
    expect(redirect.status).toBe(403);
    expect(send).toHaveBeenCalledTimes(1);
    await unlock();
    await request("/api/auth/request-password-reset", {
      email: registered.address,
      redirectTo: "/reset-password",
    });
    const url = new URL(mailLink());
    const token = url.pathname.split("/").at(-1);
    await env.DB.prepare("UPDATE verification SET expiresAt=0 WHERE identifier=?")
      .bind(`reset-password:${token}`)
      .run();
    expect((await request(url.href)).headers.get("location")).toContain("error=INVALID_TOKEN");
    expect(
      (await request("/api/auth/reset-password", { token, newPassword: password })).status,
    ).toBe(400);
  });
  it("preserves an existing session for an unverified legacy user", async () => {
    const registered = await signup();
    const verified = await request(registered.link);
    await env.DB.prepare("UPDATE user SET emailVerified=0 WHERE id=?")
      .bind(registered.data.user.id)
      .run();
    expect((await request("/api/me", undefined, { cookie: cookie(verified) })).status).toBe(200);
    expect(
      (await request("/api/auth/sign-in/email", { email: registered.address, password })).status,
    ).toBe(403);
  });
  it("fails closed when email is missing and never allows preview mode for production", async () => {
    for (const config of [
      { ...bindings, AUTH_EMAIL_FROM: "" },
      { ...env, APP_URL: "https://wechatai.app", AUTH_EMAIL_MODE: "preview" },
    ]) {
      expect(authEmailDelivery(config)).toBe("unavailable");
      const address = email();
      const response = await request(
        "/api/auth/sign-up/email",
        { name: "Test", email: address, password },
        { origin: config.APP_URL },
        config,
      );
      expect(response.status).toBe(503);
      expect(
        await env.DB.prepare("SELECT id FROM user WHERE email=?").bind(address).first(),
      ).toBeNull();
    }
    expect(send).not.toHaveBeenCalled();
  });
  it("logs delivery failure without exposing mailbox addresses or authentication links", async () => {
    send.mockRejectedValueOnce(new Error("private-recipient@example.test token=private-token"));
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await request("/api/auth/sign-up/email", {
      email: email(),
      name: "Test",
      password,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: null });
    expect(JSON.stringify(logs.mock.calls)).toContain("auth.email.delivery_failed");
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(
      /private-recipient|private-token|auth-.*example/,
    );
  });
});

describe("email safeguards", () => {
  it("atomically limits concurrent send attempts and enforces hourly/daily limits", async () => {
    const address = email();
    const start = Math.floor(Date.now() / 86_400_000) * 86_400_000;
    const parallel = await Promise.all(
      Array.from({ length: 8 }, () => reserveAuthEmail(env, address, start)),
    );
    expect(parallel.filter(Boolean)).toHaveLength(1);
    for (let n = 1; n < 5; n++)
      expect(await reserveAuthEmail(env, address, start + n * 60000)).toBe(true);
    expect(await reserveAuthEmail(env, address, start + 5 * 60000)).toBe(false);
    for (let hour = 1; hour < 4; hour++)
      for (let n = 0; n < 5; n++)
        expect(await reserveAuthEmail(env, address, start + hour * 3600000 + n * 60000)).toBe(true);
    expect(await reserveAuthEmail(env, address, start + 4 * 3600000)).toBe(false);
    expect(await reserveAuthEmail(env, address, start + 86400000)).toBe(true);
  });
  it("validates matching passwords and escapes email template values", async () => {
    expect(passwordValidationError("ten-characters", "different-value")).toContain("不一致");
    expect(passwordValidationError("ten-characters", "ten-characters")).toBe("");
    const content = authEmailContent(
      "verify",
      'https://example.test/?x="<script>',
      "<script>brand</script>",
    );
    expect(content.html).not.toContain("<script>");
    expect(content.text).toContain("https://example.test/");
    await expect(
      sendAuthEmail(bindings, "verify", email(), "https://evil.example/steal"),
    ).rejects.toThrow("Invalid authentication email URL");
    expect(send).not.toHaveBeenCalled();
  });
});
