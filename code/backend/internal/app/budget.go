package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) budgetList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	workspaceID := queryInt(r, "workspaceId")
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor", "viewer", "auditor"); err != nil {
		return err
	}
	rows, err := a.db.QueryContext(r.Context(), budgetSelectSQL("WHERE b.workspace_id = ?")+" ORDER BY b.updated_at DESC, b.id DESC", workspaceID)
	if err != nil {
		return err
	}
	defer rows.Close()
	budgets := []map[string]any{}
	for rows.Next() {
		item, err := scanBudget(rows)
		if err != nil {
			return err
		}
		budgets = append(budgets, item)
	}
	httpx.WriteOK(w, map[string]any{"budgets": budgets}, http.StatusOK)
	return rows.Err()
}

func (a *App) budgetCreate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	workspaceID := int64Value(input["workspaceId"])
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	baseID, _ := a.currencyID(r.Context(), stringDefault(stringValue(input["baseCurrency"]), "HKD"))
	displayID, _ := a.currencyID(r.Context(), stringDefault(stringValue(input["displayCurrency"]), "HKD"))
	templateID, _ := a.defaultTemplateID(r.Context())
	res, err := a.db.ExecContext(r.Context(), budgetInsertSQL(),
		workspaceID, s.UserID, s.UserID, s.UserID, nullableInt(templateID),
		nonEmptyDefault(input["title"], "Untitled Budget"), nonEmptyDefault(input["ownerName"], s.DisplayName),
		nullableDate(input["startDate"]), nullableDate(input["endDate"]), nullableInt(baseID), nullableInt(displayID),
		enumString(stringValue(input["budgetType"]), []string{"regular", "installment"}, "regular"),
		enumString(stringValue(input["participantMode"]), []string{"solo", "group"}, "solo"),
		enumString(stringValue(input["installmentDisplayMode"]), []string{"item", "overall"}, "item"),
		enumString(stringValue(input["installmentPeriodUnit"]), []string{"day", "week", "month", "year"}, "month"),
		boolInt(boolValue(input["pricingEnabled"])), enumString(stringValue(input["visibility"]), []string{"private", "workspace", "custom"}, "private"),
		enumString(stringValue(input["status"]), []string{"draft", "active", "closed", "archived"}, "draft"), nullableStringValue(input["note"]), jsonString(input["signatureConfig"]))
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	_ = a.replaceParticipants(r, id, input["participants"])
	return a.writeBudgetDetail(w, r, id, s.UserID)
}

func (a *App) budgetUpdate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	if err := a.requireBudgetWrite(r, id, s.UserID); err != nil {
		return err
	}
	baseID, _ := a.currencyID(r.Context(), stringDefault(stringValue(input["baseCurrency"]), "HKD"))
	displayID, _ := a.currencyID(r.Context(), stringDefault(stringValue(input["displayCurrency"]), "HKD"))
	_, err = a.db.ExecContext(r.Context(), budgetUpdateSQL(),
		nonEmptyDefault(input["title"], "Untitled Budget"), nonEmptyDefault(input["ownerName"], s.DisplayName),
		nullableDate(input["startDate"]), nullableDate(input["endDate"]), nullableInt(baseID), nullableInt(displayID),
		enumString(stringValue(input["budgetType"]), []string{"regular", "installment"}, "regular"),
		enumString(stringValue(input["participantMode"]), []string{"solo", "group"}, "solo"),
		enumString(stringValue(input["installmentDisplayMode"]), []string{"item", "overall"}, "item"),
		enumString(stringValue(input["installmentPeriodUnit"]), []string{"day", "week", "month", "year"}, "month"),
		boolInt(boolValue(input["pricingEnabled"])), enumString(stringValue(input["visibility"]), []string{"private", "workspace", "custom"}, "private"),
		enumString(stringValue(input["status"]), []string{"draft", "active", "closed", "archived"}, "draft"), nullableStringValue(input["note"]), jsonString(input["signatureConfig"]), id)
	if err != nil {
		return err
	}
	_ = a.replaceParticipants(r, id, input["participants"])
	return a.writeBudgetDetail(w, r, id, s.UserID)
}

func (a *App) budgetDelete(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	if err := a.requireBudgetWrite(r, id, s.UserID); err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM budgets WHERE id = ?", id); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{}, http.StatusOK)
	return nil
}

func (a *App) budgetDetail(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	return a.writeBudgetDetail(w, r, queryInt(r, "id"), s.UserID)
}

func (a *App) writeBudgetDetail(w http.ResponseWriter, r *http.Request, id, userID int64) error {
	budget, err := a.budgetDetailPayload(r, id, userID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"budget": budget}, http.StatusOK)
	return nil
}

