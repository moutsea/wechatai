import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cloudAgentConfig,
  cloudAgentConnectionConfig,
  cloudAgentEnabled,
} from "../src/server/config";
import { CloudAgentClient } from "../src/server/cloud-agent-client";

function settings(overrides: Record<string, string> = {}): Env {
  return new Proxy(env, {
    get(target, name) {
      const values: Record<string, string> = {
        CLOUD_AGENT_ENABLED: "true",
        AGT_ORIGIN: "https://agt.example.com",
        AGT_APP_ID: "app-one",
        AGT_APP_KEY: "test-only-app-key",
        AGT_TENANT_ID: "tenant-one",
        AGT_MODEL: "test-model",
        AGT_AGENT_ID: "",
        AGT_WORKSPACE_PREFIX: "",
        CLOUD_AGENT_DAILY_LIMIT: "",
        CLOUD_AGENT_DEADLINE_MINUTES: "",
        ...overrides,
      };
      return Reflect.has(values, name) ? Reflect.get(values, name) : Reflect.get(target, name);
    },
  });
}
afterEach(() => vi.unstubAllGlobals());

describe("AGT operator configuration", () => {
  it.each(["", "false", "0", "yes"])(
    "keeps new submissions disabled for %j and retains recovery configuration",
    (value) => {
      const configured = settings({ CLOUD_AGENT_ENABLED: value });
      expect(cloudAgentEnabled(configured)).toBe(false);
      expect(cloudAgentConfig(configured)).toBeNull();
      expect(cloudAgentConnectionConfig(configured)?.appKey).toBe("test-only-app-key");
    },
  );

  it.each(["true", "1", " TRUE "])("enables the configuration gate with %j", (value) => {
    expect(cloudAgentEnabled(settings({ CLOUD_AGENT_ENABLED: value }))).toBe(true);
  });

  it("returns bounded defaults without contacting AGT", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const config = cloudAgentConfig(settings());
    expect(config).toEqual({
      origin: "https://agt.example.com",
      appId: "app-one",
      appKey: "test-only-app-key",
      tenantId: "tenant-one",
      model: "test-model",
      agentId: "wechatai-v1",
      workspacePrefix: "wechatai",
      maxActive: 1,
      dailyLimit: 30,
      deadlineMs: 600_000,
    });
    expect(() => new CloudAgentClient(config!)).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["AGT_ORIGIN", "AGT_APP_ID", "AGT_APP_KEY", "AGT_TENANT_ID"])(
    "rejects missing %s for both submission and recovery",
    (name) => {
      const configured = settings({ [name]: "   " });
      expect(cloudAgentConfig(configured)).toBeNull();
      expect(cloudAgentConnectionConfig(configured)).toBeNull();
    },
  );

  it.each([
    ["AGT_MODEL", ""],
    ["AGT_AGENT_ID", "Uppercase"],
    ["AGT_WORKSPACE_PREFIX", "first/second"],
  ])("keeps recovery independent of invalid new-task setting %s", (name, value) => {
    const configured = settings({ [name]: value });
    expect(cloudAgentConfig(configured)).toBeNull();
    expect(cloudAgentConnectionConfig(configured)).toEqual({
      origin: "https://agt.example.com",
      appId: "app-one",
      tenantId: "tenant-one",
      appKey: "test-only-app-key",
    });
  });

  it.each([
    "https://agt.example.com/",
    "https://agt.example.com:8443",
    "http://localhost:8787",
    "http://127.0.0.1:8787",
    "http://[::1]:8787",
  ])("accepts the client-compatible origin %s", (origin) => {
    const config = cloudAgentConfig(settings({ AGT_ORIGIN: origin }));
    expect(config).not.toBeNull();
    expect(cloudAgentConnectionConfig(settings({ AGT_ORIGIN: origin }))?.origin).toBe(
      config?.origin,
    );
    expect(() => new CloudAgentClient(config!)).not.toThrow();
  });

  it.each([
    "not-a-url",
    "http://agt.example.com",
    "https://agt.example.com/api",
    "https://user:password@agt.example.com",
    "https://agt.example.com?key=secret",
    "https://agt.example.com/#fragment",
  ])("rejects an unsafe or non-origin AGT URL: %s", (origin) => {
    expect(cloudAgentConfig(settings({ AGT_ORIGIN: origin }))).toBeNull();
    expect(cloudAgentConnectionConfig(settings({ AGT_ORIGIN: origin }))).toBeNull();
  });

  it("keeps valid operator identifiers and trims surrounding whitespace", () => {
    const config = cloudAgentConfig(
      settings({
        AGT_AGENT_ID: " wechatai-2026.11 ",
        AGT_WORKSPACE_PREFIX: " wechatai-staging ",
        AGT_APP_KEY: " test-key ",
      }),
    );
    expect(config).toMatchObject({
      agentId: "wechatai-2026.11-v1",
      workspacePrefix: "wechatai-staging",
      appKey: "test-key",
    });
  });

  it.each([
    ["AGT_AGENT_ID", "Uppercase"],
    ["AGT_AGENT_ID", "a".repeat(62)],
    ["AGT_WORKSPACE_PREFIX", "first/second"],
    ["AGT_WORKSPACE_PREFIX", "x".repeat(88)],
    ["AGT_APP_ID", "app/other"],
    ["AGT_TENANT_ID", "tenant with spaces"],
  ])("rejects %s=%s instead of silently changing identity", (name, value) => {
    expect(cloudAgentConfig(settings({ [name]: value }))).toBeNull();
    if (name === "AGT_APP_ID" || name === "AGT_TENANT_ID")
      expect(cloudAgentConnectionConfig(settings({ [name]: value }))).toBeNull();
  });

  it("accepts identifiers up to the upstream profile and workspace limits", () => {
    const config = cloudAgentConfig(
      settings({ AGT_AGENT_ID: "a".repeat(61), AGT_WORKSPACE_PREFIX: "x".repeat(87) }),
    );
    expect(config?.agentId).toHaveLength(64);
    expect(`${config!.workspacePrefix}-${"a".repeat(32)}`).toHaveLength(120);
  });

  it.each([
    ["", 30, 10],
    ["invalid", 30, 10],
    ["-1", 30, 10],
    ["Infinity", 30, 10],
    ["0", 1, 1],
    ["1.5", 1, 1.5],
    ["2000", 1000, 30],
  ])("bounds execution settings %j", (value, daily, minutes) => {
    const config = cloudAgentConfig(
      settings({
        CLOUD_AGENT_DAILY_LIMIT: String(value),
        CLOUD_AGENT_DEADLINE_MINUTES: String(value),
      }),
    );
    expect(config).toMatchObject({
      maxActive: 1,
      dailyLimit: daily,
      deadlineMs: Number(minutes) * 60_000,
    });
  });
});
