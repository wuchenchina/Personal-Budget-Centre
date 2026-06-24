package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) workspaceMemberList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	workspaceID := queryInt(r, "workspaceId")
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor", "viewer", "auditor"); err != nil {
		return err
	}
	members, err := a.workspaceMembers(r.Context(), workspaceID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"members": members}, http.StatusOK)
	return nil
}

func (a *App) workspaceMemberCreate(w http.ResponseWriter, r *http.Request) error {
	return a.workspaceMemberUpsert(w, r, true)
}

func (a *App) workspaceMemberUpdate(w http.ResponseWriter, r *http.Request) error {
	return a.workspaceMemberUpsert(w, r, false)
}

func (a *App) workspaceMemberUpsert(w http.ResponseWriter, r *http.Request, create bool) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	workspaceID := int64Value(input["workspaceId"])
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin"); err != nil {
		return err
	}
	role := stringDefault(stringValue(input["role"]), "viewer")
	if !assignableWorkspaceRole(role) {
		return apiError("VALIDATION_ERROR", "Workspace role must be admin, editor, viewer, or auditor.", http.StatusUnprocessableEntity)
	}
	roleID, err := roleIDDB(r.Context(), a.db, role, "workspace")
	if err != nil {
		return err
	}
	userID := int64Value(input["userId"])
	if create {
		if err := a.db.QueryRowContext(r.Context(), "SELECT id FROM users WHERE email = ? AND status = 'active' LIMIT 1", normalizedEmail(input["email"])).Scan(&userID); err != nil {
			return apiError("USER_NOT_FOUND", "User was not found.", http.StatusNotFound)
		}
	}
	if err := a.assertCanMutateWorkspaceMember(r.Context(), workspaceID, s.UserID, userID, !create); err != nil {
		return err
	}
	_, err = a.db.ExecContext(r.Context(), `INSERT INTO workspace_members (workspace_id, user_id, role_id, status, joined_at)
VALUES (?, ?, ?, 'active', UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), status = 'active', joined_at = COALESCE(workspace_members.joined_at, UTC_TIMESTAMP())`, workspaceID, userID, roleID)
	if err != nil {
		return err
	}
	members, err := a.workspaceMembers(r.Context(), workspaceID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"members": members, "member": firstMember(members, userID)}, http.StatusOK)
	return nil
}

func (a *App) workspaceMemberDelete(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	workspaceID := int64Value(input["workspaceId"])
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin"); err != nil {
		return err
	}
	userID := int64Value(input["userId"])
	if err := a.assertCanMutateWorkspaceMember(r.Context(), workspaceID, s.UserID, userID, true); err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(r.Context(), `DELETE wgm
FROM workgroup_members wgm
INNER JOIN workgroups wg ON wg.id = wgm.workgroup_id
WHERE wg.workspace_id = ? AND wgm.user_id = ?`, workspaceID, userID); err != nil {
		return err
	}
	res, err := tx.ExecContext(r.Context(), "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", workspaceID, userID)
	if err != nil {
		return err
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return apiError("MEMBER_NOT_FOUND", "Workspace member was not found.", http.StatusNotFound)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{}, http.StatusOK)
	return nil
}

func (a *App) workspaceMembers(ctx context.Context, workspaceID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT wm.id, wm.workspace_id, wm.user_id, u.email, u.display_name, r.role_key, wm.status, wm.joined_at
FROM workspace_members wm JOIN users u ON u.id = wm.user_id JOIN roles r ON r.id = wm.role_id
WHERE wm.workspace_id = ? AND wm.status = 'active'
ORDER BY FIELD(r.role_key, 'owner', 'admin', 'editor', 'auditor', 'viewer'), u.display_name ASC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	members := []map[string]any{}
	for rows.Next() {
		var id, wsID, userID int64
		var email, displayName, role, status string
		var joined sql.NullString
		if err := rows.Scan(&id, &wsID, &userID, &email, &displayName, &role, &status, &joined); err != nil {
			return nil, err
		}
		members = append(members, map[string]any{"id": id, "workspaceId": wsID, "userId": userID, "email": email, "displayName": displayName, "role": role, "status": status, "joinedAt": nullableString(joined)})
	}
	return members, rows.Err()
}

func roleIDDB(ctx context.Context, db *sql.DB, key, scope string) (int64, error) {
	return roleID(ctx, db, key, scope)
}

func firstMember(members []map[string]any, userID int64) map[string]any {
	for _, member := range members {
		if member["userId"] == userID || strconv.FormatInt(member["userId"].(int64), 10) == strconv.FormatInt(userID, 10) {
			return member
		}
	}
	return nil
}

func assignableWorkspaceRole(role string) bool {
	return role == "admin" || role == "editor" || role == "viewer" || role == "auditor"
}

func (a *App) assertCanMutateWorkspaceMember(ctx context.Context, workspaceID, actorUserID, targetUserID int64, requireExisting bool) error {
	if targetUserID <= 0 {
		return apiError("VALIDATION_ERROR", "workspaceId and userId are required.", http.StatusUnprocessableEntity)
	}
	if actorUserID == targetUserID {
		return apiError("VALIDATION_ERROR", "You cannot change your own workspace membership.", http.StatusUnprocessableEntity)
	}
	role, err := a.workspaceRoleForUser(ctx, workspaceID, targetUserID)
	if err != nil {
		if !requireExisting && errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if errors.Is(err, sql.ErrNoRows) {
			return apiError("MEMBER_NOT_FOUND", "Workspace member was not found.", http.StatusNotFound)
		}
		return err
	}
	if role == "owner" {
		return apiError("FORBIDDEN", "Workspace owner membership cannot be changed here.", http.StatusForbidden)
	}
	return nil
}

func (a *App) workspaceRoleForUser(ctx context.Context, workspaceID, userID int64) (string, error) {
	var role string
	err := a.db.QueryRowContext(ctx, `SELECT r.role_key
FROM workspace_members wm
JOIN roles r ON r.id = wm.role_id
WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'active'
LIMIT 1`, workspaceID, userID).Scan(&role)
	return role, err
}
