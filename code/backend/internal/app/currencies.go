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
	IsPersonal    bool
	IsReferenced  bool
	Source        string
}

func (a *App) currencyCreate(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
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
	source := stringDefault(stringValue(input["source"]), "manual")
	if source != "catalog" {
		source = "manual"
	}
	var name string
	var symbol string
	var decimals int64
	if source == "manual" {
		name, err = requiredLimitedString(input["name"], 120, "Currency name")
		if err != nil {
			return err
		}
		symbol = stringValue(input["symbol"])
		if symbol == "" {
			symbol = code
		}
		if len(symbol) > 16 {
			return apiError("VALIDATION_ERROR", "Currency symbol must be 16 characters or less.", http.StatusUnprocessableEntity)
		}
		decimals = int64Value(firstValue(input, "decimalPlaces", "decimal_places"))
		if !validCurrencyDecimalSet[decimals] {
			return apiError("VALIDATION_ERROR", "Currency decimal places must be between 0 and 6.", http.StatusUnprocessableEntity)
		}
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var currencyID int64
	if source == "catalog" {
		currency, err := currencyByCodeTx(r.Context(), tx, code)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apiError("CURRENCY_NOT_FOUND", "Currency preset is not available.", http.StatusUnprocessableEntity)
			}
			return err
		}
		currencyID = currency.ID
		if err := ensureUserCurrencyByIDTx(r.Context(), tx, s.UserID, currencyID, source); err != nil {
			return err
		}
	} else {
		currencyID, err = ensureCurrencyTx(r.Context(), tx, code, name, symbol, decimals)
		if err != nil {
			return err
		}
		if err := ensureUserCurrencyTx(r.Context(), tx, s.UserID, currencyID, source, name, symbol, decimals); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	currency, err := a.currencyByID(r.Context(), currencyID)
	if err != nil {
		return err
	}
	currency.IsPersonal = true
	currency.Source = source
	httpx.WriteOK(w, map[string]any{"currency": currencyToResponse(currency)}, http.StatusCreated)
	return nil
}

