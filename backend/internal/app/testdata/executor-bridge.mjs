// Local transport adapter. The Worker signer and VPS executor are the application modules.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Executor } from "../../../../integrations/wechat-executor/service.mjs";

const [origin, accountId, directory, size] = process.argv.slice(2);
const payloadBytes = Number(size);
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const bundle = join(directory, "edge.mjs");
await build({
  stdin: {
    contents:
      'export { forwardBackendExecution } from "./src/server/backend-executor.ts"; export { executionCompletionSchema } from "./src/shared/executor-protocol.ts";',
    resolveDir: root,
  },
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
});
const { forwardBackendExecution, executionCompletionSchema } = await import(pathToFileURL(bundle));
const rpcSecret = "test-only-rpc-signature-key-at-least-32";
let completions = 0;
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.headers.authorization, "Bearer fixture-executor");
    const action = req.url.split("/").at(-1);
    assert.ok(action === "claim" || action === "complete");
    const upload = new Response(Readable.toWeb(req));
    if (action === "complete") executionCompletionSchema.parse(await upload.clone().json());
    const response = await forwardBackendExecution(
      origin,
      rpcSecret,
      { accountId, routeEpoch: action === "complete" && ++completions === 1 ? 2 : 1 },
      action,
      upload.body,
      {
        bodySHA256: req.headers["x-wechatai-body-sha256"],
      },
    );
    res.writeHead(response.status, { "content-type": "application/json" });
    await pipeline(Readable.fromWeb(response.body), res);
  } catch (error) {
    res.destroy(error);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const executor = new Executor({
    endpoint: `http://127.0.0.1:${server.address().port}`,
    secret: "fixture-executor",
    directory,
    attachments: async (input) => {
      assert.equal(input.items[0], "x".repeat(payloadBytes));
      return "y".repeat(payloadBytes);
    },
  });
  const { data: job } = await executor.api(accountId + "/claim", {});

  assert.equal(await executor.execute(accountId, job), false);
  assert.equal(executor.pendingReports.size, 1);
  // Restart after a signed stale-epoch rejection. The edge resolves the route
  // again on the next upload; only the saved receipt is replayed.
  const restarted = new Executor(executor.options);
  await restarted.recover();
  await restarted.flushReports();
  assert.equal(completions, 2);
  assert.equal(restarted.metrics.completed, 0);
  assert.equal(restarted.pendingReports.size, 0);
  assert.equal(executor.metrics.completed, 1);
  assert.deepEqual(
    (await readdir(directory)).filter((name) => name.endsWith(".json")),
    [],
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
