package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"budgetcentre/backend/internal/httpx"
)

var exportSlugPattern = regexp.MustCompile(`[^a-z0-9]+`)

func (a *App) exportList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	budgetID := queryInt(r, "budgetId")
	if budgetID <= 0 {
		return apiError("VALIDATION_ERROR", "budgetId query parameter is required.", http.StatusUnprocessableEntity)
	}
	if err := a.requireBudgetExport(r, budgetID, s.UserID); err != nil {
		return err
	}

	rows, err := a.db.QueryContext(r.Context(), "SELECT id, budget_id, user_id, format, file_name, file_path, status, error_message, created_at FROM budget_exports WHERE budget_id = ? ORDER BY created_at DESC, id DESC", budgetID)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		export, err := scanExport(rows)
		if err != nil {
			return err
		}
		out = append(out, export)
	}
	httpx.WriteOK(w, map[string]any{"exports": out}, http.StatusOK)
	return rows.Err()
}

func (a *App) exportCreate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	budgetID := int64Value(firstValue(input, "budgetId", "budget_id"))
	format := stringDefault(stringValue(input["format"]), "pdf")
	if budgetID <= 0 || format != "pdf" {
		return apiError("VALIDATION_ERROR", "Budget id and export format are required.", http.StatusUnprocessableEntity)
	}
	if err := a.requireBudgetExport(r, budgetID, s.UserID); err != nil {
		return err
	}
	budget, err := a.budgetDetailPayload(r, budgetID, s.UserID)
	if err != nil {
		return err
	}
	options := a.pdfExportOptions(input, s)
	scope := exportScope(input)

	if err := ensureWritableDirectory(a.cfg.ExportDir); err != nil {
		return apiError("EXPORT_STORAGE_UNWRITABLE", "Export storage directory is not writable. Set EXPORT_STORAGE_DIR or grant write permission.", http.StatusInternalServerError)
	}
	if err := ensureWritableDirectory(a.cfg.ExportTempDir); err != nil {
		return apiError("EXPORT_STORAGE_UNWRITABLE", "Export temp directory is not writable. Set EXPORT_TEMP_DIR or grant write permission.", http.StatusInternalServerError)
	}

	fileName := exportFileName(budget, format, scope)
	path := filepath.Join(a.cfg.ExportDir, fileName)
	exportCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Minute)
	defer cancel()
	if err := a.writePDFExport(exportCtx, budget, scope, options, path); err != nil {
		return apiError("EXPORT_FAILED", "Export file could not be created. Check Chromium, fonts and export storage permissions.", http.StatusInternalServerError)
	}
	if info, err := os.Stat(path); err != nil || info.IsDir() || info.Size() == 0 {
		return apiError("EXPORT_FAILED", "Export file could not be created.", http.StatusInternalServerError)
	}

	res, err := a.db.ExecContext(exportCtx, "INSERT INTO budget_exports (budget_id, user_id, format, file_name, file_path, status) VALUES (?, ?, 'pdf', ?, ?, 'completed')", budgetID, s.UserID, fileName, fileName)
	if err != nil {
		_ = os.Remove(path)
		return err
	}
	id, _ := res.LastInsertId()
	row := a.db.QueryRowContext(exportCtx, "SELECT id, budget_id, user_id, format, file_name, file_path, status, error_message, created_at FROM budget_exports WHERE id = ?", id)
	export, err := scanExport(row)
	if err != nil {
		return err
	}
	if err := a.pruneOldExports(exportCtx, budgetID, format, id); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"export": export}, http.StatusCreated)
	return nil
}

