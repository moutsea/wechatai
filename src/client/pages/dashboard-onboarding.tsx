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
  MessageCircle,
  Cloud,
  Bell,
} from "lucide-react";
import { useApp } from "../context";
import { trackFunnel } from "../analytics-client";
import { Modal } from "../ui";
import { dashboardSetupProgress, shouldShowDashboardOnboarding } from "../../shared/onboarding";
import type { Snapshot } from "../../shared/types";
import {
  chatSetupIssue,
  modelFreeWechatPlugins,
  preferredRemoteAgent,
  readyCloudAgents,
} from "../../shared/wechat-readiness";
import { useKimiseekConnect } from "./kimiseek-connect";
import "./dashboard-onboarding.css";

const steps = ["选择用途", "准备服务", "连接微信"];
const purposes = [
  {
    id: "model",
    title: "在微信聊模型",
    description: "接入 DeepSeek、Claude、GPT 等",
    icon: MessageCircle,
  },
  {
    id: "agent",
    title: "连接已有 Agent",
    description: "接入 Muse、Hermes 或 OpenClaw",
    icon: Link2,
  },
  {
    id: "cloud",
    title: "使用云端助手小薇",
    description: "免部署，处理文件与任务 · Plus",
    icon: Cloud,
  },
  {
    id: "notification",
    title: "接收服务通知",
    description: "把你的服务消息推送到微信",
    icon: Bell,
  },
] as const;
type Purpose = (typeof purposes)[number]["id"];

