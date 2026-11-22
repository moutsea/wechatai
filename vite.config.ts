import { existsSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { getPageSeo, replaceSeoHead } from "./src/shared/seo.ts";
export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    react(),
    cloudflare({
      configPath:
        process.env.CLOUDFLARE_ENV === "production"
          ? process.env.WECHATAI_WRANGLER_CONFIG ||
            (existsSync("wrangler.production.local.jsonc")
              ? "wrangler.production.local.jsonc"
              : "wrangler.jsonc")
          : "wrangler.jsonc",
      config: (config) => {
        const { assets, vars } = config;
        if (command === "build" && process.env.CLOUDFLARE_ENV === "production") {
          // Older private configs also serve legacy links with credentials in the path.
          for (const [name, namespace_id] of [
            ["ANALYTICS_LIMIT", "12003"],
            ["PUBLIC_ENTRY_LIMIT", "12004"],
          ]) {
            if (config.ratelimits?.some((binding) => binding.name === name)) continue;
            config.ratelimits = [
              ...(config.ratelimits ?? []),
              {
                name,
                namespace_id,
                simple: { limit: 600, period: 60 },
              },
            ];
          }
          const obs = config.observability;
          config.observability = {
            ...obs,
            redact_query_string: true,
            logs: {
              ...obs?.logs,
              enabled: obs?.logs?.enabled ?? obs?.enabled ?? true,
              invocation_logs: false,
            },
            traces: { enabled: false },
          };
        }
        if (
          command === "build" &&
          process.env.CLOUDFLARE_ENV === "production" &&
          vars?.AUTH_EMAIL_MODE === "cloudflare"
        ) {
          // Apply the guard to private deployment configs created before Turnstile as well.
          const required = new Set(config.secrets?.required);
          required.add("TURNSTILE_SECRET_KEY");
          if (vars.TURNSTILE_SITE_KEY === undefined) required.add("TURNSTILE_SITE_KEY");
          else if (
            typeof vars.TURNSTILE_SITE_KEY !== "string" ||
            !vars.TURNSTILE_SITE_KEY.trim() ||
            /^[1-3]x0{8}/.test(vars.TURNSTILE_SITE_KEY.trim())
          )
            throw new Error(
              "Configure a live TURNSTILE_SITE_KEY before deploying email authentication.",
            );
          config.secrets = { required: [...required] };
        }
        if (!assets) return;
        // Development serves source routes; production uses the generated HTML files.
        if (command === "serve" && !isPreview)
          assets.not_found_handling = "single-page-application";
        // Apply the index routes to the resolved config, including older private configs.
        const rules = assets.run_worker_first;
        if (rules !== true) {
          assets.run_worker_first = [
            ...new Set([...(Array.isArray(rules) ? rules : []), "/llms.txt", "/llms-full.txt"]),
          ];
        }
      },
    }),
    {
      name: "page-seo",
      transformIndexHtml: {
        order: "pre",
        handler: (html, context) => {
          const path = new URL(context.originalUrl || context.path, "https://wechatai.app")
            .pathname;
          return replaceSeoHead(html, getPageSeo(path.endsWith("/index.html") ? "/" : path));
        },
      },
    },
  ],
  server: { port: 5173, strictPort: true, headers: { "Referrer-Policy": "no-referrer" } },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                {
                  name: "react",
                  test: /node_modules[\\/](?:react|react-dom|react-router|react-router-dom|scheduler|nanostores)[\\/]/,
                },
                { name: "auth", test: /node_modules[\\/](?:better-auth|@better-auth)[\\/]/ },
                { name: "i18n", test: /src[\\/]shared[\\/]i18n[\\/]/ },
              ],
            },
          },
        },
      },
    },
  },
}));
