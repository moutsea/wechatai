// Both admin overview and external metrics use the same paid-order scope.
// Keep integer cents inside SUM and convert to yuan only after aggregation.
export function billingRevenueQueries(
  db: D1DatabaseSession,
  mode: "test" | "live",
  start: number,
  now: number,
) {
  return [
    db
      .prepare(`SELECT COALESCE(SUM(amount),0)/100.0 revenue, COUNT(*) paidOrders, COUNT(DISTINCT user_id) payingUsers,
      COALESCE(SUM(CASE WHEN kind='plus' THEN amount ELSE 0 END),0)/100.0 membershipRevenue,
      COALESCE(SUM(CASE WHEN kind='credits' THEN amount ELSE 0 END),0)/100.0 creditsRevenue
      FROM billing_order WHERE mode=? AND status='paid' AND currency='cny'`)
      .bind(mode),
    db
      .prepare(`SELECT strftime('%Y-%m-%d',COALESCE(paid_at,created_at)/1000,'unixepoch','+8 hours') day,
      SUM(amount)/100.0 revenue, COUNT(*) paidOrders FROM billing_order
      WHERE mode=? AND status='paid' AND currency='cny' AND COALESCE(paid_at,created_at)>=? AND COALESCE(paid_at,created_at)<=? GROUP BY day`)
      .bind(mode, start, now),
  ] as const;
}
