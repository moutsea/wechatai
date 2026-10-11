import { BILLING_OFFERS } from "../shared/billing";
import { secret } from "./config";
import { readJson } from "./security";

type NoticeData = {
  name: string;
  email: string;
  offerId: string;
  amount: number;
  currency: string;
  credits: number;
  firstPayment: number;
  renewal: number;
};
type Notice = {
  payment_id: string;
  order_id: string;
  data: string;
  attempts: number;
  created_at: number;
};
const RETENTION_MS = 24 * 60 * 60 * 1000;

function configured(env: Env) {
  return Boolean(
    secret(env, "STRIPE_SECRET_KEY", false).startsWith("sk_live_") &&
    secret(env, "BILLING_NOTIFY_TOKEN", false) &&
    new URL(env.APP_URL).protocol === "https:",
  );
}

// Put this statement BEFORE the paid-order update in the same D1 batch. Both
// commit together, and first-payment detection sees the pre-payment state.
export function paymentNoticeStatements(
  env: Env,
  orderId: string,
  paymentId: string,
  renewal = false,
): D1PreparedStatement[] {
  if (!configured(env)) return [];
  const now = Date.now();
  return [
    env.DB.prepare(
      `INSERT OR IGNORE INTO billing_notification(payment_id,order_id,data,created_at,next_at)
       SELECT ?,o.id,json_object(
         'name',u.name,'email',u.email,'offerId',o.offer_id,
         'amount',o.amount,'currency',o.currency,'credits',o.credits,
         'firstPayment',NOT EXISTS(SELECT 1 FROM billing_order p
           WHERE p.user_id=o.user_id AND p.mode=o.mode AND p.status='paid'),
         'renewal',?),?,?
       FROM billing_order o JOIN user u ON u.id=o.user_id
       WHERE o.id=? AND o.mode='live'
         AND (?=0 OR NOT EXISTS(SELECT 1 FROM billing_order p
           WHERE p.user_id=o.user_id AND p.mode=o.mode AND p.status='paid'))`,
    ).bind(
      paymentId,
      renewal ? 1 : 0,
      now,
      now,
      orderId,
      secret(env, "BILLING_NOTIFY_SCOPE", false) === "first_payment" ? 1 : 0,
    ),
  ];
}

function line(value: string) {
  return value
    .replace(/\s+/g, " ")
    .slice(0, 160)
    .replace(/[\\`*_[\]<>]/g, "\\$&");
}
function message(row: Notice) {
  const data: NoticeData = JSON.parse(row.data);
  const offer = BILLING_OFFERS.find((item) => item.id === data.offerId);
  const amount = `${data.currency === "cny" ? "¥" : data.currency.toUpperCase() + " "}${(data.amount / 100).toFixed(2)}`;
  return {
    title: "微伴收款成功",
    text: [
      `用户：${line(data.name)}（${line(data.email)}）`,
      `购买：${offer?.name ?? data.offerId}${data.credits ? ` · ${data.credits.toLocaleString("en-US")} credits` : ""}`,
      `实付：${amount}`,
      `类型：${data.firstPayment ? "首次付款" : data.renewal ? "订阅自动续费" : "再次购买"}`,
      `订单：${row.order_id}`,
      `确认时间：${new Date(row.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）`,
    ].join("\n"),
  };
}

async function deliver(env: Env, row: Notice) {
  try {
    const response = await fetch(new URL("/api/notify", env.APP_URL), {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${secret(env, "BILLING_NOTIFY_TOKEN")}`,
        "content-type": "application/json",
        "idempotency-key": `wechatai:payment:${row.payment_id}`,
      },
      body: JSON.stringify(message(row)),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`http_${response.status}`);
    }
    const result = (await readJson(response, 4096)) as { id?: string; status?: string } | null;
    if (
      !result ||
      typeof result.id !== "string" ||
      !/^[0-9a-f-]{36}$/.test(result.id) ||
      !["pending", "sending", "sent"].includes(result.status ?? "")
    )
      throw new Error("invalid_receipt");
    await env.DB.prepare(
      "UPDATE billing_notification SET state='accepted',data='',delivery_id=?,accepted_at=?,error='' WHERE payment_id=? AND state='sending' AND attempts=?",
    )
      .bind(result.id, Date.now(), row.payment_id, row.attempts)
      .run();
    console.info(
      JSON.stringify({
        event: "billing.notification_accepted",
        paymentId: row.payment_id,
        deliveryId: result.id,
      }),
    );
  } catch (error) {
    // Never log the request, bearer token, response body or purchaser details.
    const code =
      error instanceof Error && /^http_\d{3}$|^invalid_receipt$/.test(error.message)
        ? error.message
        : "delivery_unavailable";
    const delay = Math.min(15 * 60_000, 30_000 * 2 ** Math.min(row.attempts - 1, 5));
    await env.DB.prepare(
      "UPDATE billing_notification SET state='pending',next_at=?,error=? WHERE payment_id=? AND state='sending' AND attempts=?",
    )
      .bind(Date.now() + delay, code, row.payment_id, row.attempts)
      .run();
    console.warn(
      JSON.stringify({ event: "billing.notification_retry", paymentId: row.payment_id, code }),
    );
  }
}

export async function dispatchPaymentNotices(env: Env): Promise<void> {
  if (!configured(env)) return;
  try {
    const now = Date.now();
    await env.DB.prepare(
      "UPDATE billing_notification SET state='failed',data='',error='delivery_expired' WHERE state IN ('pending','sending') AND created_at<?",
    )
      .bind(now - RETENTION_MS)
      .run();
    const due = await env.DB.prepare(
      "SELECT payment_id FROM billing_notification WHERE state IN ('pending','sending') AND next_at<=? ORDER BY next_at LIMIT 5",
    )
      .bind(now)
      .all<{ payment_id: string }>();
    const results = await Promise.allSettled(
      due.results.map(async ({ payment_id }) => {
        const row = await env.DB.prepare(
          "UPDATE billing_notification SET state='sending',attempts=attempts+1,next_at=? WHERE payment_id=? AND state IN ('pending','sending') AND next_at<=? RETURNING *",
        )
          .bind(Date.now() + 60_000, payment_id, Date.now())
          .first<Notice>();
        if (row) await deliver(env, row);
      }),
    );
    if (results.some((result) => result.status === "rejected"))
      console.error(JSON.stringify({ event: "billing.notification_dispatch_failed" }));
  } catch {
    // The next cron invocation recovers persisted pending jobs or expired leases.
    console.error(JSON.stringify({ event: "billing.notification_dispatch_failed" }));
  }
}
