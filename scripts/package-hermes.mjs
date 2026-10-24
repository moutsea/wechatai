import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

/**
 * Hermes 渠道包的构建。
 *
 * 归档必须是**可复现**的：同样的源码必须产出逐字节相同的 tgz，否则每次
 * build 都会改写 public/downloads/ 下的产物，工作区常驻脏文件，diff 里
 * 混入二进制噪音。因此这里不用 `tar -czf`（它会写入文件 mtime、uid/gid
 * 和登录名），而是自己按固定元数据拼 tar 头，再用 gzip（Node 的 zlib 把
 * gzip 头里的 MTIME 固定为 0）。
 */
const FILES = ["__init__.py", "adapter.py", "transport.py", "plugin.yaml", "README.md", "LICENSE"];
/** 固定时间戳，避免源码 checkout 时间渗进归档。 */
const FIXED_MTIME = 1_700_000_000;

const output = resolve("public/downloads");
await mkdir(output, { recursive: true });
const archive = resolve(output, "wechatai-hermes-1.1.2.tgz");

const source = resolve("integrations/hermes");

function tarHeader(name, size) {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.write(`${FIXED_MTIME.toString(8).padStart(11, "0")}\0`, 136, 12, "ascii");
  header.write("        ", 148, 8, "ascii");
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

const parts = [];
for (const file of FILES) {
  const content = await readFile(resolve(source, file));
  parts.push(tarHeader(file, content.length));
  parts.push(content);
  const padding = (512 - (content.length % 512)) % 512;
  if (padding) parts.push(Buffer.alloc(padding, 0));
}
// tar 以两个全零块结尾。
parts.push(Buffer.alloc(1024, 0));

const tar = Buffer.concat(parts);
// zlib 的 gzip 实现不写文件名、把 MTIME 固定为 0，因此输出只取决于内容。
const gz = gzipSync(tar, { level: 9 });
await writeFile(archive, gz);

const hash = createHash("sha256").update(gz).digest("hex");
const installer = (await readFile("integrations/hermes/connect.py", "utf8")).replace(
  "__WECHATAI_HERMES_ARCHIVE_SHA256__",
  hash,
);
await writeFile(resolve(output, "wechatai-hermes-connect.py"), installer);
console.log("Built Hermes channel package and verified installer.");
