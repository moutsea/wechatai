import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
export function ConnectionPrivacy({ wechat = false }: { wechat?: boolean }) {
  return (
    <p className="form-note connection-privacy">
      <KeyRound size={15} aria-hidden="true" />
      {wechat
        ? "扫码授权此链接收发与你的 ClawBot 单聊消息；内容会经过微伴及你选择的服务。可在「微信连接」断开链接，聊天记录需另行删除。"
        : "Key 加密保存在微伴服务端，调用时会解密并发给你配置的服务地址；对话与必要上下文也会交给该服务。这不是端到端加密。可删除渠道，并在服务商后台撤销 Key。"}
      <Link to="/privacy">隐私与删除范围</Link>
    </p>
  );
}
