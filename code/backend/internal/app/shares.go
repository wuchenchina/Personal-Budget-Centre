package app

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"budgetcentre/backend/internal/httpx"
)

type budgetShare struct {
	ID              int64
	BudgetID        int64
	PrincipalType   string
	PrincipalID     int64
	CanExport       bool
	CanReshare      bool
	ExpiresAt       sql.NullString
	CreatedByUserID int64
	CreatedAt       string
	UpdatedAt       string
	Role            string
	PrincipalEmail  sql.NullString
	UserName        sql.NullString
	WorkgroupName   sql.NullString
	WorkspaceName   sql.NullString
	CreatedByName   sql.NullString
}

func (a *App) shareList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	budgetID := queryInt(r, "budgetId")
	if _, err := a.requireBudgetManage(r, budgetID, s.UserID); err != nil {
		return err
	}
	shares, err := a.sharesForBudget(r.Context(), budgetID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"shares": shares}, http.StatusOK)
	return nil
}

func (a *App) shareCreate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	budgetID := int64Value(input["budgetId"])
	workspaceID, err := a.requireBudgetManage(r, budgetID, s.UserID)
	if err != nil {
		return err
	}
	principalType := enumString(stringValue(input["principalType"]), []string{"user", "workgroup", "workspace"}, "")
	if principalType == "" {
		return apiError("VALIDATION_ERROR", "Principal type must be user, workgroup, or workspace.", http.StatusUnprocessableEntity)
	}
	principalID, err := a.validSharePrincipalID(r.Context(), principalType, workspaceID, input)
	if err != nil {
		return err
	}
	roleID, err := roleIDDB(r.Context(), a.db, shareRole(input["role"]), "budget")
	if err != nil {
		return err
	}
	expiresAt, err := expiresAtValue(input["expiresAt"])
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(r.Context(), `INSERT INTO budget_shares
(budget_id, principal_type, principal_id, role_id, can_export, can_reshare, expires_at, created_by_user_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), can_export = VALUES(can_export), can_reshare = VALUES(can_reshare), expires_at = VALUES(expires_at), updated_at = UTC_TIMESTAMP()`,
		budgetID, principalType, principalID, roleID, boolInt(boolValue(input["canExport"])), boolInt(boolValue(input["canReshare"])), expiresAt, s.UserID)
	if err != nil {
		return err
	}
	return a.writeShareList(w, r, budgetID)
}

func (a *App) shareUpdate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	share, err := a.shareByID(r.Context(), int64Value(input["id"]))
	if err != nil {
		return err
	}
	if _, err := a.requireBudgetManage(r, share.BudgetID, s.UserID); err != nil {
		return err
	}
	roleID, err := roleIDDB(r.Context(), a.db, shareRole(input["role"]), "budget")
	if err != nil {
		return err
	}
	expiresAt, err := expiresAtValue(input["expiresAt"])
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(r.Context(), `UPDATE budget_shares
SET role_id = ?, can_export = ?, can_reshare = ?, expires_at = ?
WHERE id = ?`, roleID, boolInt(boolValue(input["canExport"])), boolInt(boolValue(input["canReshare"])), expiresAt, share.ID)
	if err != nil {
		return err
	}
	return a.writeShareList(w, r, share.BudgetID)
}

func (a *App) shareDelete(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	share, err := a.shareByID(r.Context(), int64Value(input["id"]))
	if err != nil {
		return err
	}
	if _, err := a.requireBudgetManage(r, share.BudgetID, s.UserID); err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM budget_shares WHERE id = ?", share.ID); err != nil {
		return err
	}
	return a.writeShareList(w, r, share.BudgetID)
}

func (a *App) writeShareList(w http.ResponseWriter, r *http.Request, budgetID int64) error {
	shares, err := a.sharesForBudget(r.Context(), budgetID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"shares": shares}, http.StatusOK)
	return nil
}

func (a *App) validSharePrincipalID(ctx context.Context, principalType string, workspaceID int64, input map[string]any) (int64, error) {
	principalID := int64Value(input["principalId"])
	switch principalType {
	case "workspace":
		if principalID > 0 && principalID != workspaceID {
			return 0, apiError("VALIDATION_ERROR", "Workspace share must target the current workspace.", http.StatusUnprocessableEntity)
		}
		return workspaceID, nil
	case "user":
		if principalID > 0 {
			var count int
			err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND status = 'active'", workspaceID, principalID).Scan(&count)
			if err != nil {
				return 0, err
			}
			if count == 0 {
				return 0, apiError("PRINCIPAL_NOT_FOUND", "User is not an active workspace member.", http.StatusNotFound)
			}
			return principalID, nil
		}
		identifier := stringValue(input["principalIdentifier"])
		if identifier == "" {
			return 0, apiError("VALIDATION_ERROR", "User id, username, or email is required.", http.StatusUnprocessableEntity)
		}
		var userID int64
		err := a.db.QueryRowContext(ctx, `SELECT id FROM users
WHERE status = 'active' AND (email = ? OR username = ?) LIMIT 1`, strings.ToLower(identifier), identifier).Scan(&userID)
		if err != nil {
			return 0, apiError("PRINCIPAL_NOT_FOUND", "User was not found or is not active.", http.StatusNotFound)
		}
		return userID, nil
	case "workgroup":
		if principalID <= 0 {
			return 0, apiError("VALIDATION_ERROR", "Principal id is required.", http.StatusUnprocessableEntity)
		}
		var groupWorkspaceID int64
		err := a.db.QueryRowContext(ctx, "SELECT workspace_id FROM workgroups WHERE id = ? LIMIT 1", principalID).Scan(&groupWorkspaceID)
		if err != nil || groupWorkspaceID != workspaceID {
			return 0, apiError("PRINCIPAL_NOT_FOUND", "Workgroup was not found in this workspace.", http.StatusNotFound)
		}
		return principalID, nil
	default:
		return 0, apiError("VALIDATION_ERROR", "Principal type must be user, workgroup, or workspace.", http.StatusUnprocessableEntity)
	}
}

