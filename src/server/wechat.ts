// Wire format follows OpeniLink SDK (MIT). See licenses/openilink.txt.
import { createDecipheriv, createCipheriv, createHash } from "node:crypto";
import { AppError } from "./config";
import { readJson } from "./security";
import { MAX_ATTACHMENT_BYTES } from "./attachments";
export const ILINK_BASE = "https://ilinkai.weixin.qq.com";
type WxMedia = { aes_key?: string; encrypt_query_param?: string; full_url?: string };
export type WxItem = {
  type?: number;
  text_item?: { text?: string };
  voice_item?: { text?: string };
  image_item?: {
    aeskey?: string;
    media?: WxMedia;
  };
  file_item?: { file_name?: string; len?: string; aeskey?: string; media?: WxMedia };
  ref_msg?: { title?: string; message_item?: WxItem };
};
export type WxMessage = {
  message_id?: number;
  seq?: number;
  from_user_id?: string;
  to_user_id?: string;
  message_type?: number;
  context_token?: string;
  item_list?: WxItem[];
  create_time_ms?: number;
};
export type WxCredentials = { token: string; baseUrl: string; userId: string; botId: string };
export function validateWechatHost(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.port ||
    u.username ||
    u.password ||
    !(u.hostname === "ilinkai.weixin.qq.com" || u.hostname.endsWith(".ilinkai.weixin.qq.com"))
  )
    throw new AppError("wechat_host", "微信返回的连接地址无效", 502);
  return u.origin;
}
export async function wxRequest<T>(
  path: string,
  body?: unknown,
  credentials?: WxCredentials,
  timeout = 35000,
  pollBaseUrl?: string,
  signal?: AbortSignal,
): Promise<T> {
  const base = credentials
    ? validateWechatHost(credentials.baseUrl)
    : pollBaseUrl
      ? validateWechatHost(pollBaseUrl)
      : ILINK_BASE;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "iLink-App-Id": "bot",
    "iLink-App-ClientVersion": String((2 << 16) | (1 << 8) | 6),
  };
  if (credentials) {
    headers.Authorization = `Bearer ${credentials.token}`;
    headers.AuthorizationType = "ilink_bot_token";
    headers["X-WECHAT-UIN"] = btoa(String(crypto.getRandomValues(new Uint32Array(1))[0]));
  }
  const response = await fetch(`${base}/ilink/bot/${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify({ ...body, base_info: { channel_version: "2.1.6" } }) : undefined,
    redirect: "manual",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError("wechat_unavailable", `微信连接暂时不可用（${response.status}）`, 502);
  }
  const data = (await readJson(response)) as { ret?: number; errcode?: number } & T;
  if (data.ret === -14 || data.errcode === -14)
    throw new AppError("wechat_expired", "微信连接已过期，请重新扫码", 409);
  if ((data.ret ?? 0) !== 0 || (data.errcode ?? 0) !== 0)
    throw new AppError("wechat_error", "微信暂时无法完成此操作", 502);
  return data;
}
export function extractText(message: WxMessage) {
  return (message.item_list ?? [])
    .map((i) => {
      const quote = i.ref_msg?.message_item?.text_item?.text;
      const text = i.text_item?.text || i.voice_item?.text || "";
      return quote ? `引用消息：\n${quote.slice(0, 10000)}\n\n${text}` : text;
    })
    .filter(Boolean)
    .join("\n");
}
export async function downloadMedia(item: WxItem) {
  const source = item.type === 4 ? item.file_item : item.image_item;
  const media = source?.media;
  if (!media) throw new AppError("image_missing", "未能取得附件，请重新发送");
  const url =
    media.full_url ||
    `https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param ?? "")}`;
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "novac2c.cdn.weixin.qq.com" ||
    parsed.port ||
    parsed.username ||
    parsed.password
  )
    throw new AppError("image_host", "附件地址无效");
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new AppError("image_download", "附件下载失败，请重新发送");
  }
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_ATTACHMENT_BYTES + 16)
        throw new AppError("image_size", "每个附件最大 5 MB，请缩小或拆分后发送");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const raw = Buffer.concat(chunks);
  let key = source?.aeskey
    ? Buffer.from(source.aeskey, "hex")
    : Buffer.from(media.aes_key ?? "", "base64");
  if (key.length === 32) key = Buffer.from(key.toString("utf8"), "hex");
  if (key.length !== 16) throw new AppError("image_key", "附件解密信息无效，请重新发送");
  const decipher = createDecipheriv("aes-128-ecb", key, Buffer.alloc(0));
  const data = Buffer.concat([decipher.update(raw), decipher.final()]);
  if (data.length > MAX_ATTACHMENT_BYTES)
    throw new AppError("image_size", "每个附件最大 5 MB，请缩小或拆分后发送");
  return data;
}
export async function downloadImage(item: WxItem) {
  const data = await downloadMedia(item);
  const mime =
    data[0] === 0xff && data[1] === 0xd8
      ? "image/jpeg"
      : data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP"
          ? "image/webp"
          : "";
  if (!mime) throw new AppError("image_format", "请发送 JPG、PNG 或 WebP 图片");
  return { mime, data: data.toString("base64") };
}
export async function sendText(
  credentials: WxCredentials,
  contextToken: string,
  clientId: string,
  text: string,
  timeout = 15000,
) {
  await wxRequest(
    "sendmessage",
    {
      msg: {
        from_user_id: "",
        to_user_id: credentials.userId,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        context_token: contextToken,
        item_list: [{ type: 1, text_item: { text } }],
      },
    },
    credentials,
    timeout,
  );
}

export type UploadedWechatImage = { downloadParam: string; aeskey: string; size: number };
export async function uploadWechatImage(
  credentials: WxCredentials,
  data: Uint8Array,
): Promise<UploadedWechatImage> {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(16)));
  const filekey = crypto.randomUUID().replaceAll("-", "");
  const cipher = createCipheriv("aes-128-ecb", key, Buffer.alloc(0));
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const destination = await wxRequest<{ upload_param?: string; upload_full_url?: string }>(
    "getuploadurl",
    {
      filekey,
      media_type: 1,
      to_user_id: credentials.userId,
      rawsize: data.length,
      rawfilemd5: createHash("md5").update(data).digest("hex"),
      filesize: encrypted.length,
      no_need_thumb: true,
      aeskey: key.toString("hex"),
    },
    credentials,
  );
  if (!destination.upload_full_url && !destination.upload_param)
    throw new AppError("wechat_upload", "微信暂未提供图片上传地址", 502);
  const url = new URL(
    destination.upload_full_url ||
      `https://novac2c.cdn.weixin.qq.com/c2c/upload?encrypted_query_param=${encodeURIComponent(destination.upload_param!)}&filekey=${filekey}`,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "novac2c.cdn.weixin.qq.com" ||
    url.port ||
    url.username ||
    url.password
  )
    throw new AppError("wechat_upload_host", "微信图片上传地址无效", 502);
  const result = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: encrypted,
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
  await result.body?.cancel();
  const downloadParam = result.headers.get("x-encrypted-param");
  if (!result.ok || !downloadParam || downloadParam.length > 16000)
    throw new AppError("wechat_upload", "微信图片上传失败，将自动重试", 502);
  return { downloadParam, aeskey: key.toString("hex"), size: encrypted.length };
}
export async function sendUploadedWechatImage(
  credentials: WxCredentials,
  contextToken: string,
  clientId: string,
  image: UploadedWechatImage,
) {
  await wxRequest(
    "sendmessage",
    {
      msg: {
        from_user_id: "",
        to_user_id: credentials.userId,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        context_token: contextToken,
        item_list: [
          {
            type: 2,
            image_item: {
              media: {
                encrypt_query_param: image.downloadParam,
                aes_key: Buffer.from(image.aeskey).toString("base64"),
                encrypt_type: 1,
              },
              mid_size: image.size,
            },
          },
        ],
      },
    },
    credentials,
    15000,
  );
}
