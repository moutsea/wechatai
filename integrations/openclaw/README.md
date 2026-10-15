# Wechatai Channel for OpenClaw

Native, personal-use channel. It connects outbound to your Wechatai account; it does not expose the OpenClaw Gateway or reuse its operator token.

Requires Node.js >=22.19 and OpenClaw >=2026.6.10. Tested SDK: 2026.6.10.

1. In Wechatai, open Plugins → OpenClaw → Connect OpenClaw.
2. Copy the generated connection command and run it in the terminal on the OpenClaw host (macOS, Linux, or WSL).
3. The installer verifies the channel archive, installs compiled JavaScript, discovers the default Agent, pairs the account, applies a native recursive config patch and restarts Gateway. Wait for active work to finish before running it.
4. The web page updates automatically when the native channel connects. With multiple Agents, select one by name in the web UI and save. No manual Agent ID or permanent-token handling is required.
5. Send `@claw hello` or `/use claw` in your linked WeChat conversation.

Pairing commands expire after ten minutes and are single-installer credentials. Retries use a private locally stored proof, allowing safe recovery from a lost response. Credentials are passed via stdin and never printed. Reconnecting replaces the old credential only when pairing succeeds; revoking invalidates unused commands too. Switching Agents cancels old cloud routes and starts a separate native session without deleting local history.

The installer preserves existing channels, accounts, provider settings and explicit plugin allowlists. If Gateway cannot restart automatically, the terminal reports that configuration is saved and asks you to restart using your usual service/container command. The website only reports online after the native channel sends a heartbeat. The site cannot install software on your computer directly.

Use one OpenClaw instance per connector. Endpoint must be an HTTPS origin, except localhost HTTP for development. Never share tokens or expose your Gateway port for this integration.

Proactive delivery: start a WeChat conversation first. The shared message tool or a cron announcement can use channel `wechatai`, the configured account ID, and the conversation's `OriginatingTo` as `to`. Background results need that delivery route; this plugin does not forward unrelated agent activity. A local receipt means queued, not yet delivered to WeChat. Inspect delivery status in Wechatai.

Text only, including WeChat-transcribed voice. Media and approvals are not transported. The Agent owns tools, models and memory. Wechatai meters only submitted input and accepted final output; internal tokens are not reported or billed. Output caps affect delivery, not the Agent's execution budget.

Inbound job records expire 24 hours after creation, including claimed jobs. Expiration does not stop local execution, but the relay may reject its late result. Interrupted jobs fail without automatic re-execution because tools may have side effects. Replies are persisted in a private SQLite outbox and retried with stable event IDs. Revoked credentials/changed routes cannot deliver to new WeChat bindings. Reset/archive clears the platform route but does not delete local memory or cancel local cron jobs.

The connector's 20-second HTTP timeout applies only to individual relay requests, not the Agent turn. Agent execution uses the local OpenClaw timeout settings. A valid final answer accompanied by tool warnings is delivered with a short warning; raw tool error details are not forwarded. Error-only results, empty results and interrupted dispatches still fail without billing.

Latency: the connector uses a bounded 15-second long poll that wakes as soon as a job arrives. Replies and proactive messages flush immediately after local persistence, independently of heartbeat and Agent execution. The server interrupts idle WeChat receive polls when a reply arrives and prioritizes queued replies. Legacy connectors may continue short polling. Structured server timing events (`openclaw.claimed`, `openclaw.result`, `openclaw.delivered`) report queue and delivery delays without recording prompts, replies or credentials.

Full guide and agent-readable transport documentation: https://wechatai.app/developers/openclaw and https://wechatai.app/developers/openclaw.md

## Command routing (1.1.0+)

`/wx help` and other `/wx` commands belong to Wechatai. `/use` and `/exit` are global mode shortcuts. Other leading slash commands go to the active Agent; `@shortcut /command` sends a one-off native command without changing mode. Original text is retained. Native `/new` preserves Wechatai history. Agent authorization and command settings still apply.

Heartbeat, poll and claim advertise `nativeCommands: true`. Two poll lanes (`message`, `control`) allow `/stop` during a running task; other messages remain serial. `/stop` is free and bypasses the credits balance gate; other commands are metered at the gateway boundary. Old connectors cannot claim command jobs: update using a fresh website pairing command.

## License

MIT; see [LICENSE](LICENSE). Connector 1.1.4 adds runtime version reporting and an independent upgrade path; the wire protocol remains compatible with 1.1.x.

## Upgrade without pairing

Open the existing OpenClaw configuration in Wechatai and expand the connector update section. Run its upgrade command on the original host and OpenClaw profile after current tasks complete. It downloads and verifies the package, overwrites only the connector installation, and preserves channel credentials, Agent selections and routes. All Wechatai accounts in that installation share the upgrade.

The installer requests `openclaw gateway restart --safe` when supported. If unavailable or unsuccessful, restart manually after tasks finish; it never falls back to a forced/ordinary restart. Installation is not proof of activation: the page confirms the running version from fresh authenticated heartbeats (`connectorVersion`). Older clients remain supported and display an unknown version. No automatic updates are enabled.