func (a *App) budgetDetailPayload(r *http.Request, id, userID int64) (map[string]any, error) {
	budget, err := scanBudget(a.db.QueryRowContext(r.Context(), budgetSelectSQL("WHERE b.id = ?"), id))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apiError("BUDGET_NOT_FOUND", "Budget was not found.", http.StatusNotFound)
		}
		return nil, err
	}
	if err := a.requireWorkspaceRole(r.Context(), budget["workspaceId"].(int64), userID, "owner", "admin", "editor", "viewer", "auditor"); err != nil {
		return nil, err
	}
	participants, _ := a.participants(r, id)
	items, _ := a.items(r, id)
	transactions, _ := a.transactions(r, id)
	plan, _ := a.overallInstallmentPlan(r, id)
	budget["participants"] = participants
	budget["items"] = items
	budget["transactions"] = transactions
	budget["overallInstallmentPlan"] = plan
	return budget, nil
}

func scanBudget(row rowScanner) (map[string]any, error) {
	var id, workspaceID, txCount int64
	var title, ownerName, base, display, budgetType, participantMode, displayMode, periodUnit, visibility, status string
	var start, end, note, signature, templateKey, templateName sql.NullString
	var pricing bool
	var created, updated string
	var totalBudget, totalEstimated, totalVariance, totalTransaction float64
	if err := row.Scan(&id, &workspaceID, &title, &ownerName, &start, &end, &base, &display, &budgetType, &participantMode, &displayMode, &periodUnit, &pricing, &visibility, &status, &note, &signature, &templateKey, &templateName, &created, &updated, &totalBudget, &totalEstimated, &totalVariance, &txCount, &totalTransaction); err != nil {
		return nil, err
	}
	signatureConfig := map[string]any{"enabled": false, "rows": []any{}}
	if signature.Valid && signature.String != "" {
		_ = json.Unmarshal([]byte(signature.String), &signatureConfig)
	}
	return map[string]any{"id": id, "workspaceId": workspaceID, "title": title, "ownerName": ownerName, "startDate": nullableString(start), "endDate": nullableString(end), "baseCurrency": base, "displayCurrency": display, "budgetType": budgetType, "participantMode": participantMode, "installmentDisplayMode": displayMode, "installmentPeriodUnit": periodUnit, "pricingEnabled": pricing, "visibility": visibility, "status": status, "note": nullableString(note), "signatureConfig": signatureConfig, "template": map[string]any{"key": nullableString(templateKey), "name": nullableString(templateName)}, "totals": map[string]any{"totalBudgetBase": totalBudget, "totalEstimatedBase": totalEstimated, "totalVarianceBase": totalVariance, "totalTransactionBase": totalTransaction, "transactionCount": txCount}, "createdAt": created, "updatedAt": updated}, nil
}

func budgetSelectSQL(where string) string {
	return `SELECT b.id, b.workspace_id, b.title, b.owner_name, b.start_date, b.end_date,
base.code, display.code, b.budget_type, b.participant_mode, b.installment_display_mode,
b.installment_period_unit, b.pricing_enabled, b.visibility, b.status, b.note, b.signature_config,
bt.template_key, bt.name, b.created_at, b.updated_at,
COALESCE(SUM(bi.budget_amount_base), 0), COALESCE(SUM(bi.estimated_amount_base), 0),
COALESCE(SUM(bi.variance_amount_base), 0),
(SELECT COUNT(*) FROM budget_transactions tx WHERE tx.budget_id = b.id),
(SELECT COALESCE(SUM(tx.amount_base), 0) FROM budget_transactions tx WHERE tx.budget_id = b.id)
FROM budgets b
JOIN currencies base ON base.id = b.base_currency_id
JOIN currencies display ON display.id = b.display_currency_id
LEFT JOIN budget_templates bt ON bt.id = b.template_id
LEFT JOIN budget_items bi ON bi.budget_id = b.id ` + where + `
 GROUP BY b.id, b.workspace_id, b.title, b.owner_name, b.start_date, b.end_date,
base.code, display.code, b.budget_type, b.participant_mode, b.installment_display_mode,
b.installment_period_unit, b.pricing_enabled, b.visibility, b.status, b.note, b.signature_config,
bt.template_key, bt.name, b.created_at, b.updated_at`
}

func budgetInsertSQL() string {
	return `INSERT INTO budgets (workspace_id, user_id, owner_user_id, created_by_user_id, template_id,
title, owner_name, start_date, end_date, base_currency_id, display_currency_id,
budget_type, participant_mode, installment_display_mode, installment_period_unit,
pricing_enabled, visibility, status, note, signature_config)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
}

func budgetUpdateSQL() string {
	return `UPDATE budgets SET title=?, owner_name=?, start_date=?, end_date=?, base_currency_id=?, display_currency_id=?,
budget_type=?, participant_mode=?, installment_display_mode=?, installment_period_unit=?, pricing_enabled=?,
visibility=?, status=?, note=?, signature_config=? WHERE id=?`
}
