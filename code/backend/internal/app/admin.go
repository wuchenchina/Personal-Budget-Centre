package app

import (
	"database/sql"
	"net/http"
	"path/filepath"

	"budgetcentre/backend/internal/database"
	"budgetcentre/backend/internal/httpx"

	"golang.org/x/crypto/bcrypt"
)

func (a *App) adminUserList(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	rows, err := a.db.QueryContext(r.Context(), "SELECT id, email, username, display_name, status, is_admin, email_verified_at, email_verification_sent_at, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT 200")
	if err != nil {
		return err
	}
	defer rows.Close()
	users := []map[string]any{}
	for rows.Next() {
		user, err := scanAdminUser(rows)
		if err != nil {
			return err
		}
		users = append(users, user)
	}
	httpx.WriteOK(w, map[string]any{"users": users, "total": len(users), "page": 1, "pageSize": 200}, http.StatusOK)
	return rows.Err()
}

func (a *App) adminUserCreate(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(stringValue(input["password"])), bcrypt.DefaultCost)
	res, err := a.db.ExecContext(r.Context(), "INSERT INTO users (email, username, password_hash, display_name, status, is_admin, email_verified_at) VALUES (?, ?, ?, ?, 'active', ?, IF(?, UTC_TIMESTAMP(), NULL))", normalizedEmail(input["email"]), username(input["username"]), string(hash), nonEmptyDefault(input["displayName"], "User"), boolInt(boolValue(input["isAdmin"])), boolInt(boolValue(input["emailVerified"])))
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	return a.writeAdminUser(w, r, id)
}

func (a *App) adminUserUpdate(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	if _, err := a.db.ExecContext(r.Context(), "UPDATE users SET display_name = COALESCE(NULLIF(?, ''), display_name), status = COALESCE(NULLIF(?, ''), status), is_admin = ? WHERE id = ?", stringValue(input["displayName"]), stringValue(input["status"]), boolInt(boolValue(input["isAdmin"])), id); err != nil {
		return err
	}
	return a.writeAdminUser(w, r, id)
}

func (a *App) writeAdminUser(w http.ResponseWriter, r *http.Request, id int64) error {
	row := a.db.QueryRowContext(r.Context(), "SELECT id, email, username, display_name, status, is_admin, email_verified_at, email_verification_sent_at, created_at, updated_at FROM users WHERE id = ?", id)
	user, err := scanAdminUser(row)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"user": user}, http.StatusOK)
	return nil
}

func scanAdminUser(row rowScanner) (map[string]any, error) {
	var id int64
	var email, display, status, created, updated string
	var username, verified, sent sql.NullString
	var admin bool
	if err := row.Scan(&id, &email, &username, &display, &status, &admin, &verified, &sent, &created, &updated); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "email": email, "username": nullableString(username), "displayName": display, "status": status, "isAdmin": admin, "emailVerifiedAt": nullableString(verified), "emailVerificationSentAt": nullableString(sent), "defaultCurrency": nil, "createdAt": created, "updatedAt": updated}, nil
}

func (a *App) adminEnvironment(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"environment": map[string]any{"phpVersion": "go", "ok": true, "extensions": []any{}, "exportStorage": map[string]any{"path": a.cfg.ExportDir, "configured": true, "exists": true, "writable": true, "parentPath": filepath.Dir(a.cfg.ExportDir), "parentWritable": true}, "recommendations": []any{}}}, http.StatusOK)
	return nil
}

func (a *App) adminDatabaseStatus(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	status, err := database.Status(r.Context(), a.db, a.cfg)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"database": status}, http.StatusOK)
	return nil
}

func (a *App) adminDatabaseMigrate(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	if boolValue(input["dryRun"]) {
		pending, err := database.DryRun(r.Context(), a.db, a.cfg)
		if err != nil {
			return err
		}
		httpx.WriteOK(w, map[string]any{"pending": pending, "applied": false}, http.StatusOK)
		return nil
	}
	if err := database.Bootstrap(r.Context(), a.db, a.cfg, a.logger); err != nil {
		return err
	}
	status, err := database.Status(r.Context(), a.db, a.cfg)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"database": status, "applied": true}, http.StatusOK)
	return nil
}

func (a *App) adminExportCleanup(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"cleanup": map[string]any{"exportPath": a.cfg.ExportDir, "tempPath": "", "deletedExports": 0, "deletedExportFiles": 0, "deletedExportBytes": 0, "deletedTempFiles": 0, "deletedTempDirectories": 0, "deletedTempBytes": 0}}, http.StatusOK)
	return nil
}
