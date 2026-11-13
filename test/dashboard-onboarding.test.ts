import { abortAllDurableObjects, env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { dashboardSetupProgress, shouldShowDashboardOnboarding } from "../src/shared/onboarding";
import type { Snapshot } from "../src/shared/types";
import {
  notificationWechatIssue,
  notificationWechatSetupIssue,
} from "../src/shared/wechat-readiness";

describe("dashboard onboarding", () => {
  it("keeps initialization separate from the reply window and accepts a refreshed interaction", () => {
    const now = Date.now();
    const connection = {
      status: "connected" as const,
      paused: false,
      hasReplyContext: true,
      lastSeen: now - 86400000 + 1,
    };
    expect(notificationWechatIssue(connection, now)).toBeNull();
    connection.lastSeen -= 1;
    expect(notificationWechatIssue(connection, now)?.code).toBe("wechat_reply_window_expired");
    expect(notificationWechatSetupIssue(connection)).toBeNull();
    connection.lastSeen = now;
    expect(notificationWechatIssue(connection, now)).toBeNull();
    connection.hasReplyContext = false;
    expect(notificationWechatIssue(connection, now)?.code).toBe("wechat_context_required");
  });

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
      service: false,
      wechat: false,
      message: false,
    });
    const complete: Snapshot = {
      ...snapshot,
      assistants: [{ ...snapshot.assistants[0], model: "chat-model", kind: "text" }],
      connections: [{ ...snapshot.connections[0], status: "connected", paused: false }],
      stats: { ...snapshot.stats, messages: 2 },
    };
    expect(dashboardSetupProgress(complete)).toEqual({
      service: true,
      wechat: true,
      message: true,
    });
    complete.connections[0].paused = true;
    expect(dashboardSetupProgress(complete).wechat).toBe(false);
  });

  it.each(["muse", "notification"])(
    "recognizes configured %s without treating it as a model",
    async (kind) => {
      const account = env.ACCOUNTS.getByName(crypto.randomUUID());
      await account.api("wechat.create", { name: "微信" });
      const saved = JSON.parse(
        await account.api("plugin.save", {
          pluginId: `wechatai/${kind}`,
          name: kind,
          shortcut: kind,
          connectionId: "default",
        }),
      );
      expect(saved.ok).toBe(true);
      const before = await account.snapshot();
      expect(dashboardSetupProgress(before).service).toBe(false);
      const ready: Snapshot = {
        ...before,
        plugins: before.plugins!.map((p) => ({ ...p, hasKey: true })),
      };
      expect(dashboardSetupProgress(ready).service).toBe(true);
      expect(dashboardSetupProgress(ready).message).toBe(false);
      ready.connections[0] = {
        ...ready.connections[0],
        status: "connected",
        hasReplyContext: true,
      };
      expect(dashboardSetupProgress(ready).message).toBe(kind === "notification");
      ready.plugins![0].enabled = false;
      expect(dashboardSetupProgress(ready).service).toBe(false);
      expect(dashboardSetupProgress(ready).message).toBe(false);
    },
  );

  it("requires the notification's own active link, and respects the plugin allowance", async () => {
    const account = env.ACCOUNTS.getByName(crypto.randomUUID());
    await account.api("wechat.create", { name: "接收微信" });
    const saved = JSON.parse(
      await account.api("plugin.save", {
        pluginId: "wechatai/notification",
        name: "通知",
        connectionId: "default",
      }),
    );
    expect(saved.ok).toBe(true);
    const snapshot = await account.snapshot();
    snapshot.plugins![0].hasKey = true;
    snapshot.connections[0] = { ...snapshot.connections[0], status: "connected" };
    snapshot.connections.push({
      ...snapshot.connections[0],
      id: "other",
      hasReplyContext: true,
    });
    expect(dashboardSetupProgress(snapshot).message).toBe(false);
    snapshot.connections[0].hasReplyContext = true;
    expect(dashboardSetupProgress(snapshot).message).toBe(true);
    snapshot.connections[0].paused = true;
    expect(dashboardSetupProgress(snapshot).message).toBe(false);
    snapshot.connections[0].paused = false;
    snapshot.connections[0].status = "disconnected";
    expect(dashboardSetupProgress(snapshot).message).toBe(false);
    snapshot.connections[0].status = "connected";
    snapshot.plugins!.unshift({ ...snapshot.plugins![0], id: "disabled", enabled: false });
    expect(dashboardSetupProgress(snapshot).message).toBe(false);
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
