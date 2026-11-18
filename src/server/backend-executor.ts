import { createHash } from "node:crypto";
import contract from "../../backend/contract/contract.json";
import { AppError } from "./config";
import { backendOrigin, signedRequest, type SigningOptions } from "./backend-signature";

type ExecutorAction = "claim" | "complete";

// Accept the original executor body and forward the claim response as a stream.
// Clients may supply a digest for streaming. Go verifies the bytes before
// dispatch. Older clients are hashed into one bounded Blob before forwarding.
export async function forwardBackendExecution(
  origin: string,
  secret: string,
  target: { accountId: string; routeEpoch: number },
  action: ExecutorAction,
  body: ReadableStream<Uint8Array>,
  options: SigningOptions & { transport?: typeof fetch; bodySHA256?: string } = {},
) {
  if (
    !/^[a-f0-9]{64}$/.test(target.accountId) ||
    !Number.isSafeInteger(target.routeEpoch) ||
    target.routeEpoch < 1 ||
    (action !== "claim" && action !== "complete")
  )
    throw new Error("Invalid executor route");
  const url = new URL(
    `/internal/v1/executor/${target.accountId}/${target.routeEpoch}/${action}`,
    backendOrigin(origin),
  );
  const max = action === "complete" ? contract.limits.executionBytes : contract.limits.commandBytes;
  const signal = options.signal ?? AbortSignal.timeout(30_000);
  let hash = options.bodySHA256;
  if (hash !== undefined && !/^[0-9a-f]{64}$/.test(hash))
    throw new AppError("invalid_request", "执行数据摘要无效", 400);
  const digest = hash === undefined ? createHash("sha256") : undefined;
  const bounded = limitStream(body, max, signal, digest);
  let upload: Blob | ReadableStream<Uint8Array> = bounded;
  if (digest) {
    upload = await new Response(bounded).blob();
    hash = digest.digest("hex");
  }
  const request = await signedRequest(url, secret, hash!, upload, { ...options, signal });
  const response = await (options.transport ?? fetch)(request);
  if (!response.body) return response;
  const responseMax =
    action === "claim" && response.ok
      ? contract.limits.executionBytes + contract.limits.commandBytes
      : contract.limits.commandBytes;
  return new Response(limitStream(response.body, responseMax, signal), response);
}

function limitStream(
  stream: ReadableStream<Uint8Array>,
  max: number,
  signal?: AbortSignal,
  digest?: ReturnType<typeof createHash>,
) {
  let length = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        length += chunk.byteLength;
        if (length > max) throw new AppError("body_too_large", "执行数据过大", 413);
        digest?.update(chunk);
        controller.enqueue(chunk);
      },
    }),
    { signal },
  );
}
