import { DASHBOARD_PATH, type TranslationPage } from "../index";
import { dashboardCopy } from "./copy/dashboard";

const titles = {
  "": "Panel",
  "/channels": dashboardCopy.shell.channels,
  "/assistants": dashboardCopy.shell.channels,
  "/plugins": dashboardCopy.shell.plugins,
  "/tasks": dashboardCopy.shell.tasks,
  "/wechat": dashboardCopy.shell.wechat,
  "/sessions": dashboardCopy.shell.sessions,
  "/billing": dashboardCopy.shell.billing,
  "/credits": dashboardCopy.shell.credits,
  "/invite": dashboardCopy.shell.invite,
  "/notices": dashboardCopy.shell.notices,
  "/admin": dashboardCopy.shell.admin,
};

export default Object.entries(titles).map(([section, title]) => ({
  path: `${DASHBOARD_PATH}${section}`,
  title: `${title} | Wechatai`,
  description: "Gestiona tus modelos de IA, agentes y conexiones de WeChat.",
  updatedAt: "2026-11-28",
})) satisfies readonly TranslationPage[];
