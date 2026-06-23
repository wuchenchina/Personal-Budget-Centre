package app

import (
	"database/sql"
	"errors"
	"net/http"
)

func (a *App) participants(r *http.Request, budgetID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(r.Context(), "SELECT id, member_user_id, name, email, sort_order, created_at, updated_at FROM budget_participants WHERE budget_id = ? ORDER BY sort_order ASC, id ASC", budgetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, sort int64
		var member sql.NullInt64
		var name string
		var email sql.NullString
		var created, updated string
		if err := rows.Scan(&id, &member, &name, &email, &sort, &created, &updated); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "memberUserId": nullableInt(member), "name": name, "email": nullableString(email), "sortOrder": sort, "createdAt": created, "updatedAt": updated})
	}
	return out, rows.Err()
}

func (a *App) replaceParticipants(r *http.Request, budgetID int64, raw any) error {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM budget_participants WHERE budget_id = ?", budgetID); err != nil {
		return err
	}
	for i, item := range items {
		p, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name := nonEmptyString(p["name"], p["displayName"])
		if name == "" {
			continue
		}
		_, err := a.db.ExecContext(r.Context(), "INSERT INTO budget_participants (budget_id, member_user_id, name, email, sort_order) VALUES (?, ?, ?, ?, ?)", budgetID, nullableInt64Value(p["memberUserId"]), name, nullableStringValue(p["email"]), i+1)
		if err != nil {
			return err
		}
	}
	return nil
}

func (a *App) items(r *http.Request, budgetID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(r.Context(), `SELECT bi.id, bi.category_id, bc.name, bi.label, bcur.code, bi.budget_amount_original, bi.budget_rate_to_base, bi.budget_amount_base,
ecur.code, bi.estimated_amount_original, bi.estimated_rate_to_base, bi.estimated_amount_base,
bi.variance_amount_base, bi.installment_config, bi.pricing_config, bi.sort_order
FROM budget_items bi LEFT JOIN budget_categories bc ON bc.id = bi.category_id
JOIN currencies bcur ON bcur.id = bi.budget_currency_id JOIN currencies ecur ON ecur.id = bi.estimated_currency_id
WHERE bi.budget_id = ? ORDER BY bi.sort_order ASC, bi.id ASC`, budgetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, sort int64
		var catID sql.NullInt64
		var cat sql.NullString
		var label, bcur, ecur string
		var ba, br, bb, ea, er, eb, variance float64
		var installment, pricing sql.NullString
		if err := rows.Scan(&id, &catID, &cat, &label, &bcur, &ba, &br, &bb, &ecur, &ea, &er, &eb, &variance, &installment, &pricing, &sort); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "categoryId": nullableInt(catID), "category": nullableString(cat), "label": label, "budget": map[string]any{"currency": bcur, "amountOriginal": ba, "rateToBase": br, "amountBase": bb}, "estimatedActuals": map[string]any{"currency": ecur, "amountOriginal": ea, "rateToBase": er, "amountBase": eb}, "varianceBase": variance, "installmentConfig": jsonMap(installment), "pricingConfig": pricingMap(pricing), "split": nil, "sortOrder": sort})
	}
	return out, rows.Err()
}

func (a *App) transactions(r *http.Request, budgetID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(r.Context(), `SELECT tx.id, tx.category_id, tx.paid_by_participant_id, bc.name, tx.transaction_date, tx.details, c.code,
tx.amount_original, tx.rate_to_base, tx.amount_base, tx.pricing_config, rc.code,
tx.reference_amount_original, tx.remark, tx.sort_order
FROM budget_transactions tx LEFT JOIN budget_categories bc ON bc.id = tx.category_id
JOIN currencies c ON c.id = tx.currency_id LEFT JOIN currencies rc ON rc.id = tx.reference_currency_id
WHERE tx.budget_id = ? ORDER BY tx.sort_order ASC, tx.id ASC`, budgetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, sort int64
		var catID, paidBy sql.NullInt64
		var cat, date, refCur, refAmt, remark sql.NullString
		var details, cur string
		var amount, rate, base float64
		var pricing sql.NullString
		if err := rows.Scan(&id, &catID, &paidBy, &cat, &date, &details, &cur, &amount, &rate, &base, &pricing, &refCur, &refAmt, &remark, &sort); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "categoryId": nullableInt(catID), "paidByParticipantId": nullableInt(paidBy), "payments": []any{}, "category": nullableString(cat), "transactionDate": nullableString(date), "details": details, "currency": cur, "amountOriginal": amount, "rateToBase": rate, "amountBase": base, "pricingConfig": pricingMap(pricing), "referenceCurrency": nullableString(refCur), "referenceAmountOriginal": parseNullFloat(refAmt), "remark": nullableString(remark), "sortOrder": sort})
	}
	return out, rows.Err()
}

func (a *App) overallInstallmentPlan(r *http.Request, budgetID int64) (map[string]any, error) {
	row := a.db.QueryRowContext(r.Context(), "SELECT period_amounts, period_locked, period_progress, period_remarks, updated_at FROM budget_installment_plans WHERE budget_id = ? AND scope = 'overall'", budgetID)
	var amounts, locked, progress, remarks, updated sql.NullString
	if err := row.Scan(&amounts, &locked, &progress, &remarks, &updated); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return map[string]any{"periodAmounts": []any{}, "periodLocked": []any{}, "periodProgress": []any{}, "periodRemarks": []any{}, "updatedAt": nil}, nil
		}
		return nil, err
	}
	return map[string]any{"periodAmounts": jsonArray(amounts), "periodLocked": jsonArray(locked), "periodProgress": jsonArray(progress), "periodRemarks": jsonArray(remarks), "updatedAt": nullableString(updated)}, nil
}

func pricingMap(raw sql.NullString) map[string]any {
	out := jsonMap(raw)
	if len(out) == 0 {
		return map[string]any{"enabled": false, "unitPrice": nil, "quantity": nil, "totalAmount": nil}
	}
	return out
}
