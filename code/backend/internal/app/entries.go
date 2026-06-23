package app

import (
	"context"
	"net/http"
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
	basics, err := a.budgetBasics(r, budgetID)
	if err != nil {
		return err
	}
	bcur, _ := a.currencyID(r.Context(), stringDefault(stringValue(input["budgetCurrency"]), basics.BaseCurrency))
	ecur, _ := a.currencyID(r.Context(), stringDefault(stringValue(input["estimatedCurrency"]), basics.BaseCurrency))
	ba, ea := floatValue(input["budgetAmount"]), floatValue(input["estimatedAmount"])
	br, er := rateOrDefault(input["budgetRate"]), rateOrDefault(input["estimatedRate"])
	if create {
		_, err = a.db.ExecContext(r.Context(), itemInsertSQL(), budgetID, nullableInt64Value(input["categoryId"]), nonEmptyDefault(input["label"], "Untitled"), nullableInt(bcur), ba, br, round4(ba*br), nullableInt(ecur), ea, er, round4(ea*er), round4(ba*br-ea*er), jsonString(input["installmentConfig"]), jsonString(input["pricingConfig"]), int64Value(input["sortOrder"]))
	} else {
		_, err = a.db.ExecContext(r.Context(), itemUpdateSQL(), nullableInt64Value(input["categoryId"]), nonEmptyDefault(input["label"], "Untitled"), nullableInt(bcur), ba, br, round4(ba*br), nullableInt(ecur), ea, er, round4(ea*er), round4(ba*br-ea*er), jsonString(input["installmentConfig"]), jsonString(input["pricingConfig"]), int64Value(input["sortOrder"]), int64Value(input["id"]))
	}
	if err != nil {
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
	basics, err := a.budgetBasics(r, budgetID)
	if err != nil {
		return err
	}
	cur, _ := a.currencyID(r.Context(), stringDefault(stringValue(input["currency"]), basics.BaseCurrency))
	ref, _ := a.currencyID(r.Context(), stringValue(input["referenceCurrency"]))
	amount, rate := floatValue(input["amount"]), rateOrDefault(input["rate"])
	if create {
		_, err = a.db.ExecContext(r.Context(), txInsertSQL(), budgetID, nullableInt64Value(input["categoryId"]), nullableInt64Value(input["paidByParticipantId"]), nullableDate(input["transactionDate"]), nonEmptyDefault(input["details"], "Transaction"), nullableInt(cur), amount, rate, round4(amount*rate), jsonString(input["pricingConfig"]), nullableInt(ref), nullableFloat(input["referenceAmount"]), nullableStringValue(input["remark"]), int64Value(input["sortOrder"]))
	} else {
		_, err = a.db.ExecContext(r.Context(), txUpdateSQL(), nullableInt64Value(input["categoryId"]), nullableInt64Value(input["paidByParticipantId"]), nullableDate(input["transactionDate"]), nonEmptyDefault(input["details"], "Transaction"), nullableInt(cur), amount, rate, round4(amount*rate), jsonString(input["pricingConfig"]), nullableInt(ref), nullableFloat(input["referenceAmount"]), nullableStringValue(input["remark"]), int64Value(input["sortOrder"]), int64Value(input["id"]))
	}
	if err != nil {
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
		return 0, apiError("NOT_FOUND", "Budget entry was not found.", http.StatusNotFound)
	}
	return budgetID, nil
}

type budgetBasics struct {
	WorkspaceID    int64
	BaseCurrency   string
	BaseCurrencyID int64
}

func (a *App) budgetBasics(r *http.Request, budgetID int64) (budgetBasics, error) {
	var b budgetBasics
	err := a.db.QueryRowContext(r.Context(), `SELECT b.workspace_id, b.base_currency_id, c.code
FROM budgets b JOIN currencies c ON c.id = b.base_currency_id WHERE b.id = ?`, budgetID).Scan(&b.WorkspaceID, &b.BaseCurrencyID, &b.BaseCurrency)
	return b, err
}

func (a *App) requireBudgetWrite(r *http.Request, budgetID, userID int64) error {
	basics, err := a.budgetBasics(r, budgetID)
	if err != nil {
		return apiError("BUDGET_NOT_FOUND", "Budget was not found.", http.StatusNotFound)
	}
	return a.requireWorkspaceRole(r.Context(), basics.WorkspaceID, userID, "owner", "admin", "editor")
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
