import { PLUGIN_LIMITS } from "../../../plugin-access";
import { protocolExamples, protocolLinks, protocolSections } from "../../../plugin-docs";
import type { PLUGIN_PROTOCOL_VERSION } from "../../../plugins";

const version: typeof PLUGIN_PROTOCOL_VERSION = protocolExamples.invocation.protocolVersion;
const code = (language: string, body: string) => "```" + language + "\n" + body + "\n```";
const json = (value: unknown) => code("json", JSON.stringify(value, null, 2));

function sourceCodeBlock(id: string, language: string): string {
  const markdown = protocolSections.find((section) => section.id === id)?.markdown;
  const block = markdown?.match(new RegExp(`^\`\`\`${language}\\n[\\s\\S]*?^\`\`\`$`, "m"))?.[0];
  if (!block) throw new Error(`Missing ${language} code block in plugin protocol section ${id}`);
  return block;
}

export const agentDevelopmentPromptEn = `First read the Wechatai plugin protocol:
${protocolLinks.markdown}

Then read the protocol index, examples and JSON Schema:
${protocolLinks.api}
${protocolLinks.schema}

Develop a plugin adapter for me against protocolVersion ${version}. First confirm my plugin's function and runtime, then generate the manifest, adapter code and contract tests.
Preserve the runId supplied by the platform; respect limits; return only the final result fields the protocol allows; do not report usage, credits or imageCount.
Validate input and output with the JSON Schema, and test semantic constraints such as runId matching, budget, retry idempotency and attachment task ownership.
Built-in AI image generation already supports image delivery; third-party registration, the execution API, code upload and third-party media delivery are not open yet. Implement adapter logic that can be verified locally, mark the parts waiting for integration, and do not invent platform interfaces or authentication methods.`;

export interface PluginProtocolSection {
  readonly id: string;
  readonly title: string;
  readonly markdown: string;
}

const quickstart = `
## Start here for AI agents

The addresses below need no sign-in or API key; a direct GET is enough. Reading the docs is free, does not trigger a model call and consumes no credits. The HTML page and the Markdown use the same content; the JSON Schema is generated from the platform's actual validation rules.

| Format | Address | Purpose |
| --- | --- | --- |
| Web page | [Plugin protocol](/developers/plugins) | Read the protocol and examples |
| Markdown | [Complete protocol source](${protocolLinks.markdown}) | Preferred entry for an AI agent |
| JSON API | [Protocol index](${protocolLinks.api}) | Version, availability, billing policy, examples and schema links |
| Fixed version | [Protocol ${version}](${protocolLinks.versionedApi}) | Read a specific version without automatically moving to the next |
| JSON Schema | [Validation rules](${protocolLinks.schema}) | Draft 2020-12, with definitions for the five protocol objects |
| Discovery | [llms.txt](${protocolLinks.discovery}) | Find all developer resources |
| Full index | [llms-full.txt](${protocolLinks.fullDiscovery}) | Every landing page, document summary and price fact |

You can hand this instruction to your AI coding tool:

${code("text", agentDevelopmentPromptEn)}

You can also download the document and schema directly:

${code(
  "sh",
  `curl -fsSL ${protocolLinks.markdown} -o wechatai-plugin-protocol.md
