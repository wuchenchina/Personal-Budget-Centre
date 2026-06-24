package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"budgetcentre/backend/internal/database"
	"budgetcentre/backend/internal/httpx"

	"golang.org/x/crypto/bcrypt"
)

func (a *App) adminUserList(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !validUserStatus(status) {
		return apiError("VALIDATION_ERROR", "Invalid user status.", http.StatusUnprocessableEntity)
	}
	page := int(queryInt(r, "page"))
	if page <= 0 {
		page = 1
	}
	pageSize := int(queryInt(r, "pageSize"))
	if pageSize <= 0 {
		pageSize = 30
	}
	if pageSize < 10 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}
	where, args := adminUserFilters(search, status)
	var total int
	if err := a.db.QueryRowContext(r.Context(), "SELECT COUNT(*) FROM users u "+where, args...).Scan(&total); err != nil {
		return err
	}
	queryArgs := append([]any{}, args...)
	queryArgs = append(queryArgs, pageSize, (page-1)*pageSize)
	rows, err := a.db.QueryContext(r.Context(), `
SELECT u.id, u.email, u.username, u.display_name, u.status, u.is_admin,
       u.email_verified_at, u.email_verification_sent_at, u.created_at, u.updated_at, c.code
FROM users u
LEFT JOIN currencies c ON c.id = u.default_currency_id
`+where+`
ORDER BY u.created_at DESC, u.id DESC
LIMIT ? OFFSET ?`, queryArgs...)
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
	httpx.WriteOK(w, map[string]any{"users": users, "total": total, "page": page, "pageSize": pageSize}, http.StatusOK)
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
	email := normalizedEmail(input["email"])
	if email == "" {
		return apiError("VALIDATION_ERROR", "A valid email is required.", http.StatusUnprocessableEntity)
	}
	name, err := validatedUsername(input["username"])
	if err != nil {
		return err
	}
	password := stringValue(input["password"])
	if len(password) < 10 {
		return apiError("VALIDATION_ERROR", "Password must be at least 10 characters.", http.StatusUnprocessableEntity)
	}
	displayName := nonEmptyString(input["displayName"], input["display_name"])
	if displayName == "" || len(displayName) > 120 {
		return apiError("VALIDATION_ERROR", "Display name is required and must be 120 characters or less.", http.StatusUnprocessableEntity)
	}
	currencyID, err := a.optionalCurrencyID(r.Context(), firstValue(input, "defaultCurrency", "default_currency"))
	if err != nil {
		return err
	}
	if exists, err := a.emailExistsExcept(r.Context(), email, 0); err != nil || exists {
		if err != nil {
			return err
		}
		return apiError("EMAIL_ALREADY_EXISTS", "Email is already registered.", http.StatusConflict)
	}
	if exists, err := a.usernameExistsExcept(r.Context(), name, 0); err != nil || exists {
		if err != nil {
			return err
		}
		return apiError("USERNAME_ALREADY_EXISTS", "Username is already registered.", http.StatusConflict)
	}
	emailVerified := boolDefault(input["emailVerified"], true)
	isAdmin := boolDefault(input["isAdmin"], false)
	status := "pending"
	var verifiedAt any
	if emailVerified {
		status = "active"
		verifiedAt = "now"
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(r.Context(), `INSERT INTO users
(email, username, password_hash, display_name, default_currency_id, status, is_admin, email_verified_at)
VALUES (?, ?, ?, ?, ?, ?, ?, IF(? = 'now', UTC_TIMESTAMP(), NULL))`,
		email, name, string(hash), displayName, nullableInt(currencyID), status, boolInt(isAdmin), verifiedAt)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	if _, err := a.createWorkspaceTx(r.Context(), tx, id, displayName+" Personal", "personal", currencyID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	user, err := a.adminUserByID(r, id)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"user": user}, http.StatusCreated)
	return nil
}

