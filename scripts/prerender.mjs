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
    publishedLocalizedPaths,
    PUBLIC_PATHS,
    PRIVATE_PATHS,
    LEGACY_PATHS,
  } = await server.ssrLoadModule("/src/client/prerender.tsx");
  const localizedPaths = publishedLocalizedPaths();
  const renderedPublicPaths = [...PUBLIC_PATHS, ...localizedPaths];
  for (const path of [...renderedPublicPaths, ...LEGACY_PATHS, ...PRIVATE_PATHS, "/404"]) {
    const body =
      renderedPublicPaths.includes(path) || LEGACY_PATHS.includes(path) || path === "/404"
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
  //
  // Cloudflare counts every rule after the first splat or placeholder as dynamic
  // and silently drops whatever exceeds 100 dynamic rules, so the hand-written
  // rules are split: static ones first, generated canonicals next, splats last.
  // A comment stays attached to the rule that follows it.
  const source = (await readFile(resolve("public/_redirects"), "utf8")).trimEnd().split("\n");
  const staticRules = [];
  const dynamicRules = [];
  let comments = [];
  for (const line of source) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      comments.push(line);
      continue;
    }
    const from = trimmed.split(/\s+/)[0];
    (/\*|:/.test(from) ? dynamicRules : staticRules).push(...comments, line);
    comments = [];
  }
  staticRules.push(...comments);
  const canonicalRedirects = renderedPublicPaths.flatMap((path) =>
    path === "/" ? ["/index.html / 301"] : [`${path}/ ${path} 301`, `${path}.html ${path} 301`],
  );
  await writeFile(
    resolve(output, "_redirects"),
    `${staticRules.join("\n").trimEnd()}\n\n# Generated canonical public URLs\n${canonicalRedirects.join("\n")}\n\n# Dynamic rules go last: Cloudflare treats each rule after the first splat or\n# placeholder as dynamic and keeps only the first 100 of them.\n${dynamicRules.join("\n").trimEnd()}\n`,
  );
  console.log(
    `Prerendered ${renderedPublicPaths.length} public pages, private route shells and a 404 page.`,
  );
} finally {
  await server.close();
}
