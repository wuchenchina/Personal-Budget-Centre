package app

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) categoryCreate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	workspaceID := int64Value(input["workspaceId"])
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	name, err := requiredLimitedString(input["name"], 160, "Category name")
	if err != nil {
		return err
	}
	currencyID, err := a.optionalCurrencyID(r.Context(), input["defaultCurrency"])
	if err != nil {
		return err
	}
	existingID, err := a.categoryIDByName(r.Context(), workspaceID, name)
	if err != nil {
		return err
	}
	if existingID.Valid {
		_, err = a.db.ExecContext(r.Context(), `UPDATE budget_categories
SET name = ?, default_currency_id = ?, sort_order = ?, is_preset = 1, is_active = 1
WHERE id = ?`, name, nullableInt(currencyID), int64Value(input["sortOrder"]), existingID.Int64)
	} else {
		_, err = a.db.ExecContext(r.Context(), `INSERT INTO budget_categories
(workspace_id, user_id, name, default_currency_id, sort_order, is_preset)
VALUES (?, ?, ?, ?, ?, 1)`, workspaceID, s.UserID, name, nullableInt(currencyID), int64Value(input["sortOrder"]))
	}
	if err != nil {
		return err
	}
	return a.writeCategoryList(w, r, workspaceID)
}

func (a *App) categoryUpdate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	workspaceID, err := a.categoryWorkspaceID(r.Context(), id)
	if err != nil {
		return err
	}
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	name, err := requiredLimitedString(input["name"], 160, "Category name")
	if err != nil {
		return err
	}
	currencyID, err := a.optionalCurrencyID(r.Context(), input["defaultCurrency"])
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(r.Context(), `UPDATE budget_categories
SET name = ?, default_currency_id = ?, sort_order = ?, is_active = ?
WHERE id = ?`, name, nullableInt(currencyID), int64Value(input["sortOrder"]), boolInt(boolDefault(input["isActive"], true)), id)
	if err != nil {
		return err
	}
	return a.writeCategoryList(w, r, workspaceID)
}

func (a *App) categoryDelete(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	ids := int64List(input["ids"])
	if id := int64Value(input["id"]); id > 0 {
		ids = append(ids, id)
	}
	ids = uniquePositiveInt64(ids)
	if len(ids) == 0 {
		return apiError("VALIDATION_ERROR", "Category id is required.", http.StatusUnprocessableEntity)
	}
	workspaceID, err := a.categoryWorkspaceID(r.Context(), ids[0])
	if err != nil {
		return err
	}
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	for _, id := range ids[1:] {
		next, err := a.categoryWorkspaceID(r.Context(), id)
		if err != nil || next != workspaceID {
			return apiError("CATEGORY_NOT_FOUND", "Category was not found.", http.StatusNotFound)
		}
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM budget_categories WHERE id IN ("+placeholders(len(ids))+")", anySlice(ids)...); err != nil {
		return err
	}
	return a.writeCategoryList(w, r, workspaceID)
}

func (a *App) categoryAliasCreate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	workspaceID := int64Value(input["workspaceId"])
	categoryID := int64Value(input["categoryId"])
	if categoryID <= 0 || workspaceID <= 0 {
		return apiError("VALIDATION_ERROR", "Workspace and category are required.", http.StatusUnprocessableEntity)
	}
	categoryWorkspaceID, err := a.categoryWorkspaceID(r.Context(), categoryID)
	if err != nil || categoryWorkspaceID != workspaceID {
		return apiError("CATEGORY_NOT_FOUND", "Category was not found.", http.StatusNotFound)
	}
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	alias, err := requiredLimitedString(input["alias"], 160, "Alias")
	if err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), `INSERT INTO budget_category_aliases
(workspace_id, user_id, category_id, alias) VALUES (?, ?, ?, ?)`, workspaceID, s.UserID, categoryID, alias); err != nil {
		return err
	}
	return a.writeCategoryList(w, r, workspaceID)
}

