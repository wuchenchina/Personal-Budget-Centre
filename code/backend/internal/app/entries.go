package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
)

func (a *App) itemCreate(w http.ResponseWriter, r *http.Request) error {
	return a.saveItem(w, r, true)
}

func (a *App) itemUpdate(w http.ResponseWriter, r *http.Request) error {
	return a.saveItem(w, r, false)
}

func (a *App) itemDelete(w http.ResponseWriter, r *http.Request) error {
	return a.deleteEntry(w, r, "budget_items")
}

func (a *App) saveItem(w http.ResponseWriter, r *http.Request, create bool) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	budgetID := int64Value(input["budgetId"])
	if !create {
		budgetID, err = a.budgetIDFor(r.Context(), "budget_items", int64Value(input["id"]))
		if err != nil {
			return err
		}
	}
	if err := a.requireBudgetWrite(r, budgetID, s.UserID); err != nil {
		return err
	}
	basics, err := a.budgetBasics(r.Context(), budgetID)
	if err != nil {
		return err
	}
	payload, err := a.itemPayload(r.Context(), input, budgetID, s.UserID, basics)
	if err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var itemID int64
	if create {
		res, execErr := tx.ExecContext(r.Context(), itemInsertSQL(), budgetID, payload.CategoryID, payload.Label, payload.BudgetCurrencyID, payload.BudgetAmount, payload.BudgetRate, round4(payload.BudgetBase), payload.EstimatedCurrencyID, payload.EstimatedAmount, payload.EstimatedRate, round4(payload.EstimatedBase), round4(payload.BudgetBase-payload.EstimatedBase), payload.InstallmentConfig, payload.PricingConfig, payload.SortOrder)
		err = execErr
		if err == nil {
			itemID, _ = res.LastInsertId()
		}
	} else {
		itemID = int64Value(input["id"])
		_, err = tx.ExecContext(r.Context(), itemUpdateSQL(), payload.CategoryID, payload.Label, payload.BudgetCurrencyID, payload.BudgetAmount, payload.BudgetRate, round4(payload.BudgetBase), payload.EstimatedCurrencyID, payload.EstimatedAmount, payload.EstimatedRate, round4(payload.EstimatedBase), round4(payload.BudgetBase-payload.EstimatedBase), payload.InstallmentConfig, payload.PricingConfig, payload.SortOrder, itemID)
	}
	if err != nil {
		return err
	}
	if hasItemSplitInput(input) {
		if err := a.replaceItemSplitTx(r, tx, budgetID, itemID, rawItemSplit(input)); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return a.writeBudgetDetail(w, r, budgetID, s.UserID)
}

func (a *App) transactionCreate(w http.ResponseWriter, r *http.Request) error {
	return a.saveTransaction(w, r, true)
}

func (a *App) transactionUpdate(w http.ResponseWriter, r *http.Request) error {
	return a.saveTransaction(w, r, false)
}

func (a *App) transactionDelete(w http.ResponseWriter, r *http.Request) error {
	return a.deleteEntry(w, r, "budget_transactions")
}

func (a *App) saveTransaction(w http.ResponseWriter, r *http.Request, create bool) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	budgetID := int64Value(input["budgetId"])
	if !create {
		budgetID, err = a.budgetIDFor(r.Context(), "budget_transactions", int64Value(input["id"]))
		if err != nil {
			return err
		}
	}
	if err := a.requireBudgetWrite(r, budgetID, s.UserID); err != nil {
		return err
	}
	basics, err := a.budgetBasics(r.Context(), budgetID)
	if err != nil {
		return err
	}
	payload, err := a.transactionPayload(r.Context(), input, budgetID, s.UserID, basics)
	if err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var txID int64
	if create {
		res, execErr := tx.ExecContext(r.Context(), txInsertSQL(), budgetID, payload.CategoryID, nullableInt(payload.PaidByParticipantID), nullableText(payload.TransactionDate), payload.Details, payload.CurrencyID, payload.Amount, payload.Rate, round4(payload.Amount*payload.Rate), payload.PricingConfig, nullableInt(payload.ReferenceCurrencyID), nullableFloatValue(payload.ReferenceAmount, payload.ReferenceAmountValid), nullableText(payload.Remark), payload.SortOrder)
		err = execErr
		if err == nil {
			txID, _ = res.LastInsertId()
		}
	} else {
		txID = int64Value(input["id"])
		_, err = tx.ExecContext(r.Context(), txUpdateSQL(), payload.CategoryID, nullableInt(payload.PaidByParticipantID), nullableText(payload.TransactionDate), payload.Details, payload.CurrencyID, payload.Amount, payload.Rate, round4(payload.Amount*payload.Rate), payload.PricingConfig, nullableInt(payload.ReferenceCurrencyID), nullableFloatValue(payload.ReferenceAmount, payload.ReferenceAmountValid), nullableText(payload.Remark), payload.SortOrder, txID)
	}
	if err != nil {
		return err
	}
	if hasTransactionPaymentsInput(input) {
		if err := a.replaceTransactionPaymentsTx(r, tx, budgetID, txID, payload.Amount, payload.Rate, rawTransactionPayments(input)); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return a.writeBudgetDetail(w, r, budgetID, s.UserID)
}

func (a *App) installmentPlanUpdate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	budgetID := int64Value(input["budgetId"])
	if err := a.requireBudgetWrite(r, budgetID, s.UserID); err != nil {
		return err
	}
	_, err = a.db.ExecContext(r.Context(), `INSERT INTO budget_installment_plans (budget_id, scope, period_amounts, period_locked, period_progress, period_remarks)
VALUES (?, 'overall', ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE period_amounts=VALUES(period_amounts), period_locked=VALUES(period_locked), period_progress=VALUES(period_progress), period_remarks=VALUES(period_remarks), updated_at=CURRENT_TIMESTAMP`,
		budgetID, jsonString(input["periodAmounts"]), jsonString(input["periodLocked"]), jsonString(input["periodProgress"]), jsonString(input["periodRemarks"]))
	if err != nil {
		return err
	}
	return a.writeBudgetDetail(w, r, budgetID, s.UserID)
}

