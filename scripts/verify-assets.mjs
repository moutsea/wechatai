#!/usr/bin/env node
/**
 * 校验 `src/` 里写死的图片路径在 `public/` 下确实存在。
 *
 * 为什么需要：`src/client/pages/doc-screenshots.ts` 曾经引用
 * `/images/real/wechat-reminder-followup.jpg`，而那个文件已经不在磁盘上 ——
 * tsc、单测、构建、SEO 校验全绿，线上就是一张破图。这类错只有真去 stat 才拦得住。
 *
 * 只认字面量：模板拼接（`/images/roles/${id}.webp`）里带 `${`，跳过而不是误报 ——
 * 这类路径的取值集合由代码而不是本脚本负责。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const srcDir = join(root, "src");
const publicDir = join(root, "public");
const referencePattern = /["'`](\/images\/[^"'`\s]+)["'`]/g;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

/** 图片路径 → 引用它的源文件列表 */
const referenced = new Map();
for (const file of sourceFiles(srcDir)) {
  const where = relative(root, file);
  for (const match of readFileSync(file, "utf8").matchAll(referencePattern)) {
    const path = match[1];
    if (path.includes("${")) continue;
    const list = referenced.get(path) ?? [];
    list.push(where);
    referenced.set(path, list);
  }
}

const missing = [...referenced].filter(([path]) => !existsSync(join(publicDir, path)));
for (const [path, files] of missing) {
  console.error(`✗ 引用了不存在的图片：${path}\n    引用处：${files.join(", ")}`);
}
if (missing.length > 0) {
  console.error(`\n图片引用校验失败：${missing.length} 处引用找不到文件。`);
  process.exit(1);
}
if (referenced.size === 0) {
  console.error("✗ 没有抽到任何图片引用，正则或目录结构可能变了。");
  process.exit(1);
}
console.log(`图片引用校验通过：${referenced.size} 处引用全部存在。`);
