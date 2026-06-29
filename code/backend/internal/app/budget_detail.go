package app

import (
	"context"
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
		out = append(out, map[string]any{"id": id, "memberUserId": nullableInt(member), "name": name, "email": nullableString(email), "sortOrder": sort, "createdAt": dateTimeValue(created), "updatedAt": dateTimeValue(updated)})
	}
	return out, rows.Err()
}

func (a *App) replaceParticipants(r *http.Request, budgetID int64, raw any) error {
	return a.replaceParticipantsExec(r, a.db, budgetID, raw)
}

func (a *App) replaceParticipantsTx(r *http.Request, tx *sql.Tx, budgetID int64, raw any) error {
	return a.replaceParticipantsExec(r, tx, budgetID, raw)
}

func (a *App) replaceParticipantsExec(r *http.Request, exec interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}, budgetID int64, raw any) error {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	keep := []int64{}
	for i, item := range items {
		p, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name := nonEmptyString(p["name"], p["displayName"])
		if name == "" {
			continue
		}
		id := int64Value(p["id"])
		if id > 0 {
			res, err := exec.ExecContext(r.Context(), "UPDATE budget_participants SET member_user_id = ?, name = ?, email = ?, sort_order = ? WHERE id = ? AND budget_id = ?", nullableInt64Value(p["memberUserId"]), name, nullableStringValue(p["email"]), i+1, id, budgetID)
			if err != nil {
				return err
			}
			if affected, _ := res.RowsAffected(); affected > 0 {
				keep = append(keep, id)
				continue
			}
		}
		res, err := exec.ExecContext(r.Context(), "INSERT INTO budget_participants (budget_id, member_user_id, name, email, sort_order) VALUES (?, ?, ?, ?, ?)", budgetID, nullableInt64Value(p["memberUserId"]), name, nullableStringValue(p["email"]), i+1)
		if err != nil {
			return err
		}
		insertedID, _ := res.LastInsertId()
		keep = append(keep, insertedID)
	}
	if len(keep) == 0 {
		_, err := exec.ExecContext(r.Context(), "DELETE FROM budget_participants WHERE budget_id = ?", budgetID)
		return err
	}
	_, err := exec.ExecContext(r.Context(), "DELETE FROM budget_participants WHERE budget_id = ? AND id NOT IN ("+placeholders(len(keep))+")", append([]any{budgetID}, int64AnySlice(keep)...)...)
	return err
}

func int64AnySlice(values []int64) []any {
	out := make([]any, len(values))
	for i, value := range values {
		out[i] = value
	}
	return out
}

