package app

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"budgetcentre/backend/internal/httpx"
)

var (
	budgetTypes                   = []string{"regular", "installment"}
	budgetParticipantModes        = []string{"solo", "group"}
	budgetInstallmentDisplayModes = []string{"item", "overall"}
	budgetInstallmentPeriodUnits  = []string{"day", "week", "month", "year"}
	budgetVisibilities            = []string{"private", "workspace", "custom"}
	budgetStatuses                = []string{"draft", "active", "closed", "archived"}
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
	includePrivate := false
	var workspaceRole string
	_ = a.db.QueryRowContext(r.Context(), `SELECT r.role_key FROM workspace_members wm JOIN roles r ON r.id = wm.role_id WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'active' LIMIT 1`, workspaceID, s.UserID).Scan(&workspaceRole)
	includePrivate = workspaceRole == "owner" || workspaceRole == "admin"
	rows, err := a.db.QueryContext(r.Context(), budgetSelectSQL(`WHERE b.workspace_id = ? AND (
? = 1
OR b.visibility = 'workspace'
OR b.user_id = ?
OR b.owner_user_id = ?
OR b.created_by_user_id = ?
OR EXISTS (
  SELECT 1
  FROM budget_shares bs
  LEFT JOIN workgroups share_wg ON bs.principal_type = 'workgroup' AND share_wg.id = bs.principal_id
  LEFT JOIN workgroup_members share_wgm ON share_wgm.workgroup_id = share_wg.id AND share_wgm.user_id = ?
  WHERE bs.budget_id = b.id
    AND (bs.expires_at IS NULL OR bs.expires_at > UTC_TIMESTAMP())
    AND (
      (bs.principal_type = 'workspace' AND bs.principal_id = b.workspace_id)
      OR (bs.principal_type = 'user' AND bs.principal_id = ?)
      OR (bs.principal_type = 'workgroup' AND share_wg.workspace_id = b.workspace_id AND share_wgm.user_id IS NOT NULL)
    )
)
)`)+" ORDER BY b.start_date IS NULL ASC, b.start_date DESC, b.updated_at DESC, b.id DESC", workspaceID, boolInt(includePrivate), s.UserID, s.UserID, s.UserID, s.UserID, s.UserID)
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
	workspaceID := int64Value(firstValue(input, "workspaceId", "workspace_id"))
	if workspaceID <= 0 {
		return apiError("VALIDATION_ERROR", "workspaceId is required.", http.StatusUnprocessableEntity)
	}
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	values, err := a.budgetValues(r, input, s.DisplayName, nil)
	if err != nil {
		return err
	}
	baseID, err := a.requiredBudgetCurrencyID(r, values.BaseCurrency)
	if err != nil {
		return err
	}
	displayID, err := a.requiredBudgetCurrencyID(r, values.DisplayCurrency)
	if err != nil {
		return err
	}
	templateID, _ := a.defaultTemplateID(r.Context())
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(r.Context(), budgetInsertSQL(),
		workspaceID, s.UserID, s.UserID, s.UserID, nullableInt(templateID),
		values.Title, values.OwnerName,
		nullableText(values.StartDate), nullableText(values.EndDate), baseID, displayID,
		values.BudgetType,
		values.ParticipantMode,
		values.InstallmentDisplayMode,
		values.InstallmentPeriodUnit,
		boolInt(values.PricingEnabled), values.Visibility,
		values.Status, nullableText(values.Note), values.SignatureConfig)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	if values.ParticipantMode == "group" {
		if err := a.replaceParticipantsTx(r, tx, id, input["participants"]); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
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
	existing, err := a.budgetValuesByID(r, id)
	if err != nil {
		return err
	}
	values, err := a.budgetValues(r, input, s.DisplayName, &existing)
	if err != nil {
		return err
	}
	baseID, err := a.requiredBudgetCurrencyID(r, values.BaseCurrency)
	if err != nil {
		return err
	}
	displayID, err := a.requiredBudgetCurrencyID(r, values.DisplayCurrency)
	if err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(r.Context(), budgetUpdateSQL(),
		values.Title, values.OwnerName,
		nullableText(values.StartDate), nullableText(values.EndDate), baseID, displayID,
		values.BudgetType,
		values.ParticipantMode,
		values.InstallmentDisplayMode,
		values.InstallmentPeriodUnit,
		boolInt(values.PricingEnabled), values.Visibility,
		values.Status, nullableText(values.Note), values.SignatureConfig, id)
	if err != nil {
		return err
	}
	if values.ParticipantMode == "solo" {
		if _, err := tx.ExecContext(r.Context(), "DELETE FROM budget_participants WHERE budget_id = ?", id); err != nil {
			return err
		}
	} else if hasAnyKey(input, "participants") {
		if err := a.replaceParticipantsTx(r, tx, id, input["participants"]); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
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
	if err := a.requireBudgetRead(r, id, userID); err != nil {
		return nil, err
	}
	participants, err := a.participants(r, id)
	if err != nil {
		return nil, err
	}
	items, err := a.items(r, id)
	if err != nil {
		return nil, err
	}
	transactions, err := a.transactions(r, id)
	if err != nil {
		return nil, err
	}
	plan, err := a.overallInstallmentPlan(r, id)
	if err != nil {
		return nil, err
	}
	budget["participants"] = participants
	budget["items"] = items
	budget["transactions"] = transactions
	budget["overallInstallmentPlan"] = plan
	return budget, nil
}

func scanBudget(row rowScanner) (map[string]any, error) {
	var id, workspaceID, txCount int64
	var title, workspaceName, ownerName, base, display, budgetType, participantMode, displayMode, periodUnit, visibility, status string
	var start, end, note, signature, templateKey, templateName sql.NullString
	var pricing bool
	var created, updated string
	var totalBudget, totalEstimated, totalVariance, totalTransaction float64
	if err := row.Scan(&id, &workspaceID, &workspaceName, &title, &ownerName, &start, &end, &base, &display, &budgetType, &participantMode, &displayMode, &periodUnit, &pricing, &visibility, &status, &note, &signature, &templateKey, &templateName, &created, &updated, &totalBudget, &totalEstimated, &totalVariance, &txCount, &totalTransaction); err != nil {
		return nil, err
	}
	signatureConfig := map[string]any{"enabled": false, "rows": []any{}}
	if signature.Valid && signature.String != "" {
		_ = json.Unmarshal([]byte(signature.String), &signatureConfig)
	}
	return map[string]any{"id": id, "workspaceId": workspaceID, "workspaceName": workspaceName, "title": title, "ownerName": ownerName, "startDate": nullableDateOnly(start), "endDate": nullableDateOnly(end), "baseCurrency": base, "displayCurrency": display, "budgetType": budgetType, "participantMode": participantMode, "installmentDisplayMode": displayMode, "installmentPeriodUnit": periodUnit, "pricingEnabled": pricing, "visibility": visibility, "status": status, "note": nullableString(note), "signatureConfig": signatureConfig, "template": map[string]any{"key": nullableString(templateKey), "name": nullableString(templateName)}, "totals": map[string]any{"totalBudgetBase": totalBudget, "totalEstimatedBase": totalEstimated, "totalVarianceBase": totalVariance, "totalTransactionBase": totalTransaction, "transactionCount": txCount}, "createdAt": dateTimeValue(created), "updatedAt": dateTimeValue(updated)}, nil
}

func budgetSelectSQL(where string) string {
	return `SELECT b.id, b.workspace_id, w.name, b.title, b.owner_name, b.start_date, b.end_date,
base.code, display.code, b.budget_type, b.participant_mode, b.installment_display_mode,
b.installment_period_unit, b.pricing_enabled, b.visibility, b.status, b.note, b.signature_config,
bt.template_key, bt.name, b.created_at, b.updated_at,
COALESCE(SUM(ie.effective_budget_base), 0), COALESCE(SUM(ie.effective_estimated_base), 0),
COALESCE(SUM(ie.effective_variance_base), 0),
(SELECT COUNT(*) FROM budget_transactions tx WHERE tx.budget_id = b.id),
(SELECT COALESCE(SUM(tx.amount_base), 0) FROM budget_transactions tx WHERE tx.budget_id = b.id)
FROM budgets b
JOIN workspaces w ON w.id = b.workspace_id
JOIN currencies base ON base.id = b.base_currency_id
JOIN currencies display ON display.id = b.display_currency_id
LEFT JOIN budget_templates bt ON bt.id = b.template_id
LEFT JOIN (
SELECT bi.id, bi.budget_id,
ROUND(
  CASE
    WHEN bi.budget_amount_original = 0 AND bi.budget_amount_base = 0 AND COALESCE(tx.tx_count, 0) > 0
      THEN COALESCE(tx.tx_base, 0) * COALESCE(sm.multiplier, 1)
    ELSE bi.budget_amount_base * COALESCE(sm.multiplier, 1)
  END,
  2
) AS effective_budget_base,
ROUND(COALESCE(tx.tx_base, 0) * COALESCE(sm.multiplier, 1), 2) AS effective_estimated_base,
ROUND(
  CASE
    WHEN bi.budget_amount_original = 0 AND bi.budget_amount_base = 0 AND COALESCE(tx.tx_count, 0) > 0
      THEN COALESCE(tx.tx_base, 0) * COALESCE(sm.multiplier, 1)
    ELSE bi.budget_amount_base * COALESCE(sm.multiplier, 1)
  END - COALESCE(tx.tx_base, 0) * COALESCE(sm.multiplier, 1),
  2
) AS effective_variance_base
FROM budget_items bi
LEFT JOIN (
  SELECT budget_id, category_id, COUNT(*) AS tx_count, ROUND(SUM(amount_base), 2) AS tx_base
  FROM budget_transactions
  GROUP BY budget_id, category_id
) tx ON tx.budget_id = bi.budget_id AND tx.category_id = bi.category_id
LEFT JOIN (
  SELECT bis.budget_item_id,
  CASE
    WHEN bis.split_type = 'per_person' THEN GREATEST(1, COALESCE(SUM(CASE WHEN bisp.is_included = 1 THEN 1 ELSE 0 END), 0))
    ELSE 1
  END AS multiplier
  FROM budget_item_splits bis
  LEFT JOIN budget_item_split_participants bisp ON bisp.split_id = bis.id
  GROUP BY bis.id, bis.budget_item_id, bis.split_type
) sm ON sm.budget_item_id = bi.id
) ie ON ie.budget_id = b.id ` + where + `
 GROUP BY b.id, b.workspace_id, w.name, b.title, b.owner_name, b.start_date, b.end_date,
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

type budgetInputValues struct {
	Title                  string
	OwnerName              string
	StartDate              string
	EndDate                string
	BaseCurrency           string
	DisplayCurrency        string
	BudgetType             string
	ParticipantMode        string
	InstallmentDisplayMode string
	InstallmentPeriodUnit  string
	PricingEnabled         bool
	Visibility             string
	Status                 string
	Note                   string
	SignatureConfig        any
}

func (a *App) budgetValues(r *http.Request, input map[string]any, defaultOwnerName string, existing *budgetInputValues) (budgetInputValues, error) {
	values := budgetInputValues{
		OwnerName:              defaultOwnerName,
		BaseCurrency:           "CNY",
		DisplayCurrency:        "CNY",
		BudgetType:             "regular",
		ParticipantMode:        "solo",
		InstallmentDisplayMode: "item",
		InstallmentPeriodUnit:  "month",
		Visibility:             "private",
		Status:                 "draft",
	}
	if existing != nil {
		values = *existing
	}
	if hasAnyKey(input, "title") || existing == nil {
		values.Title = stringValue(input["title"])
	}
	if hasAnyKey(input, "ownerName", "owner_name") || existing == nil {
		values.OwnerName = nonEmptyString(firstValue(input, "ownerName", "owner_name"))
		if values.OwnerName == "" {
			values.OwnerName = defaultOwnerName
		}
	}
	if hasAnyKey(input, "startDate", "start_date") || existing == nil {
		values.StartDate = dateString(firstValue(input, "startDate", "start_date"))
	}
	if hasAnyKey(input, "endDate", "end_date") || existing == nil {
		values.EndDate = dateString(firstValue(input, "endDate", "end_date"))
	}
	if hasAnyKey(input, "baseCurrency", "base_currency") || existing == nil {
		values.BaseCurrency = strings.ToUpper(stringDefault(stringValue(firstValue(input, "baseCurrency", "base_currency")), "CNY"))
	}
	if hasAnyKey(input, "displayCurrency", "display_currency") || existing == nil {
		values.DisplayCurrency = strings.ToUpper(stringDefault(stringValue(firstValue(input, "displayCurrency", "display_currency")), values.BaseCurrency))
	}
	if hasAnyKey(input, "budgetType", "budget_type") || existing == nil {
		values.BudgetType = stringDefault(stringValue(firstValue(input, "budgetType", "budget_type")), "regular")
	}
	if hasAnyKey(input, "participantMode", "participant_mode") || existing == nil {
		values.ParticipantMode = stringDefault(stringValue(firstValue(input, "participantMode", "participant_mode")), "solo")
	}
	if hasAnyKey(input, "installmentDisplayMode", "installment_display_mode") || existing == nil {
		values.InstallmentDisplayMode = stringDefault(stringValue(firstValue(input, "installmentDisplayMode", "installment_display_mode")), "item")
	}
	if hasAnyKey(input, "installmentPeriodUnit", "installment_period_unit") || existing == nil {
		values.InstallmentPeriodUnit = stringDefault(stringValue(firstValue(input, "installmentPeriodUnit", "installment_period_unit")), "month")
	}
	if hasAnyKey(input, "pricingEnabled", "pricing_enabled") || existing == nil {
		values.PricingEnabled = boolDefault(firstValue(input, "pricingEnabled", "pricing_enabled"), false)
	}
	if hasAnyKey(input, "visibility") || existing == nil {
		values.Visibility = stringDefault(stringValue(input["visibility"]), "private")
	}
	if hasAnyKey(input, "status") || existing == nil {
		values.Status = stringDefault(stringValue(input["status"]), "draft")
	}
	if hasAnyKey(input, "note") || existing == nil {
		values.Note = stringValue(input["note"])
	}
	if hasAnyKey(input, "signatureConfig", "signature_config") || existing == nil {
		values.SignatureConfig = jsonString(firstValue(input, "signatureConfig", "signature_config"))
	}
	if err := validateBudgetValues(values); err != nil {
		return budgetInputValues{}, err
	}
	return values, nil
}

func validateBudgetValues(values budgetInputValues) error {
	if values.Title == "" || len(values.Title) > 255 {
		return apiError("VALIDATION_ERROR", "Budget title is required and must be 255 characters or less.", http.StatusUnprocessableEntity)
	}
	if len(values.OwnerName) > 160 {
		return apiError("VALIDATION_ERROR", "Owner name must be 160 characters or less.", http.StatusUnprocessableEntity)
	}
	if (values.StartDate == "") != (values.EndDate == "") {
		return apiError("VALIDATION_ERROR", "Budget period must include both start date and end date.", http.StatusUnprocessableEntity)
	}
	if values.StartDate != "" && values.EndDate != "" && values.StartDate > values.EndDate {
		return apiError("VALIDATION_ERROR", "Start date must be before or equal to end date.", http.StatusUnprocessableEntity)
	}
	if !stringIn(values.BudgetType, budgetTypes) {
		return apiError("VALIDATION_ERROR", "Budget type must be regular or installment.", http.StatusUnprocessableEntity)
	}
	if !stringIn(values.ParticipantMode, budgetParticipantModes) {
		return apiError("VALIDATION_ERROR", "Participant mode must be solo or group.", http.StatusUnprocessableEntity)
	}
	if !stringIn(values.InstallmentDisplayMode, budgetInstallmentDisplayModes) {
		return apiError("VALIDATION_ERROR", "Installment display mode must be item or overall.", http.StatusUnprocessableEntity)
	}
	if !stringIn(values.InstallmentPeriodUnit, budgetInstallmentPeriodUnits) {
		return apiError("VALIDATION_ERROR", "Installment period unit must be day, week, month, or year.", http.StatusUnprocessableEntity)
	}
	if !stringIn(values.Visibility, budgetVisibilities) {
		return apiError("VALIDATION_ERROR", "Budget visibility must be private, workspace, or custom.", http.StatusUnprocessableEntity)
	}
	if !stringIn(values.Status, budgetStatuses) {
		return apiError("VALIDATION_ERROR", "Budget status must be draft, active, closed, or archived.", http.StatusUnprocessableEntity)
	}
	if len(values.Note) > 20000 {
		return apiError("VALIDATION_ERROR", "Budget note must be 20000 characters or less.", http.StatusUnprocessableEntity)
	}
	return nil
}

func (a *App) budgetValuesByID(r *http.Request, id int64) (budgetInputValues, error) {
	var values budgetInputValues
	var start, end, note, signature sql.NullString
	err := a.db.QueryRowContext(r.Context(), `SELECT b.title, b.owner_name, b.start_date, b.end_date,
base.code, display.code, b.budget_type, b.participant_mode, b.installment_display_mode,
b.installment_period_unit, b.pricing_enabled, b.visibility, b.status, b.note, b.signature_config
FROM budgets b
JOIN currencies base ON base.id = b.base_currency_id
JOIN currencies display ON display.id = b.display_currency_id
WHERE b.id = ? LIMIT 1`, id).Scan(
		&values.Title,
		&values.OwnerName,
		&start,
		&end,
		&values.BaseCurrency,
		&values.DisplayCurrency,
		&values.BudgetType,
		&values.ParticipantMode,
		&values.InstallmentDisplayMode,
		&values.InstallmentPeriodUnit,
		&values.PricingEnabled,
		&values.Visibility,
		&values.Status,
		&note,
		&signature,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return budgetInputValues{}, apiError("BUDGET_NOT_FOUND", "Budget was not found.", http.StatusNotFound)
		}
		return budgetInputValues{}, err
	}
	values.StartDate = stringValue(nullableString(start))
	values.EndDate = stringValue(nullableString(end))
	values.Note = stringValue(nullableString(note))
	values.SignatureConfig = nullableString(signature)
	return values, nil
}

func (a *App) requiredBudgetCurrencyID(r *http.Request, code string) (int64, error) {
	id, err := a.currencyID(r.Context(), code)
	if err != nil || !id.Valid {
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return 0, err
		}
		return 0, apiError("CURRENCY_NOT_FOUND", "Budget currency is not available.", http.StatusUnprocessableEntity)
	}
	return id.Int64, nil
}

func stringIn(value string, allowed []string) bool {
	for _, item := range allowed {
		if value == item {
			return true
		}
	}
	return false
}
