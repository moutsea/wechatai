import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const output = resolve("dist/client");
const template = await readFile(resolve(output, "index.html"), "utf8");
// This isolated renderer neither loads Cloudflare bindings nor reads local secrets.
const server = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: ".wrangler/prerender-cache",
  optimizeDeps: { noDiscovery: true },
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  const {
    renderPublicPage,
    getPageSeo,
    replaceSeoHead,
    renderSitemap,
    PUBLIC_PATHS,
    PRIVATE_PATHS,
    LEGACY_PATHS,
  } = await server.ssrLoadModule("/src/client/prerender.tsx");
  for (const path of [...PUBLIC_PATHS, ...LEGACY_PATHS, ...PRIVATE_PATHS, "/404"]) {
    const body =
      PUBLIC_PATHS.includes(path) || LEGACY_PATHS.includes(path) || path === "/404"
        ? renderPublicPage(path)
        : '<main aria-busy="true">正在加载微伴工作台…</main>';
    const html = replaceSeoHead(template, getPageSeo(path)).replace(
      '<div id="root"></div>',
      () => `<div id="root">${body}</div>`,
    );
    const target = resolve(output, path === "/" ? "index.html" : `${path.slice(1)}.html`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
  }
  await writeFile(resolve(output, "sitemap.xml"), renderSitemap());
  // Asset HTML normalization defaults to 307. These aliases are permanent;
  // generate exact rules from public routes without redirecting unknown URLs.
  const redirects = await readFile(resolve("public/_redirects"), "utf8");
  const canonicalRedirects = PUBLIC_PATHS.flatMap((path) =>
    path === "/" ? ["/index.html / 301"] : [`${path}/ ${path} 301`, `${path}.html ${path} 301`],
  );
  await writeFile(
    resolve(output, "_redirects"),
    `${redirects.trimEnd()}\n\n# Generated canonical public URLs\n${canonicalRedirects.join("\n")}\n`,
  );
  console.log(
    `Prerendered ${PUBLIC_PATHS.length} public pages, private route shells and a 404 page.`,
  );
} finally {
  await server.close();
}
