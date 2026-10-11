import { useState } from "react";
import { MessageCircle } from "lucide-react";
import type { Channel } from "../shared/types";

const providers = [
  { icon: "kimiseek.svg", domains: ["kimiseek.app"] },
  { icon: "openai.png", domains: ["openai.com"] },
  { icon: "anthropic.png", domains: ["anthropic.com"] },
  { icon: "deepseek.png", domains: ["deepseek.com"] },
  { icon: "kimi.png", domains: ["moonshot.cn", "moonshot.ai", "kimi.com"] },
  {
    icon: "qwen.png",
    domains: ["dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com", "dashscope-us.aliyuncs.com"],
  },
  {
    icon: "gemini.png",
    domains: ["generativelanguage.googleapis.com", "aiplatform.googleapis.com"],
  },
  { icon: "siliconflow.png", domains: ["siliconflow.cn", "siliconflow.com"] },
  { icon: "xai.png", domains: ["x.ai"] },
];

function channelIcon(channel: Pick<Channel, "baseUrl" | "integration">) {
  if (channel.integration === "kimiseek") return "kimiseek.svg";
  try {
    const hostname = new URL(channel.baseUrl).hostname.toLowerCase().replace(/\.$/, "");
    // Match the upstream service, not its display name or compatible API protocol.
    return providers.find(({ domains }) =>
      domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)),
    )?.icon;
  } catch {
    return undefined;
  }
}

export function ChannelIcon({ channel, small = false }: { channel: Channel; small?: boolean }) {
  const icon = channelIcon(channel);
  const [failedIcon, setFailedIcon] = useState<string>();
  const hasLogo = icon && icon !== failedIcon;
  return (
    <span
      className={`assistant-icon channel-icon ${small ? "small" : ""} ${hasLogo ? "" : "channel-icon-custom"}`}
      aria-hidden="true"
    >
      {hasLogo ? (
        <img src={`/images/channels/${icon}`} alt="" onError={() => setFailedIcon(icon)} />
      ) : (
        <MessageCircle size={small ? 18 : 24} strokeWidth={1.7} />
      )}
    </span>
  );
}