export function DashboardOnboarding({ data }: { data: Snapshot }) {
  const { base, request, refresh } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => shouldShowDashboardOnboarding(data));
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState<Purpose>("model");
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
  const chatPlugin = purpose === "cloud" ? cloud : purpose === "agent" ? remote : undefined;
  const modelReady = chatSetupIssue(data) === null;
  const linked = data.channels.some((c) => c.integration === "kimiseek");
  useEffect(() => {
    if (!open) return;
    contentRef.current?.querySelector<HTMLElement>("section h3")?.focus({ preventScroll: true });
    contentRef.current?.closest("dialog")?.scrollTo({ top: 0 });
  }, [open, step]);

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
          description="按用途配置，再用微信扫码连接。"
          onClose={() => void dismiss()}
        >
          <div className="onboarding-content" ref={contentRef}>
            <nav className="onboarding-nav" aria-label="新手引导步骤">
              {steps.map((label, i) => (
                <button
                  key={label}
                  aria-current={step === i ? "step" : undefined}
                  disabled={saving || kimiseek.busy}
                  onClick={() => setStep(i)}
                >
                  <span>{i + 1}</span>
                  {label}
                </button>
              ))}
            </nav>
            {step === 0 && (
              <section aria-label="选择用途" className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3 tabIndex={-1}>你想在微信里做什么？</h3>
                  <p>选择一种用途，按提示完成配置。</p>
                </div>
                <div className="onboarding-choices">
                  {purposes.map(({ id, title, description, icon: Icon }) => (
                    <button
                      key={id}
                      className="onboarding-own-key"
                      aria-pressed={purpose === id}
                      disabled={saving || kimiseek.busy}
                      onClick={() => {
                        setPurpose(id);
                        trackFunnel("onboarding_step", { step: 1 });
                        setStep(1);
                      }}
                    >
                      <Icon size={22} aria-hidden="true" />
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            {step === 1 && (
              <section aria-label="准备服务" className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3 tabIndex={-1}>{purposes.find((item) => item.id === purpose)!.title}</h3>
                </div>
                {purpose === "model" && (
                  <>
                    <p className="onboarding-explainer">
                      选择服务商，填入 API Key，同步模型即可。模型 API
                      费用另付服务商；微伴提供每日免费 credits。
                    </p>
                    <button
                      className="button onboarding-connect"
                      disabled={saving || kimiseek.busy}
                      onClick={() =>
                        void dismiss(`${base}/channels${data.channels.length ? "" : "?new=1"}`)
                      }
                    >
                      <KeyRound size={18} />
                      {modelReady ? "管理模型配置" : "我有 Key，去配置模型"}
                      <ArrowRight size={16} />
                    </button>
                    <details className="onboarding-note">
                      <summary>还没有 API Key？</summary>
                      <p>
                        API Key
                        是模型服务商提供的调用密钥，不是聊天网站的登录密码。可选择下方渠道，获取后回到微伴配置。
                      </p>
                    </details>
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
                        <p>
                          使用微伴账号关联 KimiSeek，自动创建密钥并导入渠道和模型，同时打开充值页。
                        </p>
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
                    {modelReady && (
                      <p className="onboarding-success">
                        <Check size={16} />
                        文本模型已配置，可以继续连接微信。
                      </p>
                    )}
                  </>
                )}
                {purpose === "agent" && (
                  <>
                    <p className="onboarding-explainer">
                      已有 Muse 托管助理，或运行中的 Hermes、OpenClaw？在插件页选择对应
                      Agent，按提示连接。
                    </p>
                    <p className="onboarding-note">
                      无需在微伴另配模型 Key。转发消耗微伴 credits，Agent
                      自身费用由你原来的服务收取。
                    </p>
                    <button
                      className="button onboarding-connect"
                      disabled={saving}
                      onClick={() => void dismiss(`${base}/plugins`)}
                    >
                      去连接 Agent
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {purpose === "cloud" && (
                  <>
                    <p className="onboarding-explainer">
                      小薇运行在微伴云端，可处理文件、生成文档，无需自行部署。
                    </p>
                    <p className="onboarding-note">
                      {data.cloudAgent.ready
                        ? "仅对 Plus 会员开放，需配置可用的文本模型。任务消耗 credits，模型 API 费用另付服务商。"
                        : "小薇当前暂不可用，请在插件页查看服务状态。"}
                    </p>
                    <button
                      className="button onboarding-connect"
                      disabled={saving}
                      onClick={() => void dismiss(`${base}/plugins?plugin=wechatai/cloud-agent`)}
                    >
                      {!data.cloudAgent.ready
                        ? "查看小薇状态"
                        : cloudReady
                          ? "管理小薇"
                          : data.plan === "plus"
                            ? "去配置小薇"
                            : "了解小薇与 Plus"}
                      <ArrowRight size={16} />
                    </button>
                    {cloudReady && (
                      <p className="onboarding-success">
                        <Check size={16} />
                        执行模型已就绪，可以继续连接微信。
                      </p>
                    )}
                  </>
                )}
                {purpose === "notification" && (
                  <>
                    <p className="onboarding-explainer">
                      将构建结果、订单或告警等服务消息推送到微信。在插件页配置通知，获取推送地址与
                      Token。
                    </p>
                    <p className="onboarding-note">
                      无需模型 API Key，Webhook 推送不扣
                      credits。连接微信后，先发一条消息建立回复通道。
                    </p>
                    <button
                      className="button onboarding-connect"
                      disabled={saving}
                      onClick={() => void dismiss(`${base}/plugins?plugin=wechatai/notification`)}
                    >
                      去配置通知
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
                <a
                  className="text-link onboarding-help"
                  href="/docs/credits"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看额度与费用说明
                  <ArrowUpRight size={14} />
                </a>
              </section>
            )}
            {step === 2 && (
              <section aria-label="连接微信" className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3 tabIndex={-1}>扫码连接微信</h3>
                  <p>
                    {purpose === "agent" && chatPlugin
                      ? "Agent 无需使用微伴的模型配置；请确认连接器已经在线。"
                      : chatPlugin
                        ? "小薇已就绪，按下面的步骤连接。"
                        : purpose === "notification"
                          ? "连接后，在微信发送 /wx help，再测试通知推送。"
                          : purpose === "agent" || purpose === "cloud"
                            ? "先在插件页完成所选助手的配置，再连接微信。"
                            : "普通聊天需选好模型，并确保服务商有可用 API 余额。"}
                  </p>
                </div>
                <ol className="onboarding-wechat-steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>在微伴获取连接二维码</strong>
                      <p>
                        进入「微信连接」，获取二维码。用手机看本站时，请用电脑或另一台设备展示二维码。
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>打开微信 ClawBot 的扫一扫</strong>
                      <p>
                        微信「我 → 设置 → 插件 → 微信
                        ClawBot」，扫码并确认。找不到入口时，请先更新微信。
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>
                        {chatPlugin
                          ? "选择 AI，再发第一条消息"
                          : purpose === "notification"
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
                        {purpose === "notification" ? (
                          <>
                            先在微信发送 <code>/wx help</code> 建立回复通道，再在插件页生成通知
                            Token，用你的服务发送测试通知。
                          </>
                        ) : purpose === "model" ? (
                          <>
                            普通聊天先在「微信连接」选好模型，再发一句「你好」。发送{" "}
                            <code>/wx help</code> 可查看帮助。
                          </>
                        ) : (
                          <>
                            在插件页确认助手已配置，再在微信用 <code>/use</code> 选择它。发送{" "}
                            <code>/wx help</code> 可查看帮助。
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
                  disabled={saving || kimiseek.busy}
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={15} />
                  上一步
                </button>
              )}
              {step < 2 ? (
                <button
                  className="button small"
                  disabled={saving || kimiseek.busy}
                  onClick={() => {
                    trackFunnel("onboarding_step", { step: step + 1 });
                    setStep(step + 1);
                  }}
                >
                  {step === 0 ? "下一步" : "继续连接微信"}
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
