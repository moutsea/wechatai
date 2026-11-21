import { ArrowRight, Check, ChevronDown, Copy, Plus, Terminal } from "lucide-react";
import { pluginIconSource } from "../../shared/plugin-visuals";
import { useLocale } from "../locale";

export function DocAgentPairing({ kind }: { kind: "openclaw" | "hermes" }) {
  const en = useLocale().locale === "en";
  const name = kind === "openclaw" ? "OpenClaw" : "Hermes";
  return (
    <figure
      className="docs-plugin-example"
      aria-label={en ? `${name} connection walkthrough` : `${name}连接操作示意`}
    >
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
              <strong>{en ? `Connect ${name}` : `连接 ${name}`}</strong>
            </div>
            <span>{en ? "01 · Wechatai workspace" : "01 · 微伴工作台"}</span>
          </div>
          <div className="docs-channel-example-fields">
            <div className="docs-channel-example-label">
              {en ? "This connection command" : "本次连接命令"}
            </div>
            <div className="docs-agent-command-placeholder">
              {en ? "Generate a dedicated command from your account" : "从你的账号生成专属命令"}
            </div>
            <div className="docs-channel-example-submit">
              <Copy size={16} aria-hidden="true" />{" "}
              {en ? "Copy connection command" : "复制连接命令"}
            </div>
          </div>
          <div className="docs-plugin-guide-footer">
            {en ? `Copy it to the device running ${name}` : `复制到运行 ${name} 的设备`}
            <ArrowRight size={17} aria-hidden="true" />
          </div>
        </div>
        <div className="docs-channel-example-card">
          <div className="docs-channel-example-header">
            <div className="docs-plugin-heading">
              <Terminal size={22} aria-hidden="true" />
              <strong>{en ? "Device terminal" : "设备终端"}</strong>
            </div>
            <span>{en ? "02 · Computer or server" : "02 · 电脑或服务器"}</span>
          </div>
          <div className="docs-agent-terminal">
            <span>{en ? `Run it in the ${name} environment` : `在 ${name} 所在环境执行`}</span>
            <p>
              <span aria-hidden="true">$ </span>
              {en ? "Paste the connection command you just copied" : "粘贴你刚复制的连接命令"}
            </p>
            <span>
              {en
                ? "When it finishes, return to Wechatai to check the status"
                : "执行完成后，回到微伴查看状态"}
            </span>
          </div>
          <div className="docs-plugin-guide-footer">
            <Check size={16} aria-hidden="true" />
            {en ? "Wait for the page to show “Connected” (“已连接”)" : "等待网页显示「已连接」"}
          </div>
        </div>
      </div>
      <figcaption>
        {en
          ? "Sequence illustration without an executable command. Copy from your own workspace, never use someone else's command."
          : "操作顺序示意，不含可执行命令。请从自己的工作台复制，不要使用他人的连接命令。"}
      </figcaption>
    </figure>
  );
}

export function DocOpenClawConfigs() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-channel-example"
      aria-label={
        en
          ? "OpenClaw two configurations with separate shortcut names"
          : "OpenClaw 两组配置与独立快捷名称示意"
      }
    >
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
            <strong>{en ? "OpenClaw · View configuration" : "OpenClaw · 查看配置"}</strong>
          </div>
          <span>{en ? "Configuration example" : "配置示意"}</span>
        </div>
        <div className="docs-channel-example-fields">
          <div className="docs-channel-example-control docs-channel-example-provider">
            <span>{en ? "Choose configuration · Work assistant" : "选择配置 · 工作助手"}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </div>
          <div className="docs-agent-config-list">
            {(en
              ? [
                  ["Work assistant", "work"],
                  ["Life assistant", "life"],
                ]
              : [
                  ["工作助手", "work"],
                  ["生活助手", "life"],
                ]
            ).map(([name, shortcut]) => (
              <div key={shortcut}>
                <div>
                  <strong>{name}</strong>
                  <span>
                    {en ? "Each keeps its own connection and assistant" : "各自保存连接和助手选择"}
                  </span>
                </div>
                <code>@{shortcut}</code>
              </div>
            ))}
          </div>
          <div className="docs-channel-example-submit">
            <Plus size={17} aria-hidden="true" />{" "}
            {en ? "Add another configuration" : "添加另一组配置"}
          </div>
        </div>
      </div>
      <figcaption>
        {en
          ? "The two rows are two Wechatai configurations. They can come from different devices, or select different Agents in one OpenClaw install."
          : "两行代表两组微伴配置，可来自不同设备，也可在同一 OpenClaw 安装中选择不同 Agent。"}
      </figcaption>
    </figure>
  );
}

