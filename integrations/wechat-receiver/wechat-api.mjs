import { randomInt } from "node:crypto";
export function wechatURL(credentials, path = "getupdates") {
  const url = new URL(credentials.baseUrl);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !(url.hostname === "ilinkai.weixin.qq.com" || url.hostname.endsWith(".ilinkai.weixin.qq.com"))
  )
    throw new Error("invalid_wechat_host");
  return `${url.origin}/ilink/bot/${path}`;
}
export function wechatHeaders(credentials) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${credentials.token}`,
    AuthorizationType: "ilink_bot_token",
    "iLink-App-Id": "bot",
    "iLink-App-ClientVersion": "131334",
    "X-WECHAT-UIN": Buffer.from(String(randomInt(0, 2 ** 32))).toString("base64"),
  };
}
