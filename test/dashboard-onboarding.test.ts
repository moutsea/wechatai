import { abortAllDurableObjects, env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { dashboardSetupProgress, shouldShowDashboardOnboarding } from "../src/shared/onboarding";
import type { Snapshot } from "../src/shared/types";

describe("dashboard onboarding", () => {
  it("remembers dismissal across restarts, is idempotent and remains private to the account", async () => {
    const account = env.ACCOUNTS.getByName(crypto.randomUUID());
    const other = env.ACCOUNTS.getByName(crypto.randomUUID());
    const before = await account.snapshot();
    expect(shouldShowDashboardOnboarding(before)).toBe(true);
    const result = JSON.parse(
      await account.api("onboarding.dismiss", { userId: other.id.toString(), dismissedAt: -1 }),
    );
    expect(result.ok).toBe(true);
    expect(result.data.dismissedAt).toBeGreaterThan(0);
    const again = JSON.parse(await account.api("onboarding.dismiss"));
    expect(again.data.dismissedAt).toBe(result.data.dismissedAt);
    await abortAllDurableObjects();
    const saved = await env.ACCOUNTS.get(account.id).snapshot();
    expect(saved.onboardingDismissedAt).toBe(result.data.dismissedAt);
    expect(shouldShowDashboardOnboarding(saved)).toBe(false);
    expect(shouldShowDashboardOnboarding(await env.ACCOUNTS.get(other.id).snapshot())).toBe(true);
    expect(saved.channels).toEqual(before.channels);
    expect(saved.wallet.balance).toBe(before.wallet.balance);
    expect(saved.ledger).toEqual(before.ledger);
  });

  it("does not interrupt established users, but still shows the guide for an empty saved link", async () => {
    const account = env.ACCOUNTS.getByName(crypto.randomUUID());
    const empty = await account.snapshot();
    expect(
      shouldShowDashboardOnboarding({ ...empty, stats: { ...empty.stats, messages: 1 } }),
    ).toBe(false);
    const created = JSON.parse(await account.api("wechat.create", { name: "微信" }));
    expect(created.ok).toBe(true);
    expect(shouldShowDashboardOnboarding(created.data)).toBe(true);
    const connected: Snapshot = {
      ...created.data,
      connections: [{ ...created.data.connections[0], status: "connected" }],
    };
    expect(shouldShowDashboardOnboarding(connected)).toBe(false);
    const saved = JSON.parse(
      await account.api("channel.save", {
        name: "已有渠道",
        baseUrl: "https://llm.example.com",
        apiKey: "test-key",
        protocol: "responses",
      }),
    );
    expect(saved.ok).toBe(true);
    expect(shouldShowDashboardOnboarding(await account.snapshot())).toBe(false);
  });

  it("keeps setup progress until a text model, a usable WeChat link and messages exist", async () => {
    const account = env.ACCOUNTS.getByName(crypto.randomUUID());
    await account.api("assistant.save", {
      name: "生图",
      baseUrl: "https://llm.example.com",
      apiKey: "test-key",
      protocol: "responses",
      model: "qwen-image-3.0",
    });
    await account.api("wechat.create", { name: "微信" });
    const snapshot = await account.snapshot();
    expect(dashboardSetupProgress(snapshot)).toEqual({
      model: false,
      wechat: false,
      message: false,
    });
    const complete: Snapshot = {
      ...snapshot,
      assistants: [{ ...snapshot.assistants[0], model: "chat-model", kind: "text" }],
      connections: [{ ...snapshot.connections[0], status: "connected", paused: false }],
      stats: { ...snapshot.stats, messages: 2 },
    };
    expect(dashboardSetupProgress(complete)).toEqual({ model: true, wechat: true, message: true });
    complete.connections[0].paused = true;
    expect(dashboardSetupProgress(complete).wechat).toBe(false);
  });

  it("requires login and a trusted Origin to dismiss via HTTP", async () => {
    const path = new URL("/api/onboarding/dismiss", env.APP_URL).href;
    const unauthenticated = await SELF.fetch(path, {
      method: "POST",
      headers: { Origin: new URL(env.APP_URL).origin },
    });
    expect(unauthenticated.status).toBe(401);
    const crossSite = await SELF.fetch(path, {
      method: "POST",
      headers: { Origin: "https://untrusted.example.com" },
    });
    expect(crossSite.status).toBe(403);
  });
});
