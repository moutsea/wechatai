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
import { Modal, renderCommandCopy } from "../ui";
import { localizedHref, useLocale } from "../locale";
import { LanguageSwitcher } from "../language-switcher";
import { dashboardCopy } from "../../shared/i18n/dashboard";
import { dashboardSetupProgress, shouldShowDashboardOnboarding } from "../../shared/onboarding";
import type { Snapshot } from "../../shared/types";
import {
  chatSetupIssue,
  modelFreeWechatPlugins,
  preferredRemoteAgent,
  readyCloudAgents,
} from "../../shared/wechat-readiness";
import { KimiseekConnectError, useKimiseekConnect } from "./kimiseek-connect";
import "./dashboard-onboarding.css";

const purposeIcons = {
  model: MessageCircle,
  agent: Link2,
  cloud: Cloud,
  notification: Bell,
};
type Purpose = keyof typeof purposeIcons;
const purposes = Object.keys(purposeIcons) as Purpose[];

export function DashboardOnboarding({ data }: { data: Snapshot }) {
  const { base, request, refresh } = useApp();
  const { locale } = useLocale();
  const { onboarding: copy, shell } = dashboardCopy[locale];
  const steps = [copy.choosePurpose, copy.prepareService, copy.connectWechat];
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => shouldShowDashboardOnboarding(data));
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState<Purpose>("model");
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
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
    setSaveFailed(false);
    try {
      if (!data.onboardingDismissedAt) await request("/onboarding/dismiss", { method: "POST" });
      setOpen(false);
      await refresh();
      if (path) navigate(path);
    } catch {
      setSaveFailed(true);
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
          setSaveFailed(false);
          setOpen(true);
        }}
      >
        <BookOpen size={16} />
        {copy.open}
      </button>
      {open && (
        <Modal
          wide
          title={copy.title}
          description={copy.description}
          closeLabel={shell.close}
          headerAction={<LanguageSwitcher />}
          onClose={() => void dismiss()}
        >
          <div className="onboarding-content" ref={contentRef}>
            <nav className="onboarding-nav" aria-label={copy.steps}>
              {steps.map((label, i) => (
                <button
                  key={i}
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
              <section aria-label={steps[0]} className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3 tabIndex={-1}>{copy.purposeTitle}</h3>
                  <p>{copy.purposeDescription}</p>
                </div>
                <div className="onboarding-choices">
                  {purposes.map((id) => {
                    const Icon = purposeIcons[id];
                    return (
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
                          <strong>{copy[`${id}Title`]}</strong>
                          <small>{copy[`${id}Description`]}</small>
                        </span>
                        <ArrowRight size={18} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {step === 1 && (
              <section aria-label={steps[1]} className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3 tabIndex={-1}>{copy[`${purpose}Title`]}</h3>
                </div>
                {purpose === "model" && (
                  <>
                    <p className="onboarding-explainer">{copy.modelSetup}</p>
                    <button
                      className="button onboarding-connect"
                      disabled={saving || kimiseek.busy}
                      onClick={() =>
                        void dismiss(`${base}/channels${data.channels.length ? "" : "?new=1"}`)
                      }
                    >
                      <KeyRound size={18} />
                      {modelReady ? copy.manageModels : copy.configureModels}
                      <ArrowRight size={16} />
                    </button>
                    <details className="onboarding-note">
                      <summary>{copy.needKey}</summary>
                      <p>{copy.keyExplanation}</p>
                    </details>
                    <div className="onboarding-providers">
                      <article>
                        <div className="onboarding-provider-title">
                          <img src="/images/channels/deepseek.png" alt="" width={32} height={32} />
                          <h4>{copy.deepseekTitle}</h4>
                        </div>
                        <p>{copy.deepseekDescription}</p>
                        <a
                          className="button secondary small"
                          href="https://platform.deepseek.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {copy.goToDeepseek} <ArrowUpRight size={15} />
                        </a>
                        <button
                          className="text-link"
                          disabled={saving || kimiseek.busy}
                          onClick={() => void dismiss(`${base}/channels?new=1&provider=deepseek`)}
                        >
                          {copy.enterDeepseekKey} <ArrowRight size={14} />
                        </button>
                      </article>
                      <article>
                        <div className="onboarding-provider-title">
                          <img src="/images/channels/kimiseek.svg" alt="" width={32} height={32} />
                          <h4>KimiSeek</h4>
                          <span>{copy.autoImport}</span>
                        </div>
                        <p>{copy.kimiseekDescription}</p>
                        <button
                          className="button small"
                          disabled={saving || kimiseek.busy}
                          onClick={() => void kimiseek.start(linked ? "recharge" : "connect")}
                        >
                          {kimiseek.busy
                            ? copy.linking
                            : linked
                              ? copy.recharge
                              : copy.linkAndRecharge}
                          <ArrowUpRight size={15} />
                        </button>
                        <small>{copy.rechargeNote}</small>
                      </article>
                    </div>
                    {modelReady && (
                      <p className="onboarding-success">
                        <Check size={16} />
                        {copy.modelReady}
                      </p>
                    )}
                  </>
                )}
                {purpose === "agent" && (
                  <>
                    <p className="onboarding-explainer">{copy.agentSetup}</p>
                    <p className="onboarding-note">{copy.agentCosts}</p>
                    <button
                      className="button onboarding-connect"
                      disabled={saving}
                      onClick={() => void dismiss(`${base}/plugins`)}
                    >
                      {copy.connectAgent}
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {purpose === "cloud" && (
                  <>
                    <p className="onboarding-explainer">{copy.cloudSetup}</p>
                    <p className="onboarding-note">
                      {data.cloudAgent.ready ? copy.cloudCosts : copy.cloudUnavailable}
                    </p>
                    <button
                      className="button onboarding-connect"
                      disabled={saving}
                      onClick={() => void dismiss(`${base}/plugins?plugin=wechatai/cloud-agent`)}
                    >
                      {!data.cloudAgent.ready
                        ? copy.cloudStatus
                        : cloudReady
                          ? copy.manageCloud
                          : data.plan === "plus"
                            ? copy.configureCloud
                            : copy.learnCloud}
                      <ArrowRight size={16} />
                    </button>
                    {cloudReady && (
                      <p className="onboarding-success">
                        <Check size={16} />
                        {copy.cloudReady}
                      </p>
                    )}
                  </>
                )}
                {purpose === "notification" && (
                  <>
                    <p className="onboarding-explainer">{copy.notificationSetup}</p>
                    <p className="onboarding-note">{copy.notificationCosts}</p>
                    <button
                      className="button onboarding-connect"
                      disabled={saving}
                      onClick={() => void dismiss(`${base}/plugins?plugin=wechatai/notification`)}
                    >
                      {copy.configureNotifications}
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
                <a
                  className="text-link onboarding-help"
                  href={localizedHref(locale, "/docs/credits")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {copy.costGuide}
                  <ArrowUpRight size={14} />
                </a>
              </section>
            )}
            {step === 2 && (
              <section aria-label={steps[2]} className="onboarding-panel">
                <div className="onboarding-section-title">
                  <h3 tabIndex={-1}>{copy.scan}</h3>
                  <p>
                    {purpose === "agent" && chatPlugin
                      ? copy.agentConnectedHint
                      : chatPlugin
                        ? copy.cloudConnectedHint
                        : purpose === "notification"
                          ? copy.notificationHint
                          : purpose === "agent" || purpose === "cloud"
                            ? copy.pluginHint
                            : copy.modelHint}
                  </p>
                </div>
                <ol className="onboarding-wechat-steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>{copy.getQr}</strong>
                      <p>{copy.getQrHelp}</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>{copy.scanQr}</strong>
                      <p>{copy.scanQrHelp}</p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>
                        {chatPlugin
                          ? copy.selectAi
                          : purpose === "notification"
                            ? copy.testNotification
                            : copy.sendHelp}
                      </strong>
                      {chatPlugin && (
                        <p>
                          {renderCommandCopy(copy.selectAgentHelp, {
                            select: `/use ${chatPlugin.shortcut}`,
                          })}
                        </p>
                      )}
                      <p>
                        {renderCommandCopy(
                          purpose === "notification"
                            ? copy.testNotificationHelp
                            : purpose === "model"
                              ? copy.modelChatHelp
                              : copy.pluginChatHelp,
                          { help: "/wx help", select: "/use" },
                        )}
                      </p>
                    </div>
                  </li>
                </ol>
                {!progress.service && <p className="onboarding-note">{copy.setupLaterHint}</p>}
                {linked && <p className="onboarding-note">{copy.importedHint}</p>}
                <button
                  className="button onboarding-connect"
                  disabled={saving}
                  onClick={() => void dismiss(`${base}/wechat`)}
                >
                  <Link2 size={17} />
                  {copy.goConnect}
                  <ArrowRight size={16} />
                </button>
              </section>
            )}
            {kimiseek.pendingUrl && (
              <p className="onboarding-note" role="status">
                {copy.pending}
                <a
                  className="text-link"
                  href={kimiseek.pendingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {copy.continueLinking} <ArrowUpRight size={13} />
                </a>
              </p>
            )}
            {saveFailed ? (
              <p className="form-error" role="alert">
                {copy.saveFailed}
              </p>
            ) : kimiseek.error ? (
              <KimiseekConnectError message={kimiseek.error} code={kimiseek.errorCode} />
            ) : null}
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
              {saving ? copy.saving : copy.later}
            </button>
            <div>
              {step > 0 && (
                <button
                  className="button secondary small"
                  disabled={saving || kimiseek.busy}
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={15} />
                  {copy.back}
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
                  {step === 0 ? copy.next : copy.continueWechat}
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
                  {copy.done}
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
