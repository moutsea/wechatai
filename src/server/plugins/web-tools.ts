import { DEEPSEEK_SEARCH_DEFAULT_MODEL, type WebResearchPlugin } from "../../shared/web-research";
import { AppError } from "../config";
import { readJson, validateBaseUrl, validatePublicDNS } from "../security";

export type WebSource = { url: string; title: string; text: string };
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 12000) => (typeof v === "string" ? v.slice(0, max) : "");

export function publicPageUrl(value: string) {
  const url = new URL(value);
  validateBaseUrl(`${url.origin}${url.pathname}`);
  if (url.username || url.password) throw new AppError("unsafe_url", "网页地址不能包含登录凭据");
  url.hash = "";
  return url.toString();
}

// Secrets go to the user-configured search endpoint only. Redirects are never
// followed with credentials, and this function has no platform-key fallback.
export async function searchWeb(
  config: WebResearchPlugin,
  key: string,
  query: string,
  signal: AbortSignal,
): Promise<WebSource[]> {
  const endpoint = validateBaseUrl(config.searchEndpoint);
  if (config.searchProvider !== "searxng" && !key)
    throw new AppError("search_key_missing", "请配置自己的搜索 API Key");
  await validatePublicDNS(endpoint);
  signal.throwIfAborted();
  const headers: Record<string, string> = { "content-type": "application/json" };
  let body: object;
  let url = endpoint;
  if (config.searchProvider === "tavily") {
    headers.authorization = `Bearer ${key}`;
    body = {
      query,
      max_results: 5,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
    };
  } else if (config.searchProvider === "exa") {
    headers["x-api-key"] = key;
    body = { query, numResults: 5, contents: { text: { maxCharacters: 12000 } } };
  } else if (config.searchProvider === "deepseek") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: config.searchModel.trim() || DEEPSEEK_SEARCH_DEFAULT_MODEL,
      max_tokens: 1024,
      stream: false,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: `请使用 web_search 搜索以下查询，必须执行搜索并引用来源：\n${query}`,
        },
      ],
    };
  } else {
    const target = new URL(endpoint);
    target.searchParams.set("q", query);
    target.searchParams.set("format", "json");
    url = target.toString();
    if (key) headers.authorization = `Bearer ${key}`;
    body = {};
  }
  const response = await fetch(url, {
    method: config.searchProvider === "searxng" ? "GET" : "POST",
    headers,
    ...(config.searchProvider === "searxng" ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
    signal,
  });
  if (!response.ok || response.status >= 300) {
    await response.body?.cancel();
    throw new AppError(
      "search_failed",
      response.status === 401 || response.status === 403
        ? "搜索服务拒绝访问，请检查 API Key 和地址"
        : "搜索服务暂时不可用，请检查服务配置或稍后重试",
      502,
    );
  }
  const raw = obj(await readJson(response, 1_000_000));
  signal.throwIfAborted();
  let rows = list(raw.results);
  if (config.searchProvider === "deepseek") {
    const blocks = list(raw.content)
      .map(obj)
      .filter((b) => b.type === "web_search_tool_result");
    if (
      !blocks.length ||
      blocks.some((b) => obj(b.content).type === "web_search_tool_result_error")
    )
      throw new AppError(
        "search_not_executed",
        "搜索接口没有返回真实搜索结果，请确认该地址和模型支持原生 Web Search",
        502,
      );
    rows = blocks
      .flatMap((b) => list(b.content))
      .filter((r) => obj(r).type === "web_search_result");
    const excerpts = list(raw.content)
      .flatMap((b) => list(obj(b).citations))
      .map(obj);
    rows = rows.map((r) => ({
      ...obj(r),
      content: excerpts
        .filter((c) => c.url === obj(r).url)
        .map((c) => str(c.cited_text))
        .join("\n"),
    }));
  } else if (!Array.isArray(raw.results))
    throw new AppError("search_format", "搜索响应格式不匹配，请选择对应的搜索 API 类型", 502);
  const seen = new Set<string>();
  return rows
    .flatMap((item) => {
      const r = obj(item);
      try {
        const url = publicPageUrl(str(r.url, 3000));
        if (seen.has(url)) return [];
        seen.add(url);
        return [
          {
            url,
            title: str(r.title, 200) || new URL(url).hostname,
            text: str(r.content || r.text),
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(0, 5);
}

async function boundedText(response: Response, limit = 1_000_000) {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("page_empty", "网页没有返回正文", 502);
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new AppError("page_too_large", "网页过大，本次未读取完整正文", 422);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function extractPage(html: string) {
  let text = "";
  // Two streaming passes ensure removed subtrees cannot leak into text callbacks.
  const clean = await new HTMLRewriter()
    .on(
      "script,style,noscript,template,iframe,svg,nav,footer,header,form,[hidden],[aria-hidden='true']",
      {
        element(el) {
          el.remove();
        },
      },
    )
    .transform(new Response(html))
    .text();
  await new HTMLRewriter()
    .on("p,div,li,h1,h2,h3,h4,br,tr,section,article", {
      element() {
        text += "\n";
      },
    })
    .onDocument({
      text(chunk) {
        if (text.length < 100000) text += chunk.text;
      },
    })
    .transform(new Response(clean))
    .text();
  return text
    .replace(/[\t ]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim()
    .slice(0, 50000);
}

export async function readWebPage(value: string, signal: AbortSignal): Promise<WebSource> {
  let url = publicPageUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    await validatePublicDNS(url);
    signal.throwIfAborted();
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        accept: "text/html,text/plain,text/markdown",
        "user-agent": "Wechatai-Reader/1.0",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) break;
      url = publicPageUrl(new URL(location, url).toString());
      continue;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (
      !response.ok ||
      !/^(text\/(html|plain|markdown)|application\/xhtml\+xml)/.test(contentType)
    ) {
      await response.body?.cancel();
      throw new AppError("page_unreadable", "网页无法读取，可能需要登录或不支持正文提取", 422);
    }
    const raw = await boundedText(response);
    const text = /html/.test(contentType) ? await extractPage(raw) : raw.slice(0, 50000);
    if (!text.trim())
      throw new AppError("page_empty", "没有取得可读正文，请换一个链接或直接粘贴文字", 422);
    return { url, title: new URL(url).hostname, text };
  }
  throw new AppError("page_redirect", "网页重定向过多，无法读取", 422);
}