curl -fsSL ${protocolLinks.api} -o wechatai-plugin-protocol.json
curl -fsSL ${protocolLinks.schema} -o wechatai-plugin-schema.json`,
)}

All document endpoints support only GET, HEAD and OPTIONS, allow anonymous cross-origin reads and set no sign-in cookie. There is no public plugin execution, registration or callback endpoint; the Invocation here is a data contract, not an HTTP address you can POST to.

## Minimal adapter example

Start with a plain-text adapter: accept an Invocation, convert it into the target tool's input, then convert the final reply into a Result. Do not put the provider's or Agent's internal messages, tool calls or billing information into the final output.

### 1. Declare the plugin

Below is the manifest of the built-in LLM plugin actually running. Third parties can use it as a reference for their own manifest, but cannot execute on this site merely by changing runtime to remote or sandbox.

${json(protocolExamples.manifest)}

### 2. Receive a platform invocation

This example uses creditUnits 5000, meaning the service fee on this site is capped at 5 credits. The model connection and key are injected separately by the host and must not be added as top-level fields of the Invocation.

${json(protocolExamples.invocation)}

### 3. Return the final result

runId must be returned verbatim. status=partial is for a result with usable content that did not fully complete; it uses the same metering rules as a complete result.

${json(protocolExamples.result)}

### 4. Implement the conversion function

The JavaScript below only demonstrates local conversion; it is not a remote transport protocol. callYourTool and persistence are implemented by your own adapter; the authentication, transport, cancellation and timeout specifications for connecting to the platform are not open yet.

${sourceCodeBlock("examples", "js")}

The adapter should also enforce input limits before execution and implement timeouts, failures and idempotency; the function above does not include those production requirements. The platform independently enforces the final input/output and fee limits and does not trust metering fields returned by a plugin.

## Schema and validation

The downloaded JSON Schema is a collection of definitions. Choose the definition for the object type you are validating; do not validate data with the collection alone, which has no root type constraint.

| Object | JSON Pointer | Current state |
| --- | --- | --- |
| Manifest | #/$defs/Manifest | Used by the built-in manifest |
| Invocation | #/$defs/Invocation | Used by built-in synchronous calls |
| Result | #/$defs/Result | Used by built-in final results |
| Block | #/$defs/Block | Text and attachment-reference structure; result attachment delivery is not open |
| Event | #/$defs/Event | Envelope reserved only; event-specific payload structures and transport are not open |

For example, in a JSON Schema validator that supports Draft 2020-12, register the downloaded schema (including its $id), then validate an Invocation with this $ref:

${json({ $ref: `${protocolLinks.schema}#/$defs/Invocation` })}

Main boundaries:

- Protocol objects use strict field validation. Unknown top-level fields are rejected; configSchema and Event.payload are explicitly declared open objects.
- runId, instanceId, sessionId, assetId and Invocation.pluginId are 1–200 characters long; Manifest.id must be lowercase author/name (letters, digits and hyphens); a plugin version looks like 1.0.0.
- Each invocation carries at most 20,001 messages with at most 100 content blocks each; a single text block is at most 8,000,000 UTF-16 code units and is further limited by input and budget.
- inputTokens and outputTokens are integers from 1 to 2,000,000; outputImages is an integer from 0 to 20; creditUnits is null or an integer from 0 to 1,000,000,000. These are protocol boundaries; products and executors may set lower caps.
- JSON Schema validates structure only. The host must still check business constraints such as runId consistency, permission, deduplication, attachment ownership and ready state, and token and budget limits.
- Contract tests should cover at least: a valid result, unknown fields and forged usage, a mismatched runId, an empty result, an over-limit result, retrying the same task, and an unverified image reference.

An incompatible data structure change needs a new protocolVersion; feature iterations of the plugin itself use pluginVersion. A caller that specifies an old protocol version should keep using its structure and must not silently accept new fields. Transport and capability negotiation still need to be specified before a new runtime opens.

`;

const remainingSections = `
## Responsibility and identity

