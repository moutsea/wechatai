export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** 服务端 `AppError` 的错误码（`plugin_limit`、`channel_limit` 等）；没有则为 undefined。 */
    public code?: string,
  ) {
    super(message);
  }
}

/** 套餐限额类错误：命中这些错误码时不只报错，还要给一条升级出口。 */
const LIMIT_CODES = new Set(["plugin_limit", "channel_limit", "wechat_link_limit"]);

export function limitErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError && error.code && LIMIT_CODES.has(error.code)
    ? error.code
    : undefined;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const data = (await r.json()) as T & { message?: string; error?: string };
  if (!r.ok)
    throw new ApiError(
      data.message || "操作未完成，请重试",
      r.status,
      typeof data.error === "string" ? data.error : undefined,
    );
  return data;
}
export const json = (data: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