func (a *App) deleteEntry(w http.ResponseWriter, r *http.Request, table string) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	budgetID, err := a.budgetIDFor(r.Context(), table, id)
	if err != nil {
		return err
	}
	if err := a.requireBudgetWrite(r, budgetID, s.UserID); err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM "+table+" WHERE id = ?", id); err != nil {
		return err
	}
	return a.writeBudgetDetail(w, r, budgetID, s.UserID)
}

func (a *App) budgetIDFor(ctx context.Context, table string, id int64) (int64, error) {
	var budgetID int64
	err := a.db.QueryRowContext(ctx, "SELECT budget_id FROM "+table+" WHERE id = ?", id).Scan(&budgetID)
	if err != nil {
		if table == "budget_items" {
			return 0, apiError("BUDGET_ITEM_NOT_FOUND", "Budget item was not found.", http.StatusNotFound)
		}
		if table == "budget_transactions" {
			return 0, apiError("TRANSACTION_NOT_FOUND", "Transaction was not found.", http.StatusNotFound)
		}
		return 0, apiError("NOT_FOUND", "Budget entry was not found.", http.StatusNotFound)
	}
	return budgetID, nil
}

type budgetBasics struct {
	ID                    int64
	WorkspaceID           int64
	BaseCurrency          string
	BaseCurrencyID        int64
	InstallmentPeriodUnit string
	PricingEnabled        bool
}

func (a *App) budgetBasics(ctx context.Context, budgetID int64) (budgetBasics, error) {
	var b budgetBasics
	err := a.db.QueryRowContext(ctx, `SELECT b.id, b.workspace_id, b.base_currency_id, c.code, b.installment_period_unit, b.pricing_enabled
FROM budgets b JOIN currencies c ON c.id = b.base_currency_id WHERE b.id = ?`, budgetID).Scan(&b.ID, &b.WorkspaceID, &b.BaseCurrencyID, &b.BaseCurrency, &b.InstallmentPeriodUnit, &b.PricingEnabled)
	if errors.Is(err, sql.ErrNoRows) {
		return budgetBasics{}, apiError("BUDGET_NOT_FOUND", "Budget was not found.", http.StatusNotFound)
	}
	return b, err
}

type budgetItemPayload struct {
	CategoryID          int64
	Label               string
	BudgetCurrencyID    int64
	BudgetAmount        float64
	BudgetRate          float64
	BudgetBase          float64
	EstimatedCurrencyID int64
	EstimatedAmount     float64
	EstimatedRate       float64
	EstimatedBase       float64
	InstallmentConfig   any
	PricingConfig       any
	SortOrder           int64
}

type budgetTransactionPayload struct {
	CategoryID           int64
	PaidByParticipantID  sql.NullInt64
	TransactionDate      string
	Details              string
	CurrencyID           int64
	Amount               float64
	Rate                 float64
	PricingConfig        any
	ReferenceCurrencyID  sql.NullInt64
	ReferenceAmount      float64
	ReferenceAmountValid bool
	Remark               string
	SortOrder            int64
}

type pricingInputConfig struct {
	Enabled     bool
	UnitPrice   *float64
	Quantity    *float64
	TotalAmount *float64
}

func (a *App) itemPayload(ctx context.Context, input map[string]any, budgetID, userID int64, basics budgetBasics) (budgetItemPayload, error) {
	label, err := requiredLimitedString(input["label"], 160, "Category name")
	if err != nil {
		return budgetItemPayload{}, err
	}
	budgetAmount, hasBudgetAmount := optionalNumber(firstValue(input, "budgetAmount", "budget_amount"))
	specifiedAmount, hasSpecifiedAmount := optionalNumber(firstValue(input, "currencyAmount", "currency_amount"))
	bankFee, hasBankFee := optionalNumber(firstValue(input, "bankFee", "bank_fee"))
	if !hasBankFee {
		bankFee = 0
	}
	bankFeeMultiplier := 1 + bankFee/100
	usesUnifiedCurrencyPayload := hasAnyKey(input, "currency", "currency_amount", "currencyAmount")
	pricingConfig, pricingJSON, err := pricingConfigFromInput(input)
	if err != nil {
		return budgetItemPayload{}, err
	}
	if pricingConfig.Enabled && pricingConfig.TotalAmount != nil {
		budgetAmount = *pricingConfig.TotalAmount
		hasBudgetAmount = true
	}
	currencyInput := firstValue(input, "currency", "budgetCurrency", "budget_currency")
	budgetCurrencyID, err := a.requiredCurrencyID(ctx, currencyInput)
	if err != nil {
		return budgetItemPayload{}, err
	}
	estimatedCurrencyID, err := a.requiredCurrencyID(ctx, firstValue(input, "currency", "estimatedCurrency", "estimated_currency", "budgetCurrency", "budget_currency"))
	if err != nil {
		return budgetItemPayload{}, err
	}
	categoryID, err := a.budgetItemCategoryID(ctx, basics.WorkspaceID, userID, input, label)
	if err != nil {
		return budgetItemPayload{}, err
	}
	transactionTotalBase, err := a.transactionTotalBaseForCategory(ctx, budgetID, categoryID)
	if err != nil {
		return budgetItemPayload{}, err
	}
	rateDate := dateString(firstValue(input, "rateDate", "rate_date"))
	explicitBudgetRate, hasExplicitBudgetRate, budgetRateErr := rateInput(input, []string{"rate", "budgetRate", "budget_rate"}, "Budget rate")
	budgetRate, err := a.rateToBase(ctx, userID, basics.WorkspaceID, budgetCurrencyID, basics, rateDate, explicitBudgetRate, hasExplicitBudgetRate, budgetRateErr)
	if err != nil {
		return budgetItemPayload{}, err
	}
	if shouldSaveBudgetRate(input, []string{"budgetRateScope", "rateScope"}) && hasExplicitBudgetRate && budgetCurrencyID != basics.BaseCurrencyID {
		if _, err := a.saveBudgetExchangeRate(ctx, budgetExchangeRateInput{
			BudgetID:       budgetID,
			UserID:         userID,
			FromCurrencyID: budgetCurrencyID,
			ToCurrencyID:   basics.BaseCurrencyID,
			Rate:           budgetRate,
			RateDate:       dateStringOrToday(rateDate),
			Note:           "Saved from budget item.",
		}); err != nil {
			return budgetItemPayload{}, err
		}
	}
	explicitEstimatedRate, hasExplicitEstimatedRate, estimatedRateErr := rateInput(input, []string{"rate", "estimatedRate", "estimated_rate"}, "Estimated rate")
	estimatedRate, err := a.rateToBase(ctx, userID, basics.WorkspaceID, estimatedCurrencyID, basics, rateDate, explicitEstimatedRate, hasExplicitEstimatedRate, estimatedRateErr)
	if err != nil {
		return budgetItemPayload{}, err
	}
	var budgetBase, estimatedBase, estimatedAmount float64
	if hasSpecifiedAmount {
		budgetAmount = specifiedAmount
		budgetBase = budgetAmount * budgetRate * bankFeeMultiplier
		estimatedBase = transactionTotalBase
		estimatedAmount = originalAmountFromBase(estimatedBase, estimatedRate)
	} else if usesUnifiedCurrencyPayload && hasBudgetAmount {
		budgetBase = budgetAmount
		budgetAmount = originalAmountFromBase(budgetBase, budgetRate)
		estimatedBase = transactionTotalBase
		estimatedAmount = originalAmountFromBase(estimatedBase, estimatedRate)
	} else if !hasBudgetAmount {
		budgetAmount = 0
		budgetBase = 0
		estimatedBase = transactionTotalBase
		estimatedAmount = originalAmountFromBase(estimatedBase, estimatedRate)
	} else {
		budgetBase = budgetAmount * budgetRate
		estimatedBase = transactionTotalBase
		estimatedAmount = originalAmountFromBase(estimatedBase, estimatedRate)
	}
	installmentJSON, err := installmentConfigJSONFromInput(input, basics.InstallmentPeriodUnit)
	if err != nil {
		return budgetItemPayload{}, err
	}
	return budgetItemPayload{
		CategoryID:          categoryID,
		Label:               label,
		BudgetCurrencyID:    budgetCurrencyID,
		BudgetAmount:        budgetAmount,
		BudgetRate:          budgetRate,
		BudgetBase:          budgetBase,
		EstimatedCurrencyID: estimatedCurrencyID,
		EstimatedAmount:     estimatedAmount,
		EstimatedRate:       estimatedRate,
		EstimatedBase:       estimatedBase,
		InstallmentConfig:   installmentJSON,
		PricingConfig:       pricingJSON,
		SortOrder:           positiveSort(firstValue(input, "sortOrder", "sort_order")),
	}, nil
}

