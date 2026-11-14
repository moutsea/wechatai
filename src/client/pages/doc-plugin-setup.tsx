import { ArrowRight, ChevronDown, Check } from "lucide-react";

export function DocPluginSetup() {
  return (
    <figure className="docs-plugin-example" aria-label="配置插件并在微信调用的操作示意">
      <div className="docs-plugin-flow">
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <div className="docs-plugin-heading">
              <img
                src="/images/plugins/image-generation.webp"
                alt=""
                width="30"
                height="30"
                loading="lazy"
              />
              <strong>AI 生图</strong>
            </div>
            <span>插件配置示意</span>
          </div>
          <div className="docs-channel-example-fields">
            <div>
              <div className="docs-channel-example-label">生图模型</div>
              <div className="docs-channel-example-control docs-plugin-select">
                <span>已导入的生图模型</span>
                <ChevronDown size={16} aria-hidden="true" />
              </div>
            </div>
            <div>
              <div className="docs-channel-example-label">微信快捷名称</div>
              <div className="docs-channel-example-control docs-plugin-shortcut">画图</div>
            </div>
            <div>
              <div className="docs-channel-example-label">状态</div>
              <div className="docs-channel-example-control docs-plugin-select">
                <span className="docs-plugin-enabled">
                  <Check size={16} aria-hidden="true" /> 启用
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </div>
            </div>
            <div className="docs-channel-example-submit">
              保存配置
              <ArrowRight size={17} aria-hidden="true" />
            </div>
          </div>
        </div>

        <ArrowRight className="docs-plugin-flow-arrow" size={26} aria-hidden="true" />

        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>微信 ClawBot</strong>
            <span>对话示意</span>
          </div>
          <div className="docs-plugin-messages">
            <div className="docs-plugin-bubble docs-plugin-bubble-user docs-plugin-command">
              /use 画图
            </div>
            <div className="docs-plugin-bubble">
              已进入「AI 生图」。之后直接发送画面描述即可生成图片。
            </div>
            <div className="docs-plugin-bubble docs-plugin-bubble-user">
              画一张城市街头女生人像，3:4
            </div>
            <div className="docs-plugin-image-result">
              <img
                src="/images/landing/ai-image-example.webp"
                width="318"
                height="425"
                alt="AI 生成的城市街头女生人像示例"
                loading="lazy"
              />
              <span>生成结果示例</span>
            </div>
          </div>
        </div>
      </div>
      <figcaption>
        以 AI 生图为例，需先接入可用的生图模型。快捷名为「画图」时，发送 /use 画图 即可选用。
      </figcaption>
    </figure>
  );
}
