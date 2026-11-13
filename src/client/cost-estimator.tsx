import { useState } from "react";
import { Link } from "react-router-dom";
import { estimateTextCost } from "../shared/cost-estimate";
import { DAILY_CREDIT_DEFAULTS } from "../shared/credits";
import { useDocumentInputs } from "./document-handoff";
import "./cost-estimator.css";

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
        <p className="eyebrow">自备 API 的两笔费用</p>
        <h2 id="cost-estimator-title">先估算自己的文字用量</h2>
        <p>
          只在浏览器内计算，无需登录。服务商单价用于估算模型 API 费用；小薇
          同样使用自备模型，可能多次调用模型，实际 API 费用以服务商账单为准。云端仍需 Plus
          且服务已开放，执行次数另有限制。
        </p>
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
              <p>模型 API 费用另付服务商；小薇的内部多次调用也可能产生 API 费用。</p>
            </div>
          </>
        ) : (
          <p>请填写有效的非负数字，tokens 和轮数须为整数。</p>
        )}
      </div>
      <p className="cost-estimator-note">
        估算公式：（输入 + 输出 × 8）÷ 5000，每轮向上取整至 0.001
        credit。输入须包含每轮实际发送的历史上下文。未覆盖缓存差价、搜索、工具额外调用、附件、生图、税费或汇率；不是报价，也不保证固定聊天次数。
        <Link to="/docs/credits">查看完整计费规则</Link>
      </p>
    </section>
  );
}
