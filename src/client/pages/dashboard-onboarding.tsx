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
import {
  modelFreeWechatPlugins,
  preferredRemoteAgent,
  readyCloudAgents,
} from "../../shared/wechat-readiness";
import { isRemoteAgent } from "../../shared/remote-agent";
import { useKimiseekConnect } from "./kimiseek-connect";
import "./dashboard-onboarding.css";

const steps = ["了解费用", "选择 AI", "连接微信"];

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
  const cloudAgents = readyCloudAgents(data);
  const cloud =
    cloudAgents.find((plugin) => plugin.id === data.currentSession?.pluginInstanceId) ??
    cloudAgents[0];
  const cloudReady = Boolean(cloud);
  const modelFree = modelFreeWechatPlugins(data);
  const remote = preferredRemoteAgent(modelFree, data.currentSession?.pluginInstanceId);
  const notification = modelFree.find((p) => p.pluginId === "wechatai/notification");
  const chatPlugin =
    [remote, cloud].find((p) => p?.id === data.currentSession?.pluginInstanceId) ?? remote ?? cloud;
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
      if (!data.onboardingDismissedAt) await request("/onboarding/dismiss", { method: "POST" });
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
          description="选择模型、已有 Agent 或服务通知，再用微信扫码连接。"
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
                    <h3>选择适合你的 AI 接入方式。</h3>
                    <p>
                      普通聊天需配置自己的模型 API Key 和服务地址；云端 Agent 在服务开放后供 Plus
                      会员使用，沿用你配置的文本模型。已有 Muse、Hermes、OpenClaw
                      或只收通知时，无需在微伴另配模型。
                    </p>
                  </div>
                </div>
                <p className="onboarding-explainer">
                  API Key 是调用模型的密钥，不是网页登录密码。网页版 AI
                  的免费聊天或会员权益，不等同于 API 用量。
                </p>
                <div className="onboarding-costs">
                  <div>
                    <span>自备模型</span>
                    <h4>API 余额</h4>
                    <p>模型调用可能产生费用，由 DeepSeek、KimiSeek 等服务商收取，以其价格为准。</p>
                  </div>
                  <div>
                    <span>微伴</span>
                    <h4>credits 与会员</h4>
                    <p>
                      用于微伴的使用额度和功能权益。云端 Agent 按 credits 结算，模型 API
                      费用另付你选择的服务商。
                    </p>
                  </div>
                </div>
                <p className="onboarding-note">
                  自备模型的 API 费用另付服务商；云端任务需要 Plus、正数 credits
                  余额和可用执行次数，以插件页的服务状态与限额为准。
                </p>
              </section>
            )}
            {step === 1 && (
              <section aria-label="选择 AI" className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3>选择你的 AI 服务</h3>
                  <p>聊模型可填写 API Key；已有 Agent 或只收通知，可直接到插件页配置。</p>
                </div>
                {data.cloudAgent.ready ? (
                  <button
                    className="onboarding-own-key"
                    disabled={saving || kimiseek.busy}
                    onClick={() => void dismiss(`${base}/plugins`)}
                  >
                    <Link2 size={20} />
                    <span>
                      <strong>
                        {cloudReady
                          ? "云端 Agent 已就绪"
                          : data.plan === "plus"
                            ? "使用云端 Agent"
                            : "了解 Plus 云端 Agent"}
                      </strong>
                      <small>
                        {cloudReady
                          ? "执行模型已就绪，可继续连接微信；点击管理配置"
                          : "需要 Plus 和已配置的文本模型；在插件页启用"}
                      </small>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                ) : (
                  <p className="onboarding-note">
                    云端 Agent 暂未开放，仍可使用普通模型、已有 Agent 或通知。
                  </p>
                )}
                <button
                  className="onboarding-own-key"
                  disabled={saving || kimiseek.busy}
                  onClick={() => void dismiss(`${base}/plugins`)}
                >
                  <Link2 size={20} />
                  <span>
                    <strong>接入已有 Agent 或接收通知</strong>
                    <small>Muse 托管助理、Hermes、OpenClaw 或 HTTP 推送，无需本站模型 Key</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
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
                {progress.service && (
                  <p className="onboarding-success">
                    <Check size={16} />
                    {modelFree.some((p) => p.hasKey)
                      ? "已有 Agent 或通知已配置，可以继续连接微信。"
                      : cloudReady
                        ? "云端 Agent 已就绪，可以继续连接微信。"
                        : "已配置文本模型，可以继续连接微信。"}
                  </p>
                )}
              </section>
            )}
            {step === 2 && (
              <section aria-label="连接微信" className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3>最后一步，让微信连上你的 AI</h3>
                  <p>
                    {isRemoteAgent(chatPlugin)
                      ? "Agent 无需使用微伴的模型配置；请确认连接器已经在线。"
                      : chatPlugin
                        ? "云端 Agent 已就绪，按下面的步骤连接。"
                        : notification
                          ? "消息提醒无需模型；连接后请在微信发送 /wx help 建立回复通道。"
                          : "使用自己的模型时，先确认模型服务商有可用余额。"}
                  </p>
                </div>
                <ol className="onboarding-wechat-steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>在微伴获取连接二维码</strong>
                      <p>
                        进入「微信连接」，点击「获取二维码」。扫码本身无需模型配置；普通聊天与云端
                        Agent 在执行任务前仍需配置可用文本模型。
                      </p>
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
                      <strong>
                        {chatPlugin
                          ? "选择 AI，再发第一条消息"
                          : notification
                            ? "设置通知并测试推送"
                            : "发送 /wx help 查看帮助"}
                      </strong>
                      {chatPlugin && (
                        <p>
                          使用 Agent 时，先发送 <code>/use {chatPlugin.shortcut}</code>
                          ，收到进入插件的确认后，再发送文字任务，例如「帮我整理今天的计划」。
                          扫码不会自动选择 Agent。
                        </p>
                      )}
                      <p>
                        {notification && !chatPlugin ? (
                          <>
                            先在微信发送 <code>/wx help</code> 建立回复通道，再在插件页生成通知
                            Token，用你的服务发送测试通知。
                          </>
                        ) : (
                          <>
                            发送 <code>/wx help</code> 可以查看命令帮助。
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                </ol>
                {!progress.service && (
                  <p className="onboarding-note">
                    可以先绑定微信，再配置模型或插件。只接收服务通知无需模型。
                  </p>
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
                  onClick={() => void dismiss(`${base}/wechat`)}
                >
                  <Link2 size={17} />
                  去连接微信
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