func (a *App) adminUserUpdate(w http.ResponseWriter, r *http.Request) error {
	adminSession, err := a.requireAdmin(r)
	if err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	id := int64Value(input["id"])
	if id <= 0 {
		return apiError("VALIDATION_ERROR", "User id is required.", http.StatusUnprocessableEntity)
	}
	current, err := a.adminUserByID(r, id)
	if err != nil {
		if errorsIsNoRows(err) {
			return apiError("USER_NOT_FOUND", "User was not found.", http.StatusNotFound)
		}
		return err
	}

	assignments := []string{}
	args := []any{}
	if hasAnyKey(input, "displayName", "display_name") {
		displayName := nonEmptyString(input["displayName"], input["display_name"])
		if displayName == "" || len(displayName) > 120 {
			return apiError("VALIDATION_ERROR", "Display name is invalid.", http.StatusUnprocessableEntity)
		}
		assignments = append(assignments, "display_name = ?")
		args = append(args, displayName)
	}
	if hasAnyKey(input, "username") {
		name, err := validatedUsername(input["username"])
		if err != nil {
			return err
		}
		if exists, err := a.usernameExistsExcept(r.Context(), name, id); err != nil || exists {
			if err != nil {
				return err
			}
			return apiError("USERNAME_ALREADY_EXISTS", "Username is already registered.", http.StatusConflict)
		}
		assignments = append(assignments, "username = ?")
		args = append(args, name)
	}
	statusChangedExplicitly := false
	if hasAnyKey(input, "status") {
		status := stringValue(input["status"])
		if !validUserStatus(status) {
			return apiError("VALIDATION_ERROR", "Invalid user status.", http.StatusUnprocessableEntity)
		}
		if adminSession.UserID == id && status != "active" {
			return apiError("VALIDATION_ERROR", "You cannot disable your own account.", http.StatusUnprocessableEntity)
		}
		assignments = append(assignments, "status = ?")
		args = append(args, status)
		statusChangedExplicitly = true
	}
	if hasAnyKey(input, "isAdmin") {
		isAdmin := boolValue(input["isAdmin"])
		if adminSession.UserID == id && !isAdmin {
			return apiError("VALIDATION_ERROR", "You cannot revoke your own admin access.", http.StatusUnprocessableEntity)
		}
		assignments = append(assignments, "is_admin = ?")
		args = append(args, boolInt(isAdmin))
	}
	if hasAnyKey(input, "emailVerified", "email_verified") {
		emailVerified := boolValue(firstValue(input, "emailVerified", "email_verified"))
		if emailVerified {
			assignments = append(assignments, "email_verified_at = UTC_TIMESTAMP()")
			if !statusChangedExplicitly && current["status"] == "pending" {
				assignments = append(assignments, "status = 'active'")
			}
		} else {
			assignments = append(assignments, "email_verified_at = NULL")
		}
	}
	if len(assignments) > 0 {
		args = append(args, id)
		query := "UPDATE users SET " + strings.Join(assignments, ", ") + " WHERE id = ?"
		if _, err := a.db.ExecContext(r.Context(), query, args...); err != nil {
			return err
		}
	}
	return a.writeAdminUser(w, r, id)
}

func (a *App) writeAdminUser(w http.ResponseWriter, r *http.Request, id int64) error {
	user, err := a.adminUserByID(r, id)
	if err != nil {
		if errorsIsNoRows(err) {
			return apiError("USER_NOT_FOUND", "User was not found.", http.StatusNotFound)
		}
		return err
	}
	httpx.WriteOK(w, map[string]any{"user": user}, http.StatusOK)
	return nil
}

func (a *App) adminUserByID(r *http.Request, id int64) (map[string]any, error) {
	row := a.db.QueryRowContext(r.Context(), `
SELECT u.id, u.email, u.username, u.display_name, u.status, u.is_admin,
       u.email_verified_at, u.email_verification_sent_at, u.created_at, u.updated_at, c.code
FROM users u
LEFT JOIN currencies c ON c.id = u.default_currency_id
WHERE u.id = ? LIMIT 1`, id)
	return scanAdminUser(row)
}

