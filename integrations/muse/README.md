# Wechatai for Muse

Connect an existing Muse hosted assistant to WeChat through Muse's hook runtime.
The bridge follows the hook/wake integration demonstrated by
[wechat-ilink-muse-bridge](https://github.com/gfydfhcf/wechat-ilink-muse-bridge),
but uses Wechatai's existing WeChat connection, pairing, durable relay and billing.
No iLink credentials are given to Muse. This is not a Muse model API or Muse Code adapter.

1. In Wechatai, add the Muse plugin and generate connection instructions.
2. Paste them into the main chat of your Muse hosted assistant. Python 3.10+ and
   Muse's `HATCH_HOOK_RUNTIME` / hook registration tools are required.
3. Muse executes the installer, reads the generated SETUP.md and registers/enables
   the hook with the bundled WORKER.md instructions. The installer alone does not
   register a hook. Online status requires an actual successful poll.
4. Send `/use muse` or `@muse hello` in the existing linked WeChat conversation.

Re-pairing waits for running tasks and pending replies/notifications to settle.
Restore the original hook's network, access or credits before reconnecting.
Installer and connector commands share a lock, so a stale wake cannot claim a task
during credential replacement. Explicitly revoking the old connection cancels its
return routes; that disconnected queue does not block a new pairing.

Only text and WeChat-transcribed voice are transported. Native Muse commands,
media, remote approvals and cancellation are not implemented. Models, tools,
memory and service costs remain with the user's Muse environment. Each route has
its own recent boundary transcript; the Muse environment's long-term memory and
tools remain shared. Do not use one environment for mutually untrusted users.

The hook uses a persistent runner UUID, SQLite journal and server-side claims.
Duplicate wakes cannot execute a job twice. A worker renews its lease every minute;
after ten minutes without renewal the connector reports failure without rerunning
tools. Final replies are persisted before relay delivery and use stable event IDs.
Access or credit pauses retain pending replies for retry. User task results take
priority over credit-paused proactive notifications. Disabling proactive delivery
rejects those notifications permanently; enabling it later does not replay them.
Jobs finish locally only after relay acknowledgement. Recent history uses the
acknowledged text, including server-side truncation and platform failure messages,
and never includes rejected replies. Accepted proactive replies also enter history.
`take` returns `maxOutputTokens`, bounded by both the queued task and current plugin
configuration. Workers should fit their final reply into that budget; excess text
is clipped and an unbilled notice precedes the partial result in delivery and history.
Unknown claim outcomes are never automatically re-executed. Progress/reasoning is
not sent or billed. A local event ID means queued, not delivered to WeChat.
Pending jobs expire after 24 hours. Resetting a Wechatai session or revoking the
connector closes its return route, but cannot stop tools already running in Muse.
Clearing/deleting platform conversation history also removes receipt and result-cache
bodies while retaining settlement and deduplication metadata. A cleared acknowledgement
finishes the local delivery without restoring a transcript or charging again.
This does not delete existing records, memory or files from the Muse environment.

Authorized proactive notifications use `push --route <routeId> --key <deliveryKey>` with text on stdin,
after a WeChat conversation establishes that route. Unrelated Muse activity is not
automatically forwarded. The required 1–200 character key identifies one delivery:
persist the scheduler job ID plus its intended occurrence time before sending and
reuse it on retries. A new occurrence or deliberate additional part needs a new key.
The same route/key preserves the first payload and maps to a stable event ID even
after a process restart. Omitting the key is rejected before enqueueing.
Credentials and journals are private files under
`~/hooks/state/wechatai-muse/<configuration-id>/`; do not publish them.

Tests use an HTTP fixture and a simulated hook runtime, not a live Muse service.
Real validation requires pasting the instructions into Muse, observing the hook
online, sending a WeChat request and receiving a completed final reply. Do not
claim native Muse compatibility based only on these fixture tests.

MIT; see LICENSE. No upstream bridge code is bundled.
