package app

import (
	"context"
	"database/sql"
	"net/http"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) workgroupList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	workspaceID := queryInt(r, "workspaceId")
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor", "viewer", "auditor"); err != nil {
		return err
	}
	groups, err := a.workgroupsForWorkspace(r.Context(), workspaceID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"workgroups": groups}, http.StatusOK)
	return nil
}

func (a *App) workgroupCreate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	workspaceID := int64Value(input["workspaceId"])
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	name, description, err := workgroupInput(input)
	if err != nil {
		return err
	}
	res, err := a.db.ExecContext(r.Context(), `INSERT INTO workgroups (workspace_id, name, description, created_by_user_id)
VALUES (?, ?, ?, ?)`, workspaceID, name, description, s.UserID)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	return a.writeWorkgroup(w, r, id)
}

func (a *App) workgroupUpdate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	workspaceID, err := a.workgroupWorkspaceID(r.Context(), id)
	if err != nil {
		return err
	}
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	name, description, err := workgroupInput(input)
	if err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "UPDATE workgroups SET name = ?, description = ? WHERE id = ?", name, description, id); err != nil {
		return err
	}
	return a.writeWorkgroup(w, r, id)
}

func (a *App) workgroupDelete(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	workspaceID, err := a.workgroupWorkspaceID(r.Context(), id)
	if err != nil {
		return err
	}
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM workgroups WHERE id = ?", id); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{}, http.StatusOK)
	return nil
}

func (a *App) writeWorkgroup(w http.ResponseWriter, r *http.Request, id int64) error {
	group, err := a.workgroupByID(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"workgroup": group}, http.StatusOK)
	return nil
}

func (a *App) workgroupsForWorkspace(ctx context.Context, workspaceID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT wg.id, wg.workspace_id, wg.name, wg.description, COUNT(wgm.id) AS member_count
FROM workgroups wg
LEFT JOIN workgroup_members wgm ON wgm.workgroup_id = wg.id
WHERE wg.workspace_id = ?
GROUP BY wg.id, wg.workspace_id, wg.name, wg.description
ORDER BY wg.name ASC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		group, err := scanWorkgroup(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, group)
	}
	return out, rows.Err()
}

func (a *App) workgroupByID(ctx context.Context, id int64) (map[string]any, error) {
	group, err := scanWorkgroup(a.db.QueryRowContext(ctx, `SELECT wg.id, wg.workspace_id, wg.name, wg.description, COUNT(wgm.id) AS member_count
FROM workgroups wg
LEFT JOIN workgroup_members wgm ON wgm.workgroup_id = wg.id
WHERE wg.id = ?
GROUP BY wg.id, wg.workspace_id, wg.name, wg.description
LIMIT 1`, id))
	if err != nil {
		return nil, apiError("WORKGROUP_NOT_FOUND", "Workgroup was not found.", http.StatusNotFound)
	}
	return group, nil
}

func scanWorkgroup(row rowScanner) (map[string]any, error) {
	var id, workspaceID, count int64
	var name string
	var description sql.NullString
	if err := row.Scan(&id, &workspaceID, &name, &description, &count); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "workspaceId": workspaceID, "name": name, "description": nullableString(description), "memberCount": count}, nil
}

func (a *App) workgroupWorkspaceID(ctx context.Context, id int64) (int64, error) {
	var workspaceID int64
	if err := a.db.QueryRowContext(ctx, "SELECT workspace_id FROM workgroups WHERE id = ? LIMIT 1", id).Scan(&workspaceID); err != nil {
		return 0, apiError("WORKGROUP_NOT_FOUND", "Workgroup was not found.", http.StatusNotFound)
	}
	return workspaceID, nil
}

func workgroupInput(input map[string]any) (string, any, error) {
	name, err := requiredLimitedString(input["name"], 160, "Workgroup name")
	if err != nil {
		return "", nil, err
	}
	description, err := optionalLimitedString(input["description"], 500, "Workgroup description")
	if err != nil {
		return "", nil, err
	}
	return name, description, nil
}
