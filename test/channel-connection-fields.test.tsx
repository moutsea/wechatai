import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChannelConnectionFields } from "../src/client/channel-connection-fields";
import type { Channel, ChannelInput } from "../src/shared/types";

const form: ChannelInput = {
  name: "DeepSeek",
  description: "",
  protocol: "chat-completions",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  color: "sage",
};
const previous: Channel = { ...form, id: "existing", createdAt: 1, hasKey: true };
const fields = (providerId: string, saved?: Channel) =>
  renderToStaticMarkup(
    <ChannelConnectionFields
      form={form}
      providerId={providerId}
      previous={saved}
      disabled={false}
      onChange={() => {}}
      onProviderChange={() => {}}
      importAction={<button>kimiseek 一键导入</button>}
    />,
  );

describe("channel provider fields", () => {
  it("presents provider and key, with name under more settings and actual URL visible", () => {
    const html = fields("deepseek");
    expect(html).toContain('id="channel-provider"');
    expect(html).toContain("kimiseek 一键导入");
    expect(html).toContain("https://api.deepseek.com/v1/chat/completions");
    expect(html).toMatch(/<details[^>]*>[\s\S]*渠道名称/);
    expect(html).not.toContain('type="url"');
    expect(html).toMatch(/id="channel-api-key"[^>]*required/);
  });

  it("allows unchanged credentials on edit but requires them after a provider change", () => {
    expect(fields("deepseek", previous)).toContain("已加密保存，留空则不更改");
    expect(fields("deepseek", { ...previous, baseUrl: "https://other.example.com" })).toContain(
      "服务地址已更改",
    );
    expect(fields("deepseek", previous)).not.toMatch(/id="channel-api-key"[^>]*required/);
  });

  it("exposes all connection fields for custom configuration", () => {
    const html = fields("custom");
    expect(html).toContain('type="url"');
    expect(html).toContain("接口协议");
    expect(html).toContain("Anthropic Messages");
    expect(html).not.toContain("<details");
  });

  it("leaves the key optional when editing only the protocol", () => {
    const html = renderToStaticMarkup(
      <ChannelConnectionFields
        form={{ ...form, protocol: "responses" }}
        providerId="custom"
        previous={previous}
        disabled={false}
        onChange={() => {}}
        onProviderChange={() => {}}
      />,
    );
    expect(html).toContain("已加密保存，留空则不更改");
    expect(html).not.toContain("服务地址已更改");
    expect(html).not.toMatch(/id="channel-api-key"[^>]*required/);
  });

  it("distinguishes plan endpoints and explains their use restrictions", () => {
    const html = fields("zhipu-coding");
    expect(html).toContain("Coding Plan 专用入口");
    expect(html).toContain("套餐可能限制接入工具");
  });
});