type Conversation = {
  name: string;
  image: string;
  messages: string[][];
  caption: string;
};

function conversations(en: boolean): Record<string, Conversation> {
  return {
    deepseek: {
      name: "DeepSeek",
      image: "/images/channels/deepseek.png",
      messages: en
        ? [
            ["user", "Write this more naturally: meeting tomorrow morning."],
            [
              "assistant",
              "A meeting is scheduled tomorrow morning; please reserve the time if you can.",
            ],
          ]
        : [
            ["user", "把这句话写得更自然：明天上午开会。"],
            ["assistant", "明天上午安排了会议，方便的话请提前预留时间。"],
          ],
      caption: en
        ? "Normal model conversation example. After a reply, keep sending messages to continue the topic; the selected model generates actual replies."
        : "普通模型对话示意。收到回答后，继续发消息即可延续话题；实际回复由所选模型生成。",
    },
    openclaw: {
      name: "OpenClaw",
      image: pluginIconSource("wechatai/openclaw") ?? "",
      messages: en
        ? [
            ["user", "/use work"],
            ["assistant", "You are now in the work assistant. Send a task directly."],
            ["user", "/use life"],
            ["assistant", "Switched to the life assistant; no need to exit first."],
          ]
        : [
            ["user", "/use work"],
            ["assistant", "已进入「工作助手」，之后直接发送任务。"],
            ["user", "/use life"],
            ["assistant", "已切换到「生活助手」，无需先退出。"],
          ],
      caption: en
        ? "Switching example. work and life are shortcut names for the two configurations, not OpenClaw Agent IDs."
        : "切换流程示意。work 和 life 是两组配置的快捷名，不是 OpenClaw 的 Agent ID。",
    },
    hermes: {
      name: "Hermes",
      image: pluginIconSource("wechatai/hermes") ?? "",
      messages: en
        ? [
            ["user", "/use hermes"],
            ["assistant", "You are now in Hermes. Send a message directly."],
            [
              "user",
              "I need to write a weekly report and submit expenses today. Help me prioritize.",
            ],
            [
              "assistant",
              "First confirm both deadlines. If expenses are due today, submit them first, then block out time for the report.",
            ],
          ]
        : [
            ["user", "/use hermes"],
            ["assistant", "已进入 Hermes，接下来直接发消息即可。"],
            ["user", "今天要写周报、交报销，帮我排一下顺序。"],
            ["assistant", "先确认两项截止时间。若报销今天截止，就先提交报销，再留整块时间写周报。"],
          ],
      caption: en
        ? "WeChat conversation example. Actual replies and task capability depend on your Hermes model and tool configuration."
        : "微信对话示意。实际回复和任务能力取决于你的 Hermes 模型与工具配置。",
    },
  };
}

export function DocTutorialChat({ kind }: { kind: string }) {
  const en = useLocale().locale === "en";
  const example = conversations(en)[kind];
  return (
    <figure
      className="docs-channel-example"
      aria-label={
        en ? `${example.name} WeChat conversation example` : `${example.name}微信对话示意`
      }
    >
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <div className="docs-plugin-heading">
            <img src={example.image} alt="" width="28" height="28" loading="lazy" />
            <strong>{en ? `Wechatai · ${example.name}` : `微伴 · ${example.name}`}</strong>
          </div>
          <span>{en ? "WeChat conversation example" : "微信对话示意"}</span>
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