func (a *App) transactionPayload(ctx context.Context, input map[string]any, budgetID, userID int64, basics budgetBasics) (budgetTransactionPayload, error) {
	details, err := requiredLimitedString(input["details"], 500, "Transaction details")
	if err != nil {
		return budgetTransactionPayload{}, err
	}
	amount, hasAmount := optionalNumber(input["amount"])
	pricingConfig := pricingInputConfig{}
	var pricingJSON any
	if basics.PricingEnabled {
		var err error
		pricingConfig, pricingJSON, err = pricingConfigFromInput(input)
		if err != nil {
			return budgetTransactionPayload{}, err
		}
	}
	if pricingConfig.Enabled && pricingConfig.TotalAmount != nil {
		amount = *pricingConfig.TotalAmount
		hasAmount = true
	}
	if !hasAmount {
		return budgetTransactionPayload{}, apiError("VALIDATION_ERROR", "Transaction amount is required.", http.StatusUnprocessableEntity)
	}
	referenceAmount, hasReferenceAmount := optionalNumber(firstValue(input, "referenceAmount", "reference_amount"))
	if hasReferenceAmount && referenceAmount < 0 {
		return budgetTransactionPayload{}, apiError("VALIDATION_ERROR", "Reference amount cannot be less than 0.", http.StatusUnprocessableEntity)
	}
	paidByParticipantID := nullInt64FromValue(firstValue(input, "paidByParticipantId", "paid_by_participant_id"))
	participantIDs, err := a.participantIDSetCtx(ctx, budgetID)
	if err != nil {
		return budgetTransactionPayload{}, err
	}
	if paidByParticipantID.Valid && !participantIDs[paidByParticipantID.Int64] {
		return budgetTransactionPayload{}, apiError("VALIDATION_ERROR", "Paid-by participant does not belong to this budget.", http.StatusUnprocessableEntity)
	}
	currencyID, err := a.requiredCurrencyID(ctx, input["currency"])
	if err != nil {
		return budgetTransactionPayload{}, err
	}
	referenceCurrencyInput := firstValue(input, "referenceCurrency", "reference_currency")
	referenceCurrencyID := sql.NullInt64{}
	if hasReferenceAmount {
		if stringValue(referenceCurrencyInput) == "" {
			return budgetTransactionPayload{}, apiError("VALIDATION_ERROR", "Reference currency is required when reference amount is filled.", http.StatusUnprocessableEntity)
		}
		id, err := a.requiredCurrencyID(ctx, referenceCurrencyInput)
		if err != nil {
			return budgetTransactionPayload{}, err
		}
		referenceCurrencyID = sql.NullInt64{Int64: id, Valid: true}
	}
	transactionDate := dateString(firstValue(input, "transactionDate", "transaction_date"))
	rateDate := dateString(firstValue(input, "rateDate", "rate_date"))
	if rateDate == "" {
		rateDate = transactionDate
	}
	explicitRate, hasExplicitRate, rateErr := rateInput(input, []string{"rate"}, "Transaction rate")
	rate, err := a.rateToBase(ctx, userID, basics.WorkspaceID, currencyID, basics, rateDate, explicitRate, hasExplicitRate, rateErr)
	if err != nil {
		return budgetTransactionPayload{}, err
	}
	if shouldSaveBudgetRate(input, []string{"rateScope"}) && hasExplicitRate && currencyID != basics.BaseCurrencyID {
		if _, err := a.saveBudgetExchangeRate(ctx, budgetExchangeRateInput{
			BudgetID:       budgetID,
			UserID:         userID,
			FromCurrencyID: currencyID,
			ToCurrencyID:   basics.BaseCurrencyID,
			Rate:           rate,
			RateDate:       dateStringOrToday(rateDate),
			Note:           "Saved from transaction.",
		}); err != nil {
			return budgetTransactionPayload{}, err
		}
	}
	categoryID, err := a.transactionCategoryID(ctx, budgetID, basics.WorkspaceID, input)
	if err != nil {
		return budgetTransactionPayload{}, err
	}
	return budgetTransactionPayload{
		CategoryID:           categoryID,
		PaidByParticipantID:  paidByParticipantID,
		TransactionDate:      transactionDate,
		Details:              details,
		CurrencyID:           currencyID,
		Amount:               amount,
		Rate:                 rate,
		PricingConfig:        pricingJSON,
		ReferenceCurrencyID:  referenceCurrencyID,
		ReferenceAmount:      referenceAmount,
		ReferenceAmountValid: hasReferenceAmount,
		Remark:               stringValue(input["remark"]),
		SortOrder:            positiveSort(firstValue(input, "sortOrder", "sort_order")),
	}, nil
}

