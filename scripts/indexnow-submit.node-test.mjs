import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { parseArgs, parseSitemap, run } from "./indexnow-submit.mjs";

// 低熵占位 key：满足 32 位十六进制形状，同时不触发 secret 扫描（Gitleaks）。
const KEY = "0".repeat(32);
const ORIGIN = "https://wechatai.app";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "wechatai-indexnow-"));
  await mkdir(resolve(root, "public"));
  await writeFile(resolve(root, "public", `${KEY}.txt`), KEY);
  return root;
}

async function cliFixture(t) {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const scripts = resolve(root, "scripts");
  await mkdir(scripts);
  const script = resolve(scripts, "indexnow-submit.mjs");
  await copyFile(new URL("./indexnow-submit.mjs", import.meta.url), script);
  return { root, script };
}

function response(status, body = "") {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

function fakeFetch({ sitemap, postStatus = 200, postBody = "", postError } = {}) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === `${ORIGIN}/sitemap.xml`) {
      if (sitemap === undefined) throw new Error("unexpected sitemap fetch");
      return response(200, sitemap);
    }
    if (url === "https://api.indexnow.org/IndexNow") {
      if (postError) throw postError;
      return response(postStatus, postBody);
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  impl.calls = calls;
  impl.posts = () => calls.filter((call) => call.init?.method === "POST");
  return impl;
}

test("默认读取 sitemap 并提交同一个 key 证明文件", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const lines = [];
  const fetchImpl = fakeFetch({
    sitemap: `<urlset><url><loc> ${ORIGIN}/ </loc></url><url><loc>${ORIGIN}/ja</loc></url></urlset>`,
  });
  const result = await run([], { root, fetch: fetchImpl, log: (line) => lines.push(line) });

  assert.deepEqual(result.urls, [`${ORIGIN}/`, `${ORIGIN}/ja`]);
  const posts = fetchImpl.posts();
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(posts[0].init.body), {
    host: "wechatai.app",
    key: KEY,
    keyLocation: `${ORIGIN}/${KEY}.txt`,
    urlList: [`${ORIGIN}/`, `${ORIGIN}/ja`],
  });
  assert.match(lines.join("\n"), /HTTP 200/);
});

test("--url 只提交一个地址且不读取 sitemap", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const fetchImpl = fakeFetch();
  const result = await run(["--url", `${ORIGIN}/ja`], {
    root,
    fetch: fetchImpl,
    log: () => {},
  });

  assert.deepEqual(result.urls, [`${ORIGIN}/ja`]);
  const posts = fetchImpl.posts();
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(posts[0].init.body).urlList, [`${ORIGIN}/ja`]);
});

test("--file 读取每行一个 URL 并忽略空行与 BOM", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = resolve(root, "urls.txt");
  await writeFile(file, `\uFEFF${ORIGIN}/ja\n\n${ORIGIN}/ko\r\n`);
  const fetchImpl = fakeFetch();
  const result = await run(["--file", file], { root, fetch: fetchImpl, log: () => {} });

  assert.deepEqual(result.urls, [`${ORIGIN}/ja`, `${ORIGIN}/ko`]);
  assert.equal(fetchImpl.posts().length, 1);
});

test("--dry-run 输出 URL 与数量且不发送 POST", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const lines = [];
  const fetchImpl = fakeFetch({
    sitemap: `<urlset><url><loc>${ORIGIN}/ja</loc></url><url><loc>${ORIGIN}/ko</loc></url></urlset>`,
  });
  const result = await run(["--dry-run"], {
    root,
    fetch: fetchImpl,
    log: (line) => lines.push(line),
  });

  assert.equal(result.dryRun, true);
  assert.equal(fetchImpl.posts().length, 0);
  assert.deepEqual(result.urls, [`${ORIGIN}/ja`, `${ORIGIN}/ko`]);
  assert.match(lines.join("\n"), /2 个 URL/);
  assert.match(lines.join("\n"), new RegExp(`${ORIGIN}/ja`));
});

test("每批最多 10,000 个 URL", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = resolve(root, "urls.txt");
  const urls = Array.from({ length: 10_001 }, (_, index) => `${ORIGIN}/p${index}`);
  await writeFile(file, urls.join("\n"));
  const fetchImpl = fakeFetch();
  await run(["--file", file], { root, fetch: fetchImpl, log: () => {} });

  const posts = fetchImpl.posts();
  assert.equal(posts.length, 2);
  assert.equal(JSON.parse(posts[0].init.body).urlList.length, 10_000);
  assert.equal(JSON.parse(posts[1].init.body).urlList.length, 1);
});

test("拒绝非本站或其他协议的 URL，且不发送 POST", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const url of ["https://example.com/page", "http://wechatai.app/page"]) {
    const fetchImpl = fakeFetch();
    await assert.rejects(
      run(["--url", url], { root, fetch: fetchImpl, log: () => {} }),
      /只提交/,
    );
    assert.equal(fetchImpl.posts().length, 0);
  }
});

