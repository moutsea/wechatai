import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const content: SeoPage = {
  path: "/wechat-character-card",
  kind: "tutorial",
  title: "Importing WeChat character cards: PNG, V2 JSON, and compatibility",
  description:
    "Import a Character Card V2 into Wechatai and continue the character chat in WeChat. Covers PNG and JSON requirements, field mapping, world-book triggers and budget, import failures, and export rules.",
  eyebrow: "Character cards × WeChat",
  h1: "Importing WeChat character cards: PNG, V2 JSON, and compatibility",
  lede: "Already have a character card and want to continue the chat in WeChat? This page collects the supported file formats, field mapping, world-book compatibility, and export rules.",
  answer:
    "Wechatai can import a Character Card V2 PNG or JSON card as a roleplay plugin configuration and chat with the character through WeChat ClawBot. The card supplies the persona, scenario, and opening line, and its world book adds background by keyword and budget; replies come from the model you configure, and the card does not include the original chat history.",
  primaryKeyword: "import a WeChat character card",
  secondaryKeywords: [
    "WeChat character card",
    "WeChat roleplay",
    "character card WeChat",
    "WeChat persona setup",
  ],
  highlights: [
    "Supports PNG and V2 JSON",
    "Each character can bind a different model",
    "The original card can be downloaded again",
  ],
  sections: [
    {
      id: "what",
      title: "What a character card is in WeChat",
      body: `A character card (also called a persona card) is an importable persona package, not a WeChat feature. Wechatai reads the text settings in the card and connects the character conversation to WeChat through WeChat ClawBot.

No card yet, or want to learn the basics first? Start with a built-in character in the [roleplay tutorial](/docs/roleplay).

The chain is:

1. You have a character card (V2 JSON, or a PNG with \`chara\` metadata).
2. Wechatai reads the text settings into a character configuration stored under your account.
3. You enter the character by shortcut in WeChat, and the model you bound answers the conversation.

Two easy misunderstandings: **a character card is not an image**, since a PNG is only a container hiding JSON inside the picture; and **the model that answers has nothing to do with the card**, because it depends on which model you bind to the character in Wechatai.`,
    },
    {
      id: "import",
      title: "Import: two file types and several hard limits",
      body: `Two sources are supported:

- **V2 JSON character card:** up to 64 KB.
- **PNG character card:** up to 5 MB, must contain a \`chara\` text block (V2 cards usually export in this format), and the decoded text must be at most 64 KB.

| Item | Limit | What happens when exceeded |
| --- | --- | --- |
| PNG file size | ≤ 5 MB | "The character card file cannot exceed 5 MB" |
| PNG text data | ≤ 64 KB | The text data cannot exceed 64 KB |
| JSON file size | ≤ 64 KB | "The JSON character card cannot exceed 64 KB" |
| Format | Character Card V2 | Only chara_card_v2 / 2.0 is supported |
| World-book entries | ≤ 50 | The world book supports at most 50 entries |
| One character configuration | ≤ 120 KB overall | Reduce the persona or world-book content |

The file is parsed in your browser. When you save the character, Wechatai uploads and stores the original card JSON, including creator notes and extensions, alongside the editable settings. The PNG cover is not uploaded or stored. When you see "V2 character information not found", first confirm the PNG actually contains \`chara\` metadata, or import the JSON instead.`,
    },
    {
      id: "fields",
      title: "Field mapping: what the card holds and what Wechatai reads",
      body: `| Character card field | Wechatai setting |
| --- | --- |
| \`data.name\` | Name |
| \`data.description\` | Description; falls back to \`personality\` when empty |
| \`data.personality\` | Personality |
| \`data.scenario\` | Scenario |
| \`data.first_mes\` | Opening line |
| \`data.mes_example\` | Example dialogue |
| \`data.system_prompt\` | Instructions |
| \`data.post_history_instructions\` | Post-history instructions |
| \`data.character_book.entries\` | World-book entries |
| \`data.character_book.token_budget\` | World-book token budget (default 1000) |
| \`extensions.wechatai\` | User persona, form of address, and avatar marker |

Two things are **not part of the card**: the shortcut name and the bound model. They are platform-side settings; import uses your currently selected model and shortcut, and exported V2 JSON does not write those fields. Re-importing on another device or WeChat account requires selecting them again.

Extension content in the card is not executed. Alternate greetings, tags, author, and similar fields remain only in the original JSON and do not affect the conversation; macros replace only \`{{char}}\` and \`{{user}}\`, and other forms are treated as plain text.`,
    },
    {
      id: "worldbook",
      title: "World book: how keywords and budget take effect",
      body: `A world book is a prewritten collection of story settings, entered manually or imported from a character card. It does not learn from the conversation automatically; events that already happened are organized by the plot summary. Wechatai selects enabled entries by keyword or constant setting and adds them to the model context within budget:

- At most 50 entries, with a default budget of 1000 tokens and a maximum of 4000; setting it to 0 includes nothing.
- Each entry can set keywords, secondary keywords, constant, case sensitivity, and priority.
- Constant entries need no keyword; other entries match the current and latest 3 messages, scanning at most 32K characters.
- All entries are limited by the world-book budget and the model's remaining input space, selected by priority; entries that do not fit are skipped whole. Text included in context counts as input cost.

When importing from a character card, some forms degrade: **regex-triggered entries and non-constant entries without keywords are disabled**, and you need to add keywords before enabling them; recursive triggers, probability, scripts, and custom insertion positions are not supported. The interface lists these notices after import, so review them before chatting.`,
    },
    {
      id: "use",
      title: "Switch characters by shortcut in WeChat",
      body: `After configuring and saving a character, in WeChat:

1. Send \`/use shortcut\` (for example \`/use Lin\`) to enter the character, and every later message goes to it.
2. Send \`/exit\` to return to the ordinary model conversation.
3. Send \`@Lin content\` to call it once without changing the current mode.

Each character binds its own model, so "a cheap model for writing and a stronger one for character chat" can coexist. \`/wx new\` starts a separate story for the current character and keeps the old one; long conversations are summarized automatically, while the character settings always remain.

Plugin slots are limited: Free can configure 1 plugin and Plus is unlimited. One character occupies one plugin configuration, so check your plan before adding several.`,
    },
    {
      id: "export",
      title: "Exporting and downloading the original card",
      body: `After editing, Export V2 JSON writes the current settings back into a character card: name, avatar marker, user persona, description, personality, scenario, opening line, example dialogue, instructions, post-history instructions, and world book, while preserving existing extension fields such as alternate greetings, tags, and author.

If the character came from an import, you can also download the **original character card** again, which is useful elsewhere or for backup; a hand-written character has no source card, so the export is a newly generated V2 JSON.

Note that the export contains text settings only: no PNG cover, and no shortcut name or bound model.`,
    },
  ],
  faq: [
    {
      question: "What format is a WeChat character card?",
      answer:
        "Currently Character Card V2 (chara_card_v2 / 2.0): a PNG with chara metadata, or a V2 JSON file. Old V1 cards and other formats must be converted to V2 before import.",
    },
    {
      question: "What if a PNG character card fails to import?",
      answer:
        "Check each item in the notice: whether the PNG has a chara text block, whether it is written twice, whether the decoded text exceeds 64 KB, whether the image exceeds 5 MB, and whether the format declaration is V2. If it still fails, import a JSON character card instead.",
    },
    {
      question: "How many world-book entries are supported?",
      answer:
        "At most 50, with a default input budget of 1000 tokens and a maximum of 4000; constant entries also count against the budget. Imported regex entries and non-constant entries without keywords are disabled; recursive triggers, probability, and scripts are not supported.",
    },
    {
      question: "Can one character switch models?",
      answer:
        "Yes. Rebinding changes which model replies, not which story is active. If you continue the same story, its existing context can be sent to the new model provider. To keep earlier story context out of the new provider's requests, send /wx new in WeChat before sending your next chat message. This starts a separate story for the same character and keeps the old record.",
    },
    {
      question: "Is the PNG cover stored during import?",
      answer:
        "No. The PNG cover is not uploaded or stored, and the avatar uses a Wechatai preset marker. When you save the character, Wechatai uploads and stores the original card JSON, including creator notes and extensions. Keep the original PNG yourself if you want to keep the cover.",
    },
  ],
  related: [
    { label: "How to use the roleplay plugin", href: "/docs/roleplay" },
    { label: "WeChat AI companion", href: "/wechat-ai-partner" },
    { label: "WeChat AI assistant: connect your own model", href: "/wechat-ai" },
    { label: "WeChat AI with your own API key", href: "/bring-your-own-api-key" },
    { label: "Pricing and plugin count", href: "/pricing" },
  ],
  updatedAt: "2026-11-14",
};

export default [
  {
    path: "/wechat-character-card",
    title: "Import Character Cards into WeChat | Wechatai",
    description: content.description,
    updatedAt: "2026-11-20",
    content,
  },
] satisfies readonly TranslationPage[];
