import type { Protocol } from "./types";

export const protocolPaths: Record<Protocol, string> = {
  "chat-completions": "/v1/chat/completions",
  responses: "/v1/responses",
  anthropic: "/v1/messages",
};

export function modelEndpoint(baseUrl: string, protocol: Protocol): string {
  return apiEndpoint(baseUrl, protocolPaths[protocol]);
}

export function modelsEndpoint(baseUrl: string): string {
  return apiEndpoint(baseUrl, "/v1/models");
}

export function apiEndpoint(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, "");
  const prefix = pathname.replace(
    /\/(?:chat\/completions|responses|messages|models|images\/generations)$/,
    "",
  );
  // A pasted endpoint explicitly defines its root, including the absence of /v1.
  // Switching protocols replaces only the resource, never the provider/gateway prefix.
  const explicitEndpoint = prefix !== pathname;
  const versionedRoot = /\/v\d+(?:(?:alpha|beta)\d*)?$/.test(prefix);
  // These OpenAI-compatible roots already include their API version. Match both
  // host and path; Cloudflare's Anthropic route still requires /v1/messages.
  const compatibleRoot =
    (url.hostname === "generativelanguage.googleapis.com" &&
      /^\/v\d+(?:(?:alpha|beta)\d*)?\/openai$/.test(prefix)) ||
    (url.hostname === "gateway.ai.cloudflare.com" && /^\/v1\/[^/]+\/[^/]+\/openai$/.test(prefix));
  const suffix =
    explicitEndpoint || versionedRoot || compatibleRoot ? path.replace(/^\/v1(?=\/)/, "") : path;
  url.pathname = `${prefix}${suffix}`;
  return url.toString();
}