func shouldSaveBudgetRate(input map[string]any, keys []string) bool {
	for _, key := range keys {
		if stringValue(input[key]) == "budget_default" {
			return true
		}
	}
	return false
}

func dateStringOrToday(value string) string {
	if value == "" {
		return todayDate()
	}
	return value
}

func (a *App) budgetItemCategoryID(ctx context.Context, workspaceID, userID int64, input map[string]any, label string) (int64, error) {
	categoryID := int64Value(firstValue(input, "categoryId", "category_id"))
	if categoryID > 0 {
		var categoryWorkspaceID int64
		err := a.db.QueryRowContext(ctx, "SELECT workspace_id FROM budget_categories WHERE id = ? LIMIT 1", categoryID).Scan(&categoryWorkspaceID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return 0, err
		}
		if err == nil && categoryWorkspaceID == workspaceID {
			return categoryID, nil
		}
	}
	existingID, err := a.categoryIDByName(ctx, workspaceID, label)
	if err != nil {
		return 0, err
	}
	if existingID.Valid {
		return existingID.Int64, nil
	}
	res, err := a.db.ExecContext(ctx, `INSERT INTO budget_categories
(workspace_id, user_id, name, default_currency_id, sort_order, is_preset, is_active)
VALUES (?, ?, ?, NULL, 0, 0, 1)`, workspaceID, userID, label)
	if err != nil {
		existingID, lookupErr := a.categoryIDByName(ctx, workspaceID, label)
		if lookupErr == nil && existingID.Valid {
			return existingID.Int64, nil
		}
		return 0, err
	}
	id, _ := res.LastInsertId()
	return id, nil
}

func (a *App) transactionCategoryID(ctx context.Context, budgetID, workspaceID int64, input map[string]any) (int64, error) {
	categoryID := int64Value(firstValue(input, "categoryId", "category_id"))
	if categoryID <= 0 {
		return 0, apiError("VALIDATION_ERROR", "Transaction category must be selected from Budget Highlights.", http.StatusUnprocessableEntity)
	}
	categoryWorkspaceID, err := a.categoryWorkspaceID(ctx, categoryID)
	if err != nil {
		return 0, err
	}
	if categoryWorkspaceID != workspaceID {
		return 0, apiError("CATEGORY_NOT_FOUND", "Category was not found.", http.StatusNotFound)
	}
	var exists int
	err = a.db.QueryRowContext(ctx, "SELECT 1 FROM budget_items WHERE budget_id = ? AND category_id = ? LIMIT 1", budgetID, categoryID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, apiError("VALIDATION_ERROR", "Transaction category must exist in Budget Highlights.", http.StatusUnprocessableEntity)
	}
	if err != nil {
		return 0, err
	}
	return categoryID, nil
}

func (a *App) transactionTotalBaseForCategory(ctx context.Context, budgetID, categoryID int64) (float64, error) {
	var total float64
	err := a.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(amount_base), 0) FROM budget_transactions WHERE budget_id = ? AND category_id = ?", budgetID, categoryID).Scan(&total)
	return total, err
}

