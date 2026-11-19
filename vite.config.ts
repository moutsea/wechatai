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
      config: ({ assets }) => {
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
              ],
            },
          },
        },
      },
    },
  },
}));
