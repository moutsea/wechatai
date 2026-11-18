type Descriptor = { mime: string; bytes: number; name: string };
export const validAssetId = (id: string) => /^[0-9a-f-]{36}$/.test(id);
export const missingAsset = () => new Response("附件已过期或已删除", { status: 404 });

export function assetDownload(id: string, asset: Descriptor, body: ReadableStream) {
  return new Response(body, {
    headers: {
      "content-type": asset.mime,
      "content-length": String(asset.bytes),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": asset.name
        ? `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(asset.name).replace(/'/g, "%27")}`
        : `inline; filename="wechatai-${id}.${asset.mime === "image/jpeg" ? "jpg" : asset.mime.split("/")[1]}"`,
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