func (a *App) participantIDSetCtx(ctx context.Context, budgetID int64) (map[int64]bool, error) {
	rows, err := a.db.QueryContext(ctx, "SELECT id FROM budget_participants WHERE budget_id = ?", budgetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]bool{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

func (a *App) rateToBase(ctx context.Context, userID, workspaceID, currencyID int64, basics budgetBasics, rateDate string, explicitRate float64, hasExplicitRate bool, rateErr error) (float64, error) {
	if rateErr != nil {
		return 0, rateErr
	}
	if currencyID == basics.BaseCurrencyID {
		return 1, nil
	}
	if hasExplicitRate {
		return explicitRate, nil
	}
	conversion, err := a.resolveExchangeRateForBudget(ctx, basics.ID, userID, workspaceID, currencyID, basics.BaseCurrencyID, rateDate)
	if err != nil {
		return 0, err
	}
	return conversion.Rate, nil
}

func rateInput(input map[string]any, keys []string, label string) (float64, bool, error) {
	for _, key := range keys {
		value, ok := input[key]
		if !ok || value == nil || stringValue(value) == "" {
			continue
		}
		rate, ok := optionalNumber(value)
		if !ok || rate <= 0 {
			return 0, false, apiError("VALIDATION_ERROR", label+" must be greater than 0.", http.StatusUnprocessableEntity)
		}
		return rate, true, nil
	}
	return 0, false, nil
}

func optionalNumber(value any) (float64, bool) {
	if value == nil {
		return 0, false
	}
	switch v := value.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case json.Number:
		out, err := v.Float64()
		return out, err == nil
	case string:
		text := strings.TrimSpace(v)
		if text == "" {
			return 0, false
		}
		out, err := strconv.ParseFloat(text, 64)
		return out, err == nil
	default:
		return 0, false
	}
}

func originalAmountFromBase(amountBase, rateToBase float64) float64 {
	if rateToBase <= 0 {
		return 0
	}
	return amountBase / rateToBase
}

func pricingConfigFromInput(input map[string]any) (pricingInputConfig, any, error) {
	raw, ok := firstPresentValue(input, "pricingConfig", "pricing_config")
	if !ok || raw == nil {
		return pricingInputConfig{}, nil, nil
	}
	config, err := objectFromJSONInput(raw, "Pricing settings")
	if err != nil {
		return pricingInputConfig{}, nil, err
	}
	if !boolDefault(config["enabled"], false) {
		return pricingInputConfig{}, nil, nil
	}
	unitPrice, hasUnitPrice := optionalNumber(firstValue(config, "unitPrice", "unit_price"))
	quantity, hasQuantity := optionalNumber(config["quantity"])
	if hasUnitPrice && unitPrice < 0 {
		return pricingInputConfig{}, nil, apiError("VALIDATION_ERROR", "Unit price cannot be less than 0.", http.StatusUnprocessableEntity)
	}
	if hasQuantity && quantity < 0 {
		return pricingInputConfig{}, nil, apiError("VALIDATION_ERROR", "Quantity cannot be less than 0.", http.StatusUnprocessableEntity)
	}
	out := pricingInputConfig{Enabled: true}
	if hasUnitPrice {
		out.UnitPrice = &unitPrice
	}
	if hasQuantity {
		out.Quantity = &quantity
	}
	if hasUnitPrice && hasQuantity {
		total := round2(unitPrice * quantity)
		out.TotalAmount = &total
	}
	rawJSON, err := json.Marshal(map[string]any{
		"enabled":     true,
		"unitPrice":   floatPtrValue(out.UnitPrice),
		"quantity":    floatPtrValue(out.Quantity),
		"totalAmount": floatPtrValue(out.TotalAmount),
	})
	if err != nil {
		return pricingInputConfig{}, nil, apiError("VALIDATION_ERROR", "Pricing settings could not be encoded.", http.StatusUnprocessableEntity)
	}
	return out, string(rawJSON), nil
}

func installmentConfigJSONFromInput(input map[string]any, fallbackPeriodUnit string) (any, error) {
	raw, ok := firstPresentValue(input, "installmentConfig", "installment_config")
	if !ok || raw == nil {
		return nil, nil
	}
	config, err := objectFromJSONInput(raw, "Installment settings")
	if err != nil {
		return nil, err
	}
	normalized, err := installmentConfigFromMap(config, fallbackPeriodUnit)
	if err != nil {
		return nil, err
	}
	rawJSON, err := json.Marshal(normalized)
	if err != nil {
		return nil, apiError("VALIDATION_ERROR", "Installment settings could not be encoded.", http.StatusUnprocessableEntity)
	}
	return string(rawJSON), nil
}

func installmentConfigFromMap(input map[string]any, fallbackPeriodUnit string) (map[string]any, error) {
	disabled := map[string]any{
		"enabled":        false,
		"months":         nil,
		"paidMonths":     0,
		"monthlyAmount":  nil,
		"totalAmount":    nil,
		"periodAmounts":  []float64{},
		"periodLocked":   []bool{},
		"periodProgress": []bool{},
		"periodRemarks":  []string{},
		"versions":       []map[string]any{},
		"startMonth":     nil,
		"periodUnit":     "month",
		"remark":         nil,
	}
	if !boolDefault(input["enabled"], false) {
		return disabled, nil
	}
	months, hasMonths := positiveIntValue(firstValue(input, "months", "totalMonths", "total_months"))
	if !hasMonths || months > 600 {
		return nil, apiError("VALIDATION_ERROR", "Installment months must be between 1 and 600.", http.StatusUnprocessableEntity)
	}
	paidMonths, hasPaidMonths := nonNegativeIntValue(firstValue(input, "paidMonths", "paid_months"))
	if !hasPaidMonths {
		paidMonths = 0
	}
	totalAmount, hasTotalAmount := optionalNumber(firstValue(input, "totalAmount", "total_amount"))
	monthlyAmount, hasMonthlyAmount := optionalNumber(firstValue(input, "monthlyAmount", "monthly_amount"))
	periodAmounts, err := periodAmountsFromInput(firstValue(input, "periodAmounts", "period_amounts"))
	if err != nil {
		return nil, err
	}
	periodLocked := periodBoolsFromInput(firstValue(input, "periodLocked", "period_locked"))
	periodProgress := periodBoolsFromInput(firstValue(input, "periodProgress", "period_progress"))
	periodRemarks, err := periodRemarksFromInput(firstValue(input, "periodRemarks", "period_remarks"))
	if err != nil {
		return nil, err
	}
	periodUnit := installmentPeriodUnit(fallbackPeriodUnit)
	periodCount := installmentPeriodCountFromMonths(months, periodUnit)
	if len(periodAmounts) > periodCount {
		return nil, apiError("VALIDATION_ERROR", "Installment period amounts cannot exceed the saving period count.", http.StatusUnprocessableEntity)
	}
	if len(periodLocked) > periodCount {
		return nil, apiError("VALIDATION_ERROR", "Installment locked periods cannot exceed the saving period count.", http.StatusUnprocessableEntity)
	}
	if len(periodProgress) > periodCount {
		return nil, apiError("VALIDATION_ERROR", "Installment progress cannot exceed the saving period count.", http.StatusUnprocessableEntity)
	}
	if len(periodRemarks) > periodCount {
		return nil, apiError("VALIDATION_ERROR", "Installment remarks cannot exceed the saving period count.", http.StatusUnprocessableEntity)
	}
	if len(periodAmounts) > 0 {
		periodTotal := 0.0
		for _, amount := range periodAmounts {
			periodTotal += amount
		}
		if !hasTotalAmount || totalAmount <= 0 {
			totalAmount = periodTotal
			hasTotalAmount = true
		}
		if !hasMonthlyAmount {
			monthlyAmount = periodTotal / float64(len(periodAmounts))
			hasMonthlyAmount = true
		}
	}
	if !hasMonthlyAmount && hasTotalAmount {
		monthlyAmount = totalAmount / float64(months)
		hasMonthlyAmount = true
	}
	if !hasTotalAmount && hasMonthlyAmount {
		totalAmount = monthlyAmount * float64(months)
		hasTotalAmount = true
	}
	if paidMonths > months {
		return nil, apiError("VALIDATION_ERROR", "Saved months cannot exceed total saving months.", http.StatusUnprocessableEntity)
	}
	if !hasMonthlyAmount || monthlyAmount <= 0 {
		return nil, apiError("VALIDATION_ERROR", "Monthly saving amount must be greater than 0.", http.StatusUnprocessableEntity)
	}
	if hasTotalAmount && totalAmount < 0 {
		return nil, apiError("VALIDATION_ERROR", "Saving target amount cannot be less than 0.", http.StatusUnprocessableEntity)
	}
	startMonth, err := monthFromInput(firstValue(input, "startMonth", "start_month"))
	if err != nil {
		return nil, err
	}
	remark := stringValue(input["remark"])
	if len(remark) > 500 {
		return nil, apiError("VALIDATION_ERROR", "Saving plan remark must be 500 characters or less.", http.StatusUnprocessableEntity)
	}
	versions, err := installmentVersionsFromInput(input["versions"])
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"enabled":        true,
		"months":         months,
		"paidMonths":     paidMonths,
		"monthlyAmount":  monthlyAmount,
		"totalAmount":    totalAmount,
		"periodAmounts":  periodAmounts,
		"periodLocked":   periodLocked,
		"periodProgress": periodProgress,
		"periodRemarks":  periodRemarks,
		"versions":       versions,
		"startMonth":     nullableText(startMonth),
		"periodUnit":     periodUnit,
		"remark":         nullableText(remark),
	}, nil
}

