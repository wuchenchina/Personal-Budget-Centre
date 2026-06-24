package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"budgetcentre/backend/internal/httpx"
)

type exchangeRateFilter struct {
	From     string
	To       string
	RateDate string
	Source   string
}

type exchangeRateConversion struct {
	Rate           float64
	RateDate       string
	Source         string
	ConversionPath string
}

type currentExchangeRateInput struct {
	UserID            sql.NullInt64
	WorkspaceID       sql.NullInt64
	FromCurrencyID    int64
	ToCurrencyID      int64
	Rate              float64
	RateDate          string
	Source            string
	SourceName        any
	SourceURL         any
	ProviderRateType  string
	ProviderSellRate  any
	ProviderBuyRate   any
	ProviderUpdatedAt any
	FetchedAt         any
	Note              any
}

func (a *App) exchangeRatesForWorkspace(ctx context.Context, workspaceID int64, filter exchangeRateFilter) ([]map[string]any, error) {
	where, args, err := exchangeRateListClause(workspaceID, filter)
	if err != nil {
		return nil, err
	}
	rows, err := a.db.QueryContext(ctx, exchangeRateSelectSQL("WHERE "+where+" ORDER BY CASE WHEN er.workspace_id = ? THEN 0 ELSE 1 END, er.rate_date DESC, er.id DESC LIMIT 200"), append(args, workspaceID)...)
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

func exchangeRateListClause(workspaceID int64, filter exchangeRateFilter) (string, []any, error) {
	if filter.Source != "" && !validExchangeRateSource(filter.Source) {
		return "", nil, apiError("VALIDATION_ERROR", "Exchange rate source is invalid.", http.StatusUnprocessableEntity)
	}
	where := []string{
		"(er.workspace_id = ? OR er.workspace_id IS NULL)",
		"er.source <> 'mastercard'",
		"NOT (er.source = 'bochk' AND er.provider_rate_type = 'mid')",
	}
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
	return strings.Join(where, " AND "), args, nil
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

func validExchangeRateSource(source string) bool {
	return source == "manual" || source == "budget_default" || source == "bochk"
}

func (a *App) saveCurrentExchangeRate(ctx context.Context, input currentExchangeRateInput) (int64, error) {
	if input.Source == "" {
		input.Source = "manual"
	}
	if !validExchangeRateSource(input.Source) {
		return 0, apiError("VALIDATION_ERROR", "Exchange rate source is invalid.", http.StatusUnprocessableEntity)
	}
	if input.ProviderRateType == "" {
		input.ProviderRateType = "manual"
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	id, err := saveCurrentExchangeRateTx(ctx, tx, input)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return id, nil
}

func saveCurrentExchangeRateTx(ctx context.Context, tx *sql.Tx, input currentExchangeRateInput) (int64, error) {
	if input.Source == "" {
		input.Source = "manual"
	}
	if input.ProviderRateType == "" {
		input.ProviderRateType = "manual"
	}
	if err := archiveCurrentExchangeRatesTx(ctx, tx, input); err != nil {
		return 0, err
	}
	if err := deleteArchivedCurrentExchangeRatesTx(ctx, tx, input); err != nil {
		return 0, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO exchange_rates
(user_id, workspace_id, from_currency_id, to_currency_id, rate, rate_date, source, source_name, source_url,
provider_rate_type, provider_sell_rate, provider_buy_rate, provider_updated_at, fetched_at, note)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		nullableInt(input.UserID),
		nullableInt(input.WorkspaceID),
		input.FromCurrencyID,
		input.ToCurrencyID,
		input.Rate,
		input.RateDate,
		input.Source,
		input.SourceName,
		input.SourceURL,
		input.ProviderRateType,
		input.ProviderSellRate,
		input.ProviderBuyRate,
		input.ProviderUpdatedAt,
		input.FetchedAt,
		input.Note,
	)
	if err != nil {
		return 0, err
	}
	if id, _ := res.LastInsertId(); id > 0 {
		return id, nil
	}
	return 0, nil
}

const archiveCurrentExchangeRatesSQL = `INSERT INTO exchange_rate_history
(current_rate_id, user_id, workspace_id, from_currency_id, to_currency_id, rate, rate_date, source,
source_name, source_url, provider_rate_type, provider_sell_rate, provider_buy_rate, provider_updated_at,
fetched_at, note, original_created_at)
SELECT er.id, er.user_id, er.workspace_id, er.from_currency_id, er.to_currency_id, er.rate, er.rate_date,
er.source, er.source_name, er.source_url, er.provider_rate_type, er.provider_sell_rate, er.provider_buy_rate,
er.provider_updated_at, er.fetched_at, er.note, er.created_at
FROM exchange_rates er
WHERE (er.workspace_id <=> ?)
  AND er.from_currency_id = ?
  AND er.to_currency_id = ?
  AND er.source = ?
  AND er.provider_rate_type = ?`

func archiveCurrentExchangeRatesTx(ctx context.Context, tx *sql.Tx, input currentExchangeRateInput) error {
	_, err := tx.ExecContext(ctx, archiveCurrentExchangeRatesSQL,
		nullableInt(input.WorkspaceID), input.FromCurrencyID, input.ToCurrencyID, input.Source, input.ProviderRateType,
	)
	return err
}

func deleteArchivedCurrentExchangeRatesTx(ctx context.Context, tx *sql.Tx, input currentExchangeRateInput) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM exchange_rates
WHERE (workspace_id <=> ?)
  AND from_currency_id = ?
  AND to_currency_id = ?
  AND source = ?
  AND provider_rate_type = ?`,
		nullableInt(input.WorkspaceID), input.FromCurrencyID, input.ToCurrencyID, input.Source, input.ProviderRateType,
	)
	return err
}

func (a *App) resolveExchangeRate(ctx context.Context, workspaceID, fromCurrencyID, toCurrencyID int64, onDate string) (exchangeRateConversion, error) {
	if fromCurrencyID <= 0 || toCurrencyID <= 0 {
		return exchangeRateConversion{}, apiError("CURRENCY_NOT_FOUND", "Currency is not available.", http.StatusUnprocessableEntity)
	}
	if fromCurrencyID == toCurrencyID {
		return exchangeRateConversion{Rate: 1, RateDate: onDate, Source: "identity", ConversionPath: "identity"}, nil
	}
	direct, err := a.latestExchangeRate(ctx, workspaceID, fromCurrencyID, toCurrencyID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	if direct != nil {
		direct.ConversionPath = "direct"
		return *direct, nil
	}
	inverse, err := a.latestExchangeRate(ctx, workspaceID, toCurrencyID, fromCurrencyID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	if inverse != nil && inverse.Rate > 0 {
		inverse.Rate = 1 / inverse.Rate
		inverse.ConversionPath = "inverse"
		return *inverse, nil
	}
	hkdID, err := a.requiredSeedCurrencyID(ctx, "HKD")
	if err != nil {
		return exchangeRateConversion{}, err
	}
	fromHKD, err := a.rateForPair(ctx, workspaceID, fromCurrencyID, hkdID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	hkdToTarget, err := a.rateForPair(ctx, workspaceID, hkdID, toCurrencyID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	if fromHKD == nil || hkdToTarget == nil {
		fromCode, _ := a.currencyCodeByID(ctx, fromCurrencyID)
		toCode, _ := a.currencyCodeByID(ctx, toCurrencyID)
		return exchangeRateConversion{}, httpx.APIError{Code: "EXCHANGE_RATE_NOT_FOUND", Message: "Exchange rate is missing. Refresh BOCHK rates or add a manual rate.", Status: http.StatusUnprocessableEntity, Meta: map[string]any{
			"fromCurrency": nullableText(fromCode),
			"toCurrency":   nullableText(toCode),
			"rateDate":     nullableText(onDate),
		}}
	}
	return exchangeRateConversion{
		Rate:           fromHKD.Rate * hkdToTarget.Rate,
		RateDate:       maxText(fromHKD.RateDate, hkdToTarget.RateDate),
		Source:         fromHKD.Source + "+" + hkdToTarget.Source,
		ConversionPath: "hkd_cross",
	}, nil
}

func (a *App) rateForPair(ctx context.Context, workspaceID, fromCurrencyID, toCurrencyID int64, onDate string) (*exchangeRateConversion, error) {
	if fromCurrencyID == toCurrencyID {
		return &exchangeRateConversion{Rate: 1, RateDate: onDate, Source: "identity"}, nil
	}
	direct, err := a.latestExchangeRate(ctx, workspaceID, fromCurrencyID, toCurrencyID, onDate)
	if err != nil || direct != nil {
		return direct, err
	}
	inverse, err := a.latestExchangeRate(ctx, workspaceID, toCurrencyID, fromCurrencyID, onDate)
	if err != nil || inverse == nil || inverse.Rate <= 0 {
		return nil, err
	}
	inverse.Rate = 1 / inverse.Rate
	return inverse, nil
}

func (a *App) latestExchangeRate(ctx context.Context, workspaceID, fromCurrencyID, toCurrencyID int64, onDate string) (*exchangeRateConversion, error) {
	dateFilter := ""
	args := []any{workspaceID, fromCurrencyID, toCurrencyID}
	if onDate != "" {
		dateFilter = " AND er.rate_date <= ?"
		args = append(args, onDate)
	}
	args = append(args, workspaceID)
	row := a.db.QueryRowContext(ctx, `SELECT er.rate, er.rate_date, er.source
FROM (
  SELECT id, workspace_id, from_currency_id, to_currency_id, rate, rate_date, source, provider_rate_type, created_at, 1 AS is_current
  FROM exchange_rates
  UNION ALL
  SELECT id, workspace_id, from_currency_id, to_currency_id, rate, rate_date, source, provider_rate_type, original_created_at AS created_at, 0 AS is_current
  FROM exchange_rate_history
) er
WHERE (er.workspace_id = ? OR er.workspace_id IS NULL)
  AND er.from_currency_id = ?
  AND er.to_currency_id = ?
  AND er.source <> 'mastercard'
  AND NOT (er.source = 'bochk' AND er.provider_rate_type = 'mid')`+dateFilter+`
ORDER BY
  CASE WHEN er.workspace_id = ? THEN 0 ELSE 1 END,
  er.rate_date DESC,
  CASE er.source
    WHEN 'manual' THEN 0
    WHEN 'bochk' THEN 1
    WHEN 'budget_default' THEN 3
    ELSE 4
  END,
  er.is_current DESC,
  er.created_at DESC,
  er.id DESC
LIMIT 1`, args...)
	var conversion exchangeRateConversion
	if err := row.Scan(&conversion.Rate, &conversion.RateDate, &conversion.Source); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &conversion, nil
}

func (a *App) currencyCodeByID(ctx context.Context, id int64) (string, error) {
	var code string
	err := a.db.QueryRowContext(ctx, "SELECT code FROM currencies WHERE id = ? LIMIT 1", id).Scan(&code)
	return code, err
}

func (a *App) requiredSeedCurrencyID(ctx context.Context, code string) (int64, error) {
	id, err := a.currencyID(ctx, code)
	if err != nil || !id.Valid {
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return 0, err
		}
		return 0, apiError("CURRENCY_NOT_FOUND", fmt.Sprintf("%s currency seed is missing.", code), http.StatusInternalServerError)
	}
	return id.Int64, nil
}

func maxText(a, b string) string {
	if a >= b {
		return a
	}
	return b
}
