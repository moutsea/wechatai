// Wire format: openilink/openilink-sdk-python (MIT), get_config/send_typing.
import { wechatURL, wechatHeaders } from "./wechat-api.mjs";
import { readJsonLimited } from "./storage.mjs";
const MAX_TYPING_MS = 14 * 60 * 1000;

// One instance per authenticated WeChat link generation. Timers live only on the
// receiver host; failures never interrupt message receiving or model execution.
export class TypingIndicator {
  constructor(
    credentials,
    { fetchImpl = fetch, intervalMs = 5000, retryMs = 30000, metrics = {} } = {},
  ) {
    this.credentials = credentials;
    this.fetch = fetchImpl;
    this.intervalMs = intervalMs;
    this.retryMs = retryMs;
    this.metrics = metrics;
    this.until = 0;
    this.context = "";
    this.ticket = "";
    this.ticketUntil = 0;
    this.visible = false;
    this.closed = false;
    this.changed = false;
    this.work = null;
    this.timer = null;
    this.abort = new AbortController();
  }
  active() {
    return !this.closed && this.until > Date.now() && !!this.context;
  }
  update(config) {
    if (this.closed) return;
    const context = typeof config.typingContextToken === "string" ? config.typingContextToken : "";
    const until =
      Number.isFinite(config.typingUntil) && context
        ? Math.min(config.typingUntil, Date.now() + MAX_TYPING_MS)
        : 0;
    if (until === this.until && context === this.context) return;
    this.until = until;
    this.context = context;
    this.changed = true;
    this.kick();
  }
  async request(path, body, cancel = false) {
    const response = await this.fetch(wechatURL(this.credentials, path), {
      method: "POST",
      redirect: "manual",
      headers: wechatHeaders(this.credentials),
      body: JSON.stringify({ ...body, base_info: { channel_version: "2.1.6" } }),
      signal: cancel
        ? AbortSignal.timeout(3000)
        : AbortSignal.any([this.abort.signal, AbortSignal.timeout(3000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("typing_http");
    }
    const result = await readJsonLimited(response, 65536);
    if ((result.ret ?? 0) !== 0 || (result.errcode ?? 0) !== 0) throw new Error("typing_api");
    return result;
  }
  async refresh() {
    if (!this.active()) {
      if (this.visible && this.ticket) {
        try {
          await this.request(
            "sendtyping",
            { ilink_user_id: this.credentials.userId, typing_ticket: this.ticket, status: 2 },
            true,
          );
        } finally {
          this.visible = false;
        }
      }
      return;
    }
    if (!this.ticket || this.ticketUntil <= Date.now()) {
      const result = await this.request("getconfig", {
        ilink_user_id: this.credentials.userId,
        context_token: this.context,
      });
      if (
        typeof result.typing_ticket !== "string" ||
        !result.typing_ticket ||
        result.typing_ticket.length > 16000
      )
        throw new Error("typing_ticket");
      this.ticket = result.typing_ticket;
      // Conservative cache, not an assumption about WeChat's ticket lifetime.
      this.ticketUntil = Date.now() + 10 * 60 * 1000;
    }
    if (!this.active()) return;
    // A timeout can still mean WeChat applied the start: always cancel on stop.
    this.visible = true;
    await this.request("sendtyping", {
      ilink_user_id: this.credentials.userId,
      typing_ticket: this.ticket,
      status: 1,
    });
    this.metrics.typingSent = (this.metrics.typingSent || 0) + 1;
  }
  kick() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.work) return this.work;
    this.changed = false;
    let delay = this.intervalMs;
    const work = this.refresh()
      .catch(() => {
        if (!this.closed) this.metrics.typingFailed = (this.metrics.typingFailed || 0) + 1;
        this.ticketUntil = 0;
        delay = this.retryMs;
      })
      .finally(() => {
        this.work = null;
        if (this.changed || (!this.active() && this.visible)) this.kick();
        else if (this.active())
          this.timer = setTimeout(
            () => this.kick(),
            Math.max(1, Math.min(delay, this.until - Date.now())),
          );
      });
    this.work = work;
    return work;
  }
  async stop() {
    this.closed = true;
    this.until = 0;
    this.changed = true;
    this.abort.abort();
    clearTimeout(this.timer);
    this.timer = null;
    await this.kick();
    // A start may have been in flight when we stopped. Wait for its ordered cancel.
    while (this.work) await this.work;
    this.ticket = "";
  }
}