- A model channel stores the protocol, address and key; a model stores the provider model identifier and capabilities. They do not determine the plugin's function.
- A plugin definition is identified by \`author/name\`, and versions use semantic versioning. See \`pluginManifestSchema\` in \`src/shared/plugins.ts\` for the declaration.
- A plugin instance is one of a user's configurations with its own instance ID, display name, \`@\` shortcut and session. Renaming must not change identity. Upgrades must pin a target version, keep the old version and support rollback.
- The built-in \`wechatai/llm-chat@1.0.0\` keeps existing model IDs as compatible instance IDs and does not rebuild history or change old shortcuts. \`wechatai/web-research@1.3.0\` uses an independent instance ID, is managed under "Plugins" in the workspace, and binds an existing model and the user's own search API.
- The plugin configuration limit is ${PLUGIN_LIMITS.free} on Free and unlimited on Plus. DS Chat, AI image generation, roleplay and the personal assistant are available on either plan within this shared quota.
- Account identity and WeChat links are provided by the platform authentication layer and cannot be chosen by a plugin. Sessions and attachments must be isolated by account, instance and session/task. Remote session IDs are mapped by the adapter to sessions on this site.
- A plugin receives only approved input, configuration and capabilities. It does not own the wallet, ledger, WeChat credentials, payment keys or other instances' data.

## Manifest

A Manifest contains \`protocolVersion\`, \`id\`, \`version\`, \`name\`, \`author\`, \`runtime\`, \`capabilities\`, \`configSchema\` and \`permissions\`.

- \`runtime\` may declare \`builtin\`, \`remote\` or \`sandbox\`. The current executor registers only platform built-in plugins; declaring a runtime does not grant execution permission.
- Capability declarations cover input/output \`text\`, \`image\` and \`file\`, session owner \`none\`, \`platform\` or \`remote\`, and streaming, cancellation and approval support.
- \`configSchema\` uses JSON Schema to describe the form. Secret fields are managed by the host; the runtime receives them by authorization or through a restricted proxy, and they never enter ordinary configuration, events or logs.
- \`permissions\` declares model access, allowed network origins and storage needs. The host must enforce permissions rather than only show UI hints; a capability that the user has not authorized or the executor does not support is rejected directly.

The current built-in LLM and DS Chat support text/multi-image input, text results and platform sessions, and declare no streaming, in-flight cancellation or approval capabilities. The host stages WeChat attachments and calls the plugin only after a text or transcribed-voice instruction arrives; PDF, DOCX and plain text have their body extracted on the host, passed as text blocks and counted toward metering. Attachment binaries and CDN references are not counted as text tokens. \`/cancel\` only clears pending attachments and does not mean the plugin runtime supports cancellation.

The DS Chat plugin supports text input/output and an independent platform session and does not open code execution. Search and reading follow DeepSeek Harness's separation of tools and providers, with this site implementing the adapter and a bounded action loop; it does not depend on the Harness runtime. Users configure the full HTTPS address and their own key for Tavily, Exa, SearXNG or native DeepSeek search; there is no platform search key or fallback search source. New configurations select DeepSeek by default and prefill the official Messages address; the search model ID may be omitted or left empty, in which case \`deepseek-flash\` is used, and it can also be customized; the answer model is selected separately. The DeepSeek adapter obtains structured search results through the Anthropic Messages-compatible \`web_search_20250305\` tool.

In the Manifest of a web-connected plugin, \`networkOrigins: []\` means no statically pre-authorized address. The built-in host additionally binds the instance's search address and validates the HTTPS address and DNS for every search, public page read and redirect; third parties cannot inherit this built-in permission. The key is sent only to that instance's search address and does not follow redirects; reading a web page carries neither the search key nor the model key. Web material is untrusted reference content and must not be treated as an execution instruction. Reading accepts only search results or user-supplied links, with at most 5 searches and 8 pages per call; a tool call lasts at most 45 seconds, each model request at most 5 minutes, and the whole task at most 14 minutes.

The workspace \`/app/plugins\` supports configuration, enable/disable, test, delete and switching. In WeChat, send \`/wx plugins\` to list aliases and \`/use <alias>\` to enter or switch the default plugin. Use the configured alias, not a display name or list number. \`@shortcut question\` invokes once and stays in the current session without changing the default mode, \`/exit\` returns to the previous normal session, and \`/model number\` switches the normal model. Model and plugin shortcuts cannot collide. Configuration secrets are stored encrypted; public docs and account queries return only \`hasKey\`. Deleting a configuration keeps history but no longer executes it; deleting the bound model also deletes the configuration and related sessions. When Plus expires, the oldest configurations within the Free quota can still run if enabled. Configurations over the quota are kept but cannot run. Third-party registration and the execution API are still not open.

Metering runs once at the boundary of the whole web-connected plugin call: the system prompt, context and current message actually passed in count as input, and the final answer plus platform-appended source links count as output. Planning, search results, web bodies and intermediate model calls are not charged again; upstream self-reported usage does not participate in settlement. The user's upstream service is billed independently. Input/output and credit caps are still enforced by the host, and a failed request that cannot obtain material is not settled.

## Invocation boundary

Required fields of \`PluginInvocation\`:

| Field | Meaning |
| --- | --- |
| \`protocolVersion\` | \`1.0\` |
| \`runId\` | Idempotent call ID created by the platform; reused on retry and must not be changed by the plugin |
| \`instanceId\` | Plugin instance for this call |
| \`pluginId\` / \`pluginVersion\` | Plugin and version pinned by the platform |
| \`sessionId\` | Session ID on this site; null when there is no session |
| \`messages\` | Ordered messages; role is system/user/assistant and content is structured blocks |
| \`limits\` | Platform-confirmed input/output tokens, result image count and integer credit-unit cap |

The current host injects the model connection and credentials inside a closure. A remote/sandbox runtime must separately define configuration and credential binding, authenticated transport, timeout and cancellation, and can open only after contract tests pass; do not serialize \`Env\` or the whole account configuration to a remote side.

Text block: \`{"type":"text","text":"你好"}\`.
Image/file block: \`{"type":"image","assetId":"..."}\` or \`{"type":"file","assetId":"..."}\`.
The host must resolve attachment references within the current account/task. An arbitrary URL, Base64 data or an image count claimed by the plugin is never treated as a verified image.

Text blocks in the same input message are concatenated before tokenization, and each message is tokenized and summed separately. Role, IDs, field names, keys, URLs in attachment metadata, attachment binaries and serialization overhead are not counted; a URL in text content is still metered as ordinary text. The platform UI states that these tokens are this site's billing unit and do not represent a specific provider's invoice.

For LLM chat, the platform assembles context first, then passes the system prompt, effective summary, recent history and current message to the adapter; what counts is the content that actually crosses this boundary. If an external Agent maintains its own history, only the new messages and context this site explicitly hands it participate in this site's metering.

## Results and events

A synchronous final result uses \`PluginResult\`: \`protocolVersion\`, \`runId\`, \`status\` (completed/partial) and \`content\`.
Only a usable result validated, accepted and saved by the platform can be settled. The current LLM is a synchronous-final-result adapter.

Future asynchronous transport uses the \`PluginEvent\` envelope uniformly: \`protocolVersion\`, \`runId\`, \`eventId\`, a monotonically increasing \`sequence\`, \`type\` and \`payload\`.
Defined event names: accepted, progress, text.delta, approval.required, completed, failed, cancelled.
Event transport and the persistence handler are not open yet; an implementation must satisfy:

1. Remote requests/callbacks must authenticate and bind account, instance and runId, and prevent replay; runId itself must not serve as an authentication credential.
2. Streamed text is a display increment; the final result is the complete authoritative result, and the increment and complete result must not both be charged.
3. Progress, logs, tool calls, internal reasoning and approval notices do not count toward final output.
4. A duplicate eventId is not processed again; out-of-order events must be recovered or rejected and must not cause duplicate execution. Results and billing cannot be rewritten after a terminal state.
5. Cancellation is a request; you cannot claim stopped while the remote side has not stopped. When cancellation is unsupported, state that clearly.
6. \`/new\` creates a new remote session mapping. Clearing history on this site does not clear the Agent's remote memory.
7. An operation that needs confirmation must stop at waiting-for-approval; confirmation cannot be disguised as ordinary final text and execution cannot continue.

A plugin cannot return writable usage, credits, imageCount or ledger fields; result validation rejects these undeclared fields. A protocol extension must explicitly upgrade validation rules and capability negotiation.

## Platform metering

The tokenization rule is fixed at \`cl100k_base@gpt-tokenizer-4.0.0\`; the metering code lives in \`src/server/tokenizer.ts\`.
The vocabulary is bundled locally with no third-party tokenizer service, and the cross-request text-merge cache is off. Special marker strings are treated as ordinary text and cannot become cheap "special tokens".

${sourceCodeBlock("metering", "text")}

- Input counts the original boundary snapshot retained by the platform, unaffected by parameters a plugin changes during execution.
- The final output's text blocks are concatenated in order and tokenized once, so splitting blocks does not change billing.
- Upstream \`usage\`, cached tokens, internal reasoning and the Agent's own usage reports play no part in charging.
- Automatic summaries, internal model calls, compatible-parameter fallbacks and context-limit retries do not create extra charges. A summary carried into later actual input is counted normally as input content.
- Reference images are not billed as result images; output attachments must be independently validated and saved by the platform, and a trusted resolver must return a ready record in the current task. A plugin declaring ready itself is not verification.
- Result images are deduplicated by unique platform assetId at 5 credits each; duplicate delivery, preview and download of the same task are not charged again. Output images cannot bypass real type validation by relabeling as file.
- Image/file results without a platform resolver are rejected; image fees are never charged on the plugin's return value alone. Built-in image generation has the host validate actual PNG/JPEG/WebP content, dimensions and size and persist it to private R2, then bills through an account/task-scoped resolver; the third-party media upload interface is still not open.
- A failure with no usable result is not charged. A usable partial result uses the same metering rules as a complete result; resending a saved result from the delivery layer must not execute or charge again.

## Limits and atomic settlement

\`limits.creditUnits=null\` means there is no optional whole-call budget; the number 0 means a zero budget. The UI's existing "0 means unlimited" is converted by the host to null and cannot be passed through directly.

Input over the token or credit limit is rejected before the plugin executes. The output limit is passed to the upstream service and also enforced on the platform; over-limit text is truncated at the platform token level to a valid Unicode prefix, only the retained part is charged, and the user is notified. Image count and fees must stay within the limit.

All actual charging still happens inside the account Durable Object: the result record, \`usage\`, \`platform_metering\`, wallet debit and completion state commit in the same transaction, and any write failure rolls the whole thing back. A repeated call with the same runId reads the saved result.

New metering records save the policy version, tokenizer version, input/output tokens, image count, billing units and plugin/instance identity. Ledger and metering records cannot be updated or deleted, and no additional full-text message copies are stored; existing financial records are not recalculated.

Requests are not pre-charged. A call can start when the balance is positive, and successful settlement may create an arrears amount; later daily grants and top-ups repay it first. The single-call budget limits this site's service fee and does not represent a cap on the remote model or Agent's internal costs.

## Requirements for later third-party publishing

- Official and third-party adapters must pass the same protocol, isolation, limit and forged-usage tests.
- The marketplace catalog stores immutable package versions, checksum digests, authors and permissions; user instances pin versions.
- Uploaded code runs in a separate restricted environment and cannot import the host database or wallet modules; runtime, memory, network and storage have separate quotas.
- Neither remote plugins nor uploaded code may bypass the platform and deliver billing results directly to WeChat.
- A new runtime, event transport, media validation storage, configuration migration and user authorization UI must actually be completed before the corresponding capability opens.

## DS Chat plugin 1.3 invocation semantics

DS Chat is Wechatai's independent plugin name and does not restrict the answer model or search provider. Each turn the selected model decides whether the web is needed: everyday chat, writing, translation, general knowledge and follow-ups based on existing material are answered directly without search or web calls and without added web sources; real-time, verification and page-reading tasks call tools as needed. An attempt to go online that obtains no source at all still counts as a failure and does not pass off an unsupported answer as a successful web lookup. Direct and web-assisted answers use the same metering boundary.

\`@model/plugin-shortcut question\` runs once in the current session (including current context) without changing the WeChat link's default mode, and a successful answer is still stored in the current session. \`/use <alias>\` and "Set as default plugin" on the web page enter an independent plugin session; send \`/wx plugins\` to find the alias. \`/exit\` and the web exit return to the link's previous normal session. Each link is independent, and exiting does not require Plus. Deleting or disabling a plugin or membership expiry still allows exit. The normal model default is switched with \`/model number\`, which no longer reuses \`/use\`.

The adapter ID \`wechatai/web-research\` is unchanged; the old default names "联网问答" and "DeepSeek" are upgraded automatically to "DS Chat", while custom names, shortcuts, keys, history and existing bills are preserved. Old instances upgrade to 1.3.0, and historical metering versions are not changed.

### Native tool loop and compatibility path

The main path follows DeepSeek Harness's "declare tools → model answers or calls → tool result → model continues" loop, with this site implementing adapters for three protocols and without introducing the full Harness runtime. \`web_search({query})\` and \`web_fetch({url})\` are client tools executed by the platform, and search credentials are sent only to the user-configured search endpoint. Tool choice is auto and does not additionally require the model to generate an action-classification JSON first; body text without a tool call becomes the final answer directly, and intermediate text is neither displayed nor billed separately.

Chat Completions preserves assistant \`tool_calls\` / \`reasoning_content\` and returns results with role=tool / tool_call_id; Responses uses function_call / function_call_output with store=false and retains encrypted reasoning; Anthropic preserves the original thinking / redacted_thinking / tool_use and places tool_result immediately after user, including error markers. At most 8 tool calls are accepted per turn, each constrained by the remaining search/read count; every call has a corresponding result. When the count or loop budget is exhausted, a final answer is required and another tool call is an error. Truncated calls, invalid numbers and duplicate numbers are not executed.

The input limit includes tool declarations, call records and material; only tool result text is compressed, without rewriting signed reasoning, splitting a call from its result or silently truncating user messages. When the model window is exceeded, compaction is retried at most once. Tool output is untrusted data; a web address must still come from the conversation or search results and pass public-network checks.

Only when the first native request explicitly returns HTTP 400/422 and indicates that tools / tool_choice / function calling are unsupported does the adapter enter the original JSON compatibility path. Authentication, rate limiting, network timeouts, service failures, tool schema errors and invalid responses do not fall back; once the tool loop has started it also does not fall back, avoiding duplicate execution. The platform still meters only the user-supplied context and final answer; planning, reasoning, tool-call arguments and results are not billed separately, and the user bears upstream API fees.

Protocol references: [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling), [Anthropic Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls), [Harness web tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/web/tool-web/README.md).

## AI image plugin 1.0

\`wechatai/image-generation@1.2.0\` binds an existing model ID, reuses its channel URL and key, and calls OpenAI Images-compatible \`/v1/images/generations\` independently without changing the channel's chat protocol. Configure the name, shortcut, model and enabled state. It supports generating a single image from text and declares no reference image, image editing, streaming or remote session. Each request passes only the current scene description, with no chat system prompt or history; the input limit and per-call credit cap still apply. The host detects common aspect ratios in the prompt and converts them to the request's \`size\`, such as \`3:4\` → \`960x1280\` and \`16:9\` → \`1536x864\`; it supports 1:1, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9, 4:5, 5:4, 21:9 and 9:21. When no ratio is specified, no size parameter is sent and the upstream default applies. The complete prompt is forwarded verbatim. The automatically added \`size\` is not counted toward input tokens. The channel must support the requested dimensions; if the upstream rejects the size, Wechatai does not retry without the parameter, to avoid duplicate generation and charges. Fixed \`size\` values from older clients are ignored, and fixed sizes are still removed automatically from older configurations.

The boundary input describes text only and the output is one platform-validated image block; it charges input tokens plus 5 credits and ignores upstream usage. The fee cap is checked before the image request; no usable image or a storage failure is not settled. The generation endpoint does not retry automatically, avoiding duplicate upstream fees. The completed result and platform bill are saved atomically; a WeChat send retry only resends the saved image with a stable client_id and neither regenerates nor charges again.

AI image and OpenClaw configurations support \`waitingMessageEnabled\` (default \`true\`) and \`waitingMessage\` (up to 300 characters; cannot be empty while enabled). Older configurations missing these fields keep the original default notices; omitting the fields while editing an existing configuration preserves the saved setting. The default texts are "已提交 AI 生图，等待上游返回..." and "已成功转发，等待回复..." respectively. When turned off, no waiting notice is sent, only the final result or an error; the notice is sent by the platform and does not enter plugin input, conversation history or metering.

It supports data.url or data.b64_json; the download URL and every redirect must use public HTTPS and cannot carry the model key. Images are at most 8 MB and 25 million pixels. Results are stored in account-isolated private R2 and readable for 30 days only by the signed-in owner, including on Free. Deleting a session or clearing history revokes access and cleans up images immediately, while archiving retains them; images already received in WeChat are managed by the user. Web test results are also stored for 30 days, and tests do not send WeChat messages proactively.

## Roleplay plugin 1.0

The built-in ID is \`wechatai/roleplay\`, version \`1.0.0\`. The configuration JSON Schema is provided with \`builtinManifests\` at \`/api/plugins/protocol\`. The configuration has no extra API key and references an existing account \`modelId\`; it supports Chat Completions, Responses and Anthropic Messages. The character replaces the model system prompt and inherits all of that model's input, output, context window and per-call credit limits.

- Basic configuration: \`name\` (40 characters), \`shortcut\` (24 characters), \`modelId\`, \`enabled\`, \`description\` (16,000 characters). Advanced fields: \`personality\`, \`userName\`, \`userPersona\`, \`scenario\`, \`firstMessage\`, \`examples\`, \`instructions\`, \`postHistoryInstructions\`. The Manifest is authoritative for full limits; serialized configuration is at most 120,000 UTF-8 bytes.
- Fixed character instructions, setting, personality, user role, scenario and examples go into system. \`postHistoryInstructions\` is compatible as a reply instruction at the end of system and does not emulate SillyTavern's post-history insertion point. Only \`{{char}}\` and \`{{user}}\` are expanded; scripts, other macros and external resources are neither executed nor loaded.
- V2 \`chara_card_v2\` / \`2.0\` JSON and PNG \`tEXt/chara\` Base64 metadata are read in the browser, with files at most 5 MB and character text at most 64 KB. V2 core text and character_book are mapped, and the original JSON is stored as \`sourceCard\` that does not participate in the prompt. The PNG cover is not saved, alternate greetings and extensions remain only in the original JSON, and regex entries are disabled by default. The edited core V2 JSON can be exported, or the original JSON can be downloaded to keep all source extensions. V3, CHARX and full SillyTavern runtime behavior are not supported yet.
- \`lore\` has at most 50 entries and supports \`keys\`, \`secondaryKeys\` (must hit together with the primary keywords when enabled), \`constant\`, \`caseSensitive\`, \`enabled\` and \`priority\`. Direct substring matching runs over the current input and the last 32,000 characters of the most recent 3 messages and does not recursively scan injected content. Complete entries are selected by descending priority and source order. \`loreTokenBudget\` defaults to 1,000, has a maximum of 4,000 and is disabled at 0; it is also constrained by the current input space. An over-budget entry is skipped whole; character settings and user questions are never truncated.
- Character instances and WeChat links isolate sessions separately; \`/use\` restores the character's most recent unarchived story, \`/new\` starts a new story and \`/exit\` returns to the normal model. \`@\` runs a single call with the current session context and stores it back in the current session without changing the target character's independent story. The fixed opening is written to the record when a story is created; it appears once when WeChat \`/use\` first creates one, on \`/new\`, and when creating after an archive, and is not repeated when restoring an old story. Creating on the web only writes the session record and does not push to WeChat.
- Character session compaction uses a plot-summary prompt that preserves time and place, relationship changes, item state, agreements and unresolved threads; raw records are retained. Plus users can view and correct the summary in their own web session; editing keeps the same compaction cursor, validates the summary version and context version, and resets/clears/deletes follow existing mechanisms. A summary follows the session owner, and a one-off call to another character does not change its summary type.
- Gateway metering uses the completed character prompt, matched lore, summary, history, current input and final reply, with plugin identity recorded as \`wechatai/roleplay\`. Upstream usage is not trusted; internal summaries and over-limit failures are not charged twice. An opening displayed directly is free; when it later becomes input it is billed.

This implementation references the public Character Card V2 format and implements protocol mapping itself; it contains no SillyTavern or RisuAI runtime code. Reference: https://github.com/malfoyslastname/character-card-spec-v2

## Command routing

Manifest.capabilities.commands may be "platform" (default, compatible with older manifests) or "native". The built-in OpenClaw / Hermes declare "native". This declaration describes command ownership and grants no extra execution permission.

- \`/wx <command>\` always calls a Wechatai command; /use and /exit remain the global switch shortcuts.
- When the current plugin supports native, other input beginning with / is passed through verbatim; platform plugins keep using Wechatai short commands.
- @shortcut /command explicitly invokes the plugin once, performs no second Wechatai command parse and does not change the default plugin.
- Only an \`@\` at the start of the message is recognized (full-width \`＠\` is also accepted); after the shortcut, whitespace, a Chinese or English comma or a colon may separate it, such as \`@助理，5 分钟后提醒我喝水\`. After removing the shortcut and separator, punctuation in the body is retained, and matching is exact by shortcut; a name without a separator is not guessed.
- The Agent's native /new or /reset preserves platform history and routes; /wx new creates a new platform session, and /wx reset invalidates the old return route.
- The Relay connector declares command support with heartbeat.nativeCommands=true; poll and claim must also carry nativeCommands=true. poll.lane is message (default) or control; control currently contains only parameterless /stop and can run in parallel with normal tasks. Normal tasks remain serial, and claimed tasks are not rerun. Older connectors do not claim native commands.
- A job returned by the Relay contains lane (message or control) and an optional command (lowercase command name), with text preserved verbatim. The connector enables native-command handling only for command jobs and still respects the Agent's permission settings. /stop is free and its confirmation reply is at most 256 tokens; /stop with parameters is handled as a normal command. Other native commands keep the gateway's input and final-output billing.

## Personal assistant plugin 1.0

The built-in plugin is \`wechatai/personal-assistant@1.0.0\`. The Manifest's configuration schema is public at \`/api/plugins/protocol\`. Configuration fields are \`name\`, \`shortcut\`, \`modelId\`, \`enabled\`, \`currency\` (default CNY) and \`reminderConnectionId\` (may be empty). It reuses the user's model and channel, requires native tool-call support and is compatible with Chat Completions, Responses and Anthropic Messages; models without tool support are not downgraded automatically. The assistant prompt replaces the normal model system prompt and inherits the model's input/output, context and per-call credit limits.

- Data is isolated by account and plugin instance; record types are \`note\`, \`entry\`, \`task\` and \`reminder\`, independent of chat sessions and summaries. Each configuration holds at most 10,000 records of at most 6,000 characters each. Clearing/deleting chats or deleting the answer model does not delete records; deleting the plugin configuration deletes all records and reminders.
- \`personal_query\` returns paginated records, ID/revision, total count and income/expense summaries by currency; 20 by default and at most 50. Dates use Beijing time, amounts are entered as positive decimal strings and stored as integer cents; summaries are computed by the database and the model's addition is not trusted.
- \`personal_create\`, \`personal_update\` and \`personal_delete\` are draft operations within the turn. Before editing/deleting, obtain the ID/revision from a query result. Tool calls only stage changes; after the final model reply succeeds, record changes, reminder plans, platform bills and a run receipt are saved together in a synchronous transaction. Upstream failures, timeouts, context retries and concurrent version conflicts leave no half-turn write. Duplicate messages are deduplicated by platform run ID, and identical write parameters in the same turn are also deduplicated. Each turn allows at most 9 model requests and 24 tool calls.
- Use a \`reminder\` record to schedule a reminder, not a \`task\`. Set \`remindAt\` to an ISO time with a timezone within the next two years and select a connected WeChat link; \`repeat\` is none/daily/weekly. Natural-language time is interpreted at fixed UTC+08:00. Scheduling uses the persistent alarm of the platform account DO and advances reminders in parallel with slow model requests; the database stores send state, and send retries reuse a stable client_id per reminder, without promising absolute once-only delivery over the upstream network.
- Reminders pause when the assistant is disabled, its configuration is outside the current plugin quota, or the connection is unavailable; a missing WeChat context token waits for the next WeChat message, and temporary failures retry with backoff. When re-scanning changes the connection generation or the target link is changed, old reminders are not forwarded to the new identity and must be set again. A one-time reminder overdue by more than 24 hours is marked expired, and a repeating reminder jumps to the next occurrence, avoiding a burst of catch-up sends. Completing or deleting a task does not cancel reminders. To cancel future delivery, set \`reminderEnabled\` to \`false\` to keep the record, or delete the reminder record. Proactive messages use the platform plugin source notice and divider.
- Gateway metering counts once the input snapshot (assistant system, actual context, current input) and the final reply; internal records, tool receipts and model calls are not charged again. Due reminders use a fixed template, call no model and consume no credits. A configuration test still bills input/final output but commits no drafts and sends no reminders.
- Same-origin signed-in API: \`POST /api/plugins/:id/records/query\` to query, \`POST /api/plugins/:id/records\` to save \`{record,recordId?,revision?}\`, and \`DELETE /api/plugins/:id/records/:recordId\` accepting \`{revision}\`. The account comes from the signed-in state, and both plugin and record IDs have ownership checked; this is not a public third-party plugin invocation interface. Reading, exporting and deleting remain available after Plus expires. Editing records requires an enabled assistant within the current plugin quota. Web CSV export is at most 1,000 rows at a time, can be split by date, and escapes cells against formula injection.

`;

export const pluginProtocolSectionsEn: readonly PluginProtocolSection[] = `${quickstart}${remainingSections}`
  .split(/^## /m)
  .slice(1)
  .map((section, index) => {
    const split = section.indexOf("\n");
    const title = section.slice(0, split).trim();
    const id = protocolSections[index]?.id;
    if (!id) throw new Error(`Missing Chinese protocol anchor for ${title}`);
    return { id, title, markdown: section.slice(split + 1).trim() };
  });

