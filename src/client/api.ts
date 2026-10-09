export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const data = (await r.json()) as T & { message?: string };
  if (!r.ok) throw new ApiError(data.message || "操作未完成，请重试", r.status);
  return data;
}
export const json = (data: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
