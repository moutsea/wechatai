import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelEndpointPreview } from "../src/client/model-endpoint-preview";

describe("channel request URL preview", () => {
  it("shows the complete provider URL as selectable text without making it a navigation link", () => {
    const html = renderToStaticMarkup(
      <ModelEndpointPreview
        baseUrl=" https://generativelanguage.googleapis.com/v1beta/openai/ "
        protocol="chat-completions"
      />,
    );
    expect(html).toContain("实际请求地址");
    expect(html).toContain(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
    expect(html).not.toContain("href=");
  });

  it.each([
    "",
    "https://",
    "not a URL",
    "javascript:alert(1)",
    "https://user:private-secret@api.example.com/v1",
    "https://api.example.com/v1?key=private-secret",
    "https://api.example.com/v1#private-secret",
  ])(
    "handles incomplete or disallowed input without rendering a misleading request: %s",
    (baseUrl) => {
      const html = renderToStaticMarkup(
        <ModelEndpointPreview baseUrl={baseUrl} protocol="responses" />,
      );
      expect(html).not.toContain("<code>");
      expect(html).not.toContain("private-secret");
      expect(html).toContain(baseUrl ? "请输入有效" : "填写 Base URL 后显示");
    },
  );
});
