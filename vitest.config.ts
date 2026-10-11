import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          GOOGLE_CLIENT_ID: "",
          GOOGLE_CLIENT_SECRET: "",
          GITHUB_CLIENT_ID: "",
          GITHUB_CLIENT_SECRET: "",
          STRIPE_SECRET_KEY: "",
          STRIPE_WEBHOOK_SECRET: "",
          STRIPE_PORTAL_CONFIG_ID: "",
          BETTER_AUTH_SECRET: "test-only-secret-of-at-least-32-characters",
          ENCRYPTION_KEY: "test-only-independent-encryption-secret-32chars",
          KIMISEEK_CONNECT_SECRET: "test-only-kimiseek-integration-secret-32chars",
          KIMISEEK_URL: "https://kimiseek.example.com",
          KIMISEEK_API_URL: "https://api.kimiseek.example.com",
        },
      },
    }),
  ],
});
