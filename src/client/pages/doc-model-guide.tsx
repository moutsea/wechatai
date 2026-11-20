import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import {
  DEFAULT_CONTEXT_TOKENS,
  DEFAULT_INPUT_TOKENS,
  DEFAULT_OUTPUT_TOKENS,
} from "../../shared/context";
import { useLocale } from "../locale";

function modelSettings(en: boolean) {
  return [
    {
      label: en ? "Input token limit" : "输入 Token 上限",
      value: DEFAULT_INPUT_TOKENS,
      hint: en
        ? "Includes the system prompt, history, attachments and this message."
        : "包含系统提示词、历史上下文、附件与本次消息。",
    },
    {
      label: en ? "Output token limit" : "输出 Token 上限",
      value: DEFAULT_OUTPUT_TOKENS,
      hint: en ? "Caps the length of each reply." : "控制每轮回复的最大长度。",
    },
    {
      label: en ? "Model context window (including output)" : "模型上下文窗口（含输出）",
      value: DEFAULT_CONTEXT_TOKENS,
      hint: en
        ? "Enter the model's actual capability; a larger number does not give the model more capacity."
        : "按模型实际能力填写，填大不会让模型容量变大。",
    },
    {
      label: en ? "Per-turn credits limit" : "单轮 credits 上限",
      value: 0,
      hint: en
        ? "0 means unlimited; it only caps Wechatai charges, not the provider bill."
        : "0 表示不限；仅限制微伴扣费，不限制服务商账单。",
    },
  ];
}

export function DocModelSettings() {
  const en = useLocale().locale === "en";
  return (
    <figure
      className="docs-channel-example"
      aria-label={en ? "Model prompt and usage settings example" : "模型提示词与用量设置示意"}
    >
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <strong>{en ? "Edit model" : "编辑模型"}</strong>
          <span>{en ? "Configuration example" : "配置示意"}</span>
        </div>
        <div className="docs-channel-example-fields">
          <div>
            <div className="docs-channel-example-label">{en ? "Model ID" : "模型 ID"}</div>
            <div className="docs-channel-example-control">deepseek-chat</div>
          </div>
          <div>
            <div className="docs-channel-example-label">
              {en ? "System prompt (optional)" : "系统提示词（可选）"}
            </div>
            <div className="docs-channel-example-control docs-model-prompt">
              {en
                ? "Answer in concise English. Give the conclusion first, then the necessary explanation."
                : "请用简洁的中文回答，先给结论，再补充必要说明。"}
            </div>
          </div>
          <details className="docs-model-options">
            <summary>
              <span>
                {en
                  ? "More settings: input, output and spending limits"
                  : "更多设置：输入、输出与消耗上限"}
              </span>
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <dl className="docs-model-setting-grid">
              {modelSettings(en).map(({ label, value, hint }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value.toLocaleString(en ? "en-US" : "zh-CN")}</dd>
                  <dd className="docs-model-setting-hint">{hint}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </div>
      <figcaption>
        {en
          ? "The prompt is an example and the limits show the defaults for a new model. Expand for explanations; save actual settings in the workspace."
          : "提示词为示例，上限展示新建模型的默认值。这里可展开说明；实际配置请在工作台保存。"}
      </figcaption>
    </figure>
  );
}

function switchSteps(en: boolean) {
  return [
    {
      title: en ? "List and choose a channel" : "查看并选择渠道",
      command: "/wx channels",
      select: "/wx channel 2",
    },
    {
      title: en ? "List and choose a model" : "查看并选择模型",
      command: "/wx models",
      select: "/wx model 2",
    },
    {
      title: en ? "Confirm the current configuration" : "确认当前配置",
      command: "/wx status",
      select: null,
    },
  ];
}

export function DocModelCommands() {
  const en = useLocale().locale === "en";
  const [status, setStatus] = useState<{ command: string; copied: boolean } | null>(null);
  async function copy(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setStatus({ command, copied: true });
    } catch {
      setStatus({ command, copied: false });
    }
  }
  return (
    <div
      className="docs-model-commands"
      role="group"
      aria-label={en ? "Common WeChat commands for switching models" : "微信切换模型的常用命令"}
    >
      <ol className="docs-model-command-list">
        {switchSteps(en).map(({ title, command, select }, index) => (
          <li key={command}>
            <span className="docs-model-command-step" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <strong>{title}</strong>
              <div className="docs-model-command-code">
                <code>{command}</code>
                <button
                  type="button"
                  aria-label={en ? `Copy command ${command}` : `复制命令 ${command}`}
                  onClick={() => void copy(command)}
                >
                  {status?.command === command && status.copied ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <Copy size={15} aria-hidden="true" />
                  )}
                  {status?.command === command && status.copied
                    ? en
                      ? "Copied"
                      : "已复制"
                    : en
                      ? "Copy"
                      : "复制"}
                </button>
              </div>
              {select ? (
                <p>
                  {en ? "After the list arrives, send " : "收到列表后，发送 "}
                  <code>{select}</code>
                  {en ? " to choose." : " 选择。"}
                  <small>
                    {en
                      ? "2 is an example; replace it with the actual number in your list."
                      : "2 是示例，请替换为列表中的实际编号。"}
                  </small>
                </p>
              ) : (
                <p>
                  {en
                    ? "Verify the current channel, model and plugin status."
                    : "核对当前渠道、模型及插件状态。"}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="docs-model-command-feedback" role="status">
        {status
          ? status.copied
            ? en
              ? `Copied ${status.command}. Paste it into the WeChat ClawBot conversation to send.`
              : `已复制 ${status.command}，请粘贴到微信 ClawBot 会话中发送。`
            : en
              ? `Could not copy automatically. Press and hold or select ${status.command} to copy it manually.`
              : `无法自动复制，请长按或选中 ${status.command} 手动复制。`
          : en
            ? "Copy a command into the WeChat ClawBot conversation, or press and hold or select it to copy manually."
            : "将命令复制到微信 ClawBot 会话中发送，也可长按或选中命令手动复制。"}
      </p>
    </div>
  );
}
