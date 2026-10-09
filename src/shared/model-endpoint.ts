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
  // Accept existing /v1 bases and pasted endpoints without duplicating the suffix.
  // Keep gateway path prefixes, as well as the original host and URL security checks.
  const prefix = url.pathname
    .replace(/\/+$/, "")
    .replace(/\/(?:chat\/completions|responses|messages|models|images\/generations)$/, "")
    .replace(/\/v1$/, "");
  url.pathname = `${prefix}${path}`;
  return url.toString();
}
