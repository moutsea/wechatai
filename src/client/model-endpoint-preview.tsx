import { modelEndpoint } from "../shared/model-endpoint";
import type { Protocol } from "../shared/types";

export function ModelEndpointPreview({
  baseUrl,
  protocol,
}: {
  baseUrl: string;
  protocol: Protocol;
}) {
  let endpoint = "";
  try {
    const url = new URL(baseUrl.trim());
    // Do not repeat credentials or query-string secrets in the preview. The
    // server remains responsible for public-host/DNS and environment validation.
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      endpoint = modelEndpoint(url.toString(), protocol);
  } catch {
    // Incomplete URLs are normal while typing.
  }
  return (
    <div
      className="model-endpoint-preview"
      id="channel-endpoint-preview"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="model-endpoint-preview-title">实际请求地址</span>
      {endpoint ? (
        <div className="model-endpoint-preview-url">
          <span>POST</span>
          <code>{endpoint}</code>
        </div>
      ) : (
        <small>
          {baseUrl.trim()
            ? "请输入有效的 HTTP(S) 服务地址，不要包含密钥、查询参数或 # 片段。"
            : "填写 Base URL 后显示。"}
        </small>
      )}
    </div>
  );
}
