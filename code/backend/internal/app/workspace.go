package app

import (
	"context"
	"database/sql"
	"net/http"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) firstWorkspace(ctx context.Context, userID int64) (sql.NullInt64, error) {
	var id int64
	err := a.db.QueryRowContext(ctx, `
SELECT w.id FROM workspace_members wm
JOIN workspaces w ON w.id = wm.workspace_id
WHERE wm.user_id = ? AND wm.status = 'active'
ORDER BY w.created_at ASC LIMIT 1`, userID).Scan(&id)
	if err == sql.ErrNoRows {
		return sql.NullInt64{}, nil
	}
	return sql.NullInt64{Int64: id, Valid: true}, err
}

func firstWorkspaceTx(ctx context.Context, tx *sql.Tx, userID int64) (sql.NullInt64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `
SELECT w.id FROM workspace_members wm
JOIN workspaces w ON w.id = wm.workspace_id
WHERE wm.user_id = ? AND wm.status = 'active'
ORDER BY w.created_at ASC LIMIT 1`, userID).Scan(&id)
	if err == sql.ErrNoRows {
		return sql.NullInt64{}, nil
	}
	return sql.NullInt64{Int64: id, Valid: true}, err
}

func (a *App) sessionWorkspace(ctx context.Context, s *session) (map[string]any, error) {
	if s.CurrentWorkspace.Valid {
		if ws, err := a.workspaceForUser(ctx, s.CurrentWorkspace.Int64, s.UserID); err == nil && ws != nil {
			return ws, nil
		}
	}
	first, err := a.firstWorkspace(ctx, s.UserID)
	if err != nil || !first.Valid {
		return nil, err
	}
	return a.workspaceForUser(ctx, first.Int64, s.UserID)
}

func (a *App) workspaceForUser(ctx context.Context, workspaceID, userID int64) (map[string]any, error) {
	row := a.db.QueryRowContext(ctx, `
SELECT w.id, w.name, w.type, wm.status, r.role_key, c.code
FROM workspace_members wm
JOIN workspaces w ON w.id = wm.workspace_id
JOIN roles r ON r.id = wm.role_id
LEFT JOIN currencies c ON c.id = w.default_currency_id
WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'active'
LIMIT 1`, workspaceID, userID)
	var id int64
	var name, typ, status, role string
	var currency sql.NullString
	if err := row.Scan(&id, &name, &typ, &status, &role, &currency); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return map[string]any{"id": id, "name": name, "type": typ, "role": role, "status": status, "defaultCurrency": nullableString(currency)}, nil
}

func (a *App) workspaceList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	rows, err := a.db.QueryContext(r.Context(), `
SELECT w.id, w.name, w.type, wm.status, r.role_key, c.code
FROM workspace_members wm
JOIN workspaces w ON w.id = wm.workspace_id
JOIN roles r ON r.id = wm.role_id
LEFT JOIN currencies c ON c.id = w.default_currency_id
WHERE wm.user_id = ? AND wm.status = 'active'
ORDER BY w.created_at ASC`, s.UserID)
	if err != nil {
		return err
	}
	defer rows.Close()
	workspaces := []map[string]any{}
	for rows.Next() {
		var id int64
		var name, typ, status, role string
		var currency sql.NullString
		if err := rows.Scan(&id, &name, &typ, &status, &role, &currency); err != nil {
			return err
		}
		workspaces = append(workspaces, map[string]any{"id": id, "name": name, "type": typ, "role": role, "status": status, "defaultCurrency": nullableString(currency)})
	}
	httpx.WriteOK(w, map[string]any{"workspaces": workspaces}, http.StatusOK)
	return rows.Err()
}

func (a *App) workspaceCreate(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	name := nonEmptyString(input["name"])
	if name == "" || len(name) > 160 {
		return apiError("VALIDATION_ERROR", "Workspace name is required and must be 160 characters or less.", http.StatusUnprocessableEntity)
	}
	typ := stringDefault(stringValue(input["type"]), "team")
	if !roleAllowed(typ, "family", "team", "custom") {
		return apiError("VALIDATION_ERROR", "Workspace type must be family, team, or custom.", http.StatusUnprocessableEntity)
	}
	currencyID, err := a.optionalCurrencyID(r.Context(), firstValue(input, "defaultCurrency", "default_currency"))
	if err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	id, err := a.createWorkspaceTx(r.Context(), tx, s.UserID, name, typ, currencyID)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	ws, err := a.workspaceForUser(r.Context(), id, s.UserID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"workspace": ws}, http.StatusOK)
	return nil
}

func (a *App) createWorkspaceTx(ctx context.Context, tx *sql.Tx, userID int64, name, typ string, currencyID sql.NullInt64) (int64, error) {
	ownerRoleID, err := roleID(ctx, tx, "owner", "workspace")
	if err != nil {
		return 0, err
	}
	res, err := tx.ExecContext(ctx, "INSERT INTO workspaces (owner_user_id, name, type, default_currency_id) VALUES (?, ?, ?, ?)", userID, name, typ, nullableInt(currencyID))
	if err != nil {
		return 0, err
	}
	workspaceID, _ := res.LastInsertId()
	_, err = tx.ExecContext(ctx, "INSERT INTO workspace_members (workspace_id, user_id, role_id, status, joined_at) VALUES (?, ?, ?, 'active', UTC_TIMESTAMP())", workspaceID, userID, ownerRoleID)
	return workspaceID, err
}

