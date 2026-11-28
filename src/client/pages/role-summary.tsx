import { workspaceError } from "../workspace-copy";
import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/role-summary-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/role-summary-page";
import { workspaceCopy as ptCopy } from "../../shared/i18n/pt/copy/workspace";
import { useEffect, useState } from "react";
import { useApp } from "../context";
import { Modal } from "../ui";
import { json } from "../api";
import "./roleplay.css";

type Summary = {
  text: string;
  throughId: number;
  updatedAt: number;
  resetAt: number;
  contextStart: number;
};
export function RoleSummary({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { locale } = useLocale();
  const pageCopy =
    locale === "ko" ? koCopy : locale === "pt" ? ptCopy : sourceCopy;

  const { request, notify } = useApp();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void request<Summary>(`/sessions/${sessionId}/summary`)
      .then((s) => {
        if (current) {
          setSummary(s);
          setText(s.text);
        }
      })
      .catch((e: Error) => {
        if (current) setError(workspaceError(e, locale));
      });
    return () => {
      current = false;
    };
  }, [request, sessionId, locale]);
  async function save() {
    if (!summary) return;
    setBusy(true);
    setError("");
    try {
      await request(`/sessions/${sessionId}/summary`, json({ ...summary, text }, "PATCH"));
      notify(pageCopy["剧情摘要已更新，下次对话生效"]);
      onClose();
    } catch (e) {
      setError(workspaceError(e as Error, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={pageCopy["剧情摘要"]}
      description={pageCopy["修正这段故事的记忆，不改动原始聊天记录。"]}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="form-body role-summary">
          <p className="guide-note">
            {
              pageCopy[
                "长对话会自动整理摘要。你也可以补充或修正时间、地点、关系、约定和未完成的线索。摘要仅用于当前会话；编辑不扣 credits，下次随对话发送时计入输入。"
              ]
            }
          </p>
          <label>
            {pageCopy["当前记忆"]}
            <textarea
              disabled={!summary || busy}
              maxLength={12000}
              rows={12}
              value={text}
              placeholder={
                summary
                  ? pageCopy["暂未生成摘要，最近的对话仍会作为上下文。也可以在这里补充故事记忆。"]
                  : pageCopy["正在读取…"]
              }
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <small>
            {text.length.toLocaleString()}
            {pageCopy[" / 12,000 字符。清空摘要会遗忘已压缩的剧情；/reset 可重置整个上下文。"]}
          </small>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            {pageCopy["关闭"]}
          </button>
          <button className="button" disabled={!summary || busy}>
            {busy ? pageCopy["正在保存…"] : pageCopy["保存摘要"]}
          </button>
        </div>
      </form>
    </Modal>
  );
}
