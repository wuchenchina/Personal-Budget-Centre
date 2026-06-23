package app

import (
	"context"
	"database/sql"
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
	roleID, err := roleIDDB(r.Context(), a.db, enumString(stringValue(input["role"]), []string{"owner", "admin", "editor", "viewer", "auditor"}, "viewer"), "workspace")
	if err != nil {
		return err
	}
	userID := int64Value(input["userId"])
	if create {
		if err := a.db.QueryRowContext(r.Context(), "SELECT id FROM users WHERE email = ? LIMIT 1", normalizedEmail(input["email"])).Scan(&userID); err != nil {
			return apiError("USER_NOT_FOUND", "User was not found.", http.StatusNotFound)
		}
	}
	_, err = a.db.ExecContext(r.Context(), `INSERT INTO workspace_members (workspace_id, user_id, role_id, status, joined_at)
VALUES (?, ?, ?, 'active', UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), status = 'active'`, workspaceID, userID, roleID)
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
	_, err = a.db.ExecContext(r.Context(), "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", workspaceID, int64Value(input["userId"]))
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{}, http.StatusOK)
	return nil
}

func (a *App) workspaceMembers(ctx context.Context, workspaceID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT wm.id, wm.workspace_id, wm.user_id, u.email, u.display_name, r.role_key, wm.status, wm.joined_at
FROM workspace_members wm JOIN users u ON u.id = wm.user_id JOIN roles r ON r.id = wm.role_id
WHERE wm.workspace_id = ? ORDER BY wm.created_at ASC`, workspaceID)
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
