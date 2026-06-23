package app

import (
	"context"
	"database/sql"
	"strings"
)

type exchangeRateFilter struct {
	From     string
	To       string
	RateDate string
	Source   string
}

func (a *App) exchangeRatesForWorkspace(ctx context.Context, workspaceID int64, filter exchangeRateFilter) ([]map[string]any, error) {
	where := []string{"er.workspace_id = ?"}
	args := []any{workspaceID}
	if filter.From != "" {
		where = append(where, "f.code = ?")
		args = append(args, strings.ToUpper(filter.From))
	}
	if filter.To != "" {
		where = append(where, "t.code = ?")
		args = append(args, strings.ToUpper(filter.To))
	}
	if filter.RateDate != "" {
		where = append(where, "er.rate_date = ?")
		args = append(args, filter.RateDate)
	}
	if filter.Source != "" {
		where = append(where, "er.source = ?")
		args = append(args, filter.Source)
	}
	rows, err := a.db.QueryContext(ctx, exchangeRateSelectSQL("WHERE "+strings.Join(where, " AND ")+" ORDER BY er.rate_date DESC, er.id DESC LIMIT 200"), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rates := []map[string]any{}
	for rows.Next() {
		rate, err := scanExchangeRate(rows)
		if err != nil {
			return nil, err
		}
		rates = append(rates, rate)
	}
	return rates, rows.Err()
}

func (a *App) exchangeRateByID(ctx context.Context, id int64) (map[string]any, error) {
	rate, err := scanExchangeRate(a.db.QueryRowContext(ctx, exchangeRateSelectSQL("WHERE er.id = ? LIMIT 1"), id))
	if err != nil {
		return nil, err
	}
	return rate, nil
}

func scanExchangeRate(row rowScanner) (map[string]any, error) {
	var id int64
	var ws sql.NullInt64
	var from, to, source, provider, rateDate, created string
	var rate float64
	var sourceName, sourceURL, sell, buy, updated, fetched, note sql.NullString
	if err := row.Scan(&id, &ws, &from, &to, &rate, &source, &sourceName, &sourceURL, &provider, &sell, &buy, &updated, &fetched, &note, &rateDate, &created); err != nil {
		return nil, err
	}
	return map[string]any{
		"id":                id,
		"workspaceId":       nullableInt(ws),
		"from":              from,
		"to":                to,
		"rate":              rate,
		"source":            source,
		"sourceName":        nullableString(sourceName),
		"sourceUrl":         nullableString(sourceURL),
		"providerRateType":  provider,
		"providerSellRate":  parseNullFloat(sell),
		"providerBuyRate":   parseNullFloat(buy),
		"providerUpdatedAt": nullableString(updated),
		"fetchedAt":         nullableString(fetched),
		"note":              nullableString(note),
		"rateDate":          rateDate,
		"createdAt":         created,
	}, nil
}

func exchangeRateSelectSQL(clause string) string {
	return `SELECT er.id, er.workspace_id, f.code, t.code, er.rate, er.source, er.source_name, er.source_url,
er.provider_rate_type, er.provider_sell_rate, er.provider_buy_rate, er.provider_updated_at, er.fetched_at,
er.note, er.rate_date, er.created_at
FROM exchange_rates er
JOIN currencies f ON f.id = er.from_currency_id
JOIN currencies t ON t.id = er.to_currency_id ` + clause
}