func scanAdminUser(row rowScanner) (map[string]any, error) {
	var id int64
	var email, display, status, created, updated string
	var username, verified, sent, defaultCurrency sql.NullString
	var admin bool
	if err := row.Scan(&id, &email, &username, &display, &status, &admin, &verified, &sent, &created, &updated, &defaultCurrency); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "email": email, "username": nullableString(username), "displayName": display, "status": status, "isAdmin": admin, "emailVerifiedAt": nullableString(verified), "emailVerificationSentAt": nullableString(sent), "defaultCurrency": nullableString(defaultCurrency), "createdAt": created, "updatedAt": updated}, nil
}

func adminUserFilters(search, status string) (string, []any) {
	clauses := []string{}
	args := []any{}
	if search != "" {
		clauses = append(clauses, "(u.email LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)")
		term := "%" + search + "%"
		args = append(args, term, term, term)
	}
	if status != "" {
		clauses = append(clauses, "u.status = ?")
		args = append(args, status)
	}
	if len(clauses) == 0 {
		return "", args
	}
	return "WHERE " + strings.Join(clauses, " AND "), args
}

func validUserStatus(status string) bool {
	return status == "active" || status == "pending" || status == "disabled"
}

func validatedUsername(value any) (string, error) {
	raw := strings.ToLower(strings.TrimSpace(stringValue(value)))
	name := username(value)
	if raw == "" || name != raw || len(name) < 3 || len(name) > 32 {
		return "", apiError("VALIDATION_ERROR", "Username must be 3-32 characters and only use letters, numbers, dots, dashes, or underscores.", http.StatusUnprocessableEntity)
	}
	return name, nil
}

func (a *App) emailExistsExcept(ctx context.Context, email string, excludeID int64) (bool, error) {
	var count int
	err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE email = ? AND id <> ?", email, excludeID).Scan(&count)
	return count > 0, err
}

func (a *App) usernameExistsExcept(ctx context.Context, username string, excludeID int64) (bool, error) {
	var count int
	err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE username = ? AND id <> ?", username, excludeID).Scan(&count)
	return count > 0, err
}

func errorsIsNoRows(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}

func (a *App) adminEnvironment(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	exportStorage := storageStatus(a.cfg.ExportDir)
	recommendations := []any{}
	if !boolValue(exportStorage["writable"]) {
		recommendations = append(recommendations, "Grant write permission to the export storage directory or set EXPORT_STORAGE_DIR.")
	}
	httpx.WriteOK(w, map[string]any{"environment": map[string]any{
		"runtime":         "Go",
		"runtimeVersion":  "Go API",
		"extensions":      []any{},
		"exportStorage":   exportStorage,
		"ok":              boolValue(exportStorage["writable"]),
		"recommendations": recommendations,
	}}, http.StatusOK)
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
	exportResult, err := a.deleteExportFiles(r)
	if err != nil {
		return err
	}
	tempFiles, tempDirs, tempBytes, err := deleteDirectoryContents(a.cfg.ExportTempDir)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"cleanup": map[string]any{
		"exportPath":             a.cfg.ExportDir,
		"tempPath":               a.cfg.ExportTempDir,
		"deletedExports":         exportResult.deletedExports,
		"deletedExportFiles":     exportResult.deletedFiles,
		"deletedExportBytes":     exportResult.deletedBytes,
		"deletedTempFiles":       tempFiles,
		"deletedTempDirectories": tempDirs,
		"deletedTempBytes":       tempBytes,
	}}, http.StatusOK)
	return nil
}

func (a *App) adminLogs(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	limit := int(queryInt(r, "limit"))
	httpx.WriteOK(w, map[string]any{"logs": a.recentLogs(limit)}, http.StatusOK)
	return nil
}

