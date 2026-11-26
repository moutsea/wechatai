import "../src/shared/i18n/load";
import { expect, it } from "vitest";
import { PUBLIC_PATHS, LEGACY_PATHS, publishedLocalizedPaths } from "../src/shared/seo";
import { isTrackedPath } from "../src/shared/analytics";
import { METRICS_TRAFFIC_PATHS } from "../src/server/metrics-traffic-paths";

it("permits exactly the published tracked paths and login/register without loading SEO in the Worker", () => {
  const expected = [
    ...new Set([
      ...PUBLIC_PATHS,
      ...LEGACY_PATHS,
      ...publishedLocalizedPaths(),
      "/login",
      "/register",
    ]),
  ]
    .filter(isTrackedPath)
    .sort();
  expect(METRICS_TRAFFIC_PATHS).toEqual(expected);
});
