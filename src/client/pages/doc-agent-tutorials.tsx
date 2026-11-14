import { ArrowRight, Check, ChevronDown, Copy, Plus, Terminal } from "lucide-react";
import { pluginIconSource } from "../../shared/plugin-visuals";

export function DocAgentPairing({ kind }: { kind: "openclaw" | "hermes" }) {
  const name = kind === "openclaw" ? "OpenClaw" : "Hermes";
  return (
    <figure className="docs-plugin-example" aria-label={`${name}连接操作示意`}>
      <div className="docs-plugin-guide-grid">
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <div className="docs-plugin-heading">
              <img
                src={pluginIconSource(`wechatai/${kind}`)}
                alt=""
                width="28"
                height="28"
                loading="lazy"
              />
              <strong>连接 {name}</strong>
            </div>
            <span>01 · 微伴工作台</span>
          </div>
          <div className="docs-channel-example-fields">
            <div className="docs-channel-example-label">本次连接命令</div>
            <div className="docs-agent-command-placeholder">从你的账号生成专属命令</div>
            <div className="docs-channel-example-submit">
              <Copy size={16} aria-hidden="true" /> 复制连接命令
            </div>
          </div>
          <div className="docs-plugin-guide-footer">
            复制到运行 {name} 的设备
            <ArrowRight size={17} aria-hidden="true" />
          </div>
        </div>
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <div className="docs-plugin-heading">
              <Terminal size={22} aria-hidden="true" />
              <strong>设备终端</strong>
            </div>
            <span>02 · 电脑或服务器</span>
          </div>
          <div className="docs-agent-terminal">
            <span>在 {name} 所在环境执行</span>
            <p>
              <span aria-hidden="true">$ </span>粘贴你刚复制的连接命令
            </p>
            <span>执行完成后，回到微伴查看状态</span>
          </div>
          <div className="docs-plugin-guide-footer">
            <Check size={16} aria-hidden="true" />
            等待网页显示「已连接」
          </div>
        </div>
      </div>
      <figcaption>
        操作顺序示意，不含可执行命令。请从自己的工作台复制，不要使用他人的连接命令。
      </figcaption>
    </figure>
  );
}

export function DocOpenClawConfigs() {
  return (
    <figure className="docs-channel-example" aria-label="OpenClaw 两组配置与独立快捷名称示意">
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <div className="docs-plugin-heading">
            <img
              src={pluginIconSource("wechatai/openclaw")}
              alt=""
              width="28"
              height="28"
              loading="lazy"
            />
            <strong>OpenClaw · 查看配置</strong>
          </div>
          <span>配置示意</span>
        </div>
        <div className="docs-channel-example-fields">
          <div className="docs-channel-example-control docs-channel-example-provider">
            <span>选择配置 · 工作助手</span>
            <ChevronDown size={16} aria-hidden="true" />
          </div>
          <div className="docs-agent-config-list">
            {[
              ["工作助手", "work"],
              ["生活助手", "life"],
            ].map(([name, shortcut]) => (
              <div key={shortcut}>
                <div>
                  <strong>{name}</strong>
                  <span>各自保存连接和助手选择</span>
                </div>
                <code>@{shortcut}</code>
              </div>
            ))}
          </div>
          <div className="docs-channel-example-submit">
            <Plus size={17} aria-hidden="true" /> 添加另一组配置
          </div>
        </div>
      </div>
      <figcaption>
        两行代表两组微伴配置，可来自不同设备，也可在同一 OpenClaw 安装中选择不同 Agent。
      </figcaption>
    </figure>
  );
}

const conversations = {
  deepseek: {
    name: "DeepSeek",
    image: "/images/channels/deepseek.png",
    messages: [
      ["user", "把这句话写得更自然：明天上午开会。"],
      ["assistant", "明天上午安排了会议，方便的话请提前预留时间。"],
    ],
    caption: "普通模型对话示意。收到回答后，继续发消息即可延续话题；实际回复由所选模型生成。",
  },
  openclaw: {
    name: "OpenClaw",
    image: pluginIconSource("wechatai/openclaw"),
    messages: [
      ["user", "/use work"],
      ["assistant", "已进入「工作助手」，之后直接发送任务。"],
      ["user", "/use life"],
      ["assistant", "已切换到「生活助手」，无需先退出。"],
    ],
    caption: "切换流程示意。work 和 life 是两组配置的快捷名，不是 OpenClaw 的 Agent ID。",
  },
  hermes: {
    name: "Hermes",
    image: pluginIconSource("wechatai/hermes"),
    messages: [
      ["user", "/use hermes"],
      ["assistant", "已进入 Hermes，接下来直接发消息即可。"],
      ["user", "今天要写周报、交报销，帮我排一下顺序。"],
      ["assistant", "先确认两项截止时间。若报销今天截止，就先提交报销，再留整块时间写周报。"],
    ],
    caption: "微信对话示意。实际回复和任务能力取决于你的 Hermes 模型与工具配置。",
  },
} as const;

export function DocTutorialChat({ kind }: { kind: keyof typeof conversations }) {
  const example = conversations[kind];
  return (
    <figure className="docs-channel-example" aria-label={`${example.name}微信对话示意`}>
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <div className="docs-plugin-heading">
            <img src={example.image} alt="" width="28" height="28" loading="lazy" />
            <strong>微伴 · {example.name}</strong>
          </div>
          <span>微信对话示意</span>
        </div>
        <div className="docs-plugin-messages">
          {example.messages.map(([role, text], index) => (
            <div
              key={index}
              className={`docs-plugin-bubble${role === "user" ? " docs-plugin-bubble-user" : ""}${text.startsWith("/use ") ? " docs-plugin-command" : ""}`}
            >
              {text}
            </div>
          ))}
        </div>
      </div>
      <figcaption>{example.caption}</figcaption>
    </figure>
  );
}
