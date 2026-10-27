import { expect, test, type Route } from "@playwright/test";
import { build } from "esbuild";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeApi } from "../support/fake-api";
import type { Snapshot } from "../../src/shared/types";

const assets = new Map<string, Uint8Array>();
let snapshot: Snapshot;
const returnTo = "/app/channels?channel=abc#settings";

test.beforeAll(async () => {
  snapshot = await createFakeApi()<Snapshot>("/dashboard");
  // 使用真实认证客户端、两个 Provider 和登录表单；只在 HTTP 边界替换服务端。
  const result = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { BrowserRouter, Route, Routes } from 'react-router-dom';
        import { AuthProvider, useAuth } from './src/client/auth';
        import { AppProvider, useApp } from './src/client/context';
        import { AuthPage } from './src/client/public-pages';
        import './src/client/styles.css';
        function Identity() {
          const {data} = useAuth();
          return <output data-testid="identity">{data?.user.id}:{data?.user.email}</output>;
        }
        function Workspace() {
          const {user, data, refresh} = useApp();
          return <main>
            <output data-testid="user">{user.name}</output>
            <output data-testid="workspace">{data ? 'ready' : 'loading'}</output>
            <button onClick={() => void refresh()}>刷新工作台</button>
          </main>;
        }
        createRoot(document.getElementById('root')).render(
          <BrowserRouter><AuthProvider><Identity /><Routes>
            <Route path="/app/*" element={<AppProvider><Workspace /></AppProvider>} />
            <Route path="/login" element={<AuthPage />} />
          </Routes></AuthProvider></BrowserRouter>
        );
      `,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
      loader: "tsx",
    },
    outfile: "auth.js",
    bundle: true,
    format: "esm",
    write: false,
  });
  for (const asset of result.outputFiles) assets.set(`/${basename(asset.path)}`, asset.contents);
});

const cases = [
  { width: 320, outcome: "ok" },
  { width: 1280, outcome: "ok" },
  { width: 1280, outcome: "hung" },
  { width: 1280, outcome: "failed" },
  { width: 1280, outcome: "stale" },
  { width: 1280, outcome: "late" },
];
for (const { width, outcome } of cases) {
  test(`expired session confirms the new identity at ${width}px with ${outcome} session queries`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    let expired = false;
    let dashboardReads = 0;
    let signIns = 0;
    let sessionOutcome = outcome;
    const pending: Route[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cached = {
      user: {
        id: "cached-user",
        name: "Cached",
        email: "cached@example.test",
        emailVerified: true,
      },
      session: {
        id: "cached-session",
        userId: "cached-user",
        token: "fixture",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    };
    let session = cached;
    await page.route("**/*", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/get-session") {
        if (expired || (signIns >= 2 && sessionOutcome === "hung")) {
          pending.push(route);
          return;
        }
        if (signIns >= 2 && sessionOutcome === "failed")
          return route.fulfill({ status: 500, json: { message: "Session unavailable" } });
        if (signIns >= 2 && sessionOutcome === "stale") return route.fulfill({ json: cached });
        return route.fulfill({ json: session });
      }
      if (path === "/api/dashboard") {
        dashboardReads++;
        return route.fulfill(
          expired
            ? { status: 401, json: { error: "unauthorized", message: "登录已失效" } }
            : { json: snapshot },
        );
      }
      if (path === "/api/auth/sign-in/email") {
        signIns++;
        if (signIns === 1)
          return route.fulfill({
            status: 401,
            json: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid credentials" },
          });
        expired = false;
        session = {
          ...cached,
          user: { ...cached.user, id: "new-user", name: "Signed in", email: "new@example.test" },
          session: {
            ...cached.session,
            userId: "new-user",
            id: `new-session-${signIns}`,
            token: `new-fixture-${signIns}`,
          },
        };
        return route.fulfill({
          json: { redirect: false, token: session.session.token, user: session.user },
        });
      }
      if (path === "/api/admin/access") return route.fulfill({ json: { isAdmin: false } });
      if (path === "/api/auth/providers") return route.fulfill({ json: { providers: [] } });
      if (path === "/api/referrals/attribution") return route.fulfill({ json: { active: false } });
      if (path.startsWith("/api/analytics/")) return route.fulfill({ status: 204 });
      const asset = assets.get(path);
      if (asset)
        return route.fulfill({
          contentType: path.endsWith(".css") ? "text/css" : "text/javascript",
          body: Buffer.from(asset),
        });
      if (path.startsWith("/api/"))
        return route.fulfill({ status: 404, json: { message: "Unexpected API" } });
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/auth.css"><div id="root"></div><script type="module" src="/auth.js"></script>',
      });
    });

    await page.goto(`http://auth.test${returnTo}`);
    await expect(page.getByTestId("user")).toHaveText("Cached");
    await expect(page.getByTestId("workspace")).toHaveText("ready");
    expired = true;
    await page.getByRole("button", { name: "刷新工作台", exact: true }).click();
    await expect.poll(() => pending.length).toBeGreaterThan(0);
    await page.clock.fastForward(15001);
    const password = page.locator('input[type="password"]');
    await expect(password).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(returnTo);
    await password.fill("test-password");
    if (outcome !== "late") {
      const late = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/auth/get-session",
      );
      await pending[0].fulfill({ json: cached });
      await late;
    }
    const reads = dashboardReads;
    await page.clock.fastForward(60000);
    await expect(password).toHaveValue("test-password");
    expect(dashboardReads).toBe(reads);
    await page.locator('input[type="email"]').fill("new@example.test");
    await page.getByRole("button", { name: "登录工作台", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("邮箱或密码不正确，请重新输入。");
    await expect(password).toBeVisible();
    await page.getByRole("button", { name: "登录工作台", exact: true }).click();
    const needsRetry = ["hung", "failed", "stale"].includes(outcome);
    if (needsRetry) {
      if (outcome === "hung") {
        await expect.poll(() => pending.length).toBe(2);
        await page.clock.fastForward(15001);
      }
      await expect(page.getByRole("alert")).toHaveText(
        outcome === "hung"
          ? "确认登录会话超时，请重新登录。"
          : "暂时无法确认新的登录会话，请重新登录。",
      );
      await expect(password).toHaveValue("test-password");
      await expect(page.getByTestId("identity")).toHaveText(":");
      expect(new URL(page.url()).pathname).toBe("/login");
      expect(dashboardReads).toBe(reads);
      if (outcome === "hung") {
        // 超时后的成功结果也不能自行解除保护；用户重试必须确认另一条新会话。
        const late = page.waitForResponse(
          (response) => new URL(response.url()).pathname === "/api/auth/get-session",
        );
        await pending[1].fulfill({ json: session });
        await late;
        await page.clock.fastForward(60000);
        await expect(password).toBeVisible();
        await expect(page.getByTestId("identity")).toHaveText(":");
      }
      sessionOutcome = "ok";
      await page.getByRole("button", { name: "登录工作台", exact: true }).click();
    }
    await expect(page.getByTestId("workspace")).toHaveText("ready");
    await expect(page.getByTestId("user")).toHaveText("Signed in");
    await expect(page.getByTestId("identity")).toHaveText("new-user:new@example.test");
    if (outcome === "late") {
      await pending[0].fulfill({ json: cached });
      await page.clock.fastForward(60000);
      await expect(page.getByTestId("identity")).toHaveText("new-user:new@example.test");
    }
    expect(
      new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash,
    ).toBe(returnTo);
    expect(signIns).toBe(needsRetry ? 3 : 2);
    expect(errors).toEqual([]);
  });
}