func storageStatus(path string) map[string]any {
	parent := filepath.Dir(path)
	return map[string]any{
		"path":           path,
		"configured":     path != "",
		"exists":         isDir(path),
		"writable":       isWritableDir(path),
		"parentPath":     parent,
		"parentWritable": isWritableDir(parent),
	}
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func isWritableDir(path string) bool {
	if !isDir(path) {
		return false
	}
	file, err := os.CreateTemp(path, ".bc-write-test-*")
	if err != nil {
		return false
	}
	name := file.Name()
	_ = file.Close()
	_ = os.Remove(name)
	return true
}

type exportCleanupResult struct {
	deletedExports int
	deletedFiles   int
	deletedBytes   int64
}

func (a *App) deleteExportFiles(r *http.Request) (exportCleanupResult, error) {
	rows, err := a.db.QueryContext(r.Context(), "SELECT id, file_path FROM budget_exports")
	if err != nil {
		return exportCleanupResult{}, err
	}
	defer rows.Close()
	type exportFile struct {
		ID   int64
		Path sql.NullString
	}
	files := []exportFile{}
	for rows.Next() {
		var item exportFile
		if err := rows.Scan(&item.ID, &item.Path); err != nil {
			return exportCleanupResult{}, err
		}
		files = append(files, item)
	}
	if err := rows.Err(); err != nil {
		return exportCleanupResult{}, err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return exportCleanupResult{}, err
	}
	defer tx.Rollback()
	result := exportCleanupResult{}
	for _, item := range files {
		if item.Path.Valid && item.Path.String != "" {
			path := safeExportPath(a.cfg.ExportDir, item.Path.String)
			if path != "" {
				if info, err := os.Stat(path); err == nil && !info.IsDir() {
					result.deletedBytes += info.Size()
					if err := os.Remove(path); err != nil {
						return exportCleanupResult{}, apiError("EXPORT_CLEANUP_FAILED", "Export PDF could not be removed.", http.StatusInternalServerError)
					}
					result.deletedFiles++
				}
			}
		}
		if _, err := tx.ExecContext(r.Context(), "DELETE FROM budget_exports WHERE id = ?", item.ID); err != nil {
			return exportCleanupResult{}, err
		}
		result.deletedExports++
	}
	if err := tx.Commit(); err != nil {
		return exportCleanupResult{}, err
	}
	return result, nil
}

func safeExportPath(root, value string) string {
	if value == "" {
		return ""
	}
	name := filepath.Base(value)
	path := filepath.Join(root, name)
	cleanRoot, err := filepath.Abs(root)
	if err != nil {
		return ""
	}
	cleanPath, err := filepath.Abs(path)
	if err != nil {
		return ""
	}
	if filepath.Dir(cleanPath) != cleanRoot {
		return ""
	}
	return cleanPath
}

func deleteDirectoryContents(path string) (files int, dirs int, bytes int64, err error) {
	entries, err := os.ReadDir(path)
	if os.IsNotExist(err) {
		return 0, 0, 0, nil
	}
	if err != nil {
		return 0, 0, 0, err
	}
	for _, entry := range entries {
		itemPath := filepath.Join(path, entry.Name())
		info, statErr := entry.Info()
		if statErr != nil {
			return files, dirs, bytes, statErr
		}
		if entry.IsDir() {
			nextFiles, nextDirs, nextBytes, nextErr := deleteDirectoryContents(itemPath)
			if nextErr != nil {
				return files, dirs, bytes, nextErr
			}
			files += nextFiles
			dirs += nextDirs
			bytes += nextBytes
			if err := os.Remove(itemPath); err != nil {
				return files, dirs, bytes, err
			}
			dirs++
			continue
		}
		bytes += info.Size()
		if err := os.Remove(itemPath); err != nil {
			return files, dirs, bytes, err
		}
		files++
	}
	return files, dirs, bytes, nil
}
