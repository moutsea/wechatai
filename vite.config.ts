import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { getPageSeo, replaceSeoHead } from "./src/shared/seo.ts";
export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    react(),
    cloudflare({
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
  server: { port: 5173, strictPort: true },
}));