func firstPresentValue(input map[string]any, keys ...string) (any, bool) {
	for _, key := range keys {
		value, ok := input[key]
		if ok {
			return value, true
		}
	}
	return nil, false
}

func objectFromJSONInput(raw any, label string) (map[string]any, error) {
	if text, ok := raw.(string); ok {
		trimmed := strings.TrimSpace(text)
		if trimmed == "" {
			return map[string]any{}, nil
		}
		var decoded map[string]any
		if err := json.Unmarshal([]byte(trimmed), &decoded); err != nil {
			return nil, apiError("VALIDATION_ERROR", label+" must be valid JSON.", http.StatusUnprocessableEntity)
		}
		return decoded, nil
	}
	if input, ok := raw.(map[string]any); ok {
		return input, nil
	}
	return nil, apiError("VALIDATION_ERROR", label+" must be an object.", http.StatusUnprocessableEntity)
}

func floatPtrValue(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}

func positiveSort(value any) int64 {
	sort := int64Value(value)
	if sort < 0 {
		return 0
	}
	return sort
}

func positiveIntValue(value any) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, v > 0
	case int64:
		if v <= 0 || v > int64(math.MaxInt) {
			return 0, false
		}
		return int(v), true
	case float64:
		if v <= 0 || math.Trunc(v) != v {
			return 0, false
		}
		return int(v), true
	case json.Number:
		out, err := v.Int64()
		if err != nil || out <= 0 || out > int64(math.MaxInt) {
			return 0, false
		}
		return int(out), true
	case string:
		text := strings.TrimSpace(v)
		if text == "" {
			return 0, false
		}
		out, err := strconv.ParseInt(text, 10, 64)
		if err != nil || out <= 0 || out > int64(math.MaxInt) {
			return 0, false
		}
		return int(out), true
	default:
		return 0, false
	}
}

func nonNegativeIntValue(value any) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, v >= 0
	case int64:
		if v < 0 || v > int64(math.MaxInt) {
			return 0, false
		}
		return int(v), true
	case float64:
		if v < 0 || math.Trunc(v) != v {
			return 0, false
		}
		return int(v), true
	case json.Number:
		out, err := v.Int64()
		if err != nil || out < 0 || out > int64(math.MaxInt) {
			return 0, false
		}
		return int(out), true
	case string:
		text := strings.TrimSpace(v)
		if text == "" {
			return 0, false
		}
		out, err := strconv.ParseInt(text, 10, 64)
		if err != nil || out < 0 || out > int64(math.MaxInt) {
			return 0, false
		}
		return int(out), true
	default:
		return 0, false
	}
}

func periodAmountsFromInput(value any) ([]float64, error) {
	items, ok := value.([]any)
	if !ok {
		return []float64{}, nil
	}
	amounts := make([]float64, 0, len(items))
	for _, item := range items {
		amount, ok := optionalNumber(item)
		if !ok || amount < 0 {
			return nil, apiError("VALIDATION_ERROR", "Installment period amounts must be zero or greater.", http.StatusUnprocessableEntity)
		}
		amounts = append(amounts, amount)
	}
	return amounts, nil
}

func periodBoolsFromInput(value any) []bool {
	items, ok := value.([]any)
	if !ok {
		return []bool{}
	}
	out := make([]bool, 0, len(items))
	for _, item := range items {
		out = append(out, item == true)
	}
	return out
}

func periodRemarksFromInput(value any) ([]string, error) {
	items, ok := value.([]any)
	if !ok {
		return []string{}, nil
	}
	remarks := make([]string, 0, len(items))
	for _, item := range items {
		remark := stringValue(item)
		if len(remark) > 500 {
			return nil, apiError("VALIDATION_ERROR", "Installment period remarks must be 500 characters or less.", http.StatusUnprocessableEntity)
		}
		remarks = append(remarks, remark)
	}
	return remarks, nil
}

func installmentPeriodUnit(value string) string {
	if value == "day" || value == "week" || value == "month" || value == "year" {
		return value
	}
	return "month"
}

func installmentPeriodCountFromMonths(months int, periodUnit string) int {
	value := float64(months)
	switch periodUnit {
	case "day":
		value = value * (365.0 / 12.0)
	case "week":
		value = value * (52.0 / 12.0)
	case "year":
		value = value / 12.0
	}
	count := int(math.Ceil(value))
	if count < 1 {
		return 1
	}
	return count
}

