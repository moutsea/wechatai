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
      // Development serves source routes; production uses the generated HTML files.
      config:
        command === "serve" && !isPreview
          ? { assets: { not_found_handling: "single-page-application" } }
          : {},
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
}));
