import type { PersonalAccount } from "./personal-account";
import type { RemoteAgentKind } from "../shared/remote-agent";

// The ordinary Worker holds this HTTP wait. Its account DO only handles the
// initial/final queue reads; the intervening wake socket uses DO hibernation.
// Existing OpenClaw/Hermes clients keep the same HTTP protocol and wait limit.
export async function connectorPoll(
  account: Pick<DurableObjectStub<PersonalAccount>, "fetch" | "openClawRequest">,
  pluginId: string,
  secret: string,
  kind: RemoteAgentKind,
  payload: unknown,
  signal?: AbortSignal,
) {
  const input = payload as { waitMs?: unknown } | null;
  if (
    !input ||
    typeof input.waitMs !== "number" ||
    !Number.isInteger(input.waitMs) ||
    input.waitMs <= 0 ||
    input.waitMs > 15000
  )
    return account.openClawRequest(pluginId, secret, "poll", payload, kind);
  const start = Date.now();
  let response: Response;
  try {
    response = await account.fetch("https://account.internal/connector-wait", {
      headers: {
        Upgrade: "websocket",
        "X-Plugin-Id": pluginId,
        "X-Connector-Secret": secret,
        "X-Connector-Kind": kind,
      },
    });
  } catch (error) {
    // A platform upgrade/transport failure must preserve connector availability.
    // This boundary only performs an internal socket upgrade, never model I/O.
    console.warn(
      JSON.stringify({
        event: "connector.wait_socket_failed",
        kind,
        reason:
          error instanceof Error
            ? error.message.replaceAll(secret, "[redacted]").slice(0, 400)
            : "unknown",
      }),
    );
    return account.openClawRequest(pluginId, secret, "poll", payload, kind);
  }
  if (!response.webSocket) {
    await response.body?.cancel();
    return account.openClawRequest(pluginId, secret, "poll", { ...input, waitMs: 0 }, kind);
  }
  const socket = response.webSocket;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake!: () => void;
  const changed = new Promise<void>((resolve) => {
    wake = resolve;
  });
  socket.addEventListener("message", wake);
  socket.addEventListener("close", wake);
  socket.addEventListener("error", wake);
  signal?.addEventListener("abort", wake, { once: true });
  socket.accept();
  try {
    const poll = () =>
      account.openClawRequest(pluginId, secret, "poll", { ...input, waitMs: 0 }, kind);
    const first = await poll();
    const result = JSON.parse(first) as {
      ok: boolean;
      data?: { jobs?: unknown[]; retryAfterMs?: number };
    };
    if (result.ok && result.data) result.data.retryAfterMs = 0;
    if (!result.ok || result.data?.jobs?.length || signal?.aborted) return JSON.stringify(result);
    timer = setTimeout(wake, Math.max(0, input.waitMs - (Date.now() - start)));
    await changed;
    const last = JSON.parse(await poll());
    if (last.ok) last.data.retryAfterMs = 0;
    return JSON.stringify(last);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", wake);
    socket.close(1000, "poll finished");
  }
}
