package reporting

import (
	"context"
	"time"

	"github.com/moutsea/wechatai/backend/internal/credits"
	"github.com/moutsea/wechatai/backend/internal/membership"
	"github.com/moutsea/wechatai/backend/internal/platform/sqlite"
	"github.com/moutsea/wechatai/backend/internal/wechat"
)

type usage struct {
	Requests int64   `json:"requests"`
	Tokens   int64   `json:"tokens"`
	Credits  float64 `json:"credits"`
}
type dailyUsage struct {
	usage
	Day            string `json:"day"`
	FailedRequests int64  `json:"failedRequests"`
}
type pluginUsage struct {
	usage
	PluginID string `json:"pluginId"`
	Day      string `json:"day"`
}
type activation struct {
	FirstModelTestAt       *int64 `json:"firstModelTestAt"`
	FirstWechatConnectedAt *int64 `json:"firstWechatConnectedAt"`
	FirstWechatReplyAt     *int64 `json:"firstWechatReplyAt"`
	LastWechatReplyAt      *int64 `json:"lastWechatReplyAt"`
	DeliveredWechatReplies int64  `json:"deliveredWechatReplies"`
}
type Stats struct {
	usage
	Activation        activation    `json:"activation"`
	SampledAt         int64         `json:"sampledAt"`
	PlanUntil         int64         `json:"planUntil"`
	Links             int           `json:"links"`
	Connected         int           `json:"connected"`
	Channels          int           `json:"channels"`
	Models            int           `json:"models"`
	Plugins           int           `json:"plugins"`
	Sessions          int           `json:"sessions"`
	PurchasedCredits  float64       `json:"purchasedCredits"`
	Debt              float64       `json:"debt"`
	LastActiveAt      *int64        `json:"lastActiveAt"`
	FailedRequests    int64         `json:"failedRequests"`
	LastFailureAt     *int64        `json:"lastFailureAt"`
	LastFailureCode   *string       `json:"lastFailureCode"`
	LastFailureStatus *int          `json:"lastFailureStatus"`
	Daily             []dailyUsage  `json:"daily"`
	PluginUsage       []pluginUsage `json:"pluginUsage"`
}

const unresolved = `NOT EXISTS(SELECT 1 FROM usage u WHERE u.id=f.id)`

func Read(ctx context.Context, q sqlite.Querier, now time.Time) (Stats, error) {
	s := Stats{SampledAt: now.UnixMilli()}
	var err error
	if s.PlanUntil, err = membership.PlanUntil(ctx, q); err != nil {
		return s, err
	}
	if s.Links, s.Connected, err = wechat.LinkCounts(ctx, q, s.PlanUntil > s.SampledAt); err != nil {
		return s, err
	}
	if err := s.readTotals(ctx, q); err != nil {
		return s, err
	}
	if err := s.Activation.read(ctx, q); err != nil {
		return s, err
	}
	_, today, _ := credits.DayWindow(now)
	start := today - 29*86400000
	if s.Daily, err = daily(ctx, q, start, s.SampledAt); err != nil {
		return s, err
	}
	s.PluginUsage, err = plugins(ctx, q, start, s.SampledAt)
	return s, err
}