func monthFromInput(value any) (string, error) {
	text := stringValue(value)
	if text == "" {
		return "", nil
	}
	if len(text) != 7 || text[4] != '-' {
		return "", apiError("VALIDATION_ERROR", "Installment start month must use YYYY-MM.", http.StatusUnprocessableEntity)
	}
	date := dateString(text + "-01")
	if date == "" {
		return "", apiError("VALIDATION_ERROR", "Installment start month must be a valid month.", http.StatusUnprocessableEntity)
	}
	return date[:7], nil
}

func installmentVersionsFromInput(value any) ([]map[string]any, error) {
	items, ok := value.([]any)
	if !ok {
		return []map[string]any{}, nil
	}
	limit := len(items)
	if limit > 25 {
		limit = 25
	}
	versions := make([]map[string]any, 0, limit)
	for _, item := range items[:limit] {
		input, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id := stringValue(input["id"])
		createdAt := stringValue(input["createdAt"])
		if id == "" || createdAt == "" {
			continue
		}
		label := stringValue(input["label"])
		if len(label) > 120 {
			label = label[:120]
		}
		amounts, err := periodAmountsFromInput(input["periodAmounts"])
		if err != nil {
			return nil, err
		}
		remarks, err := periodRemarksFromInput(input["periodRemarks"])
		if err != nil {
			return nil, err
		}
		totalAmount, hasTotal := optionalNumber(input["totalAmount"])
		versions = append(versions, map[string]any{
			"id":             id,
			"createdAt":      dateTimeValue(createdAt),
			"label":          label,
			"periodAmounts":  amounts,
			"periodProgress": periodBoolsFromInput(input["periodProgress"]),
			"periodRemarks":  remarks,
			"totalAmount":    nullableFloatValue(totalAmount, hasTotal),
		})
	}
	return versions, nil
}

type entryExec interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func (a *App) replaceItemSplit(r *http.Request, budgetID, itemID int64, raw any) error {
	return a.replaceItemSplitExec(r, a.db, budgetID, itemID, raw)
}

func (a *App) replaceItemSplitTx(r *http.Request, tx *sql.Tx, budgetID, itemID int64, raw any) error {
	return a.replaceItemSplitExec(r, tx, budgetID, itemID, raw)
}

func (a *App) replaceItemSplitExec(r *http.Request, exec entryExec, budgetID, itemID int64, raw any) error {
	if _, err := exec.ExecContext(r.Context(), "DELETE FROM budget_item_splits WHERE budget_item_id = ?", itemID); err != nil {
		return err
	}
	if raw == nil {
		return nil
	}
	input, ok := raw.(map[string]any)
	if !ok {
		return apiError("VALIDATION_ERROR", "Budget item split must be an object.", http.StatusUnprocessableEntity)
	}
	participantIDs, err := a.participantIDSet(r, budgetID)
	if err != nil {
		return err
	}
	if len(participantIDs) == 0 {
		return nil
	}
	paidBy := nullInt64FromValue(input["paidByParticipantId"])
	if !paidBy.Valid {
		paidBy = nullInt64FromValue(input["paid_by_participant_id"])
	}
	if paidBy.Valid && !participantIDs[paidBy.Int64] {
		return apiError("VALIDATION_ERROR", "Paid-by participant does not belong to this budget.", http.StatusUnprocessableEntity)
	}
	splitType := enumString(stringDefault(stringValue(input["splitType"]), stringValue(input["split_type"])), []string{"equal", "personal", "individual", "per_person", "custom_amount", "custom_share", "excluded"}, "equal")
	participants, err := splitParticipantsFromInput(input["participants"], participantIDs)
	if err != nil {
		return err
	}
	if splitType == "personal" {
		if !paidBy.Valid {
			return apiError("VALIDATION_ERROR", "Personal split requires a paid-by participant.", http.StatusUnprocessableEntity)
		}
		if len(participants) == 0 {
			participants = []splitParticipant{{ParticipantID: paidBy.Int64, Included: true}}
		}
	}
	if splitType == "individual" || splitType == "per_person" {
		paidBy = sql.NullInt64{}
		filtered := []splitParticipant{}
		for _, participant := range participants {
			if participant.Included {
				filtered = append(filtered, participant)
			}
		}
		participants = filtered
	}
	if splitType != "excluded" && len(participants) == 0 {
		return apiError("VALIDATION_ERROR", "Split must include at least one participant.", http.StatusUnprocessableEntity)
	}
	res, err := exec.ExecContext(r.Context(), "INSERT INTO budget_item_splits (budget_item_id, paid_by_participant_id, split_type, note) VALUES (?, ?, ?, ?)", itemID, nullableInt(paidBy), splitType, nullableStringValue(input["note"]))
	if err != nil {
		return err
	}
	splitID, _ := res.LastInsertId()
	for _, participant := range participants {
		if _, err := exec.ExecContext(r.Context(), "INSERT INTO budget_item_split_participants (split_id, participant_id, is_included, share_ratio, share_amount_base) VALUES (?, ?, ?, ?, ?)", splitID, participant.ParticipantID, boolInt(participant.Included), participant.ShareRatio, participant.ShareAmountBase); err != nil {
			return err
		}
	}
	return nil
}

type splitParticipant struct {
	ParticipantID   int64
	Included        bool
	ShareRatio      any
	ShareAmountBase any
}

