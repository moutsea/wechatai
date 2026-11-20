import { useState } from "react";
import { Link } from "react-router-dom";
import { estimateTextCost } from "../shared/cost-estimate";
import { DAILY_CREDIT_DEFAULTS } from "../shared/credits";
import { pricingCopy } from "../shared/i18n/en/copy/pricing";
import { useDocumentInputs } from "./document-handoff";
import { useLocale } from "./locale";
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
  const { locale } = useLocale();
  const english = locale === "en";
  const copy = pricingCopy.estimator;
  const numberLocale = english ? "en-US" : "zh-CN";
  const [values, setValues] = useState(() =>
    ["1000", "1000", "10", "", ""].map(
      (value, index) => inputs?.get(estimateInputIds[index]) ?? value,
    ),
  );
  const fields = english
    ? copy.fields
    : [
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
        <p className="eyebrow">{english ? copy.eyebrow : "自备 API 的两笔费用"}</p>
        <h2 id="cost-estimator-title">{english ? copy.title : "先估算自己的文字用量"}</h2>
        <p>
          {english
            ? copy.intro
            : "只在浏览器内计算，无需登录。服务商单价用于估算模型 API 费用；小薇 同样使用自备模型，可能多次调用模型，实际 API 费用以服务商账单为准。云端仍需 Plus 且服务已开放，执行次数另有限制。"}
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
              placeholder={index > 2 ? (english ? copy.placeholder : "选填，人民币单价") : undefined}
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
              <span>{english ? copy.platformLabel : "微伴中转用量 / 天"}</span>
              <strong>
                {estimate.credits.toLocaleString(numberLocale, { maximumFractionDigits: 3 })}{" "}
                credits
              </strong>
              <p>
                {english
                  ? copy.platformHint(
                      DAILY_CREDIT_DEFAULTS.free,
                      DAILY_CREDIT_DEFAULTS.plus,
                    )
                  : `Free 每天 ${DAILY_CREDIT_DEFAULTS.free}，Plus 每天 ${DAILY_CREDIT_DEFAULTS.plus}；赠额不累计。`}
              </p>
            </div>
            <div>
              <span>{english ? copy.providerLabel : "服务商模型费用 / 天"}</span>
              <strong>
                {priced
                  ? english
                    ? copy.providerValue(
                        estimate.modelYuan.toLocaleString(numberLocale, {
                          maximumFractionDigits: 4,
                        }),
                      )
                    : `约 ¥${estimate.modelYuan.toLocaleString(numberLocale, { maximumFractionDigits: 4 })}`
                  : english
                    ? copy.providerEmpty
                    : "填写单价后显示"}
              </strong>
              <p>
                {english
                  ? copy.providerHint
                  : "模型 API 费用另付服务商；小薇的内部多次调用也可能产生 API 费用。"}
              </p>
            </div>
          </>
        ) : (
          <p>
            {english ? copy.invalid : "请填写有效的非负数字，tokens 和轮数须为整数。"}
          </p>
        )}
      </div>
      <p className="cost-estimator-note">
        {english
          ? copy.note
          : "估算公式：（输入 + 输出 × 8）÷ 5000，每轮向上取整至 0.001 credit。输入须包含每轮实际发送的历史上下文。未覆盖缓存差价、搜索、工具额外调用、附件、生图、税费或汇率；不是报价，也不保证固定聊天次数。"}
        <Link to="/docs/credits">{english ? copy.noteLink : "查看完整计费规则"}</Link>
      </p>
    </section>
  );
}
