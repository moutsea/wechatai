// Rate limit keys use the address supplied by Cloudflare at the public edge.
export function admitSessionLookup(env: Env, request: Request) {
  return env.PUBLIC_ENTRY_LIMIT.limit({
    key: "session:" + (request.headers.get("cf-connecting-ip") || "local"),
  });
}

export function entryLimited() {
  return Response.json(
    { error: "rate_limited", message: "请求过于频繁，请稍后再试。" },
    {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    },
  );
}
