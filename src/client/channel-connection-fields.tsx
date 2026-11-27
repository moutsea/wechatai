import { useWorkspaceText } from "./workspace-copy";
import { ConnectionPrivacy } from "./connection-privacy";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import {
  CHANNEL_PROVIDERS,
  channelProvider,
  channelNeedsApiKey,
} from "../shared/channel-providers";
import { protocolLabels, type Channel, type ChannelInput } from "../shared/types";
import { ModelEndpointPreview } from "./model-endpoint-preview";

export function ChannelConnectionFields({
  form,
  providerId,
  previous,
  disabled,
  onChange,
  onProviderChange,
  importAction,
  importStatus,
}: {
  form: ChannelInput;
  providerId: string;
  previous?: Channel;
  disabled: boolean;
  onChange: <K extends keyof ChannelInput>(key: K, value: ChannelInput[K]) => void;
  onProviderChange: (id: string) => void;
  importAction?: ReactNode;
  importStatus?: ReactNode;
}) {
  const copyText = useWorkspaceText();
  const provider = channelProvider(providerId);
  const needsKey = channelNeedsApiKey(previous, form);
  const nameFields = (
    <>
      <label>
        {copyText("渠道名称")}
        <input
          required={!provider}
          maxLength={40}
          disabled={disabled}
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder={provider ? copyText(provider.name) : copyText("例如：我的模型服务")}
        />
      </label>
      <label>
        {copyText("备注（可选）")}
        <input
          maxLength={160}
          disabled={disabled}
          value={form.description}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </label>
    </>
  );
  return (
    <>
      <div className="channel-name-field">
        <div className="channel-name-label">
          <label htmlFor="channel-provider">{copyText("服务商")}</label>
          {importAction}
        </div>
        <select
          id="channel-provider"
          autoFocus
          disabled={disabled}
          value={providerId}
          onChange={(e) => onProviderChange(e.target.value)}
        >
          <optgroup label={copyText("模型 API 服务")}>
            {CHANNEL_PROVIDERS.filter((p) => !p.codingPlan).map((p) => (
              <option key={p.id} value={p.id}>
                {copyText(p.name)}
              </option>
            ))}
          </optgroup>
          <optgroup label={copyText("Coding Plan 专用入口")}>
            {CHANNEL_PROVIDERS.filter((p) => p.codingPlan).map((p) => (
              <option key={p.id} value={p.id}>
                {copyText(p.name)}
              </option>
            ))}
          </optgroup>
          <option value="custom">{copyText("自定义（第三方渠道 / 其他协议）")}</option>
        </select>
        {provider?.note && <small>{copyText(provider.note)}</small>}
        {provider?.codingPlan && (
          <small>
            {copyText(
              "请使用对应套餐的 Key。套餐可能限制接入工具，是否允许此用途请以服务商说明为准。",
            )}
          </small>
        )}
        {importStatus}
      </div>
      {!provider && (
        <>
          {nameFields}
          <label>
            {copyText("接口协议")}
            <select
              disabled={disabled}
              value={form.protocol}
              onChange={(e) => onChange("protocol", e.target.value as Channel["protocol"])}
            >
              {Object.entries(protocolLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {copyText(label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Base URL
            <input
              type="url"
              required
              maxLength={500}
              disabled={disabled}
              value={form.baseUrl}
              aria-describedby="channel-endpoint-preview"
              onChange={(e) => onChange("baseUrl", e.target.value)}
              placeholder="https://api.example.com"
            />
            <small>
              {copyText("填写服务商提供的 Base URL，或粘贴完整接口地址。系统按所选协议补全路径。")}
            </small>
          </label>
        </>
      )}
      <ConnectionPrivacy />
      <div className="channel-name-field">
        <div className="channel-name-label">
          <label htmlFor="channel-api-key">API Key</label>
          {provider && (
            <a
              className="text-link provider-doc-link"
              href={provider.setupUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {copyText("服务商说明 ")}
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <input
          id="channel-api-key"
          type="password"
          autoComplete="new-password"
          required={needsKey}
          disabled={disabled}
          maxLength={2000}
          value={form.apiKey ?? ""}
          onChange={(e) => onChange("apiKey", e.target.value)}
          placeholder={
            needsKey
              ? copyText("填写{value0} API Key", {
                  value0: provider ? copyText(provider.name) : copyText("此渠道"),
                })
              : copyText("已加密保存，留空则不更改")
          }
        />
        {needsKey && previous && (
          <small>{copyText("服务地址已更改，需要填写对应的 API Key。")}</small>
        )}
      </div>
      {provider && (
        <div className="provider-connection-meta">
          <span>{protocolLabels[form.protocol]}</span>
          <button
            type="button"
            className="text-link"
            disabled={disabled}
            onClick={() => onProviderChange("custom")}
          >
            {copyText("自定义接口")}
          </button>
        </div>
      )}
      <ModelEndpointPreview baseUrl={form.baseUrl} protocol={form.protocol} />
      {provider && (
        <details className="advanced-fields provider-advanced">
          <summary>{copyText("更多设置 · 渠道名称、备注")}</summary>
          <div className="provider-advanced-fields">{nameFields}</div>
        </details>
      )}
    </>
  );
}
