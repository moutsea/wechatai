import { billingRevenueQueries } from "./billing-revenue";
import { dayWindow } from "./wallet";

type RevenueSummary = {
  revenue: number;
  paidOrders: number;
  payingUsers: number;
  membershipRevenue: number;
  creditsRevenue: number;
};
type RevenueDay = { day: string; revenue: number; paidOrders: number };

export async function metricsRevenue(env: Env, mode: "test" | "live", now = Date.now()) {
  const start = dayWindow(now).start - 29 * 86400000;
  const db = env.DB.withSession("first-primary");
  const [summaryResult, dailyResult] = await db.batch<RevenueSummary | RevenueDay>([
    ...billingRevenueQueries(db, mode, start, now),
  ]);
  if (!summaryResult.success || !dailyResult.success || summaryResult.results.length !== 1)
    throw new Error("billing_orders_unavailable");
  const summary = summaryResult.results[0] as RevenueSummary;
  const days = new Map((dailyResult.results as RevenueDay[]).map((row) => [row.day, row]));
  const unavailable = {
    available: false,
    value: null,
    reason: "现有 paid 订单求和不是净额，退款未入本聚合",
  } as const;
  return {
    service: "wechatai",
    documentationVersion: "1",
    timezone: "Asia/Shanghai",
    authenticated: true,
    mode,
    currency: "cny",
    unit: "人民币元",
    basis: "gross",
    label: "已支付毛额",
    generatedAt: now,
    source: "billing_order",
    sourceCoverage:
      "仅覆盖本库订单。历史订阅续费更新原订单，paid_at 仅首次填入，可能缺少后续收款。全量实收及对账需另行核验。",
    definitions: {
      filter: "mode=当前站点模式 AND status='paid' AND currency='cny'",
      amount: "SUM(amount)/100，整数分求和后转换为人民币元，未扣退款",
      paidOrders: "COUNT(*)，每个匹配订单行计一次",
      payingUsers: "COUNT(DISTINCT user_id)，在累计匹配订单中去重",
      membershipRevenue: "kind='plus' 的已支付毛额",
      creditsRevenue: "kind='credits' 的已支付毛额",
      dailyTime: "COALESCE(paid_at,created_at)，毫秒时间，按 Asia/Shanghai 分日",
    },
    summary: {
      available: true,
      window: "查询时库内全部匹配订单，无日期过滤",
      revenue: summary.revenue,
      paidOrders: summary.paidOrders,
      payingUsers: summary.payingUsers,
      membershipRevenue: summary.membershipRevenue,
      creditsRevenue: summary.creditsRevenue,
    },
    daily: {
      available: true,
      from: start,
      to: now,
      boundaries: "inclusive",
      includesToday: true,
      items: Array.from({ length: 30 }, (_, index) => {
        const day = dayWindow(start + index * 86400000).day;
        const row = days.get(day);
        return { day, revenue: row?.revenue ?? 0, paidOrders: row?.paidOrders ?? 0 };
      }),
    },
    refunds: unavailable,
    netRevenue: unavailable,
  };
}
