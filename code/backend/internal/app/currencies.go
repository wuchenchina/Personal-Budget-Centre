package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"budgetcentre/backend/internal/httpx"
)

var (
	currencyCodePattern     = regexp.MustCompile(`^[A-Z]{3}$`)
	mysqlIdentifierPattern  = regexp.MustCompile(`^[A-Za-z0-9_]+$`)
	validCurrencyDecimalSet = map[int64]bool{0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true}
)

type currencyRecord struct {
	ID            int64
	Code          string
	Name          string
	Symbol        string
	DecimalPlaces int64
	IsEnabled     bool
}

func (a *App) currencyCreate(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	code := normalizedCurrencyCode(input["code"])
	if !currencyCodePattern.MatchString(code) {
		return apiError("VALIDATION_ERROR", "Currency code must be a three-letter ISO-style code.", http.StatusUnprocessableEntity)
	}
	name, err := requiredLimitedString(input["name"], 120, "Currency name")
	if err != nil {
		return err
	}
	symbol := stringValue(input["symbol"])
	if symbol == "" {
		symbol = code
	}
	if len(symbol) > 16 {
		return apiError("VALIDATION_ERROR", "Currency symbol must be 16 characters or less.", http.StatusUnprocessableEntity)
	}
	decimals := int64Value(firstValue(input, "decimalPlaces", "decimal_places"))
	if !validCurrencyDecimalSet[decimals] {
		return apiError("VALIDATION_ERROR", "Currency decimal places must be between 0 and 6.", http.StatusUnprocessableEntity)
	}
	if exists, err := a.currencyExists(r.Context(), code); err != nil || exists {
		if err != nil {
			return err
		}
		return apiError("CURRENCY_ALREADY_EXISTS", "Currency already exists.", http.StatusConflict)
	}
	res, err := a.db.ExecContext(r.Context(), `INSERT INTO currencies
(code, name, symbol, decimal_places, is_enabled)
VALUES (?, ?, ?, ?, 1)`, code, name, symbol, decimals)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	currency, err := a.currencyByID(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"currency": currencyToResponse(currency)}, http.StatusCreated)
	return nil
}

func (a *App) currencyDelete(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	currency, err := a.currencyByInput(r.Context(), input)
	if err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := deleteCurrencyExchangeRateReferences(r.Context(), tx, currency.ID); err != nil {
		return err
	}
	usage, err := a.currencyUsageCountTx(r.Context(), tx, currency.ID)
	if err != nil {
		return err
	}
	if usage > 0 {
		return httpx.APIError{
			Code:    "CURRENCY_IN_USE",
			Message: "Currency is still referenced by existing data.",
			Status:  http.StatusConflict,
			Meta: map[string]any{
				"currency": currency.Code,
				"usage":    usage,
			},
		}
	}
	if _, err := tx.ExecContext(r.Context(), "DELETE FROM currencies WHERE id = ?", currency.ID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	currencies, err := a.currencies(r.Context())
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"currencies": currenciesToResponse(currencies)}, http.StatusOK)
	return nil
}

func (a *App) currencyExists(ctx context.Context, code string) (bool, error) {
	var exists int
	err := a.db.QueryRowContext(ctx, "SELECT 1 FROM currencies WHERE code = ? LIMIT 1", code).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (a *App) currencies(ctx context.Context) ([]currencyRecord, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT id, code, name, symbol, decimal_places, is_enabled
FROM currencies
WHERE is_enabled = 1
ORDER BY code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	currencies := []currencyRecord{}
	for rows.Next() {
		currency, err := scanCurrency(rows)
		if err != nil {
			return nil, err
		}
		currencies = append(currencies, currency)
	}
	return currencies, rows.Err()
}

func (a *App) currencyByID(ctx context.Context, id int64) (currencyRecord, error) {
	return scanCurrency(a.db.QueryRowContext(ctx, `SELECT id, code, name, symbol, decimal_places, is_enabled
FROM currencies
WHERE id = ?
LIMIT 1`, id))
}

func (a *App) currencyByInput(ctx context.Context, input map[string]any) (currencyRecord, error) {
	id := int64Value(input["id"])
	if id > 0 {
		currency, err := a.currencyByID(ctx, id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return currencyRecord{}, apiError("CURRENCY_NOT_FOUND", "Currency is not available.", http.StatusNotFound)
			}
			return currencyRecord{}, err
		}
		return currency, nil
	}
	code := normalizedCurrencyCode(input["code"])
	if !currencyCodePattern.MatchString(code) {
		return currencyRecord{}, apiError("VALIDATION_ERROR", "Currency id or code is required.", http.StatusUnprocessableEntity)
	}
	row := a.db.QueryRowContext(ctx, `SELECT id, code, name, symbol, decimal_places, is_enabled
FROM currencies
WHERE code = ?
LIMIT 1`, code)
	currency, err := scanCurrency(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return currencyRecord{}, apiError("CURRENCY_NOT_FOUND", "Currency is not available.", http.StatusNotFound)
		}
		return currencyRecord{}, err
	}
	return currency, nil
}