func (a *App) categoryAliasDelete(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	workspaceID, err := a.aliasWorkspaceID(r.Context(), id)
	if err != nil {
		return err
	}
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM budget_category_aliases WHERE id = ?", id); err != nil {
		return err
	}
	return a.writeCategoryList(w, r, workspaceID)
}

func (a *App) writeCategoryList(w http.ResponseWriter, r *http.Request, workspaceID int64) error {
	categories, err := a.categoriesForWorkspace(r.Context(), workspaceID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"categories": categories}, http.StatusOK)
	return nil
}

func (a *App) categoriesForWorkspace(ctx context.Context, workspaceID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT bc.id, bc.workspace_id, bc.name, bc.parent_id, c.code, bc.sort_order, bc.is_preset, bc.is_active
FROM budget_categories bc LEFT JOIN currencies c ON c.id = bc.default_currency_id
WHERE bc.workspace_id = ? AND bc.is_preset = 1
ORDER BY bc.sort_order ASC, bc.name ASC, bc.id ASC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cats := []map[string]any{}
	for rows.Next() {
		var id, ws, sort int64
		var parent sql.NullInt64
		var name string
		var cur sql.NullString
		var preset, active bool
		if err := rows.Scan(&id, &ws, &name, &parent, &cur, &sort, &preset, &active); err != nil {
			return nil, err
		}
		cats = append(cats, map[string]any{"id": id, "workspaceId": ws, "name": name, "parentId": nullableInt(parent), "defaultCurrency": nullableString(cur), "sortOrder": sort, "isPreset": preset, "isActive": active, "aliases": []any{}})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	aliases, err := a.categoryAliases(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	for _, cat := range cats {
		id := cat["id"].(int64)
		if list, ok := aliases[id]; ok {
			cat["aliases"] = list
		}
	}
	return cats, nil
}

func (a *App) categoryAliases(ctx context.Context, workspaceID int64) (map[int64][]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT id, category_id, alias, created_at
FROM budget_category_aliases WHERE workspace_id = ? ORDER BY alias ASC, id ASC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]map[string]any{}
	for rows.Next() {
		var id, categoryID int64
		var alias, created string
		if err := rows.Scan(&id, &categoryID, &alias, &created); err != nil {
			return nil, err
		}
		out[categoryID] = append(out[categoryID], map[string]any{"id": id, "categoryId": categoryID, "alias": alias, "createdAt": dateTimeValue(created)})
	}
	return out, rows.Err()
}

func (a *App) categoryWorkspaceID(ctx context.Context, id int64) (int64, error) {
	var workspaceID int64
	if err := a.db.QueryRowContext(ctx, "SELECT workspace_id FROM budget_categories WHERE id = ? LIMIT 1", id).Scan(&workspaceID); err != nil {
		return 0, apiError("CATEGORY_NOT_FOUND", "Category was not found.", http.StatusNotFound)
	}
	return workspaceID, nil
}

func (a *App) aliasWorkspaceID(ctx context.Context, id int64) (int64, error) {
	var workspaceID int64
	if err := a.db.QueryRowContext(ctx, "SELECT workspace_id FROM budget_category_aliases WHERE id = ? LIMIT 1", id).Scan(&workspaceID); err != nil {
		return 0, apiError("ALIAS_NOT_FOUND", "Category alias was not found.", http.StatusNotFound)
	}
	return workspaceID, nil
}

func (a *App) categoryIDByName(ctx context.Context, workspaceID int64, name string) (sql.NullInt64, error) {
	var id int64
	err := a.db.QueryRowContext(ctx, `SELECT id FROM budget_categories
WHERE workspace_id = ? AND LOWER(name) = ? LIMIT 1`, workspaceID, strings.ToLower(name)).Scan(&id)
	if err == sql.ErrNoRows {
		return sql.NullInt64{}, nil
	}
	return sql.NullInt64{Int64: id, Valid: true}, err
}