func (a *App) currencyDelete(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
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
	isDefault, err := a.isUserDefaultCurrency(r.Context(), s.UserID, currency.ID)
	if err != nil {
		return err
	}
	if isDefault {
		return httpx.APIError{
			Code:    "CURRENCY_IN_USE",
			Message: "Currency is your primary currency. Change or clear it before removing.",
			Status:  http.StatusConflict,
			Meta: map[string]any{
				"currency": currency.Code,
				"usage":    "defaultCurrency",
			},
		}
	}
	usage, err := a.userVisibleCurrencyUsageCount(r.Context(), s.UserID, currency.ID)
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
	if _, err := a.db.ExecContext(r.Context(), `UPDATE user_currencies
SET is_active = 0
WHERE user_id = ? AND currency_id = ?`, s.UserID, currency.ID); err != nil {
		return err
	}
	currencies, err := a.currenciesForUser(r.Context(), s.UserID, queryInt(r, "workspaceId"), queryInt(r, "budgetId"))
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

func (a *App) currenciesForUser(ctx context.Context, userID, workspaceID, budgetID int64) ([]currencyRecord, error) {
	query := `SELECT c.id, c.code,
COALESCE(NULLIF(uc.display_name, ''), c.name) AS name,
COALESCE(NULLIF(uc.display_symbol, ''), c.symbol) AS symbol,
COALESCE(uc.display_decimal_places, c.decimal_places) AS decimal_places,
c.is_enabled,
CASE WHEN uc.id IS NULL THEN 0 ELSE 1 END AS is_personal,
0 AS is_referenced,
COALESCE(uc.source, '') AS source
	FROM user_currencies uc
	JOIN currencies c ON c.id = uc.currency_id
	WHERE uc.user_id = ? AND uc.is_active = 1 AND c.is_enabled = 1`
	args := []any{userID}
	query += `
	UNION
	` + referencedAccountExchangeRateCurrenciesSQL()
	args = append(args, userID, userID, userID)
	if budgetID > 0 {
		query += `
	UNION
` + referencedBudgetCurrenciesSQL()
		args = append(args, userID)
		for i := 0; i < 11; i++ {
			args = append(args, budgetID)
		}
	}
	if workspaceID > 0 {
		query += `
UNION
` + referencedWorkspaceCurrenciesSQL()
		args = append(args, userID, workspaceID, workspaceID, workspaceID)
	}
	query += `
ORDER BY code`
	rows, err := a.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	currencies := []currencyRecord{}
	for rows.Next() {
		currency, err := scanCurrencyWithScope(rows)
		if err != nil {
			return nil, err
		}
		currencies = append(currencies, currency)
	}
	return currencies, rows.Err()
}

func referencedBudgetCurrenciesSQL() string {
	return `SELECT DISTINCT c.id, c.code, c.name, c.symbol, c.decimal_places, c.is_enabled,
CASE WHEN uc.id IS NULL THEN 0 ELSE 1 END AS is_personal,
1 AS is_referenced,
'referenced' AS source
FROM currencies c
LEFT JOIN user_currencies uc ON uc.currency_id = c.id AND uc.user_id = ? AND uc.is_active = 1
WHERE c.is_enabled = 1
  AND c.id IN (
    SELECT base_currency_id FROM budgets WHERE id = ?
    UNION SELECT display_currency_id FROM budgets WHERE id = ?
    UNION SELECT budget_currency_id FROM budget_items WHERE budget_id = ?
    UNION SELECT estimated_currency_id FROM budget_items WHERE budget_id = ?
    UNION SELECT currency_id FROM budget_transactions WHERE budget_id = ?
    UNION SELECT reference_currency_id FROM budget_transactions WHERE budget_id = ? AND reference_currency_id IS NOT NULL
    UNION SELECT destination_currency_id FROM budget_transactions WHERE budget_id = ? AND destination_currency_id IS NOT NULL
    UNION SELECT currency_id FROM budget_bookkeeping_records WHERE budget_id = ?
    UNION SELECT destination_currency_id FROM budget_bookkeeping_records WHERE budget_id = ? AND destination_currency_id IS NOT NULL
    UNION SELECT from_currency_id FROM budget_exchange_rates WHERE budget_id = ?
    UNION SELECT to_currency_id FROM budget_exchange_rates WHERE budget_id = ?
	  )`
}

func referencedAccountExchangeRateCurrenciesSQL() string {
	return `SELECT DISTINCT c.id, c.code, c.name, c.symbol, c.decimal_places, c.is_enabled,
	CASE WHEN uc.id IS NULL THEN 0 ELSE 1 END AS is_personal,
	1 AS is_referenced,
	'account_rate' AS source
	FROM currencies c
	LEFT JOIN user_currencies uc ON uc.currency_id = c.id AND uc.user_id = ? AND uc.is_active = 1
	WHERE c.is_enabled = 1
	  AND c.id IN (
	    SELECT from_currency_id FROM exchange_rates
	    WHERE user_id = ? AND workspace_id IS NULL AND source = 'manual'
	    UNION SELECT to_currency_id FROM exchange_rates
	    WHERE user_id = ? AND workspace_id IS NULL AND source = 'manual'
	  )`
}

func referencedWorkspaceCurrenciesSQL() string {
	return `SELECT DISTINCT c.id, c.code, c.name, c.symbol, c.decimal_places, c.is_enabled,
	CASE WHEN uc.id IS NULL THEN 0 ELSE 1 END AS is_personal,
1 AS is_referenced,
'referenced' AS source
FROM currencies c
LEFT JOIN user_currencies uc ON uc.currency_id = c.id AND uc.user_id = ? AND uc.is_active = 1
WHERE c.is_enabled = 1
  AND c.id IN (
    SELECT default_currency_id FROM workspaces WHERE id = ? AND default_currency_id IS NOT NULL
    UNION SELECT base_currency_id FROM budgets WHERE workspace_id = ?
    UNION SELECT display_currency_id FROM budgets WHERE workspace_id = ?
  )`
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

func scanCurrencyWithScope(row rowScanner) (currencyRecord, error) {
	var currency currencyRecord
	if err := row.Scan(
		&currency.ID,
		&currency.Code,
		&currency.Name,
		&currency.Symbol,
		&currency.DecimalPlaces,
		&currency.IsEnabled,
		&currency.IsPersonal,
		&currency.IsReferenced,
		&currency.Source,
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
		"isPersonal":    currency.IsPersonal,
		"isReferenced":  currency.IsReferenced,
		"source":        currency.Source,
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

func ensureCurrencyTx(ctx context.Context, tx *sql.Tx, code, name, symbol string, decimals int64) (int64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, "SELECT id FROM currencies WHERE code = ? LIMIT 1", code).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO currencies
(code, name, symbol, decimal_places, is_enabled)
VALUES (?, ?, ?, ?, 1)`, code, name, symbol, decimals)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func currencyByCodeTx(ctx context.Context, tx *sql.Tx, code string) (currencyRecord, error) {
	return scanCurrency(tx.QueryRowContext(ctx, `SELECT id, code, name, symbol, decimal_places, is_enabled
FROM currencies
WHERE code = ? AND is_enabled = 1
LIMIT 1`, code))
}

func ensureUserCurrencyTx(ctx context.Context, tx *sql.Tx, userID, currencyID int64, source, name, symbol string, decimals int64) error {
	var displayDecimals any
	if decimals >= 0 {
		displayDecimals = decimals
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO user_currencies
(user_id, currency_id, source, display_name, display_symbol, display_decimal_places, is_active)
VALUES (?, ?, ?, ?, ?, ?, 1)
ON DUPLICATE KEY UPDATE
  source = VALUES(source),
  display_name = COALESCE(VALUES(display_name), display_name),
  display_symbol = COALESCE(VALUES(display_symbol), display_symbol),
  display_decimal_places = COALESCE(VALUES(display_decimal_places), display_decimal_places),
  is_active = 1`,
		userID, currencyID, source, nullableStringValue(name), nullableStringValue(symbol), displayDecimals,
	)
	return err
}

func ensureUserCurrencyByIDTx(ctx context.Context, tx *sql.Tx, userID, currencyID int64, source string) error {
	currency, err := scanCurrency(tx.QueryRowContext(ctx, `SELECT id, code, name, symbol, decimal_places, is_enabled
FROM currencies
WHERE id = ?
LIMIT 1`, currencyID))
	if err != nil {
		return err
	}
	return ensureUserCurrencyTx(ctx, tx, userID, currency.ID, source, "", "", -1)
}

func (a *App) isUserDefaultCurrency(ctx context.Context, userID, currencyID int64) (bool, error) {
	var exists int
	err := a.db.QueryRowContext(ctx, `SELECT 1
FROM users
WHERE id = ? AND default_currency_id = ?
LIMIT 1`, userID, currencyID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (a *App) currencyUsageCount(ctx context.Context, currencyID int64) (int64, error) {
	return a.currencyUsageCountTx(ctx, a.db, currencyID)
}

func (a *App) userVisibleCurrencyUsageCount(ctx context.Context, userID, currencyID int64) (int64, error) {
	var total int64
	queries := []string{
		`SELECT COUNT(*) FROM users WHERE id = ? AND default_currency_id = ?`,
		`SELECT COUNT(*) FROM workspaces WHERE owner_user_id = ? AND default_currency_id = ?`,
		`SELECT COUNT(*) FROM budgets WHERE (user_id = ? OR owner_user_id = ? OR created_by_user_id = ?) AND (base_currency_id = ? OR display_currency_id = ?)`,
		`SELECT COUNT(*) FROM budget_items bi JOIN budgets b ON b.id = bi.budget_id WHERE (b.user_id = ? OR b.owner_user_id = ? OR b.created_by_user_id = ?) AND (bi.budget_currency_id = ? OR bi.estimated_currency_id = ?)`,
		`SELECT COUNT(*) FROM budget_transactions bt JOIN budgets b ON b.id = bt.budget_id WHERE (b.user_id = ? OR b.owner_user_id = ? OR b.created_by_user_id = ?) AND (bt.currency_id = ? OR bt.reference_currency_id = ? OR bt.destination_currency_id = ?)`,
		`SELECT COUNT(*) FROM budget_bookkeeping_records br JOIN budgets b ON b.id = br.budget_id WHERE (b.user_id = ? OR b.owner_user_id = ? OR b.created_by_user_id = ?) AND (br.currency_id = ? OR br.destination_currency_id = ?)`,
		`SELECT COUNT(*) FROM budget_exchange_rates ber JOIN budgets b ON b.id = ber.budget_id WHERE (b.user_id = ? OR b.owner_user_id = ? OR b.created_by_user_id = ?) AND (ber.from_currency_id = ? OR ber.to_currency_id = ?)`,
	}
	args := [][]any{
		{userID, currencyID},
		{userID, currencyID},
		{userID, userID, userID, currencyID, currencyID},
		{userID, userID, userID, currencyID, currencyID},
		{userID, userID, userID, currencyID, currencyID, currencyID},
		{userID, userID, userID, currencyID, currencyID},
		{userID, userID, userID, currencyID, currencyID},
	}
	for idx, query := range queries {
		var count int64
		if err := a.db.QueryRowContext(ctx, query, args[idx]...).Scan(&count); err != nil {
			return 0, err
		}
		total += count
	}
	return total, nil
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
