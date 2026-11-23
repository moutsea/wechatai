import { expect, it } from "vitest";
import { renderPublicPage } from "../src/client/prerender";

it.each(["openclaw", "hermes"])("documents native-command relay requests for %s", (agent) => {
  const document = new DOMParser().parseFromString(
    renderPublicPage(`/en/developers/${agent}`),
    "text/html",
  );
  const requests = Array.from(document.querySelectorAll("main li"));
  for (const action of ["heartbeat", "poll", "claim"]) {
    const request = requests.find((item) => item.firstElementChild?.textContent === action);
    expect(request?.textContent, action).toContain("nativeCommands?: boolean");
  }
  const commandRouting = document.querySelector('main a[href="/en/developers/plugins#commands"]');
  const guidance = commandRouting?.parentElement?.textContent;
  expect(guidance).toContain("nativeCommands: true in heartbeat, poll and claim");
  expect(guidance).toContain('lane: "control" for /stop with no arguments');
  expect(guidance).toContain('lane: "message"');
});

it("documents Free plugin access, including generation, image reads and assistant writes", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/plugins"),
    "text/html",
  );
  const article = document.querySelector("main article")?.textContent;
  expect(document.getElementById("identity")?.textContent).toMatch(
    /plugin configuration limit is 1 on Free and unlimited on Plus/i,
  );
  expect(article).toMatch(/oldest configurations within the Free quota can still run/i);
  expect(article).toMatch(/signed-in owner, including on Free/i);
  expect(article).toMatch(
    /editing records requires an enabled assistant within the current plugin quota/i,
  );
  expect(article).toMatch(
    /reminders pause when the assistant is disabled, its configuration is outside the current plugin quota/i,
  );
  expect(article).not.toMatch(/Plus-only|by Plus only|with Plus permission|require active Plus/i);
});

it("renders the complete Wechatai command, including its placeholder", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/plugins"),
    "text/html",
  );
  expect(document.querySelector("#commands li code")?.textContent).toBe("/wx <command>");
});

it("directs readers and the AI instruction to current English protocol behavior", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/plugins"),
    "text/html",
  );
  const quickstart = document.getElementById("quickstart");
  const englishLink = quickstart?.querySelector('a[href="/en/developers/plugins"]');
  expect(englishLink?.closest("tr")?.textContent).toContain("Current platform behavior");
  expect(quickstart?.textContent).not.toContain("the Markdown use the same content");
  const prompt = quickstart?.querySelector("pre > code.language-text")?.textContent;
  expect(prompt).toMatch(
    /English HTML for current platform behavior.*\nhttps:\/\/wechatai\.app\/en\/developers\/plugins\n/,
  );
  expect(prompt).toContain("https://wechatai.app/developers/plugins.md");
  expect(prompt).toContain("https://wechatai.app/api/plugins/protocol/1.0/schema.json");
});

it("documents independent reminder records and how to cancel them", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/plugins"),
    "text/html",
  );
  const assistant = document.getElementById("个人助理插件 1.0")?.textContent;
  expect(assistant).toMatch(/record types are note, entry, task and reminder/i);
  expect(assistant).toMatch(/use a reminder record to schedule a reminder/i);
  expect(assistant).toMatch(/completing or deleting a task does not cancel reminders/i);
  expect(assistant).toMatch(/set reminderEnabled to false .*or delete the reminder record/i);
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

it("shows alias-only plugin switching and how to find aliases in both instructions", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/plugins"),
    "text/html",
  );
  for (const id of ["manifest", "DS Chat 插件 1.3 调用语义"]) {
    const codes = Array.from(document.getElementById(id)!.querySelectorAll("p code"), (code) =>
      code.textContent,
    );
    expect(codes, id).toContain("/use <alias>");
    expect(codes, id).toContain("/wx plugins");
    expect(codes, id).not.toContain("/use name-or-number");
    expect(codes, id).not.toContain("/use plugin-name/shortcut/number");
  }
});

it("shows the platform model-switch command in the English Manifest", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/plugins"),
    "text/html",
  );
  const commands = Array.from(document.querySelectorAll("#manifest p code"), (code) =>
    code.textContent,
  );
  expect(commands).toContain("/wx model <number>");
  expect(commands).not.toContain("/model number");
});

it("documents Anthropic tool results in the next user message", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/plugins"),
    "text/html",
  );
  const section = document.getElementById("DS Chat 插件 1.3 调用语义");
  expect(section?.textContent).toMatch(
    /assistant message.*tool_use.*immediately followed by a user message containing.*tool_result/,
  );
});

it("distinguishes Muse online status from retrieving a task in the guide and FAQ", () => {
  const document = new DOMParser().parseFromString(
    renderPublicPage("/en/developers/muse"),
    "text/html",
  );
  const main = document.querySelector("main");
  const faq = Array.from(main?.querySelectorAll("h3") ?? []).find((heading) =>
    heading.textContent?.startsWith("Why does the plugins page never show"),
  );
  expect(faq?.nextElementSibling?.textContent).toMatch(/heartbeat.*before the first poll/i);
  const setup = Array.from(main?.querySelectorAll("p") ?? []).find((paragraph) =>
    paragraph.textContent?.startsWith("The connection command is valid"),
  );
  expect(setup?.textContent).toMatch(/heartbeat.*before the first poll/i);
  expect(setup?.textContent).toMatch(/send a test task.*confirm/i);
  expect(main?.textContent).toMatch(/if Muse is online but no task arrives, check.*poll and claim/i);
  expect(main?.textContent).not.toMatch(
    /online (?:only after|appears only after)|does not show online and WeChat tasks/i,
  );
});
