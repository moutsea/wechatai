import { expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";

it("renders the complete Wechatai command, including its placeholder", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/plugins"),
    "text/html",
  );
  expect(document.querySelector("#commands li code")?.textContent).toBe("/wx <command>");
});
