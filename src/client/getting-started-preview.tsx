import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Copy, Bell, Bot, MessageSquare } from "lucide-react";
import { estimateTextCost } from "../shared/cost-estimate";
import { DAILY_CREDIT_DEFAULTS } from "../shared/credits";
import { useDocumentInputs } from "./document-handoff";
import "./getting-started-preview.css";

export function WechatPrerequisite() {
  const [available, setAvailable] = useState<"yes" | "no" | null>(null);
  return (
    <section className="start-check" aria-labelledby="start-check-title">
      <h2 id="start-check-title">先看微信入口，再开始配置</h2>
      <p>
        打开手机微信「我 → 设置 → 功能 → 插件」，检查是否有「微信
        ClawBot」。不同账号的开放情况可能不同。
      </p>
      <div className="start-check-actions" role="group" aria-label="微信入口检查">
        <button
          type="button"
          className="button secondary small"
          aria-pressed={available === "yes"}
          onClick={() => setAvailable("yes")}
        >
          我有 ClawBot 入口
        </button>
        <button
          type="button"
          className="button secondary small"
          aria-pressed={available === "no"}
          onClick={() => setAvailable("no")}
        >
          暂时找不到入口
        </button>
      </div>
      <div aria-live="polite">
        {available === "yes" && (
          <p>
            接下来选择下方的使用方式。聊模型需自备有效 API Key 和服务商余额；已有 Agent
            或只收通知无需添加本站模型渠道。<Link to="/register">免费创建账户 →</Link>
          </p>
        )}
        {available === "no" && (
          <p>
            先暂停 Key 配置与付费。微伴无法替账号开通微信入口；可先查看
            <Link to="/wechat-clawbot">入口截图与排查说明</Link>
            ，等待微信开放后再绑定。下面的模拟预览无需注册。
          </p>
        )}
      </div>
      <p className="start-note">
        只支持与 ClawBot 单聊。此检查是操作指引，不会读取你的微信，也不能验证账号是否可绑定。
      </p>
    </section>
  );
}

