package app

import (
	"database/sql"
	"net/http"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) reconciliation(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	budgetID := queryInt(r, "budgetId")
	if err := a.requireBudgetRead(r, budgetID, s.UserID); err != nil {
		return err
	}
	rows, err := a.db.QueryContext(r.Context(), `SELECT vr.budget_id, vr.category_id, vr.label, bc.name,
vr.estimated_amount_base, vr.transaction_total_base, vr.difference_base
FROM v_budget_reconciliation vr
LEFT JOIN budget_categories bc ON bc.id = vr.category_id
WHERE vr.budget_id = ?
ORDER BY ABS(vr.difference_base) DESC, vr.label ASC`, budgetID)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var bid int64
		var categoryID sql.NullInt64
		var label string
		var category sql.NullString
		var estimated, transactionTotal, difference float64
		if err := rows.Scan(&bid, &categoryID, &label, &category, &estimated, &transactionTotal, &difference); err != nil {
			return err
		}
		out = append(out, map[string]any{
			"budgetId":             bid,
			"categoryId":           nullableInt(categoryID),
			"category":             nullableString(category),
			"label":                label,
			"estimatedAmountBase":  estimated,
			"transactionTotalBase": transactionTotal,
			"differenceBase":       difference,
		})
	}
	if err := rows.Err(); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"reconciliation": out}, http.StatusOK)
	return nil
}
