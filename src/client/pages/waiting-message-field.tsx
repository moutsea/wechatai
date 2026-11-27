import { useLocale } from "../locale";
import { copy as sourceCopy } from "../../shared/i18n/zh-CN/copy/waiting-message-field-page";
import { copy as koCopy } from "../../shared/i18n/ko/copy/waiting-message-field-page";
import {
  MAX_WAITING_MESSAGE_LENGTH,
  type WaitingMessageSettings,
} from "../../shared/waiting-message";

export function WaitingMessageField({
  value,
  defaultMessage,
  onChange,
}: {
  value: WaitingMessageSettings;
  defaultMessage: string;
  onChange: (value: WaitingMessageSettings) => void;
}) {
  const { locale } = useLocale();
  const pageCopy = locale === "ko" ? koCopy : sourceCopy;

  return (
    <div className="waiting-message-field">
      <label className="check-label">
        <input
          type="checkbox"
          checked={value.waitingMessageEnabled}
          onChange={(e) => onChange({ ...value, waitingMessageEnabled: e.target.checked })}
        />
        {pageCopy["发送等待提示"]}
      </label>
      <p className="form-note">
        {value.waitingMessageEnabled
          ? pageCopy["收到请求后，先在微信发送一条提示。提示不消耗 credits。"]
          : pageCopy["已关闭等待提示，完成后直接发送结果；出错时仍会告知原因。"]}
      </p>
      {value.waitingMessageEnabled && (
        <>
          <label>
            {pageCopy["提示文案"]}
            <textarea
              rows={2}
              required
              maxLength={MAX_WAITING_MESSAGE_LENGTH}
              value={value.waitingMessage}
              onChange={(e) => onChange({ ...value, waitingMessage: e.target.value })}
            />
            <small>
              {pageCopy["最多 "]}
              {MAX_WAITING_MESSAGE_LENGTH}
              {pageCopy[" 字，保存后生效。"]}
            </small>
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() => onChange({ ...value, waitingMessage: defaultMessage })}
          >
            {pageCopy["恢复默认文案"]}
          </button>
        </>
      )}
    </div>
  );
}
