import { defineConfig } from "vitest/config";

// DOM interaction tests run in Node; D1/Workers integration tests keep their own runtime.
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["test/**/*.client.test.tsx"],
    maxWorkers: 1,
  },
});
