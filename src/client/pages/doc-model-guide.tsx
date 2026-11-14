import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import {
  DEFAULT_CONTEXT_TOKENS,
  DEFAULT_INPUT_TOKENS,
  DEFAULT_OUTPUT_TOKENS,
} from "../../shared/context";

const modelSettings = [
  {
    label: "输入 Token 上限",
    value: DEFAULT_INPUT_TOKENS,
    hint: "包含系统提示词、历史上下文、附件与本次消息。",
  },
  {
    label: "输出 Token 上限",
    value: DEFAULT_OUTPUT_TOKENS,
    hint: "控制每轮回复的最大长度。",
  },
  {
    label: "模型上下文窗口（含输出）",
    value: DEFAULT_CONTEXT_TOKENS,
    hint: "按模型实际能力填写，填大不会让模型容量变大。",
  },
  {
    label: "单轮 credits 上限",
    value: 0,
    hint: "0 表示不限；仅限制微伴扣费，不限制服务商账单。",
  },
];

export function DocModelSettings() {
  return (
    <figure className="docs-channel-example" aria-label="模型提示词与用量设置示意">
      <div className="docs-channel-example-card">
        <div className="docs-channel-example-header">
          <strong>编辑模型</strong>
          <span>配置示意</span>
        </div>
        <div className="docs-channel-example-fields">
          <div>
            <div className="docs-channel-example-label">模型 ID</div>
            <div className="docs-channel-example-control">deepseek-chat</div>
          </div>
          <div>
            <div className="docs-channel-example-label">系统提示词（可选）</div>
            <div className="docs-channel-example-control docs-model-prompt">
              请用简洁的中文回答，先给结论，再补充必要说明。
            </div>
          </div>
          <details className="docs-model-options">
            <summary>
              <span>更多设置：输入、输出与消耗上限</span>
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <dl className="docs-model-setting-grid">
              {modelSettings.map(({ label, value, hint }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value.toLocaleString("zh-CN")}</dd>
                  <dd className="docs-model-setting-hint">{hint}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </div>
      <figcaption>
        提示词为示例，上限展示新建模型的默认值。这里可展开说明；实际配置请在工作台保存。
      </figcaption>
    </figure>
  );
}

const switchSteps = [
  { title: "查看并选择渠道", command: "/wx channels", select: "/wx channel 2" },
  { title: "查看并选择模型", command: "/wx models", select: "/wx model 2" },
  { title: "确认当前配置", command: "/wx status", select: null },
];

export function DocModelCommands() {
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
    <div className="docs-model-commands" role="group" aria-label="微信切换模型的常用命令">
      <ol className="docs-model-command-list">
        {switchSteps.map(({ title, command, select }, index) => (
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
                  aria-label={`复制命令 ${command}`}
                  onClick={() => void copy(command)}
                >
                  {status?.command === command && status.copied ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <Copy size={15} aria-hidden="true" />
                  )}
                  {status?.command === command && status.copied ? "已复制" : "复制"}
                </button>
              </div>
              {select ? (
                <p>
                  收到列表后，发送 <code>{select}</code> 选择。
                  <small>2 是示例，请替换为列表中的实际编号。</small>
                </p>
              ) : (
                <p>核对当前渠道、模型及插件状态。</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="docs-model-command-feedback" role="status">
        {status
          ? status.copied
            ? `已复制 ${status.command}，请粘贴到微信 ClawBot 会话中发送。`
            : `无法自动复制，请长按或选中 ${status.command} 手动复制。`
          : "将命令复制到微信 ClawBot 会话中发送，也可长按或选中命令手动复制。"}
      </p>
    </div>
  );
}