const paths = [
  {
    icon: MessageSquare,
    title: "在微信聊模型",
    note: "自带 API Key",
    body: "模型运行在你选择的服务商。准备有效 Key 与余额，微伴负责中转与会话。",
    cost: "平台 credits + 服务商模型费",
    href: "/docs/getting-started",
    action: "配置第一个模型",
  },
  {
    icon: Bot,
    title: "连接已有 Agent",
    note: "自备在线设备",
    body: "OpenClaw / Hermes 在你自己的电脑或服务器运行。设备和 Agent 需保持在线。",
    cost: "平台 credits + Agent 自身费用",
    href: "/wechat-agent",
    action: "选择 Agent 接入方式",
  },
  {
    icon: Bell,
    title: "接收服务通知",
    note: "无需模型 Key",
    body: "让自己的服务把构建结果、订单或告警推送到已绑定微信。无需模型参与。",
    cost: "Webhook 推送不扣 credits",
    href: "/docs/notifications",
    action: "配置通知 Webhook",
  },
];
const tasks = [
  {
    title: "整理一段会议记录",
    prompt:
      "把下面的会议记录整理成待办表：任务、负责人、截止时间。没有明确的信息请标为待确认，不要推测。",
    result: "示例结果：整理为三列表格，缺少负责人或时间的项目标记「待确认」。",
    requires: "配置文字模型并连接微信；模型费另计。",
    href: "/docs/deepseek-in-wechat",
  },
  {
    title: "记下一笔午餐开销",
    prompt: "@助手 记一笔支出，今天午餐 28 元，分类餐饮。",
    result: "示例结果：个人助理保存一笔餐饮支出，可在工作台核对。",
    requires: "先配置个人助理，快捷名设为「助手」；Free 可使用 1 个插件。",
    href: "/docs/personal-assistant",
  },
  {
    title: "十分钟后提醒自己",
    prompt: "@助手 10 分钟后提醒我检查烤箱。",
    result: "示例结果：确认提醒时间，到点后尝试向已绑定微信发送提醒。",
    requires: "个人助理 + 有效微信连接。受最近互动后的 24 小时回复窗口影响，不保证必达。",
    href: "/docs/personal-assistant",
  },
];
export function GettingStartedPreview() {
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState("");
  const task = tasks[selected];
  return (
    <section className="start-explore" id="start" aria-labelledby="start-explore-title">
      <header>
        <p className="eyebrow">从你想做的事开始</p>
        <h2 id="start-explore-title">一个微信，三种接入方式</h2>
        <p>先确认入口，再选适合自己的路径。免费版可配置 1 个插件、绑定 1 个微信链接。</p>
      </header>
      <WechatPrerequisite />
      <div className="start-paths">
        {paths.map(({ icon: Icon, ...path }) => (
          <article key={path.title}>
            <Icon size={24} aria-hidden="true" />
            <span className="start-tag">{path.note}</span>
            <h3>{path.title}</h3>
            <p>{path.body}</p>
            <strong>{path.cost}</strong>
            <Link to={path.href}>
              {path.action}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
      <section className="task-preview" id="try" aria-labelledby="task-preview-title">
        <div>
          <p className="eyebrow">不用注册，先试着看</p>
          <h2 id="task-preview-title">选一件小事，看看怎么用</h2>
          <p>模拟预览：不收 API Key、不连接微信、不调用模型。结果用于说明操作方式。</p>
          <div className="task-choices" role="group" aria-label="选择示例任务">
            {tasks.map((item, index) => (
              <button
                key={item.title}
                type="button"
                aria-pressed={selected === index}
                onClick={() => {
                  setSelected(index);
                  setCopied("");
                }}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
        <div className="task-conversation">
          <span className="start-tag">模拟预览</span>
          <p className="task-prompt">{task.prompt}</p>
          <p className="task-result">{task.result}</p>
          <p className="start-note">前提：{task.requires}</p>
          <div className="start-check-actions">
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                if (!navigator.clipboard?.writeText) {
                  setCopied("复制失败，请选中上方文字手动复制");
                  return;
                }
                void navigator.clipboard.writeText(task.prompt).then(
                  () => setCopied("已复制，配置完成后可粘贴到微信"),
                  () => setCopied("复制失败，请选中上方文字手动复制"),
                );
              }}
            >
              <Copy size={15} aria-hidden="true" />
              复制示例
            </button>
            <Link to={task.href}>查看操作教程 →</Link>
          </div>
          <p role="status">{copied}</p>
        </div>
      </section>
    </section>
  );
}

const estimateInputIds = [
  "estimate-input-tokens",
  "estimate-output-tokens",
  "estimate-rounds",
  "estimate-input-price",
  "estimate-output-price",
];

export function CostEstimator() {
  const inputs = useDocumentInputs();
  const [values, setValues] = useState(() =>
    ["1000", "1000", "10", "", ""].map(
      (value, index) => inputs?.get(estimateInputIds[index]) ?? value,
    ),
  );
  const fields = [
    "每轮输入 tokens（含历史上下文）",
    "每轮输出 tokens",
    "每天请求轮数",
    "服务商输入价（元 / 百万 tokens）",
    "服务商输出价（元 / 百万 tokens）",
  ];
  const estimate = values.slice(0, 3).every((v) => v !== "")
    ? estimateTextCost(...(values.map(Number) as [number, number, number, number, number]))
    : null;
  const priced = values[3] !== "" && values[4] !== "";
  return (
    <section className="cost-estimator" id="estimate" aria-labelledby="cost-estimator-title">
      <header>
        <p className="eyebrow">两笔账，分开算</p>
        <h2 id="cost-estimator-title">先估算自己的文字用量</h2>
        <p>只在浏览器内计算，无需登录。价格请从你的服务商账单填写，不预设模型报价。</p>
      </header>
      <div className="cost-fields">
        {fields.map((label, index) => (
          <label key={label}>
            {label}
            <input
              id={estimateInputIds[index]}
              type="number"
              min="0"
              step={index < 3 ? "1" : "any"}
              value={values[index]}
              placeholder={index > 2 ? "选填，人民币单价" : undefined}
              onChange={(e) =>
                setValues((old) => old.map((v, i) => (i === index ? e.target.value : v)))
              }
            />
          </label>
        ))}
      </div>
      <div className="cost-results" aria-live="polite">
        {estimate ? (
          <>
            <div>
              <span>微伴中转用量 / 天</span>
              <strong>
                {estimate.credits.toLocaleString("zh-CN", { maximumFractionDigits: 3 })} credits
              </strong>
              <p>
                Free 每天 {DAILY_CREDIT_DEFAULTS.free}，Plus 每天 {DAILY_CREDIT_DEFAULTS.plus}
                ；赠额不累计。
              </p>
            </div>
            <div>
              <span>服务商模型费用 / 天</span>
              <strong>
                {priced
                  ? `约 ¥${estimate.modelYuan.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}`
                  : "填写单价后显示"}
              </strong>
              <p>单独付给你的服务商，不包含在 Plus 或 credits 内。</p>
            </div>
          </>
        ) : (
          <p>请填写有效的非负数字，tokens 和轮数须为整数。</p>
        )}
      </div>
      <p className="start-note">
        估算公式：（输入 + 输出 × 8）÷ 5000，每轮向上取整至 0.001
        credit。输入须包含每轮实际发送的历史上下文。未覆盖缓存差价、搜索、工具额外调用、附件、生图、税费或汇率；不是报价，也不保证固定聊天次数。
        <Link to="/docs/credits">查看完整计费规则</Link>
      </p>
    </section>
  );
}
