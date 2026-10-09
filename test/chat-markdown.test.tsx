import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "../src/client/chat-markdown";
import { ChatMessageBubble } from "../src/client/chat-message";
import type { ChatMessage } from "../src/shared/types";

const render = (content: string, id = "test") =>
  renderToStaticMarkup(<ChatMarkdown content={content} id={id} />);

describe("model Markdown rendering", () => {
  it("renders GFM headings, emphasis, nested lists, quotes and line breaks", () => {
    const html = render(
      "## 标题\n\n**重点**、*强调*、~~旧文~~\n下一行\n\n1. 第一步\n   - 子步骤\n\n> 引用\n\n- [x] 已完成\n- [ ] 待办",
    );
    for (const tag of ["h2", "strong", "em", "del", "ol", "ul", "blockquote"])
      expect(html).toContain(`<${tag}`);
    expect(html).toContain("<br/>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled=""');
  });

  it("keeps code literal, whitespace intact and adds a copy action", () => {
    const html = render(
      '正文中的 `value`\n\n```html\n<div>\n  <script>alert("x")</script>\n</div>\n```',
    );
    expect(html).toContain("<code>value</code>");
    expect(html).toContain('aria-label="复制代码"');
    expect(html).toContain('class="language-html"');
    expect(html).toContain("&lt;div&gt;\n  &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders wide tables in a scroll region and preserves column alignment", () => {
    const html = render("| 名称 | 用量 |\n| :--- | ---: |\n| 示例 | 50 |");
    expect(html).toContain('class="chat-table"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("<table>");
    expect(html).toContain("text-align:right");
  });

  it("does not execute raw HTML, scripts, event handlers or active links", () => {
    const html = render(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[恶意链接](javascript:alert%281%29)\n\n[数据链接](data:text/html,hello)\n\n[系统命令](vscode://file/private)',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("href=");
    expect(html).toContain("恶意链接");
  });

  it("opens ordinary external links with isolation and no referrer", () => {
    const html = render("[文档](https://example.com/docs)\n\nhttps://example.com");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("does not automatically load model-provided image URLs", () => {
    const html = render("![示意图](https://images.example.com/tracking.png)");
    expect(html).toContain("查看图片：示意图");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("src=");
    expect(render("![坏图片](data:image/svg+xml,evil)")).not.toContain("data:image");
  });

  it("keeps footnote IDs and backlinks separate between replies", () => {
    const content = "参考[^1]\n\n[^1]: 注释内容";
    const a = render(content, "first");
    const b = render(content, "second");
    expect(a).toContain('id="chat-first-fn-1"');
    expect(a).toContain('href="#chat-first-fnref-1"');
    expect(a).toContain('aria-describedby="chat-first-footnote-label"');
    expect(b).toContain('id="chat-second-footnote-label"');
    const ids = [...(a + b).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("conversation bubbles", () => {
  const message: ChatMessage = {
    id: 1,
    sessionId: "s1",
    role: "user",
    content: "**原文** <img src=x>",
    createdAt: 1700000000000,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    estimated: false,
    model: "test-model",
  };
  it("preserves user messages as text and renders only model replies as Markdown", () => {
    const user = renderToStaticMarkup(<ChatMessageBubble message={message} />);
    expect(user).toContain("chat-message user");
    expect(user).toContain("**原文** &lt;img src=x&gt;");
    expect(user).not.toContain("<strong>原文</strong>");
    const assistant = renderToStaticMarkup(
      <ChatMessageBubble message={{ ...message, role: "assistant" }} modelName="我的模型" />,
    );
    expect(assistant).toContain("<strong>原文</strong>");
    expect(assistant).toContain('aria-label="复制回答"');
    expect(assistant).toContain("我的模型");
    expect(assistant).not.toContain("<img");
  });
  it("keeps system notices distinct from message bubbles", () => {
    const html = renderToStaticMarkup(
      <ChatMessageBubble message={{ ...message, role: "system", content: "上下文已重置" }} />,
    );
    expect(html).toContain('class="context-divider"');
    expect(html).not.toContain("chat-message system");
    expect(html).toContain("上下文已重置");
  });
});