func splitParticipantsFromInput(raw any, participantIDs map[int64]bool) ([]splitParticipant, error) {
	items, ok := raw.([]any)
	if !ok {
		return []splitParticipant{}, nil
	}
	byID := map[int64]splitParticipant{}
	for _, item := range items {
		input, ok := item.(map[string]any)
		if !ok {
			continue
		}
		participantID := int64Value(input["participantId"])
		if participantID <= 0 {
			participantID = int64Value(input["participant_id"])
		}
		if participantID <= 0 || !participantIDs[participantID] {
			return nil, apiError("VALIDATION_ERROR", "Split participant does not belong to this budget.", http.StatusUnprocessableEntity)
		}
		ratio, hasRatio := numericInput(firstValue(input, "shareRatio", "share_ratio"))
		amount, hasAmount := numericInput(firstValue(input, "shareAmountBase", "share_amount_base"))
		if hasRatio && ratio < 0 {
			return nil, apiError("VALIDATION_ERROR", "Split share ratio cannot be less than 0.", http.StatusUnprocessableEntity)
		}
		if hasAmount && amount < 0 {
			return nil, apiError("VALIDATION_ERROR", "Split share amount cannot be less than 0.", http.StatusUnprocessableEntity)
		}
		byID[participantID] = splitParticipant{ParticipantID: participantID, Included: boolDefault(firstValue(input, "isIncluded", "is_included"), true), ShareRatio: nullableFloatValue(ratio, hasRatio), ShareAmountBase: nullableFloatValue(amount, hasAmount)}
	}
	out := make([]splitParticipant, 0, len(byID))
	for _, participant := range byID {
		out = append(out, participant)
	}
	return out, nil
}

func (a *App) replaceTransactionPayments(r *http.Request, budgetID, transactionID int64, transactionAmount, rate float64, raw any) error {
	return a.replaceTransactionPaymentsExec(r, a.db, budgetID, transactionID, transactionAmount, rate, raw)
}

func (a *App) replaceTransactionPaymentsTx(r *http.Request, tx *sql.Tx, budgetID, transactionID int64, transactionAmount, rate float64, raw any) error {
	return a.replaceTransactionPaymentsExec(r, tx, budgetID, transactionID, transactionAmount, rate, raw)
}

func (a *App) replaceTransactionPaymentsExec(r *http.Request, exec entryExec, budgetID, transactionID int64, transactionAmount, rate float64, raw any) error {
	if _, err := exec.ExecContext(r.Context(), "DELETE FROM budget_transaction_payments WHERE transaction_id = ?", transactionID); err != nil {
		return err
	}
	if raw == nil {
		return nil
	}
	items, ok := raw.([]any)
	if !ok {
		return apiError("VALIDATION_ERROR", "Transaction payments must be an array.", http.StatusUnprocessableEntity)
	}
	participantIDs, err := a.participantIDSet(r, budgetID)
	if err != nil {
		return err
	}
	if len(participantIDs) == 0 && len(items) > 0 {
		return apiError("VALIDATION_ERROR", "Transaction payments require budget participants.", http.StatusUnprocessableEntity)
	}
	amounts := map[int64]float64{}
	for _, item := range items {
		input, ok := item.(map[string]any)
		if !ok {
			continue
		}
		participantID := int64Value(input["participantId"])
		if participantID <= 0 {
			participantID = int64Value(input["participant_id"])
		}
		if participantID <= 0 || !participantIDs[participantID] {
			return apiError("VALIDATION_ERROR", "Payment participant does not belong to this budget.", http.StatusUnprocessableEntity)
		}
		amount, ok := numericInput(firstValue(input, "amount", "amountOriginal", "amount_original"))
		if !ok || amount <= 0 {
			continue
		}
		amounts[participantID] += amount
	}
	if len(amounts) == 0 {
		return nil
	}
	total := 0.0
	for _, amount := range amounts {
		total += amount
	}
	if absFloat(round2(total)-round2(transactionAmount)) > 0.01 {
		return apiError("VALIDATION_ERROR", "Payment amounts must match the transaction amount.", http.StatusUnprocessableEntity)
	}
	for participantID, amount := range amounts {
		if _, err := exec.ExecContext(r.Context(), "INSERT INTO budget_transaction_payments (transaction_id, participant_id, amount_original, amount_base) VALUES (?, ?, ?, ?)", transactionID, participantID, amount, round4(amount*rate)); err != nil {
			return err
		}
	}
	if len(amounts) == 1 {
		for participantID := range amounts {
			_, _ = exec.ExecContext(r.Context(), "UPDATE budget_transactions SET paid_by_participant_id = ? WHERE id = ?", participantID, transactionID)
		}
	} else {
		_, _ = exec.ExecContext(r.Context(), "UPDATE budget_transactions SET paid_by_participant_id = NULL WHERE id = ?", transactionID)
	}
	return nil
}

func firstValue(input map[string]any, keys ...string) any {
	for _, key := range keys {
		if value, ok := input[key]; ok {
			return value
		}
	}
	return nil
}

func nullableFloatValue(value float64, valid bool) any {
	if !valid {
		return nil
	}
	return value
}

func nullInt64FromValue(value any) sql.NullInt64 {
	id := int64Value(value)
	return sql.NullInt64{Int64: id, Valid: id > 0}
}

func round2(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}

func absFloat(value float64) float64 {
	if value < 0 {
		return -value
	}
	return value
}

func itemInsertSQL() string {
	return `INSERT INTO budget_items (budget_id, category_id, label, budget_currency_id, budget_amount_original, budget_rate_to_base, budget_amount_base,
estimated_currency_id, estimated_amount_original, estimated_rate_to_base, estimated_amount_base, variance_amount_base,
installment_config, pricing_config, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
}

func itemUpdateSQL() string {
	return `UPDATE budget_items SET category_id=?, label=?, budget_currency_id=?, budget_amount_original=?, budget_rate_to_base=?, budget_amount_base=?,
estimated_currency_id=?, estimated_amount_original=?, estimated_rate_to_base=?, estimated_amount_base=?, variance_amount_base=?,
installment_config=?, pricing_config=?, sort_order=? WHERE id=?`
}

func txInsertSQL() string {
	return `INSERT INTO budget_transactions (budget_id, category_id, paid_by_participant_id, transaction_date, details, currency_id, amount_original,
rate_to_base, amount_base, pricing_config, reference_currency_id, reference_amount_original, remark, sort_order)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
}

func txUpdateSQL() string {
	return `UPDATE budget_transactions SET category_id=?, paid_by_participant_id=?, transaction_date=?, details=?, currency_id=?, amount_original=?,
rate_to_base=?, amount_base=?, pricing_config=?, reference_currency_id=?, reference_amount_original=?, remark=?, sort_order=? WHERE id=?`
}
