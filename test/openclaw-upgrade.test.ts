import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { openClawUpgradeState } from "../src/client/remote-agent-status";
import { OpenClawUpgrade } from "../src/client/pages/openclaw-upgrade";
import { compareConnectorVersions } from "../src/shared/openclaw-release";
import type { OpenClawStatus } from "../src/shared/openclaw";

const now = Date.now();
const status: OpenClawStatus = {
  hasKey: true,
  lastSeen: now,
  agentId: "main",
  agents: [],
  deliveries: [],
  connectorVersion: "1.1.4",
  versionSeenAt: now,
  connectorUpdate: { version: "1.1.4", notes: ["更新说明"], command: "node upgrade" },
};
describe("connector update status", () => {
  it("compares numeric versions and does not guess legacy versions", () => {
    expect(compareConnectorVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareConnectorVersions("2.0.0", "1.99.0")).toBe(1);
    expect(compareConnectorVersions("1.1.3", "1.1.4")).toBe(-1);
    for (const value of ["", "unknown", "1.1", "1.1.4-beta", "01.1.4", "9999999.1.4"])
      expect(compareConnectorVersions(value, "1.1.4")).toBeNull();
  });
  it("requires a recent version heartbeat, not merely a recent poll or installed files", () => {
    expect(openClawUpgradeState(status, now).confirmed).toBe(true);
    expect(openClawUpgradeState({ ...status, connectorVersion: "1.1.3" }, now).state).toBe(
      "outdated",
    );
    expect(openClawUpgradeState({ ...status, connectorVersion: null }, now).state).toBe("unknown");
    expect(openClawUpgradeState({ ...status, versionSeenAt: now - 60001 }, now).confirmed).toBe(
      false,
    );
    expect(openClawUpgradeState({ ...status, lastSeen: 0 }, now).confirmed).toBe(false);
    expect(openClawUpgradeState({ ...status, hasKey: false }, now).confirmed).toBe(false);
  });
  it("renders the upgrade independently from pairing and waits for old clients", () => {
    const html = renderToStaticMarkup(
      createElement(OpenClawUpgrade, { status: { ...status, connectorVersion: null } }),
    );
    expect(html).toContain("版本待检测");
    expect(html).toContain("复制升级命令");
    expect(html).toContain("无需重新配对");
    expect(html).not.toContain("新版连接器已上线");
    expect(
      renderToStaticMarkup(
        createElement(OpenClawUpgrade, { status: { ...status, hasKey: false } }),
      ),
    ).toBe("");
  });
});
