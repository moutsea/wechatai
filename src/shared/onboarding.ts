import type { Snapshot } from "./types";
import {
  chatSetupIssue,
  modelFreeWechatPlugins,
  notificationWechatSetupIssue,
} from "./wechat-readiness";

export function dashboardSetupProgress(data: Snapshot) {
  const plugins = modelFreeWechatPlugins(data);
  const notificationReady = plugins.some(
    (p) =>
      p.pluginId === "wechatai/notification" &&
      p.hasKey &&
      !notificationWechatSetupIssue(data.connections.find((c) => c.id === p.connectionId)),
  );
  return {
    service: chatSetupIssue(data) === null || plugins.some((p) => p.hasKey),
    wechat: data.connections.some((c) => c.status === "connected" && !c.paused),
    message: data.stats.messages > 0 || notificationReady,
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
