import { ArrowRight, ChevronDown, Check } from "lucide-react";
import { useLocale } from "../locale";

export function DocPluginSetup() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-plugin-example"
      aria-label={
        en
          ? "Walkthrough of configuring a plugin and using it in WeChat"
          : "配置插件并在微信调用的操作示意"
      }
    >
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
              <strong>{en ? "AI image generation" : "AI 生图"}</strong>
            </div>
            <span>{en ? "Plugin configuration example" : "插件配置示意"}</span>
          </div>
          <div className="docs-channel-example-fields">
            <div>
              <div className="docs-channel-example-label">{en ? "Image model" : "生图模型"}</div>
              <div className="docs-channel-example-control docs-plugin-select">
                <span>{en ? "Imported image model" : "已导入的生图模型"}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </div>
            </div>
            <div>
              <div className="docs-channel-example-label">
                {en ? "WeChat shortcut name" : "微信快捷名称"}
              </div>
              <div className="docs-channel-example-control docs-plugin-shortcut">画图</div>
            </div>
            <div>
              <div className="docs-channel-example-label">{en ? "Status" : "状态"}</div>
              <div className="docs-channel-example-control docs-plugin-select">
                <span className="docs-plugin-enabled">
                  <Check size={16} aria-hidden="true" /> {en ? "Enabled" : "启用"}
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </div>
            </div>
            <div className="docs-channel-example-submit">
              {en ? "Save configuration" : "保存配置"}
              <ArrowRight size={17} aria-hidden="true" />
            </div>
          </div>
        </div>

        <ArrowRight className="docs-plugin-flow-arrow" size={26} aria-hidden="true" />

        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <strong>{en ? "WeChat ClawBot" : "微信 ClawBot"}</strong>
            <span>{en ? "Conversation example" : "对话示意"}</span>
          </div>
          <div className="docs-plugin-messages">
            <div className="docs-plugin-bubble docs-plugin-bubble-user docs-plugin-command">
              /use 画图
            </div>
            <div className="docs-plugin-bubble">
              {en
                ? "You are now in AI image generation. Send a description to generate an image."
                : "已进入「AI 生图」。之后直接发送画面描述即可生成图片。"}
            </div>
            <div className="docs-plugin-bubble docs-plugin-bubble-user">
              {en ? "A portrait of a woman on a city street, 3:4" : "画一张城市街头女生人像，3:4"}
            </div>
            <div className="docs-plugin-image-result">
              <img
                src="/images/landing/ai-image-example.webp"
                width="318"
                height="425"
                alt={
                  en
                    ? "Example AI-generated portrait of a woman on a city street"
                    : "AI 生成的城市街头女生人像示例"
                }
                loading="lazy"
              />
              <span>{en ? "Generated result example" : "生成结果示例"}</span>
            </div>
          </div>
        </div>
      </div>
      <figcaption>
        {en
          ? "Using AI image generation as an example; an available image model must be connected first. With the shortcut “画图”, send /use 画图 to select it."
          : "以 AI 生图为例，需先接入可用的生图模型。快捷名为「画图」时，发送 /use 画图 即可选用。"}
      </figcaption>
    </figure>
  );
}
