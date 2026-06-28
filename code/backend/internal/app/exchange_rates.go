package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
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

type bankReferenceRateBoardRow struct {
	CurrencyCode      string
	CurrencyName      string
	CurrencySymbol    string
	CustomerSellRate  float64
	CustomerBuyRate   float64
	RateDate          string
	ProviderUpdatedAt string
	FetchedAt         string
	SourceName        string
	SourceURL         string
}

type budgetExchangeRateInput struct {
	BudgetID       int64
	UserID         int64
	FromCurrencyID int64
	ToCurrencyID   int64
	Rate           float64
	RateDate       string
	Note           any
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
		"((er.source = 'bank_reference' AND er.workspace_id IS NULL) OR (er.source <> 'bank_reference' AND er.workspace_id = ?))",
		"NOT (er.source = 'bank_reference' AND er.provider_rate_type = 'mid')",
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

func (a *App) accountExchangeRates(ctx context.Context, userID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, exchangeRateSelectSQL(`WHERE er.source = 'manual'
  AND er.workspace_id IS NULL
  AND er.user_id = ?
ORDER BY er.rate_date DESC, er.created_at DESC, er.id DESC`), userID)
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

func (a *App) requireAccountExchangeRateOwner(ctx context.Context, id, userID int64) error {
	var exists int
	err := a.db.QueryRowContext(ctx, `SELECT 1
FROM exchange_rates
WHERE id = ? AND user_id = ? AND workspace_id IS NULL AND source = 'manual'
LIMIT 1`, id, userID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return apiError("EXCHANGE_RATE_NOT_FOUND", "Exchange rate was not found.", http.StatusNotFound)
	}
	return err
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
	sourceNameValue := nullableString(sourceName)
	sourceURLValue := nullableString(sourceURL)
	if source == "bank_reference" {
		sourceNameValue = "Reference rate provider"
		sourceURLValue = nil
	}
	return map[string]any{
		"id":                id,
		"workspaceId":       nullableInt(ws),
		"from":              from,
		"to":                to,
		"rate":              rate,
		"source":            source,
		"sourceName":        sourceNameValue,
		"sourceUrl":         sourceURLValue,
		"providerRateType":  provider,
		"providerSellRate":  parseNullFloat(sell),
		"providerBuyRate":   parseNullFloat(buy),
		"providerUpdatedAt": nullableString(updated),
		"fetchedAt":         nullableString(fetched),
		"note":              nullableString(note),
		"rateDate":          dateString(rateDate),
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
	return source == "manual" || source == "budget_default" || source == "bank_reference"
}

func bankReferenceCurrencyCodes() []string {
	codes := make([]string, 0, len(bankReferenceCurrencyMetaByCode))
	for code := range bankReferenceCurrencyMetaByCode {
		if code == "HKD" {
			continue
		}
		codes = append(codes, code)
	}
	return codes
}

func bankReferenceSupportedCurrencyCodes() []string {
	codes := make([]string, 0, len(bankReferenceCurrencyMetaByCode))
	for code := range bankReferenceCurrencyMetaByCode {
		codes = append(codes, code)
	}
	return codes
}

func isBankReferenceSupportedCurrency(code string) bool {
	_, ok := bankReferenceCurrencyMetaByCode[strings.ToUpper(strings.TrimSpace(code))]
	return ok
}

func (a *App) bankReferenceRateBoard(ctx context.Context, onDate string) ([]bankReferenceRateBoardRow, error) {
	hkdID, err := a.requiredSeedCurrencyID(ctx, "HKD")
	if err != nil {
		return nil, err
	}
	codes := bankReferenceCurrencyCodes()
	if len(codes) == 0 {
		return []bankReferenceRateBoardRow{}, nil
	}
	args := []any{hkdID}
	for _, code := range codes {
		args = append(args, code)
	}
	dateFilter := ""
	if onDate != "" {
		dateFilter = " AND er.rate_date <= ?"
	}
	query := `SELECT c.code, c.name, c.symbol,
  MAX(CASE WHEN er.provider_rate_type = 'customer_buy' THEN er.provider_buy_rate END) AS customer_buy,
  MAX(CASE WHEN er.provider_rate_type = 'customer_sell' THEN er.provider_sell_rate END) AS customer_sell,
  MAX(er.rate_date) AS rate_date,
  MAX(er.provider_updated_at) AS provider_updated_at,
  MAX(er.fetched_at) AS fetched_at,
  MAX(er.source_name) AS source_name,
  MAX(er.source_url) AS source_url
FROM exchange_rates er
JOIN currencies c ON c.id = CASE
  WHEN er.from_currency_id = ? THEN er.to_currency_id
  ELSE er.from_currency_id
END
WHERE er.source = 'bank_reference'
  AND er.workspace_id IS NULL
  AND c.code IN (` + placeholders(len(codes)) + `)
  AND ((er.to_currency_id = ? AND er.provider_rate_type = 'customer_buy')
    OR (er.from_currency_id = ? AND er.provider_rate_type = 'customer_sell'))` + dateFilter + `
GROUP BY c.code, c.name, c.symbol
HAVING customer_buy IS NOT NULL OR customer_sell IS NOT NULL
ORDER BY c.code`
	args = append(args, hkdID, hkdID)
	if onDate != "" {
		args = append(args, onDate)
	}
	rows, err := a.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []bankReferenceRateBoardRow{}
	for rows.Next() {
		var row bankReferenceRateBoardRow
		var buy, sell, updated, fetched, sourceName, sourceURL sql.NullString
		if err := rows.Scan(
			&row.CurrencyCode,
			&row.CurrencyName,
			&row.CurrencySymbol,
			&buy,
			&sell,
			&row.RateDate,
			&updated,
			&fetched,
			&sourceName,
			&sourceURL,
		); err != nil {
			return nil, err
		}
		if value, ok := nullStringFloat(buy); ok {
			row.CustomerBuyRate = value
		}
		if value, ok := nullStringFloat(sell); ok {
			row.CustomerSellRate = value
		}
		row.RateDate = dateString(row.RateDate)
		row.ProviderUpdatedAt = nullableStringToString(updated)
		row.FetchedAt = nullableStringToString(fetched)
		row.SourceName = nullableStringToString(sourceName)
		row.SourceURL = nullableStringToString(sourceURL)
		out = append(out, row)
	}
	return out, rows.Err()
}

func nullStringFloat(raw sql.NullString) (float64, bool) {
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return 0, false
	}
	value, err := strconv.ParseFloat(raw.String, 64)
	return value, err == nil
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
	if err := deleteCurrentExchangeRatesTx(ctx, tx, input); err != nil {
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

func deleteCurrentExchangeRatesTx(ctx context.Context, tx *sql.Tx, input currentExchangeRateInput) error {
	_, err := tx.ExecContext(ctx, `DELETE FROM exchange_rates
WHERE (workspace_id <=> ?)
  AND (workspace_id IS NOT NULL OR user_id <=> ?)
  AND from_currency_id = ?
  AND to_currency_id = ?
  AND source = ?
  AND provider_rate_type = ?`,
		nullableInt(input.WorkspaceID), nullableInt(input.UserID), input.FromCurrencyID, input.ToCurrencyID, input.Source, input.ProviderRateType,
	)
	return err
}

func (a *App) resolveExchangeRate(ctx context.Context, userID, workspaceID, fromCurrencyID, toCurrencyID int64, onDate string) (exchangeRateConversion, error) {
	return a.resolveExchangeRateForBudget(ctx, 0, userID, workspaceID, fromCurrencyID, toCurrencyID, onDate)
}

func (a *App) resolveExchangeRateForBudget(ctx context.Context, budgetID, userID, workspaceID, fromCurrencyID, toCurrencyID int64, onDate string) (exchangeRateConversion, error) {
	if fromCurrencyID <= 0 || toCurrencyID <= 0 {
		return exchangeRateConversion{}, apiError("CURRENCY_NOT_FOUND", "Currency is not available.", http.StatusUnprocessableEntity)
	}
	if fromCurrencyID == toCurrencyID {
		return exchangeRateConversion{Rate: 1, RateDate: onDate, Source: "identity", ConversionPath: "identity"}, nil
	}
	if budgetID > 0 {
		direct, err := a.latestBudgetExchangeRate(ctx, budgetID, fromCurrencyID, toCurrencyID, onDate)
		if err != nil {
			return exchangeRateConversion{}, err
		}
		if direct != nil {
			direct.ConversionPath = "budget_direct"
			return *direct, nil
		}
		inverse, err := a.latestBudgetExchangeRate(ctx, budgetID, toCurrencyID, fromCurrencyID, onDate)
		if err != nil {
			return exchangeRateConversion{}, err
		}
		if inverse != nil && inverse.Rate > 0 {
			inverse.Rate = 1 / inverse.Rate
			inverse.ConversionPath = "budget_inverse"
			return *inverse, nil
		}
	}
	direct, err := a.latestAccountExchangeRate(ctx, userID, fromCurrencyID, toCurrencyID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	if direct != nil {
		direct.ConversionPath = "account_direct"
		return *direct, nil
	}
	inverse, err := a.latestAccountExchangeRate(ctx, userID, toCurrencyID, fromCurrencyID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	if inverse != nil && inverse.Rate > 0 {
		inverse.Rate = 1 / inverse.Rate
		inverse.ConversionPath = "account_inverse"
		return *inverse, nil
	}
	direct, err = a.latestBankReferenceExchangeRate(ctx, fromCurrencyID, toCurrencyID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	if direct != nil {
		direct.ConversionPath = "bank_reference_direct"
		return *direct, nil
	}
	inverse, err = a.latestBankReferenceExchangeRate(ctx, toCurrencyID, fromCurrencyID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	if inverse != nil && inverse.Rate > 0 {
		inverse.Rate = 1 / inverse.Rate
		inverse.ConversionPath = "bank_reference_inverse"
		return *inverse, nil
	}
	hkdID, err := a.requiredSeedCurrencyID(ctx, "HKD")
	if err != nil {
		return exchangeRateConversion{}, err
	}
	fromHKD, err := a.rateForPair(ctx, userID, workspaceID, fromCurrencyID, hkdID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	hkdToTarget, err := a.rateForPair(ctx, userID, workspaceID, hkdID, toCurrencyID, onDate)
	if err != nil {
		return exchangeRateConversion{}, err
	}
	if fromHKD == nil || hkdToTarget == nil {
		fromCode, _ := a.currencyCodeByID(ctx, fromCurrencyID)
		toCode, _ := a.currencyCodeByID(ctx, toCurrencyID)
		return exchangeRateConversion{}, httpx.APIError{Code: "EXCHANGE_RATE_NOT_FOUND", Message: "Exchange rate is missing. Enter a manual rate or use an external reference.", Status: http.StatusUnprocessableEntity, Meta: map[string]any{
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

func (a *App) latestBudgetExchangeRate(ctx context.Context, budgetID, fromCurrencyID, toCurrencyID int64, onDate string) (*exchangeRateConversion, error) {
	dateFilter := ""
	args := []any{budgetID, fromCurrencyID, toCurrencyID}
	if onDate != "" {
		dateFilter = " AND rate_date <= ?"
		args = append(args, onDate)
	}
	row := a.db.QueryRowContext(ctx, `SELECT rate, rate_date, 'budget_default'
FROM budget_exchange_rates
WHERE budget_id = ?
  AND from_currency_id = ?
  AND to_currency_id = ?`+dateFilter+`
ORDER BY rate_date DESC, updated_at DESC, id DESC
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

func (a *App) latestGlobalExchangeRate(ctx context.Context, fromCurrencyID, toCurrencyID int64, onDate string) (*exchangeRateConversion, error) {
	if fromCurrencyID == toCurrencyID {
		return &exchangeRateConversion{Rate: 1, RateDate: dateStringOrToday(onDate), Source: "identity", ConversionPath: "identity"}, nil
	}
	direct, err := a.latestGlobalBankReferenceRate(ctx, fromCurrencyID, toCurrencyID, onDate)
	if err != nil || direct != nil {
		if direct != nil {
			direct.ConversionPath = "global_direct"
		}
		return direct, err
	}
	inverse, err := a.latestGlobalBankReferenceRate(ctx, toCurrencyID, fromCurrencyID, onDate)
	if err != nil || inverse == nil || inverse.Rate <= 0 {
		return nil, err
	}
	inverse.Rate = 1 / inverse.Rate
	inverse.ConversionPath = "global_inverse"
	return inverse, nil
}

func (a *App) latestGlobalExchangeRateWithCross(ctx context.Context, fromCurrencyID, toCurrencyID int64, onDate string) (*exchangeRateConversion, error) {
	direct, err := a.latestGlobalExchangeRate(ctx, fromCurrencyID, toCurrencyID, onDate)
	if err != nil || direct != nil {
		return direct, err
	}
	hkdID, err := a.requiredSeedCurrencyID(ctx, "HKD")
	if err != nil {
		var apiErr httpx.APIError
		if errors.As(err, &apiErr) && apiErr.Code == "CURRENCY_NOT_FOUND" {
			return nil, nil
		}
		return nil, err
	}
	fromHKD, err := a.latestGlobalExchangeRate(ctx, fromCurrencyID, hkdID, onDate)
	if err != nil {
		return nil, err
	}
	hkdToTarget, err := a.latestGlobalExchangeRate(ctx, hkdID, toCurrencyID, onDate)
	if err != nil {
		return nil, err
	}
	if fromHKD == nil || hkdToTarget == nil {
		return nil, nil
	}
	return &exchangeRateConversion{
		Rate:           fromHKD.Rate * hkdToTarget.Rate,
		RateDate:       maxText(fromHKD.RateDate, hkdToTarget.RateDate),
		Source:         fromHKD.Source + "+" + hkdToTarget.Source,
		ConversionPath: "global_hkd_cross",
	}, nil
}

func (a *App) latestGlobalBankReferenceRate(ctx context.Context, fromCurrencyID, toCurrencyID int64, onDate string) (*exchangeRateConversion, error) {
	dateFilter := ""
	args := []any{fromCurrencyID, toCurrencyID}
	if onDate != "" {
		dateFilter = " AND er.rate_date <= ?"
		args = append(args, onDate)
	}
	row := a.db.QueryRowContext(ctx, `SELECT er.rate, er.rate_date, er.source
FROM exchange_rates er
WHERE er.source = 'bank_reference'
  AND er.workspace_id IS NULL
  AND er.from_currency_id = ?
  AND er.to_currency_id = ?
  AND NOT (er.provider_rate_type = 'mid')`+dateFilter+`
ORDER BY er.rate_date DESC, er.created_at DESC, er.id DESC
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

func (a *App) budgetExchangeRates(ctx context.Context, budgetID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, budgetExchangeRateSelectSQL("WHERE ber.budget_id = ? ORDER BY ber.updated_at DESC, ber.id DESC"), budgetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rates := []map[string]any{}
	for rows.Next() {
		rate, err := scanBudgetExchangeRate(rows)
		if err != nil {
			return nil, err
		}
		rates = append(rates, rate)
	}
	return rates, rows.Err()
}

func (a *App) budgetExchangeRateByID(ctx context.Context, id int64) (map[string]any, error) {
	return scanBudgetExchangeRate(a.db.QueryRowContext(ctx, budgetExchangeRateSelectSQL("WHERE ber.id = ? LIMIT 1"), id))
}

func (a *App) budgetExchangeRateBudgetID(ctx context.Context, id int64) (int64, error) {
	var budgetID int64
	err := a.db.QueryRowContext(ctx, "SELECT budget_id FROM budget_exchange_rates WHERE id = ? LIMIT 1", id).Scan(&budgetID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, apiError("EXCHANGE_RATE_NOT_FOUND", "Budget exchange rate was not found.", http.StatusNotFound)
	}
	return budgetID, err
}

func budgetExchangeRateSelectSQL(clause string) string {
	return `SELECT ber.id, ber.budget_id, f.code, t.code, ber.rate, ber.rate_date, ber.source_note, ber.updated_at
FROM budget_exchange_rates ber
JOIN currencies f ON f.id = ber.from_currency_id
JOIN currencies t ON t.id = ber.to_currency_id ` + clause
}

func scanBudgetExchangeRate(row rowScanner) (map[string]any, error) {
	var id, budgetID int64
	var from, to, rateDate, updated string
	var rate float64
	var note sql.NullString
	if err := row.Scan(&id, &budgetID, &from, &to, &rate, &rateDate, &note, &updated); err != nil {
		return nil, err
	}
	return map[string]any{
		"id":        id,
		"budgetId":  budgetID,
		"from":      from,
		"to":        to,
		"rate":      rate,
		"rateDate":  dateString(rateDate),
		"source":    "budget_default",
		"note":      nullableString(note),
		"updatedAt": updated,
	}, nil
}

func (a *App) saveBudgetExchangeRate(ctx context.Context, input budgetExchangeRateInput) (int64, error) {
	if input.RateDate == "" {
		input.RateDate = todayDate()
	}
	res, err := a.db.ExecContext(ctx, `INSERT INTO budget_exchange_rates
(budget_id, user_id, from_currency_id, to_currency_id, rate, rate_date, source_note)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  user_id = VALUES(user_id),
  rate = VALUES(rate),
  rate_date = VALUES(rate_date),
  source_note = VALUES(source_note),
  updated_at = CURRENT_TIMESTAMP`,
		input.BudgetID, input.UserID, input.FromCurrencyID, input.ToCurrencyID, input.Rate, input.RateDate, input.Note,
	)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	if id > 0 {
		return id, nil
	}
	row := a.db.QueryRowContext(ctx, `SELECT id FROM budget_exchange_rates
WHERE budget_id = ? AND from_currency_id = ? AND to_currency_id = ?
LIMIT 1`, input.BudgetID, input.FromCurrencyID, input.ToCurrencyID)
	var existingID int64
	if err := row.Scan(&existingID); err != nil {
		return 0, err
	}
	return existingID, nil
}

func (a *App) rateForPair(ctx context.Context, userID, workspaceID, fromCurrencyID, toCurrencyID int64, onDate string) (*exchangeRateConversion, error) {
	if fromCurrencyID == toCurrencyID {
		return &exchangeRateConversion{Rate: 1, RateDate: onDate, Source: "identity"}, nil
	}
	direct, err := a.latestAccountExchangeRate(ctx, userID, fromCurrencyID, toCurrencyID, onDate)
	if err != nil || direct != nil {
		return direct, err
	}
	inverse, err := a.latestAccountExchangeRate(ctx, userID, toCurrencyID, fromCurrencyID, onDate)
	if err != nil {
		return nil, err
	}
	if inverse != nil && inverse.Rate > 0 {
		inverse.Rate = 1 / inverse.Rate
		return inverse, nil
	}
	direct, err = a.latestBankReferenceExchangeRate(ctx, fromCurrencyID, toCurrencyID, onDate)
	if err != nil || direct != nil {
		return direct, err
	}
	inverse, err = a.latestBankReferenceExchangeRate(ctx, toCurrencyID, fromCurrencyID, onDate)
	if err != nil || inverse == nil || inverse.Rate <= 0 {
		return nil, err
	}
	inverse.Rate = 1 / inverse.Rate
	return inverse, nil
}

func (a *App) latestBankReferenceExchangeRate(ctx context.Context, fromCurrencyID, toCurrencyID int64, onDate string) (*exchangeRateConversion, error) {
	dateFilter := ""
	args := []any{fromCurrencyID, toCurrencyID}
	if onDate != "" {
		dateFilter = " AND er.rate_date <= ?"
		args = append(args, onDate)
	}
	row := a.db.QueryRowContext(ctx, `SELECT er.rate, er.rate_date, er.source
FROM exchange_rates er
WHERE er.source = 'bank_reference'
  AND er.workspace_id IS NULL
  AND er.from_currency_id = ?
  AND er.to_currency_id = ?
  AND er.provider_rate_type IN ('customer_sell', 'customer_buy')`+dateFilter+`
ORDER BY er.rate_date DESC, er.created_at DESC, er.id DESC
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

func (a *App) latestAccountExchangeRate(ctx context.Context, userID, fromCurrencyID, toCurrencyID int64, onDate string) (*exchangeRateConversion, error) {
	if userID <= 0 {
		return nil, nil
	}
	dateFilter := ""
	args := []any{userID, fromCurrencyID, toCurrencyID}
	if onDate != "" {
		dateFilter = " AND er.rate_date <= ?"
		args = append(args, onDate)
	}
	row := a.db.QueryRowContext(ctx, `SELECT er.rate, er.rate_date, er.source
FROM exchange_rates er
WHERE er.source = 'manual'
  AND er.workspace_id IS NULL
  AND er.user_id = ?
  AND er.from_currency_id = ?
  AND er.to_currency_id = ?`+dateFilter+`
ORDER BY er.rate_date DESC, er.created_at DESC, er.id DESC
LIMIT 1`, args...)
	var conversion exchangeRateConversion
	if err := row.Scan(&conversion.Rate, &conversion.RateDate, &conversion.Source); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	conversion.Source = "account_manual"
	return &conversion, nil
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
FROM exchange_rates er
WHERE ((er.source = 'bank_reference' AND er.workspace_id IS NULL) OR (er.source <> 'bank_reference' AND er.workspace_id = ?))
  AND er.from_currency_id = ?
  AND er.to_currency_id = ?
  AND NOT (er.source = 'bank_reference' AND er.provider_rate_type = 'mid')`+dateFilter+`
ORDER BY
  CASE WHEN er.workspace_id = ? THEN 0 ELSE 1 END,
  er.rate_date DESC,
  CASE er.source
    WHEN 'manual' THEN 0
    WHEN 'bank_reference' THEN 1
    WHEN 'budget_default' THEN 3
    ELSE 4
  END,
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
