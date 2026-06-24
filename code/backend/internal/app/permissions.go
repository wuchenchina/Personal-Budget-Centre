package app

import (
	"context"
	"database/sql"
	"net/http"
)

type budgetAccess struct {
	BudgetID        int64
	WorkspaceID     int64
	UserID          int64
	OwnerUserID     int64
	CreatedByUserID int64
	Visibility      string
	WorkspaceRole   sql.NullString
	ShareRole       sql.NullString
	ShareCanExport  bool
	ShareCanReshare bool
	EffectiveRole   sql.NullString
}

func (a *App) budgetAccess(ctx context.Context, budgetID, userID int64) (budgetAccess, error) {
	var access budgetAccess
	err := a.db.QueryRowContext(ctx, `
SELECT b.id, b.workspace_id, b.user_id, b.owner_user_id, b.created_by_user_id, b.visibility
FROM budgets b
WHERE b.id = ?
LIMIT 1`, budgetID).Scan(&access.BudgetID, &access.WorkspaceID, &access.UserID, &access.OwnerUserID, &access.CreatedByUserID, &access.Visibility)
	if err != nil {
		return budgetAccess{}, apiError("BUDGET_NOT_FOUND", "Budget was not found.", http.StatusNotFound)
	}

	_ = a.db.QueryRowContext(ctx, `
SELECT r.role_key
FROM workspace_members wm
JOIN roles r ON r.id = wm.role_id
WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'active'
LIMIT 1`, access.WorkspaceID, userID).Scan(&access.WorkspaceRole)

	share, err := a.effectiveBudgetShare(ctx, budgetID, access.WorkspaceID, userID)
	if err != nil {
		return budgetAccess{}, err
	}
	if share != nil {
		access.ShareRole = sql.NullString{String: share.Role, Valid: true}
		access.ShareCanExport = share.CanExport
		access.ShareCanReshare = share.CanReshare
	}
	access.EffectiveRole = effectiveBudgetRole(access, userID)
	return access, nil
}

type effectiveShare struct {
	Role       string
	CanExport  bool
	CanReshare bool
}

func (a *App) effectiveBudgetShare(ctx context.Context, budgetID, workspaceID, userID int64) (*effectiveShare, error) {
	var share effectiveShare
	err := a.db.QueryRowContext(ctx, `
SELECT r.role_key, bs.can_export, bs.can_reshare
FROM budget_shares bs
JOIN roles r ON r.id = bs.role_id
LEFT JOIN workgroups wg ON bs.principal_type = 'workgroup' AND wg.id = bs.principal_id
LEFT JOIN workgroup_members wgm ON wgm.workgroup_id = wg.id AND wgm.user_id = ?
WHERE bs.budget_id = ?
  AND (bs.expires_at IS NULL OR bs.expires_at > UTC_TIMESTAMP())
  AND (
    (bs.principal_type = 'workspace' AND bs.principal_id = ?)
    OR (bs.principal_type = 'user' AND bs.principal_id = ?)
    OR (
      bs.principal_type = 'workgroup'
      AND wg.workspace_id = ?
      AND wgm.user_id IS NOT NULL
    )
  )
ORDER BY FIELD(r.role_key, 'owner', 'editor', 'viewer', 'auditor'), bs.can_reshare DESC, bs.can_export DESC
LIMIT 1`, userID, budgetID, workspaceID, userID, workspaceID).Scan(&share.Role, &share.CanExport, &share.CanReshare)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &share, nil
}

func effectiveBudgetRole(access budgetAccess, userID int64) sql.NullString {
	if access.WorkspaceRole.Valid && (access.WorkspaceRole.String == "owner" || access.WorkspaceRole.String == "admin") {
		return access.WorkspaceRole
	}
	if access.UserID == userID || access.OwnerUserID == userID || access.CreatedByUserID == userID {
		return sql.NullString{String: "owner", Valid: true}
	}
	if access.Visibility == "workspace" && access.WorkspaceRole.Valid && roleAllowed(access.WorkspaceRole.String, "owner", "admin", "editor") {
		return access.WorkspaceRole
	}
	if access.ShareRole.Valid {
		return access.ShareRole
	}
	if access.Visibility == "workspace" && access.WorkspaceRole.Valid {
		return access.WorkspaceRole
	}
	return sql.NullString{}
}

func roleAllowed(role string, allowed ...string) bool {
	for _, item := range allowed {
		if role == item {
			return true
		}
	}
	return false
}

func (a *App) requireBudgetRead(r *http.Request, budgetID, userID int64) error {
	access, err := a.budgetAccess(r.Context(), budgetID, userID)
	if err != nil {
		return err
	}
	if !access.EffectiveRole.Valid {
		return apiError("FORBIDDEN", "Budget access is required.", http.StatusForbidden)
	}
	return nil
}

func (a *App) requireBudgetWrite(r *http.Request, budgetID, userID int64) error {
	access, err := a.budgetAccess(r.Context(), budgetID, userID)
	if err != nil {
		return err
	}
	if !access.EffectiveRole.Valid || !roleAllowed(access.EffectiveRole.String, "owner", "admin", "editor") {
		return apiError("FORBIDDEN", "You do not have permission for this budget.", http.StatusForbidden)
	}
	return nil
}

func (a *App) requireBudgetExport(r *http.Request, budgetID, userID int64) error {
	access, err := a.budgetAccess(r.Context(), budgetID, userID)
	if err != nil {
		return err
	}
	if !access.EffectiveRole.Valid {
		return apiError("FORBIDDEN", "Budget access is required.", http.StatusForbidden)
	}
	if roleAllowed(access.EffectiveRole.String, "owner", "admin", "editor") {
		return nil
	}
	if access.ShareRole.Valid && access.ShareCanExport {
		return nil
	}
	return apiError("FORBIDDEN", "You do not have permission to export this budget.", http.StatusForbidden)
}

func (a *App) requireBudgetManage(r *http.Request, budgetID, userID int64) (int64, error) {
	access, err := a.budgetAccess(r.Context(), budgetID, userID)
	if err != nil {
		return 0, err
	}
	if !access.EffectiveRole.Valid || !roleAllowed(access.EffectiveRole.String, "owner", "admin") {
		return 0, apiError("FORBIDDEN", "You do not have permission for this budget.", http.StatusForbidden)
	}
	return access.WorkspaceID, nil
}

func (a *App) budgetWorkspaceID(ctx context.Context, budgetID int64) (int64, error) {
	var workspaceID int64
	if err := a.db.QueryRowContext(ctx, "SELECT workspace_id FROM budgets WHERE id = ? LIMIT 1", budgetID).Scan(&workspaceID); err != nil {
		return 0, apiError("BUDGET_NOT_FOUND", "Budget was not found.", http.StatusNotFound)
	}
	return workspaceID, nil
}
