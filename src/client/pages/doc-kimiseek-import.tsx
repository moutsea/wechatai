import { ArrowRight, Check, ChevronDown, MousePointer2 } from "lucide-react";

export function DocKimiseekImport() {
  return (
    <figure className="docs-kimiseek-example" aria-label="KimiSeek 一键导入操作示意">
      <div className="docs-kimiseek-flow">
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>添加渠道</strong>
            <span>入口示意</span>
          </div>
          <div className="docs-channel-example-fields">
            <div>
              <div className="docs-kimiseek-label-row">
                <span className="docs-channel-example-label">服务商</span>
                <span className="docs-kimiseek-import-target">
                  kimiseek 一键导入
                  <MousePointer2 size={17} aria-hidden="true" />
                </span>
              </div>
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
            <p className="docs-kimiseek-hint">
              点击「服务商」右侧的导入入口，按新页面提示完成关联。
            </p>
          </div>
        </div>
        <ArrowRight className="docs-kimiseek-flow-arrow" size={26} aria-hidden="true" />
        <div className="docs-kimiseek-result">
          <span className="docs-kimiseek-result-label">关联完成后</span>
          <div className="docs-kimiseek-result-brand">
            <img src="/images/channels/kimiseek.svg" alt="" width="44" height="44" loading="lazy" />
            <strong>KimiSeek</strong>
          </div>
          <div className="docs-kimiseek-result-item">
            <Check size={18} aria-hidden="true" /> 自动导入渠道
          </div>
          <div className="docs-kimiseek-result-item">
            <Check size={18} aria-hidden="true" /> 尝试同步可用模型
          </div>
          <p>无需手动填写 API Key</p>
        </div>
      </div>
      <figcaption>此图为操作示意。请在工作台完成关联，返回渠道页确认实际导入的模型。</figcaption>
    </figure>
  );
}
