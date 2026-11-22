import { expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";

it("renders the complete Wechatai command, including its placeholder", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/plugins"),
    "text/html",
  );
  expect(document.querySelector("#commands li code")?.textContent).toBe("/wx <command>");
});

it.each(["quickstart", "examples", "validation", "metering"])(
  "preserves every shared fenced block in #%s, including whitespace and comments",
  (section) => {
    const blocks = (path: string) => {
      const document = new DOMParser().parseFromString(renderPublicPage(path), "text/html");
      return Array.from(document.querySelectorAll(`#${section} pre > code`))
        // The quickstart instruction is localized prose, not an executable example.
        .filter((code) => section !== "quickstart" || !code.classList.contains("language-text"))
        .map((code) => [code.className, code.textContent]);
    };
    const original = blocks("/developers/plugins");
    expect(original.length).toBeGreaterThan(0);
    expect(blocks("/en/developers/plugins")).toEqual(original);
  },
);
