import { ArrowRight, Check, ChevronDown, Download, Plus } from "lucide-react";

/** A static, responsive example: credentials are entered only in the workspace. */
export function DocChannelExample() {
  return (
    <figure className="docs-channel-example">
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <strong>添加渠道</strong>
          <span>配置示意</span>
        </div>
        <div className="docs-channel-example-fields">
          <div>
            <div className="docs-channel-example-label">服务商</div>
            <div className="docs-channel-example-control docs-channel-example-provider">
              <img
                src="/images/channels/deepseek.png"
                alt=""
                width="24"
                height="24"
                loading="lazy"
              />
              <span>DeepSeek</span>
              <ChevronDown size={16} aria-hidden="true" />
            </div>
          </div>
          <div>
            <div className="docs-channel-example-label">API Key</div>
            <div className="docs-channel-example-control docs-channel-example-key">
              粘贴你的 DeepSeek API Key
            </div>
          </div>
          <div className="docs-channel-example-automatic">
            <Check size={16} aria-hidden="true" />
            地址与协议已自动填写
          </div>
          <div className="docs-channel-example-submit">
            保存并获取模型
            <ArrowRight size={17} aria-hidden="true" />
          </div>
        </div>
      </div>
      <figcaption>以 DeepSeek 为例。请在「渠道与模型」页填写自己的 API Key 并保存。</figcaption>
    </figure>
  );
}

export function DocModelSyncExample() {
  return (
    <figure className="docs-channel-example" aria-label="模型同步完成后的界面示意">
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <div className="docs-model-sync-brand">
            <img src="/images/channels/deepseek.png" alt="" width="28" height="28" loading="lazy" />
            <strong>DeepSeek</strong>
          </div>
          <span>同步完成</span>
        </div>
        <div className="docs-channel-example-fields">
          <div className="docs-model-sync-meta">
            <span>OpenAI Chat Completions</span>
            <span>2 个模型</span>
          </div>
          <div>
            <div className="docs-channel-example-label">文本模型</div>
            <ul className="docs-model-sync-list" aria-label="DeepSeek 已导入的示例模型">
              {["deepseek-chat", "deepseek-reasoner"].map((model) => (
                <li key={model}>
                  <span className="docs-model-sync-dot" aria-hidden="true" />
                  <strong>{model}</strong>
                  <span className="docs-model-sync-use">使用</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="docs-model-sync-status">
            <Check size={17} aria-hidden="true" />
            已导入 2 个模型
          </div>
          <div className="docs-model-sync-actions" aria-hidden="true">
            <span>
              <Download size={15} /> 获取可用模型
            </span>
            <span>
              <Plus size={15} /> 手动添加
            </span>
          </div>
        </div>
      </div>
      <figcaption>
        同步完成后的界面示意，模型以服务商实际返回为准。看到文本模型后，即可继续连接微信。
      </figcaption>
    </figure>
  );
}
