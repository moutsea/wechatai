import type { Locale } from "./index";
import { dashboardCopy as zh } from "./zh-CN/copy/dashboard";
import { dashboardCopy as en } from "./en/copy/dashboard";
import { dashboardCopy as es } from "./es/copy/dashboard";
import { dashboardCopy as ja } from "./ja/copy/dashboard";
import { dashboardCopy as ko } from "./ko/copy/dashboard";
import { dashboardCopy as pt } from "./pt/copy/dashboard";

export const dashboardCopy = { "zh-CN": zh, en, es, ja, ko, pt } satisfies Record<
  Locale,
  typeof zh
>;

export function formatCopy(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => String(values[key] ?? token));
}