func scanCurrency(row rowScanner) (currencyRecord, error) {
	var currency currencyRecord
	if err := row.Scan(
		&currency.ID,
		&currency.Code,
		&currency.Name,
		&currency.Symbol,
		&currency.DecimalPlaces,
		&currency.IsEnabled,
	); err != nil {
		return currencyRecord{}, err
	}
	return currency, nil
}

func currencyToResponse(currency currencyRecord) map[string]any {
	return map[string]any{
		"id":            currency.ID,
		"code":          currency.Code,
		"name":          currency.Name,
		"symbol":        currency.Symbol,
		"decimalPlaces": currency.DecimalPlaces,
		"isEnabled":     currency.IsEnabled,
	}
}

func currenciesToResponse(currencies []currencyRecord) []map[string]any {
	out := make([]map[string]any, 0, len(currencies))
	for _, currency := range currencies {
		out = append(out, currencyToResponse(currency))
	}
	return out
}

func normalizedCurrencyCode(value any) string {
	return strings.ToUpper(strings.TrimSpace(stringValue(value)))
}

func (a *App) currencyUsageCount(ctx context.Context, currencyID int64) (int64, error) {
	return a.currencyUsageCountTx(ctx, a.db, currencyID)
}

func (a *App) currencyUsageCountTx(ctx context.Context, db queryExecer, currencyID int64) (int64, error) {
	rows, err := db.QueryContext(ctx, `SELECT table_name, column_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name = 'currencies'
  AND referenced_column_name = 'id'
ORDER BY table_name, column_name`)
	if err != nil {
		return 0, err
	}
	type currencyReferenceColumn struct {
		tableName  string
		columnName string
	}
	references := []currencyReferenceColumn{}
	for rows.Next() {
		var reference currencyReferenceColumn
		if err := rows.Scan(&reference.tableName, &reference.columnName); err != nil {
			_ = rows.Close()
			return 0, err
		}
		references = append(references, reference)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return 0, err
	}
	if err := rows.Close(); err != nil {
		return 0, err
	}
	var total int64
	for _, reference := range references {
		if reference.tableName == "exchange_rates" || reference.tableName == "exchange_rate_history" {
			continue
		}
		count, err := currencyColumnUsage(ctx, db, reference.tableName, reference.columnName, currencyID)
		if err != nil {
			return 0, err
		}
		total += count
	}
	return total, nil
}

func deleteCurrencyExchangeRateReferences(ctx context.Context, tx *sql.Tx, currencyID int64) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM exchange_rates
WHERE from_currency_id = ? OR to_currency_id = ?`, currencyID, currencyID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `DELETE FROM exchange_rate_history
WHERE from_currency_id = ? OR to_currency_id = ?`, currencyID, currencyID)
	return err
}

func currencyColumnUsage(ctx context.Context, db queryExecer, tableName, columnName string, currencyID int64) (int64, error) {
	tableID, err := quoteMySQLIdentifier(tableName)
	if err != nil {
		return 0, err
	}
	columnID, err := quoteMySQLIdentifier(columnName)
	if err != nil {
		return 0, err
	}
	var count int64
	query := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s = ?", tableID, columnID)
	if err := db.QueryRowContext(ctx, query, currencyID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

type queryExecer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func quoteMySQLIdentifier(value string) (string, error) {
	if !mysqlIdentifierPattern.MatchString(value) {
		return "", fmt.Errorf("invalid MySQL identifier %q", value)
	}
	return "`" + value + "`", nil
}