test("--file --dry-run 拒绝带凭据的 URL，不在 stderr 回显输入", async (t) => {
  const { root, script } = await cliFixture(t);
  const file = resolve(root, "urls.txt");
  for (const [suffix, reason] of [
    ["/ja", /只提交/],
    [":99999/ja", /无效 URL/],
  ]) {
    await t.test(suffix, async () => {
      await writeFile(
        file,
        `${ORIGIN}/ko\nhttps://synthetic-user:synthetic-password@wechatai.app${suffix}\n`,
      );
      const { status, stdout, stderr } = spawnSync(
        process.execPath,
        [script, "--file", file, "--dry-run"],
        { encoding: "utf8" },
      );
      assert.equal(status, 1);
      assert.equal(stdout, "");
      assert.match(stderr, reason);
      assert.doesNotMatch(stderr, /synthetic-user|synthetic-password/);
    });
  }
});

test("200 与 202 均视为提交成功", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const status of [200, 202]) {
    const fetchImpl = fakeFetch({ postStatus: status });
    const result = await run(["--url", `${ORIGIN}/ja`], {
      root,
      fetch: fetchImpl,
      log: () => {},
    });
    assert.deepEqual(result.results, [{ status, urlCount: 1 }]);
  }
});

test("提交收到 HTTP 302 时记录原始状态并失败，不请求跳转页", async (t) => {
  const { script } = await cliFixture(t);
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url === "/IndexNow") response.writeHead(302, { location: "/landing" });
    response.end();
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((done) => server.close(done)));

  const preload = `
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
      if (url !== "https://api.indexnow.org/IndexNow") throw new Error("unexpected fetch");
      return nativeFetch("http://127.0.0.1:${server.address().port}/IndexNow", init);
    };
  `;
  const { code, stdout, stderr } = await promisify(execFile)(
    process.execPath,
    ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, script, "--url", `${ORIGIN}/ja`],
    { timeout: 10_000 },
  ).catch((error) => error);

  assert.deepEqual(requests, ["POST /IndexNow"], stdout);
  assert.match(stdout, /HTTP 302/);
  assert.equal(code, 1);
  assert.match(stderr, /提交失败/);
});

test("4xx 输出脱敏响应并以失败结束", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const lines = [];
  const fetchImpl = fakeFetch({
    postStatus: 422,
    postBody: JSON.stringify({ error: `invalid key ${KEY}` }),
  });
  await assert.rejects(
    run(["--url", `${ORIGIN}/ja`], { root, fetch: fetchImpl, log: (line) => lines.push(line) }),
    /提交失败/,
  );
  const output = lines.join("\n");
  assert.match(output, /HTTP 422/);
  assert.match(output, /\[redacted-key\]/);
  assert.doesNotMatch(output, new RegExp(KEY));
});

test("网络错误以失败结束", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const lines = [];
  const fetchImpl = fakeFetch({ postError: new Error("ECONNRESET") });
  await assert.rejects(
    run(["--url", `${ORIGIN}/ja`], { root, fetch: fetchImpl, log: (line) => lines.push(line) }),
    /提交失败/,
  );
  assert.match(lines.join("\n"), /网络错误 ECONNRESET/);
});

test("拒绝带尾换行的证明文件，不在 stderr 回显 key", async (t) => {
  const { root, script } = await cliFixture(t);
  await writeFile(resolve(root, "public", `${KEY}.txt`), `${KEY}\n`);
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [script, "--url", `${ORIGIN}/ja`, "--dry-run"],
    { encoding: "utf8" },
  );
  assert.equal(status, 1);
  assert.equal(stdout, "");
  assert.match(stderr, /内容与文件名不一致/);
  assert.doesNotMatch(stderr, new RegExp(KEY));
});

test("--url= 写法只报告未知参数和用法，不回显凭据", async (t) => {
  const { script } = await cliFixture(t);
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [script, "--url=https://synthetic-user:synthetic-password@wechatai.app/ja", "--dry-run"],
    { encoding: "utf8" },
  );
  assert.equal(status, 1);
  assert.equal(stdout, "");
  assert.doesNotMatch(stderr, /synthetic-user|synthetic-password/);
  assert.match(stderr, /未知参数\n用法：.*\[--url <url> \| --file <路径>\] \[--dry-run\]/);
});

test("参数与 sitemap 解析", () => {
  assert.throws(() => parseArgs(["--url"]), /需要一个值/);
  assert.throws(() => parseArgs(["--url", `${ORIGIN}/a`, "--file", "x"]), /互斥/);
  assert.throws(() => parseArgs(["--unknown"]), /未知参数/);
  assert.deepEqual(parseSitemap("<loc>https://wechatai.app/a?x=1&amp;y=2</loc>"), [
    "https://wechatai.app/a?x=1&y=2",
  ]);
});
