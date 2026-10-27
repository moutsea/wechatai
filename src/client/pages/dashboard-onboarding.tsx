import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  KeyRound,
  Link2,
} from "lucide-react";
import { useApp } from "../context";
import { trackFunnel } from "../analytics-client";
import { Modal } from "../ui";
import { dashboardSetupProgress, shouldShowDashboardOnboarding } from "../../shared/onboarding";
import type { Snapshot } from "../../shared/types";
import { useKimiseekConnect } from "./kimiseek-connect";
import "./dashboard-onboarding.css";

const steps = ["了解费用", "配置模型", "连接微信"];

export function DashboardOnboarding({ data }: { data: Snapshot }) {
  const { base, request, refresh } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => shouldShowDashboardOnboarding(data));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const kimiseek = useKimiseekConnect(() => setStep(2));
  const progress = dashboardSetupProgress(data);
  const linked = data.channels.some((c) => c.integration === "kimiseek");
  useEffect(() => {
    contentRef.current?.closest("dialog")?.scrollTo({ top: 0 });
  }, [step]);

  const dismiss = async (path?: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      if (!data.onboardingDismissedAt)
        await request("/onboarding/dismiss", { method: "POST" });
      setOpen(false);
      await refresh();
      if (path) navigate(path);
    } catch {
      setError("暂时没能保存引导状态，请重试。");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <button
        className="button secondary"
        onClick={() => {
          setStep(0);
          setError("");
          setOpen(true);
        }}
      >
        <BookOpen size={16} />
        新手引导
      </button>
      {open && (
        <Modal
          wide
          title="把你的 AI 接入微信"
          description="准备好模型服务，再用微信扫码连接。"
          onClose={() => void dismiss()}
        >
          <div className="onboarding-content" ref={contentRef}>
            <nav className="onboarding-nav" aria-label="新手引导步骤">
              {steps.map((label, i) => (
                <button
                  key={label}
                  aria-current={step === i ? "step" : undefined}
                  onClick={() => setStep(i)}
                >
                  <span>{i + 1}</span>
                  {label}
                </button>
              ))}
            </nav>
            {step === 0 && (
              <section aria-label="了解费用" className="onboarding-panel">
                <div className="onboarding-intro">
                  <span className="onboarding-key">
                    <KeyRound size={24} />
                  </span>
                  <div>
                    <h3>你提供模型，微伴帮你接入微信。</h3>
                    <p>
                      使用前，需要准备你自己的模型 API Key（也叫 API Token），以及服务商提供的 API
                      地址。
                    </p>
                  </div>
                </div>
                <p className="onboarding-explainer">
                  API Key 是调用模型的密钥，不是网页登录密码。网页版 AI
                  的免费聊天或会员权益，不等同于 API 用量。
                </p>
                <div className="onboarding-costs">
                  <div>
                    <span>模型服务商</span>
                    <h4>API 余额</h4>
                    <p>模型调用可能产生费用，由 DeepSeek、KimiSeek 等服务商收取，以其价格为准。</p>
                  </div>
                  <div>
                    <span>微伴</span>
                    <h4>credits 与会员</h4>
                    <p>用于微伴的使用额度和功能权益，不包含模型服务商的 API 费用。</p>
                  </div>
                </div>
                <p className="onboarding-note">
                  两边的额度分开计算；微伴有 credits，模型服务商余额不足时也无法回复。
                </p>
              </section>
            )}
            {step === 1 && (
              <section aria-label="配置模型" className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3>选择你的模型服务</h3>
                  <p>已经有 API Key，可以直接填写。没有的话，下面两种方式都可以。</p>
                </div>
                <button
                  className="onboarding-own-key"
                  disabled={saving || kimiseek.busy}
                  onClick={() =>
                    void dismiss(`${base}/channels${data.channels.length ? "" : "?new=1"}`)
                  }
                >
                  <KeyRound size={20} />
                  <span>
                    <strong>我已有 API Key</strong>
                    <small>填写服务地址与密钥，添加文本模型</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
                <div className="onboarding-providers">
                  <article>
                    <div className="onboarding-provider-title">
                      <img src="/images/channels/deepseek.png" alt="" width={32} height={32} />
                      <h4>DeepSeek 官方</h4>
                    </div>
                    <p>在 DeepSeek 开放平台注册、充值并创建 API Key，再回到微伴填写配置。</p>
                    <a
                      className="button secondary small"
                      href="https://platform.deepseek.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      前往 DeepSeek <ArrowUpRight size={15} />
                    </a>
                    <button
                      className="text-link"
                      disabled={saving || kimiseek.busy}
                      onClick={() => void dismiss(`${base}/channels?new=1&provider=deepseek`)}
                    >
                      已拿到 Key，填写配置 <ArrowRight size={14} />
                    </button>
                  </article>
                  <article>
                    <div className="onboarding-provider-title">
                      <img src="/images/channels/kimiseek.svg" alt="" width={32} height={32} />
                      <h4>KimiSeek</h4>
                      <span>自动导入</span>
                    </div>
                    <p>使用微伴账号关联 KimiSeek，自动创建密钥并导入渠道和模型，同时打开充值页。</p>
                    <button
                      className="button small"
                      disabled={saving || kimiseek.busy}
                      onClick={() => void kimiseek.start(linked ? "recharge" : "connect")}
                    >
                      {kimiseek.busy
                        ? "正在关联…"
                        : linked
                          ? "前往 KimiSeek 充值"
                          : "一键关联并去充值"}
                      <ArrowUpRight size={15} />
                    </button>
                    <small>关联不扣费；充值金额由你在 KimiSeek 确认。</small>
                  </article>
                </div>
                {progress.model && (
                  <p className="onboarding-success">
                    <Check size={16} />
                    已配置文本模型，可以继续连接微信。
                  </p>
                )}
              </section>
            )}
            {step === 2 && (
              <section aria-label="连接微信" className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3>最后一步，让微信连上你的 AI</h3>
                  <p>先确认模型服务商有可用余额，再按下面的步骤操作。</p>
                </div>
                <ol className="onboarding-wechat-steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>在微伴获取连接二维码</strong>
                      <p>进入「微信连接」，点击「获取二维码」。渠道和文本模型需先配置完整。</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>打开微信 ClawBot 的扫一扫</strong>
                      <p>微信 → 设置 → 功能中的「插件」→ 微信 ClawBot → 扫一扫，扫码并确认连接。</p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>发一句「你好」试试</strong>
                      <p>
                        确认能收到 AI 回复。发送 <code>/wx help</code> 可以查看命令帮助。
                      </p>
                    </div>
                  </li>
                </ol>
                {!progress.model && (
                  <p className="onboarding-note">还没有配置完整的文本模型，请先添加渠道和模型。</p>
                )}
                {linked && (
                  <p className="onboarding-note">
                    已导入 KimiSeek 配置。若尚未充值，请在刚打开的 KimiSeek
                    页面完成充值，也可以在「渠道与模型」中查看余额和充值。
                  </p>
                )}
                <button
                  className="button onboarding-connect"
                  disabled={saving}
                  onClick={() => void dismiss(`${base}/${progress.model ? "wechat" : "channels"}`)}
                >
                  <Link2 size={17} />
                  {progress.model ? "去连接微信" : "先配置渠道与模型"}
                  <ArrowRight size={16} />
                </button>
              </section>
            )}
            {kimiseek.pendingUrl && (
              <p className="onboarding-note" role="status">
                正在等待 KimiSeek 关联完成。新窗口没打开？
                <a
                  className="text-link"
                  href={kimiseek.pendingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  点击继续关联 <ArrowUpRight size={13} />
                </a>
              </p>
            )}
            {(error || kimiseek.error) && (
              <p className="form-error" role="alert">
                {error || kimiseek.error}
              </p>
            )}
          </div>
          <div className="onboarding-footer">
            <button
              className="text-button muted"
              disabled={saving}
              onClick={() => {
                trackFunnel("onboarding_skip", { step: step + 1 });
                void dismiss();
              }}
            >
              {saving ? "正在保存…" : "稍后设置"}
            </button>
            <div>
              {step > 0 && (
                <button
                  className="button secondary small"
                  disabled={saving}
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={15} />
                  上一步
                </button>
              )}
              {step < 2 ? (
                <button
                  className="button small"
                  disabled={saving}
                  onClick={() => {
                    trackFunnel("onboarding_step", { step: step + 1 });
                    setStep(step + 1);
                  }}
                >
                  {step === 0 ? "我了解了，下一步" : "下一步"}
                  <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  className="button secondary small"
                  disabled={saving}
                  onClick={() => {
                    trackFunnel("onboarding_done");
                    void dismiss();
                  }}
                >
                  完成引导
                  <Check size={15} />
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