func (a *App) sharesForBudget(ctx context.Context, budgetID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, shareSelectSQL("WHERE bs.budget_id = ?")+`
ORDER BY FIELD(bs.principal_type, 'workspace', 'workgroup', 'user'), COALESCE(w.name, wg.name, u.display_name, u.email), bs.id`, budgetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		share, err := scanShare(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, share)
	}
	return out, rows.Err()
}

func (a *App) shareByID(ctx context.Context, id int64) (budgetShare, error) {
	share, err := scanShareStruct(a.db.QueryRowContext(ctx, shareSelectSQL("WHERE bs.id = ? LIMIT 1"), id))
	if err != nil {
		return budgetShare{}, apiError("BUDGET_SHARE_NOT_FOUND", "Budget share was not found.", http.StatusNotFound)
	}
	return share, nil
}

func scanShare(row rowScanner) (map[string]any, error) {
	share, err := scanShareStruct(row)
	if err != nil {
		return nil, err
	}
	return sharePayload(share), nil
}

func scanShareStruct(row rowScanner) (budgetShare, error) {
	var share budgetShare
	err := row.Scan(
		&share.ID, &share.BudgetID, &share.PrincipalType, &share.PrincipalID,
		&share.CanExport, &share.CanReshare, &share.ExpiresAt, &share.CreatedByUserID,
		&share.CreatedAt, &share.UpdatedAt, &share.Role, &share.PrincipalEmail,
		&share.UserName, &share.WorkgroupName, &share.WorkspaceName, &share.CreatedByName,
	)
	return share, err
}

func sharePayload(share budgetShare) map[string]any {
	return map[string]any{
		"id":              share.ID,
		"budgetId":        share.BudgetID,
		"principalType":   share.PrincipalType,
		"principalId":     share.PrincipalID,
		"principalName":   principalName(share),
		"principalEmail":  nullableString(share.PrincipalEmail),
		"role":            share.Role,
		"canExport":       share.CanExport,
		"canReshare":      share.CanReshare,
		"expiresAt":       nullableString(share.ExpiresAt),
		"createdByUserId": share.CreatedByUserID,
		"createdByName":   nullableString(share.CreatedByName),
		"createdAt":       share.CreatedAt,
		"updatedAt":       share.UpdatedAt,
	}
}

func principalName(share budgetShare) string {
	switch share.PrincipalType {
	case "workspace":
		return stringDefault(nullableStringToString(share.WorkspaceName), "Workspace")
	case "workgroup":
		return stringDefault(nullableStringToString(share.WorkgroupName), "Workgroup")
	case "user":
		return stringDefault(nullableStringToString(share.UserName), stringDefault(nullableStringToString(share.PrincipalEmail), "User"))
	default:
		return "Principal"
	}
}

func shareRole(value any) string {
	return enumString(stringValue(value), []string{"editor", "viewer", "auditor"}, "viewer")
}

func expiresAtValue(value any) (any, error) {
	text := stringValue(value)
	if text == "" {
		return nil, nil
	}
	if _, err := time.Parse("2006-01-02", text); err == nil {
		return text + " 23:59:59", nil
	}
	if _, err := time.Parse("2006-01-02 15:04:05", text); err == nil {
		return text, nil
	}
	return nil, apiError("VALIDATION_ERROR", "expiresAt must use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.", http.StatusUnprocessableEntity)
}

func nullableStringToString(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func shareSelectSQL(where string) string {
	return `SELECT bs.id, bs.budget_id, bs.principal_type, bs.principal_id,
bs.can_export, bs.can_reshare, bs.expires_at, bs.created_by_user_id,
bs.created_at, bs.updated_at, r.role_key, u.email, u.display_name, wg.name, w.name, creator.display_name
FROM budget_shares bs
JOIN roles r ON r.id = bs.role_id
LEFT JOIN users u ON bs.principal_type = 'user' AND u.id = bs.principal_id
LEFT JOIN workgroups wg ON bs.principal_type = 'workgroup' AND wg.id = bs.principal_id
LEFT JOIN workspaces w ON bs.principal_type = 'workspace' AND w.id = bs.principal_id
LEFT JOIN users creator ON creator.id = bs.created_by_user_id ` + where + ` `
}
