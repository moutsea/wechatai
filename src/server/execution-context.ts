import { AsyncLocalStorage } from "node:async_hooks";
import type { WxItem } from "./wechat";

export type HttpActivity = {
  kind: "http";
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxBytes: number;
};
export type Activity = HttpActivity | { kind: "attachments"; items: WxItem[]; timeoutMs: number };
export type HttpResult = { status: number; headers: Record<string, string>; body: string };
export class ExecutionPending extends Error {
  constructor() {
    super("Execution is durably queued");
  }
}
type Scope = { id: string; startedAt: number; perform(input: Activity): Promise<unknown> };
const scope = new AsyncLocalStorage<Scope>();
export const withExecution = <T>(value: Scope, fn: () => Promise<T>) => scope.run(value, fn);
export const executionId = () => scope.getStore()?.id;
export const executionNow = () => scope.getStore()?.startedAt ?? Date.now();
// The executor owns the upstream timeout. A local abort timer would keep the
// Durable Object awake even after it has persisted the activity and returned.
export const executionSignal = (timeoutMs: number) =>
  scope.getStore() ? new AbortController().signal : AbortSignal.timeout(timeoutMs);
export async function executionActivity<T>(input: Activity, local: () => Promise<T>): Promise<T> {
  const active = scope.getStore();
  return active ? ((await active.perform(input)) as T) : local();
}
export async function activityFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxBytes = 2_000_000,
) {
  if (!scope.getStore()) return fetch(url, init);
  init.signal?.throwIfAborted();
  const result = await executionActivity<HttpResult>(
    {
      kind: "http",
      url,
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers)),
      ...(typeof init.body === "string" ? { body: init.body } : {}),
      timeoutMs,
      maxBytes,
    },
    () => {
      throw new Error("Missing execution scope");
    },
  );
  return new Response(
    [204, 205, 304].includes(result.status) ? null : Buffer.from(result.body, "base64"),
    {
      status: result.status,
      headers: result.headers,
    },
  );
}
