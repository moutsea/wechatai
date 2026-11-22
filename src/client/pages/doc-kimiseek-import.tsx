import { ArrowRight, Check, ChevronDown, MousePointer2 } from "lucide-react";
import { useLocale } from "../locale";

export function DocKimiseekImport() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-kimiseek-example"
      aria-label={en ? "KimiSeek one-click import walkthrough" : "KimiSeek 一键导入操作示意"}
    >
      <div className="docs-kimiseek-flow">
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>{en ? "Add channel" : "添加渠道"}</strong>
            <span>{en ? "Entry point" : "入口示意"}</span>
          </div>
          <div className="docs-channel-example-fields">
            <div>
              <div className="docs-kimiseek-label-row">
                <span className="docs-channel-example-label">{en ? "Provider" : "服务商"}</span>
                <span className="docs-kimiseek-import-target">
                  {en ? "kimiseek one-click import" : "kimiseek 一键导入"}
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
              {en
                ? "Click the import entry to the right of “Provider” (“服务商”) and follow the new page to link your account."
                : "点击「服务商」右侧的导入入口，按新页面提示完成关联。"}
            </p>
          </div>
        </div>
        <ArrowRight className="docs-kimiseek-flow-arrow" size={26} aria-hidden="true" />
        <div className="docs-kimiseek-result">
          <span className="docs-kimiseek-result-label">{en ? "After linking" : "关联完成后"}</span>
          <div className="docs-kimiseek-result-brand">
            <img src="/images/channels/kimiseek.svg" alt="" width="44" height="44" loading="lazy" />
            <strong>KimiSeek</strong>
          </div>
          <div className="docs-kimiseek-result-item">
            <Check size={18} aria-hidden="true" />{" "}
            {en ? "Channel imported automatically" : "自动导入渠道"}
          </div>
          <div className="docs-kimiseek-result-item">
            <Check size={18} aria-hidden="true" />{" "}
            {en ? "Tries to sync available models" : "尝试同步可用模型"}
          </div>
          <p>{en ? "No manual API key entry" : "无需手动填写 API Key"}</p>
        </div>
      </div>
      <figcaption>
        {en
          ? "Illustration only. Complete the link in the workspace, then return to the channels page to confirm the imported models."
          : "此图为操作示意。请在工作台完成关联，返回渠道页确认实际导入的模型。"}
      </figcaption>
    </figure>
  );
}
