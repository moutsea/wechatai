import type { Snapshot } from "./types";
import { wechatSetupIssue } from "./wechat-readiness";

export function dashboardSetupProgress(data: Snapshot) {
  return {
    model: wechatSetupIssue(data) === null,
    wechat: data.connections.some((c) => c.status === "connected" && !c.paused),
    message: data.stats.messages > 0,
  };
}

export function shouldShowDashboardOnboarding(data: Snapshot) {
  // Existing users keep their usual dashboard. They can reopen the guide from
  // its permanent entry; only accounts that haven't started see it on arrival.
  return (
    !data.onboardingDismissedAt &&
    !data.channels.length &&
    !data.stats.messages &&
    !data.connections.some((c) => c.status === "connected")
  );
}
