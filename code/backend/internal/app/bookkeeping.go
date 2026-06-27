package app

import (
	"context"
	"database/sql"
	"net/http"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) bookkeepingList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	budgetID := queryInt(r, "budgetId")
	if err := a.requireBudgetRead(r, budgetID, s.UserID); err != nil {
		return err
	}
	records, err := a.bookkeepingRecordsForBudget(r.Context(), budgetID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"records": records}, http.StatusOK)
	return nil
}

func (a *App) bookkeepingCreate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	budgetID := int64Value(input["budgetId"])
	if err := a.requireBudgetWrite(r, budgetID, s.UserID); err != nil {
		return err
	}
	record, err := a.bookkeepingRecordValues(r.Context(), input, budgetID, s.UserID)
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(r.Context(), `INSERT INTO budget_bookkeeping_records
(budget_id, transaction_type, record_date, order_reference, details, category_label, source_account_name,
destination_account_name, currency_id, amount_original, rate_to_base, amount_base, destination_currency_id,
destination_amount_original, destination_rate, remark, sort_order)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		budgetID, record.transactionType, record.recordDate, record.orderReference, record.details,
		record.categoryLabel, record.sourceAccountName, record.destinationAccountName, record.currencyID,
		record.amount, record.rate, round4(record.amount*record.rate), record.destinationCurrencyID,
		record.destinationAmount, record.destinationRate, record.remark, record.sortOrder,
	)
	if err != nil {
		return err
	}
	return a.writeBookkeepingList(w, r, budgetID)
}

func (a *App) bookkeepingUpdate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	budgetID, err := a.bookkeepingBudgetIDForRecord(r.Context(), id)
	if err != nil {
		return err
	}
	if err := a.requireBudgetWrite(r, budgetID, s.UserID); err != nil {
		return err
	}
	record, err := a.bookkeepingRecordValues(r.Context(), input, budgetID, s.UserID)
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(r.Context(), `UPDATE budget_bookkeeping_records
SET transaction_type = ?, record_date = ?, order_reference = ?, details = ?, category_label = ?,
source_account_name = ?, destination_account_name = ?, currency_id = ?, amount_original = ?,
rate_to_base = ?, amount_base = ?, destination_currency_id = ?, destination_amount_original = ?,
destination_rate = ?, remark = ?, sort_order = ?
WHERE id = ?`,
		record.transactionType, record.recordDate, record.orderReference, record.details, record.categoryLabel,
		record.sourceAccountName, record.destinationAccountName, record.currencyID, record.amount,
		record.rate, round4(record.amount*record.rate), record.destinationCurrencyID,
		record.destinationAmount, record.destinationRate, record.remark, record.sortOrder, id,
	)
	if err != nil {
		return err
	}
	return a.writeBookkeepingList(w, r, budgetID)
}

func (a *App) bookkeepingDelete(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	budgetID, err := a.bookkeepingBudgetIDForRecord(r.Context(), id)
	if err != nil {
		return err
	}
	if err := a.requireBudgetWrite(r, budgetID, s.UserID); err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM budget_bookkeeping_records WHERE id = ?", id); err != nil {
		return err
	}
	return a.writeBookkeepingList(w, r, budgetID)
}

func (a *App) writeBookkeepingList(w http.ResponseWriter, r *http.Request, budgetID int64) error {
	records, err := a.bookkeepingRecordsForBudget(r.Context(), budgetID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"records": records}, http.StatusOK)
	return nil
}

type bookkeepingRecordValues struct {
	transactionType        string
	recordDate             any
	orderReference         any
	details                string
	categoryLabel          any
	sourceAccountName      any
	destinationAccountName any
	currencyID             int64
	amount                 float64
	rate                   float64
	destinationCurrencyID  any
	destinationAmount      any
	destinationRate        any
	remark                 any
	sortOrder              int64
}

func (a *App) bookkeepingRecordValues(ctx context.Context, input map[string]any, budgetID, userID int64) (bookkeepingRecordValues, error) {
	details, err := requiredLimitedString(input["details"], 500, "Details")
	if err != nil {
		return bookkeepingRecordValues{}, err
	}
	orderReference, err := optionalLimitedString(input["orderReference"], 120, "Order reference")
	if err != nil {
		return bookkeepingRecordValues{}, err
	}
	categoryLabel, err := optionalLimitedString(input["categoryLabel"], 160, "Category label")
	if err != nil {
		return bookkeepingRecordValues{}, err
	}
	sourceAccountName, err := optionalLimitedString(input["sourceAccountName"], 160, "Source account")
	if err != nil {
		return bookkeepingRecordValues{}, err
	}
	destinationAccountName, err := optionalLimitedString(input["destinationAccountName"], 160, "Destination account")
	if err != nil {
		return bookkeepingRecordValues{}, err
	}
	remark, err := optionalLimitedString(input["remark"], 500, "Remark")
	if err != nil {
		return bookkeepingRecordValues{}, err
	}
	amount, amountOK := numericInput(input["amount"])
	if !amountOK || amount < 0 {
		return bookkeepingRecordValues{}, apiError("VALIDATION_ERROR", "Amount is required and cannot be less than 0.", http.StatusUnprocessableEntity)
	}
	currencyID, err := a.requiredCurrencyID(ctx, input["currency"])
	if err != nil {
		return bookkeepingRecordValues{}, err
	}
	basics, err := a.budgetBasics(ctx, budgetID)
	if err != nil {
		return bookkeepingRecordValues{}, err
	}
	rateDate := dateString(firstValue(input, "rateDate", "recordDate", "record_date"))
	explicitRate, hasExplicitRate, rateErr := rateInput(input, []string{"rate"}, "Rate")
	if rateErr == nil && !hasExplicitRate && currencyID != basics.BaseCurrencyID && amount > 0 {
		if targetBaseAmount, ok := optionalNumber(firstValue(input, "targetBaseAmount", "target_base_amount", "amountBase", "amount_base")); ok && targetBaseAmount >= 0 {
			explicitRate = targetBaseAmount / amount
			hasExplicitRate = explicitRate > 0
		}
	}
	rate, err := a.rateToBase(ctx, userID, basics.WorkspaceID, currencyID, basics, rateDate, explicitRate, hasExplicitRate, rateErr)
	if err != nil {
		return bookkeepingRecordValues{}, err
	}
	if shouldSaveBudgetRate(input, []string{"rateScope"}) && hasExplicitRate {
		if currencyID != basics.BaseCurrencyID {
			if _, err := a.saveBudgetExchangeRate(ctx, budgetExchangeRateInput{
				BudgetID:       budgetID,
				UserID:         userID,
				FromCurrencyID: currencyID,
				ToCurrencyID:   basics.BaseCurrencyID,
				Rate:           rate,
				RateDate:       dateStringOrToday(rateDate),
				Note:           "Saved from bookkeeping record.",
			}); err != nil {
				return bookkeepingRecordValues{}, err
			}
		}
	}
	destinationAmount, hasDestinationAmount := numericInput(input["destinationAmount"])
	if hasDestinationAmount && destinationAmount < 0 {
		return bookkeepingRecordValues{}, apiError("VALIDATION_ERROR", "Destination amount cannot be less than 0.", http.StatusUnprocessableEntity)
	}
	var destinationCurrencyID any
	var destinationAmountValue any
	if hasDestinationAmount {
		id, err := a.requiredCurrencyID(ctx, input["destinationCurrency"])
		if err != nil {
			return bookkeepingRecordValues{}, apiError("VALIDATION_ERROR", "Destination currency is required when destination amount is filled.", http.StatusUnprocessableEntity)
		}
		destinationCurrencyID = id
		destinationAmountValue = destinationAmount
	}
	destinationRate := nullableFloat(input["destinationRate"])
	return bookkeepingRecordValues{
		transactionType:        enumString(stringValue(input["transactionType"]), []string{"expense", "income", "sof", "transfer", "fx_exchange", "cross_border_remittance"}, "expense"),
		recordDate:             nullableDate(input["recordDate"]),
		orderReference:         orderReference,
		details:                details,
		categoryLabel:          categoryLabel,
		sourceAccountName:      sourceAccountName,
		destinationAccountName: destinationAccountName,
		currencyID:             currencyID,
		amount:                 amount,
		rate:                   rate,
		destinationCurrencyID:  destinationCurrencyID,
		destinationAmount:      destinationAmountValue,
		destinationRate:        destinationRate,
		remark:                 remark,
		sortOrder:              int64Value(input["sortOrder"]),
	}, nil
}

func (a *App) bookkeepingRecordsForBudget(ctx context.Context, budgetID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT br.id, br.budget_id, br.transaction_type, br.record_date, br.order_reference,
br.details, br.category_label, br.source_account_name, br.destination_account_name, c.code,
br.amount_original, br.rate_to_base, br.amount_base, dc.code, br.destination_amount_original,
br.destination_rate, br.remark, br.sort_order, br.created_at, br.updated_at
FROM budget_bookkeeping_records br
JOIN currencies c ON c.id = br.currency_id
LEFT JOIN currencies dc ON dc.id = br.destination_currency_id
WHERE br.budget_id = ? ORDER BY br.sort_order ASC, br.id ASC`, budgetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []map[string]any{}
	for rows.Next() {
		var id, budget, sort int64
		var txType, details, currency, created, updated string
		var recordDate, orderRef, category, source, destAccount, destCurrency, destAmount, destRate, remark sql.NullString
		var amount, rate, base float64
		if err := rows.Scan(&id, &budget, &txType, &recordDate, &orderRef, &details, &category, &source, &destAccount, &currency, &amount, &rate, &base, &destCurrency, &destAmount, &destRate, &remark, &sort, &created, &updated); err != nil {
			return nil, err
		}
		records = append(records, map[string]any{
			"id":                        id,
			"budgetId":                  budget,
			"transactionType":           txType,
			"recordDate":                nullableString(recordDate),
			"orderReference":            nullableString(orderRef),
			"details":                   details,
			"categoryLabel":             nullableString(category),
			"sourceAccountName":         nullableString(source),
			"destinationAccountName":    nullableString(destAccount),
			"currency":                  currency,
			"amountOriginal":            amount,
			"rateToBase":                rate,
			"amountBase":                base,
			"destinationCurrency":       nullableString(destCurrency),
			"destinationAmountOriginal": parseNullFloat(destAmount),
			"destinationRate":           parseNullFloat(destRate),
			"remark":                    nullableString(remark),
			"sortOrder":                 sort,
			"createdAt":                 created,
			"updatedAt":                 updated,
		})
	}
	return records, rows.Err()
}

func (a *App) bookkeepingBudgetIDForRecord(ctx context.Context, id int64) (int64, error) {
	var budgetID int64
	if err := a.db.QueryRowContext(ctx, "SELECT budget_id FROM budget_bookkeeping_records WHERE id = ? LIMIT 1", id).Scan(&budgetID); err != nil {
		return 0, apiError("BOOKKEEPING_RECORD_NOT_FOUND", "Bookkeeping record was not found.", http.StatusNotFound)
	}
	return budgetID, nil
}

func (a *App) requiredCurrencyID(ctx context.Context, value any) (int64, error) {
	id, err := a.optionalCurrencyID(ctx, value)
	if err != nil || !id.Valid {
		return 0, apiError("VALIDATION_ERROR", "Currency is required.", http.StatusUnprocessableEntity)
	}
	return id.Int64, nil
}

func numericInput(value any) (float64, bool) {
	if value == nil {
		return 0, false
	}
	switch v := value.(type) {
	case string:
		if stringValue(v) == "" {
			return 0, false
		}
		return floatValue(v), true
	default:
		return floatValue(v), true
	}
}
