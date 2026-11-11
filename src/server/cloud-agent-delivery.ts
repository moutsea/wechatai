import type { ChatSession } from "../shared/types";
import {
  CloudAgentStore,
  cloudTaskMatchesSession,
  cloudTaskTerminal,
  type CloudTask,
} from "./cloud-agent-store";

type Reply = {
  state: string;
  part: number;
  reply: string;
  sessionId: string;
  connectionId: string;
};
const replyId = (id: string) => `cloud:${id}`;

/** Local delivery bookkeeping only. The existing inbox sender owns network I/O,
 * parts and retries. The host must schedule its shared alarm after sync(). */
export class CloudAgentDelivery {
  private store: CloudAgentStore;
  constructor(
    private storage: DurableObjectStorage,
    private isStale: (task: CloudTask) => boolean,
  ) {
    this.store = new CloudAgentStore(storage);
  }

  init() {
    this.store.init();
  }

  private reply(id: string) {
    return this.storage.sql
      .exec<Reply>(
        "SELECT state,part,reply,sessionId,connectionId FROM inbox WHERE id=?",
        replyId(id),
      )
      .toArray()[0];
  }

  private current(task: CloudTask) {
    const row = this.storage.sql
      .exec<{ data: string }>("SELECT data FROM sessions WHERE id=?", task.sessionId)
      .toArray()[0];
    const session = row ? (JSON.parse(row.data) as ChatSession & { contextStart: number }) : null;
    return (
      !task.hidden && !task.stale && cloudTaskMatchesSession(task, session) && !this.isStale(task)
    );
  }

  private discard(task: CloudTask, status: "stale" | "failed") {
    this.storage.sql.exec(
      "UPDATE inbox SET state='done',payload='{}',reply='' WHERE id=? AND state IN ('reply','waiting_context')",
      replyId(task.id),
    );
    return this.store.patch(task, {
      stale: status === "stale" ? 1 : task.stale,
      delivered: 1,
      deliveryStatus: status,
      nextAt: 0,
    });
  }

  /** Idempotently queue a terminal reply or reconcile sender failure. Never bill
   * or rebuild an existing body/part cursor. Only acknowledge() confirms sent. */
  sync(id: string): CloudTask | null {
    return this.storage.transactionSync(() => {
      const task = this.store.get(id);
      if (!task || !cloudTaskTerminal(task.state)) return null;
      if (task.delivered) {
        if (task.deliveryStatus !== "sent")
          this.discard(task, task.stale || task.hidden ? "stale" : "failed");
        return this.store.get(id)!;
      }
      if (!this.current(task)) return this.discard(task, "stale");
      const row = this.reply(id);
      if (row && (row.sessionId !== task.sessionId || row.connectionId !== task.connectionId))
        return this.discard(task, "stale");
      if (row && !["reply", "waiting_context"].includes(row.state))
        return this.discard(task, "failed");
      if (!row) {
        if (task.deliveryQueuedAt !== undefined) return this.discard(task, "failed");
        const body = [task.error, task.result].filter((part) => part.trim()).join("\n\n");
        if (!body.trim()) return this.discard(task, "failed");
        const now = Date.now();
        this.storage.sql.exec(
          "INSERT INTO inbox (id,payload,state,reply,createdAt,sessionId,connectionId) VALUES (?,'{}','reply',?,?,?,?)",
          replyId(id),
          body,
          now,
          task.sessionId,
          task.connectionId,
        );
        return this.store.patch(task, { deliveryQueuedAt: now, attempts: 0, nextAt: now + 15_000 });
      }
      if (!row.reply.trim()) return this.discard(task, "failed");
      return this.store.patch(task, {
        attempts: task.attempts + 1,
        nextAt: Date.now() + Math.min(300_000, 15_000 * 2 ** Math.min(task.attempts, 4)),
      });
    });
  }

  /** The sender checks before each part and again after external I/O. Discard a
   * changed route, but leave a newer part cursor untouched by a late response. */
  pending(id: string, part: number): boolean {
    return this.storage.transactionSync(() => {
      const task = this.store.get(id);
      if (!task || !cloudTaskTerminal(task.state)) {
        this.storage.sql.exec(
          "UPDATE inbox SET state='done',payload='{}',reply='' WHERE id=?",
          replyId(id),
        );
        return false;
      }
      if (task.delivered) {
        if (task.deliveryStatus !== "sent")
          this.discard(task, task.stale || task.hidden ? "stale" : "failed");
        return false;
      }
      if (!this.current(task)) {
        this.discard(task, "stale");
        return false;
      }
      const row = this.reply(id);
      if (row && (row.sessionId !== task.sessionId || row.connectionId !== task.connectionId)) {
        this.discard(task, "stale");
        return false;
      }
      if (row?.state === "reply" && !row.reply.trim()) {
        this.discard(task, "failed");
        return false;
      }
      return !!row && row.state === "reply" && row.part === part && !!row.reply.trim();
    });
  }

  /** Called only after the final part is acknowledged by WeChat. Commit the
   * receipt with inbox completion, so a crash cannot resend or guess success. */
  acknowledge(id: string, part: number): boolean {
    return this.storage.transactionSync(() => {
      if (!this.pending(id, part)) return false;
      this.storage.sql.exec(
        "UPDATE inbox SET state='done',payload='{}',reply='' WHERE id=?",
        replyId(id),
      );
      this.store.patch(this.store.get(id)!, {
        delivered: 1,
        deliveryStatus: "sent",
        nextAt: 0,
        attempts: 0,
      });
      return true;
    });
  }
}