func (a *App) exportDownload(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	id := queryInt(r, "id")
	if id <= 0 {
		return apiError("VALIDATION_ERROR", "Export id query parameter is required.", http.StatusUnprocessableEntity)
	}
	row := a.db.QueryRowContext(r.Context(), "SELECT budget_id, format, file_name, file_path FROM budget_exports WHERE id = ?", id)
	var budgetID int64
	var format, name string
	var filePath sql.NullString
	if err := row.Scan(&budgetID, &format, &name, &filePath); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return apiError("EXPORT_NOT_FOUND", "Export was not found.", http.StatusNotFound)
		}
		return err
	}
	if err := a.requireBudgetExport(r, budgetID, s.UserID); err != nil {
		return err
	}

	relativePath := name
	if filePath.Valid && filePath.String != "" {
		relativePath = filePath.String
	}
	path := safeExportPath(a.cfg.ExportDir, relativePath)
	if path == "" {
		return apiError("EXPORT_FILE_NOT_FOUND", "Export file has been removed.", http.StatusNotFound)
	}
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return apiError("EXPORT_FILE_NOT_FOUND", "Export file has been removed.", http.StatusNotFound)
	}

	w.Header().Set("Content-Type", contentTypeForExport(format))
	w.Header().Set("Content-Disposition", `attachment; filename="`+filepath.Base(name)+`"`)
	http.ServeFile(w, r, path)
	return nil
}

func (a *App) pruneOldExports(ctx context.Context, budgetID int64, format string, currentExportID int64) error {
	keep := a.cfg.ExportKeep
	if keep <= 0 {
		keep = 3
	}
	rows, err := a.db.QueryContext(ctx, fmt.Sprintf(`
SELECT id, file_path
FROM budget_exports
WHERE budget_id = ? AND format = ? AND id NOT IN (
  SELECT id FROM (
    SELECT id
    FROM budget_exports
    WHERE budget_id = ? AND format = ?
    ORDER BY created_at DESC, id DESC
    LIMIT %d
  ) recent_exports
)
ORDER BY created_at ASC, id ASC`, keep), budgetID, format, budgetID, format)
	if err != nil {
		return err
	}
	defer rows.Close()
	type staleExport struct {
		ID   int64
		Path sql.NullString
	}
	stale := []staleExport{}
	for rows.Next() {
		var item staleExport
		if err := rows.Scan(&item.ID, &item.Path); err != nil {
			return err
		}
		stale = append(stale, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, item := range stale {
		if item.ID == currentExportID {
			continue
		}
		if item.Path.Valid && item.Path.String != "" {
			if path := safeExportPath(a.cfg.ExportDir, item.Path.String); path != "" {
				_ = os.Remove(path)
			}
		}
		if _, err := a.db.ExecContext(ctx, "DELETE FROM budget_exports WHERE id = ?", item.ID); err != nil {
			return err
		}
	}
	return nil
}

func scanExport(row rowScanner) (map[string]any, error) {
	var id, budgetID, userID int64
	var format, name, status, created string
	var filePath, errorMessage sql.NullString
	if err := row.Scan(&id, &budgetID, &userID, &format, &name, &filePath, &status, &errorMessage, &created); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "budgetId": budgetID, "userId": userID, "format": format, "fileName": name, "filePath": nullableString(filePath), "status": status, "errorMessage": nullableString(errorMessage), "createdAt": created, "downloadUrl": fmt.Sprintf("/api/exports/download?id=%d", id)}, nil
}

func exportScope(input map[string]any) string {
	scope := stringValue(firstValue(input, "exportScope", "export_scope", "scope"))
	if scope == "bookkeeping" {
		return "bookkeeping"
	}
	return "budget"
}

func exportFileName(budget map[string]any, format, scope string) string {
	title := strings.ToLower(stringValue(budget["title"]))
	slug := strings.Trim(exportSlugPattern.ReplaceAllString(title, "-"), "-")
	if slug == "" {
		slug = "budget"
	}
	suffix := ""
	if scope == "bookkeeping" {
		suffix = "-bookkeeping-ledger"
	}
	return time.Now().UTC().Format("20060102-150405") + "-" + slug + suffix + "." + format
}

func ensureWritableDirectory(path string) error {
	if path == "" {
		return os.ErrInvalid
	}
	if err := os.MkdirAll(path, 0o775); err != nil {
		return err
	}
	file, err := os.CreateTemp(path, ".bc-write-test-*")
	if err != nil {
		return err
	}
	name := file.Name()
	if err := file.Close(); err != nil {
		_ = os.Remove(name)
		return err
	}
	return os.Remove(name)
}

func contentTypeForExport(format string) string {
	if format == "pdf" {
		return "application/pdf"
	}
	return "application/octet-stream"
}