func (a *App) participantIDSet(r *http.Request, budgetID int64) (map[int64]bool, error) {
	rows, err := a.db.QueryContext(r.Context(), "SELECT id FROM budget_participants WHERE budget_id = ?", budgetID)
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

func (a *App) itemSplits(r *http.Request, budgetID int64) (map[int64]map[string]any, error) {
	rows, err := a.db.QueryContext(r.Context(), `SELECT bis.id, bis.budget_item_id, bis.paid_by_participant_id, bis.split_type, bis.note
FROM budget_item_splits bis
JOIN budget_items bi ON bi.id = bis.budget_item_id
WHERE bi.budget_id = ?`, budgetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	bySplit := map[int64]map[string]any{}
	byItem := map[int64]int64{}
	for rows.Next() {
		var id, itemID int64
		var paidBy sql.NullInt64
		var splitType string
		var note sql.NullString
		if err := rows.Scan(&id, &itemID, &paidBy, &splitType, &note); err != nil {
			return nil, err
		}
		bySplit[id] = map[string]any{"id": id, "budgetItemId": itemID, "paidByParticipantId": nullableInt(paidBy), "splitType": splitType, "note": nullableString(note), "participants": []any{}}
		byItem[itemID] = id
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(bySplit) == 0 {
		return map[int64]map[string]any{}, nil
	}
	participants, err := a.db.QueryContext(r.Context(), `SELECT bisp.split_id, bisp.participant_id, bisp.is_included, bisp.share_ratio, bisp.share_amount_base
FROM budget_item_split_participants bisp
JOIN budget_item_splits bis ON bis.id = bisp.split_id
JOIN budget_items bi ON bi.id = bis.budget_item_id
WHERE bi.budget_id = ?
ORDER BY bisp.id ASC`, budgetID)
	if err != nil {
		return nil, err
	}
	defer participants.Close()
	for participants.Next() {
		var splitID, participantID int64
		var included bool
		var ratio, amount sql.NullString
		if err := participants.Scan(&splitID, &participantID, &included, &ratio, &amount); err != nil {
			return nil, err
		}
		if split, ok := bySplit[splitID]; ok {
			list := split["participants"].([]any)
			split["participants"] = append(list, map[string]any{"participantId": participantID, "isIncluded": included, "shareRatio": parseNullFloat(ratio), "shareAmountBase": parseNullFloat(amount)})
		}
	}
	if err := participants.Err(); err != nil {
		return nil, err
	}
	out := map[int64]map[string]any{}
	for itemID, splitID := range byItem {
		out[itemID] = bySplit[splitID]
	}
	return out, nil
}

func (a *App) transactionPayments(r *http.Request, budgetID int64) (map[int64][]any, error) {
	rows, err := a.db.QueryContext(r.Context(), `SELECT btp.transaction_id, btp.participant_id, btp.amount_original, btp.amount_base
FROM budget_transaction_payments btp
JOIN budget_transactions bt ON bt.id = btp.transaction_id
WHERE bt.budget_id = ?
ORDER BY btp.id ASC`, budgetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]any{}
	for rows.Next() {
		var txID, participantID int64
		var amount, amountBase float64
		if err := rows.Scan(&txID, &participantID, &amount, &amountBase); err != nil {
			return nil, err
		}
		out[txID] = append(out[txID], map[string]any{"participantId": participantID, "amountOriginal": amount, "amountBase": amountBase})
	}
	return out, rows.Err()
}

func hasItemSplitInput(input map[string]any) bool {
	_, ok := input["split"]
	if ok {
		return true
	}
	_, ok = input["split_config"]
	return ok
}

func hasTransactionPaymentsInput(input map[string]any) bool {
	if _, ok := input["payments"]; ok {
		return true
	}
	if _, ok := input["paymentAllocations"]; ok {
		return true
	}
	_, ok := input["payment_allocations"]
	return ok
}

func rawTransactionPayments(input map[string]any) any {
	if value, ok := input["payments"]; ok {
		return value
	}
	if value, ok := input["paymentAllocations"]; ok {
		return value
	}
	return input["payment_allocations"]
}

func rawItemSplit(input map[string]any) any {
	if value, ok := input["split"]; ok {
		return value
	}
	return input["split_config"]
}

func (a *App) items(r *http.Request, budgetID int64) ([]map[string]any, error) {
	splits, err := a.itemSplits(r, budgetID)
	if err != nil {
		return nil, err
	}
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
		out = append(out, map[string]any{"id": id, "categoryId": nullableInt(catID), "category": nullableString(cat), "label": label, "budget": map[string]any{"currency": bcur, "amountOriginal": ba, "rateToBase": br, "amountBase": bb}, "estimatedActuals": map[string]any{"currency": ecur, "amountOriginal": ea, "rateToBase": er, "amountBase": eb}, "varianceBase": variance, "installmentConfig": jsonMap(installment), "pricingConfig": pricingMap(pricing), "split": splits[id], "sortOrder": sort})
	}
	return out, rows.Err()
}

func (a *App) transactions(r *http.Request, budgetID int64) ([]map[string]any, error) {
	payments, err := a.transactionPayments(r, budgetID)
	if err != nil {
		return nil, err
	}
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
		txPayments := payments[id]
		if txPayments == nil {
			txPayments = []any{}
		}
		out = append(out, map[string]any{"id": id, "categoryId": nullableInt(catID), "paidByParticipantId": nullableInt(paidBy), "payments": txPayments, "category": nullableString(cat), "transactionDate": nullableDateOnly(date), "details": details, "currency": cur, "amountOriginal": amount, "rateToBase": rate, "amountBase": base, "pricingConfig": pricingMap(pricing), "referenceCurrency": nullableString(refCur), "referenceAmountOriginal": parseNullFloat(refAmt), "remark": nullableString(remark), "sortOrder": sort})
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
	return map[string]any{"periodAmounts": jsonArray(amounts), "periodLocked": jsonArray(locked), "periodProgress": jsonArray(progress), "periodRemarks": jsonArray(remarks), "updatedAt": nullableDateTime(updated)}, nil
}

func pricingMap(raw sql.NullString) map[string]any {
	out := jsonMap(raw)
	if len(out) == 0 {
		return map[string]any{"enabled": false, "unitPrice": nil, "quantity": nil, "totalAmount": nil}
	}
	return out
}