func (a *App) workspaceUpdate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["workspaceId"])
	if err := a.requireWorkspaceRole(r.Context(), id, s.UserID, "owner", "admin"); err != nil {
		return err
	}
	current, err := a.workspaceForUser(r.Context(), id, s.UserID)
	if err != nil {
		return err
	}
	if current == nil {
		return apiError("WORKSPACE_NOT_FOUND", "Workspace was not found.", http.StatusNotFound)
	}
	name := nonEmptyString(input["name"])
	if name == "" || len(name) > 160 {
		return apiError("VALIDATION_ERROR", "Workspace name is required and must be 160 characters or less.", http.StatusUnprocessableEntity)
	}
	typ := stringValue(input["type"])
	if !roleAllowed(typ, "personal", "family", "team", "custom") {
		return apiError("VALIDATION_ERROR", "Workspace type is invalid.", http.StatusUnprocessableEntity)
	}
	currentType := stringValue(current["type"])
	if currentType == "personal" && typ != "personal" {
		return apiError("VALIDATION_ERROR", "Personal workspace type cannot be changed.", http.StatusUnprocessableEntity)
	}
	if currentType != "personal" && typ == "personal" {
		return apiError("VALIDATION_ERROR", "Only the system can create personal workspaces.", http.StatusUnprocessableEntity)
	}
	if currentType == "personal" && current["role"] != "owner" {
		return apiError("FORBIDDEN", "Only the owner can update a personal workspace.", http.StatusForbidden)
	}
	currencyID, err := a.optionalCurrencyID(r.Context(), firstValue(input, "defaultCurrency", "default_currency"))
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(r.Context(), "UPDATE workspaces SET name = ?, type = ?, default_currency_id = ? WHERE id = ?", name, typ, nullableInt(currencyID), id)
	if err != nil {
		return err
	}
	ws, err := a.workspaceForUser(r.Context(), id, s.UserID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"workspace": ws}, http.StatusOK)
	return nil
}

func (a *App) workspaceDelete(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["workspaceId"])
	if err := a.requireWorkspaceRole(r.Context(), id, s.UserID, "owner"); err != nil {
		return err
	}
	current, err := a.workspaceForUser(r.Context(), id, s.UserID)
	if err != nil {
		return err
	}
	if current == nil {
		return apiError("WORKSPACE_NOT_FOUND", "Workspace was not found.", http.StatusNotFound)
	}
	if current["type"] == "personal" {
		return apiError("VALIDATION_ERROR", "Personal workspace cannot be deleted.", http.StatusUnprocessableEntity)
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), "DELETE FROM workspaces WHERE id = ? AND owner_user_id = ?", id, s.UserID); err != nil {
		return err
	}
	nextWorkspace, err := firstWorkspaceTx(r.Context(), tx, s.UserID)
	if err != nil {
		return err
	}
	if nextWorkspace.Valid {
		_, err = tx.ExecContext(r.Context(), "UPDATE user_sessions SET current_workspace_id = ? WHERE session_token_hash = ?", nextWorkspace.Int64, s.TokenHash)
	} else {
		_, err = tx.ExecContext(r.Context(), "UPDATE user_sessions SET current_workspace_id = NULL WHERE session_token_hash = ?", s.TokenHash)
	}
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	var workspace map[string]any
	if nextWorkspace.Valid {
		workspace, err = a.workspaceForUser(r.Context(), nextWorkspace.Int64, s.UserID)
		if err != nil {
			return err
		}
	}
	httpx.WriteOK(w, map[string]any{"workspace": workspace}, http.StatusOK)
	return nil
}

func (a *App) workspaceSwitch(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["workspaceId"])
	ws, err := a.workspaceForUser(r.Context(), id, s.UserID)
	if err != nil {
		return err
	}
	if ws == nil {
		return apiError("WORKSPACE_NOT_FOUND", "Workspace was not found.", http.StatusNotFound)
	}
	_, err = a.db.ExecContext(r.Context(), "UPDATE user_sessions SET current_workspace_id = ? WHERE session_token_hash = ?", id, s.TokenHash)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"workspace": ws}, http.StatusOK)
	return nil
}

func (a *App) requireWorkspaceRole(ctx context.Context, workspaceID, userID int64, allowed ...string) error {
	var role string
	err := a.db.QueryRowContext(ctx, `SELECT r.role_key FROM workspace_members wm JOIN roles r ON r.id = wm.role_id
WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'active' LIMIT 1`, workspaceID, userID).Scan(&role)
	if err != nil {
		return apiError("FORBIDDEN", "Workspace access is required.", http.StatusForbidden)
	}
	for _, item := range allowed {
		if role == item {
			return nil
		}
	}
	return apiError("FORBIDDEN", "Workspace permission is required.", http.StatusForbidden)
}

func (a *App) sessionInput(r *http.Request) (*session, map[string]any, error) {
	s, err := a.currentSession(r)
	if err != nil {
		return nil, nil, err
	}
	input, err := readJSON(r)
	return s, input, err
}
