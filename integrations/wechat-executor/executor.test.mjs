import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv } from "node:crypto";
import { publicAddress, validateTarget } from "./http.mjs";
import { Executor, durableWrite } from "./service.mjs";
import { parseAttachmentBatch } from "./attachments.bundle.mjs";

test("rejects private, metadata, loopback and transition-network targets", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "2002:a00:1::",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
    assert.equal(publicAddress(ip), true, ip);
  for (const url of [
    "http://api.example.com",
    "https://127.0.0.1",
    "https://api.internal",
    "https://u:p@api.example.com",
    "https://api.example.com:8080",
  ])
    assert.throws(() => validateTarget(url));
});
test("restart retries a saved result and fails an uncertain operation without invoking it again", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "wechatai-executor-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ids = ["a".repeat(64), "b".repeat(64)];
  await durableWrite(join(directory, ids[0] + ".json"), {
    accountId: "c".repeat(64),
    payload: { id: ids[0], lease: "lease", result: { ok: true, value: { text: "saved" } } },
  });
  await durableWrite(join(directory, ids[1] + ".json"), {
    accountId: "c".repeat(64),
    payload: { id: ids[1], lease: "lease" },
  });
  const executor = new Executor({ directory, concurrency: 1 });
  let reports = 0;
  executor.api = async (path, payload) => {
    assert.ok(path.endsWith("/complete"));
    reports++;
    if (payload.id === ids[0])
      assert.deepEqual(payload.result, { ok: true, value: { text: "saved" } });
    else assert.equal(payload.result.code, "executor_interrupted");
    return { data: { accepted: true } };
  };
  await executor.recover();
  assert.equal(reports, 2);
  assert.deepEqual(await readdir(directory), []);
});
test("a lost acknowledgement replays a durable result without re-executing upstream", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "wechatai-executor-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let executions = 0,
    reports = 0;
  const executor = new Executor({
    directory,
    concurrency: 1,
    attachments: async () => {
      executions++;
      return { files: [{ name: "test.txt", text: "hello" }], images: [] };
    },
  });
  executor.api = async () => {
    reports++;
    if (reports === 1) throw new Error("lost acknowledgement");
    return { data: { accepted: true } };
  };
  await executor.execute("a".repeat(64), {
    id: "b".repeat(64),
    lease: "lease",
    expiresAt: Date.now() + 60000,
    input: { kind: "attachments", items: [], timeoutMs: 1000 },
  });
  assert.equal(executions, 1);
  assert.equal(reports, 2);
  assert.deepEqual(await readdir(directory), []);
});
test("the Node parser decrypts and extracts a real WeChat text attachment", async (t) => {
  const key = Buffer.alloc(16, 1),
    cipher = createCipheriv("aes-128-ecb", key, null);
  const encrypted = Buffer.concat([cipher.update(Buffer.from("附件正文")), cipher.final()]);
  t.mock.method(globalThis, "fetch", async () => new Response(encrypted));
  const result = await parseAttachmentBatch([
    {
      type: 4,
      file_item: {
        file_name: "test.txt",
        media: { aes_key: key.toString("base64"), encrypt_query_param: "test" },
      },
    },
  ]);
  assert.equal(result.files[0].text, "附件正文");
  assert.equal(result.images.length, 0);
});

test("continues the next tool step directly after acknowledging its predecessor", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "wechatai-executor-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const accountId = "a".repeat(64);
  const jobs = ["b", "c"].map((v) => ({
    id: v.repeat(64),
    lease: v,
    expiresAt: Date.now() + 60000,
    input: { kind: "attachments", items: [], timeoutMs: 1000 },
  }));
  let executed = 0,
    claims = 0,
    acknowledged = 0;
  const service = new Executor({
    directory,
    concurrency: 1,
    attachments: async () => {
      executed++;
      return { images: [], files: [] };
    },
  });
  service.api = async (path) => {
    if (path.endsWith("/complete")) {
      acknowledged++;
      return { data: { accepted: true } };
    }
    assert.equal(path, accountId + "/claim");
    assert.equal(acknowledged, claims + 1);
    claims++;
    return { data: claims === 1 ? jobs[1] : null };
  };
  await service.runAccount(accountId, jobs[0]);
  assert.equal(executed, 2);
  assert.equal(acknowledged, 2);
  assert.equal(claims, 2);
  assert.deepEqual(await readdir(directory), []);
});

test("draining finishes the claimed activity without starting another", async () => {
  const service = new Executor({concurrency:1});
  let finished=false;
  service.api = async () => {throw new Error('must not discover or claim while draining');};
  service.execute = async () => { service.drain(); finished=true; };
  await service.runAccount('a'.repeat(64),{id:'job'});
  await service.tick();
  assert.equal(finished,true);
  assert.equal(service.stopController.signal.aborted,false);
  assert.equal(service.health().draining,true);
});