func (s *Stats) readTotals(ctx context.Context, q sqlite.Querier) error {
	err := q.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE(SUM(tokens),0),COALESCE(SUM(units),0)/1000.0,MAX(createdAt) FROM usage`).Scan(&s.Requests, &s.Tokens, &s.Credits, &s.LastActiveAt)
	if err != nil {
		return err
	}
	err = q.QueryRowContext(ctx, `SELECT
        (SELECT COUNT(*) FROM channels)+(SELECT COUNT(*) FROM assistants a WHERE json_extract(a.data,'$.channelId') IS NULL AND NOT EXISTS(SELECT 1 FROM channels c WHERE c.id=a.id)),
        (SELECT COUNT(*) FROM assistants),(SELECT COUNT(*) FROM plugins),(SELECT COUNT(*) FROM sessions),
        (SELECT COALESCE(SUM(remaining),0)/1000.0 FROM credit_buckets WHERE kind='purchase' AND expires>?),
        (SELECT amount/1000.0 FROM credit_debt WHERE id=1),
        (SELECT count(*) FROM call_failures f WHERE `+unresolved+`)`, s.SampledAt).Scan(&s.Channels, &s.Models, &s.Plugins, &s.Sessions, &s.PurchasedCredits, &s.Debt, &s.FailedRequests)
	if err != nil {
		return err
	}
	err = q.QueryRowContext(ctx, `SELECT createdAt,code,upstreamStatus FROM call_failures f WHERE `+unresolved+` ORDER BY createdAt DESC,id DESC LIMIT 1`).Scan(&s.LastFailureAt, &s.LastFailureCode, &s.LastFailureStatus)
	if err != nil && !sqlite.IsMissing(err) {
		return err
	}
	return nil
}

func (a *activation) read(ctx context.Context, q sqlite.Querier) error {
	return q.QueryRowContext(ctx, `SELECT
        MAX(CASE key WHEN 'firstModelTestAt' THEN json_extract(value,'$') END),
        MAX(CASE key WHEN 'firstWechatConnectedAt' THEN json_extract(value,'$') END),
        MAX(CASE key WHEN 'firstWechatReplyAt' THEN json_extract(value,'$') END),
        MAX(CASE key WHEN 'lastWechatReplyAt' THEN json_extract(value,'$') END),
        COALESCE(MAX(CASE key WHEN 'deliveredWechatReplies' THEN json_extract(value,'$') END),0)
        FROM settings WHERE key IN ('firstModelTestAt','firstWechatConnectedAt','firstWechatReplyAt','lastWechatReplyAt','deliveredWechatReplies')`).Scan(&a.FirstModelTestAt, &a.FirstWechatConnectedAt, &a.FirstWechatReplyAt, &a.LastWechatReplyAt, &a.DeliveredWechatReplies)
}

func daily(ctx context.Context, q sqlite.Querier, start, end int64) ([]dailyUsage, error) {
	rows, err := q.QueryContext(ctx, `SELECT strftime('%Y-%m-%d',createdAt/1000,'unixepoch','+8 hours') day,
        SUM(succeeded),SUM(1-succeeded),SUM(tokens),SUM(units)/1000.0
        FROM (SELECT createdAt,tokens,units,1 succeeded FROM usage
              UNION ALL SELECT createdAt,0,0,0 FROM call_failures f WHERE `+unresolved+`)
        WHERE createdAt>=? AND createdAt<=? GROUP BY day ORDER BY day`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []dailyUsage{}
	for rows.Next() {
		var d dailyUsage
		if err := rows.Scan(&d.Day, &d.Requests, &d.FailedRequests, &d.Tokens, &d.Credits); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, rows.Err()
}

func plugins(ctx context.Context, q sqlite.Querier, start, end int64) ([]pluginUsage, error) {
	rows, err := q.QueryContext(ctx, `SELECT COALESCE(m.pluginId,json_extract(p.data,'$.pluginId'),'legacy'),
        strftime('%Y-%m-%d',u.createdAt/1000,'unixepoch','+8 hours'),count(*) requests,SUM(u.tokens),SUM(u.units)/1000.0
        FROM usage u LEFT JOIN platform_metering m ON m.id=u.id
        LEFT JOIN claw_events e ON e.id=substr(u.id,6) AND u.id LIKE 'claw:%'
        LEFT JOIN plugins p ON p.id=e.pluginId WHERE u.createdAt>=? AND u.createdAt<=?
        GROUP BY 1,2 ORDER BY requests DESC`, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []pluginUsage{}
	for rows.Next() {
		var p pluginUsage
		if err := rows.Scan(&p.PluginID, &p.Day, &p.Requests, &p.Tokens, &p.Credits); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}
