import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../../test-results/browser",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: {
    // Playwright's bundled headless shell uses its own temporary profile and detached process.
    // Do not select the system Chrome channel or a user's browser profile.
    browserName: "chromium",
    headless: true,
    launchOptions: { args: ["--remote-debugging-port=0"] },
    screenshot: "only-on-failure",
  },
});
