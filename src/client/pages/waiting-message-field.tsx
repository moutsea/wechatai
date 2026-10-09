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
  return (
    <div className="waiting-message-field">
      <label className="check-label">
        <input
          type="checkbox"
          checked={value.waitingMessageEnabled}
          onChange={(e) => onChange({ ...value, waitingMessageEnabled: e.target.checked })}
        />
        发送等待提示
      </label>
      <p className="form-note">
        {value.waitingMessageEnabled
          ? "收到请求后，先在微信发送一条提示。提示不消耗 credits。"
          : "已关闭等待提示，完成后直接发送结果；出错时仍会告知原因。"}
      </p>
      {value.waitingMessageEnabled && (
        <>
          <label>
            提示文案
            <textarea
              rows={2}
              required
              maxLength={MAX_WAITING_MESSAGE_LENGTH}
              value={value.waitingMessage}
              onChange={(e) => onChange({ ...value, waitingMessage: e.target.value })}
            />
            <small>最多 {MAX_WAITING_MESSAGE_LENGTH} 字，保存后生效。</small>
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() => onChange({ ...value, waitingMessage: defaultMessage })}
          >
            恢复默认文案
          </button>
        </>
      )}
    </div>
  );
}
