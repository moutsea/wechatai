import type { Channel } from "../shared/types";
import { modelsEndpoint } from "../shared/model-endpoint";
import { AppError } from "./config";
import { readJson, validateBaseUrl, validatePublicDNS } from "./security";
import { MAX_CONTEXT_TOKENS } from "../shared/context";

type AvailableModel = { id: string; name: string; contextTokens?: number };
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export async function fetchAvailableModels(env: Env, channel: Channel, apiKey: string) {
  validateBaseUrl(channel.baseUrl, env.LLM_ALLOWED_HOSTS);
  const models = new Map<string, AvailableModel>();
  let invalid = 0;
  try {
    await validatePublicDNS(channel.baseUrl);
    const url = new URL(modelsEndpoint(channel.baseUrl));
    const headers: Record<string, string> = { accept: "application/json" };
    if (channel.protocol === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else headers.authorization = `Bearer ${apiKey}`;
    const signal = AbortSignal.timeout(30000);
    const cursors = new Set<string>();
    for (let page = 0; page < 20; page++) {
      // Never follow an upstream URL or redirect with the channel's credentials.
      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
        redirect: "manual",
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403)
          throw new AppError(
            "models_unauthorized",
            "获取模型失败，请检查渠道 API Key 是否有效及是否有查看模型的权限",
            502,
          );
        if (response.status === 404 || response.status === 405)
          throw new AppError(
            "models_unsupported",
            "上游未提供 /v1/models 接口，请手动添加模型",
            502,
          );
        if (response.status >= 300 && response.status < 400)
          throw new AppError(
            "models_redirect",
            "上游返回了跳转，请将渠道地址改为供应商提供的最终 API 地址",
            502,
          );
        throw new AppError(
          "models_http_error",
          `获取模型失败（${response.status}），请稍后重试或检查渠道配置`,
          502,
        );
      }
      const payload = object(await readJson(response));
      if (payload.error || !Array.isArray(payload.data))
        throw new AppError("models_format", "上游返回的模型列表格式不正确，请手动添加模型", 502);
      for (const item of payload.data) {
        const entry = object(item);
        const id = typeof entry.id === "string" ? entry.id.trim() : "";
        // Explicitly reject control characters in untrusted upstream identifiers.
        // eslint-disable-next-line no-control-regex
        if (!id || id.length > 120 || /[\x00-\x1f\x7f]/.test(id)) {
          invalid++;
          continue;
        }
        const name = typeof entry.display_name === "string" ? entry.display_name.trim() : "";
        const context = entry.context_length ?? entry.context_window;
        const contextTokens =
          typeof context === "number" &&
          Number.isInteger(context) &&
          context >= 512 &&
          context <= MAX_CONTEXT_TOKENS
            ? context
            : undefined;
        if (!models.has(id))
          models.set(id, {
            id,
            name: (name || id).slice(0, 40),
            ...(contextTokens ? { contextTokens } : {}),
          });
      }
      if (models.size + invalid > 10000)
        throw new AppError("models_too_large", "上游模型列表过大，请手动添加需要的模型", 502);
      if (payload.has_more !== true) return { models: [...models.values()], invalid };
      const cursor = payload.last_id;
      if (typeof cursor !== "string" || !cursor || cursor.length > 500 || cursors.has(cursor))
        throw new AppError(
          "models_pagination",
          "上游模型列表分页异常，请稍后重试或手动添加模型",
          502,
        );
      cursors.add(cursor);
      url.searchParams.set("after_id", cursor);
    }
    throw new AppError("models_too_large", "上游模型列表分页过多，请手动添加需要的模型", 502);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "models_unavailable",
      "暂时无法获取模型列表，连接超时或上游不可用，请稍后重试",
      502,
    );
  }
}
