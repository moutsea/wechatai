# Wechatai for Hermes Agent

Native personal WeChat platform adapter for Hermes. Uses Hermes' documented platform registration, final `notify` marker and processing lifecycle hooks; no core patches or public inbound ports. Text and WeChat-transcribed voice only. Models, tools and memory stay in Hermes.

Tested with Hermes Agent v0.21.6+199.g1744a19 (upstream 1744a19e). Requires a current Hermes with platform registration, processing lifecycle hooks, `allow_gateway_control` and standalone cron send support. Install Hermes from https://hermes-agent.nousresearch.com/docs/getting-started/installation first. Node.js is not required for pairing; Python 3.10+ is required for the bootstrap command. Hermes supplies its own Python runtime.

1. In Wechatai Plus, open Plugins → Hermes → Connect Hermes.
2. Execute the generated Python command on the Hermes host (macOS, Linux or WSL).
3. The installer verifies the archive, installs this platform, pairs the current Hermes profile and starts/restarts Gateway. Wait for active tasks to finish first. It preserves other providers, platforms and existing plugin selections.
4. Send `@hermes question`, `/use hermes`, or `/exit` in WeChat. The actual shortcut is configurable.

The installer gets the active profile directory from `hermes config path`. Credentials live in its `plugin-data/wechatai/accounts.json` with mode 0600. The pairing proof is retained privately so a lost response can be retried without rotating a second credential. One Hermes profile can contain multiple connector accounts. Never share pairing commands or credentials. Profile user authorization is restricted to those connector IDs; remote Gateway control and tool approvals are not enabled.

Each route maps to an isolated native session. `/new`, `/reset`, archive, re-pair and changed WeChat bindings invalidate the old platform return route; local Hermes memory and scheduled tasks remain under Hermes' control. Use a separate Hermes profile if you need separate long-term agent memory.

Scheduled and host-initiated background delivery can use `deliver=wechatai:<accountId>:<routeId>` (or the source origin saved by Hermes). Start a WeChat conversation first to establish this destination. The registered standalone sender also works when cron runs outside Gateway. This plugin does not invent a model-callable messaging tool or forward unrelated agent activity.

Jobs are atomically claimed and journaled before execution. Restarted uncertain tasks fail without rerunning tools. Only completed final text is submitted to Wechatai; progress/reasoning/internal usage are not billed. Proactive delivery has zero input tokens. The local receipt means durable acceptance; relay and WeChat confirmations are asynchronous. Disable proactive delivery or edit waiting notices in the plugin settings.

Incoming jobs use bounded long polls. Local outbox notifications trigger immediate sends, while a local SQLite check covers other processes. Stable event IDs make retries idempotent. A revoked route/credential cannot post to a newly paired WeChat link.

Protocol and guide: https://wechatai.app/developers/hermes.md
Upstream platform SDK: https://hermes-agent.nousresearch.com/docs/developer-guide/adding-platform-adapters


## Verification

Run `pnpm test:hermes` with the official Hermes CLI installed (`HERMES_CLI` can override its path). The tests load the installed Hermes SDK and exercise final reply handling, startup restore, failure, persistent retry and standalone delivery, with no upstream calls. Cloudflare account/pairing/billing regressions are covered by `test/hermes.test.ts`.

Compatibility note: Hermes 2026.9 can return an empty acknowledged turn while startup restore queues the event for replay. The adapter waits on the current runner's `_startup_restore_in_progress` gate before dispatch. This is the only version-specific readiness read; rerun the native lifecycle and real gateway smoke checks when updating Hermes.
