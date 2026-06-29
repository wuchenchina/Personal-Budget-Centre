package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"budgetcentre/backend/internal/exportpdf"
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

	rows, err := a.db.QueryContext(r.Context(), exportSelectSQL("WHERE budget_id = ? ORDER BY created_at DESC, id DESC"), budgetID)
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
	optionsJSON, err := json.Marshal(exportOptionsPayload(options, scope))
	if err != nil {
		return err
	}
	exportCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 15*time.Second)
	defer cancel()

	tx, err := a.db.BeginTx(exportCtx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(exportCtx, `
INSERT INTO budget_exports
(budget_id, user_id, format, scope, file_name, file_path, status, options_json, progress_stage)
VALUES (?, ?, 'pdf', ?, ?, NULL, 'queued', ?, 'queued')`,
		budgetID, s.UserID, scope, fileName, string(optionsJSON))
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	if err := a.signExportJob(exportCtx, tx, id, budgetID, s.UserID, scope, fileName); err != nil {
		return err
	}
	if err := insertExportAudit(exportCtx, tx, id, "queued", "", "Export job queued by Go API.", nil); err != nil {
		return err
	}
	row := tx.QueryRowContext(exportCtx, exportSelectSQL("WHERE id = ?"), id)
	export, err := scanExport(row)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"export": export}, http.StatusCreated)
	return nil
}

type exportSQLExecer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func (a *App) signExportJob(ctx context.Context, execer exportSQLExecer, exportID, budgetID, userID int64, scope, fileName string) error {
	secret := strings.TrimSpace(a.cfg.ExportJobSecret)
	if secret == "" {
		return apiError("EXPORT_JOB_SECRET_MISSING", "PDF renderer job secret is missing. Set PDF_RENDERER_JOB_SECRET or APP_KEY.", http.StatusInternalServerError)
	}
	token := exportJobToken(secret, exportID, budgetID, userID, scope, fileName)
	_, err := execer.ExecContext(ctx, "UPDATE budget_exports SET job_token = ? WHERE id = ?", token, exportID)
	return err
}

func exportJobToken(secret string, exportID, budgetID, userID int64, scope, fileName string) string {
	payload := fmt.Sprintf("%d|%d|%d|%s|%s", exportID, budgetID, userID, scope, fileName)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func insertExportAudit(ctx context.Context, execer exportSQLExecer, exportID int64, event, workerID, message string, metadata any) error {
	var encoded any
	if metadata != nil {
		bytes, err := json.Marshal(metadata)
		if err != nil {
			return err
		}
		encoded = string(bytes)
	}
	_, err := execer.ExecContext(ctx, `
INSERT INTO budget_export_audit_logs (export_id, event, worker_id, message, metadata_json)
VALUES (?, ?, ?, ?, ?)`, exportID, event, nullableText(workerID), nullableText(message), encoded)
	return err
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
	row := a.db.QueryRowContext(r.Context(), "SELECT budget_id, format, file_name, file_path, status FROM budget_exports WHERE id = ?", id)
	var budgetID int64
	var format, name, status string
	var filePath sql.NullString
	if err := row.Scan(&budgetID, &format, &name, &filePath, &status); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return apiError("EXPORT_NOT_FOUND", "Export was not found.", http.StatusNotFound)
		}
		return err
	}
	if err := a.requireBudgetExport(r, budgetID, s.UserID); err != nil {
		return err
	}
	if status != "completed" {
		return apiError("EXPORT_NOT_READY", "Export file is not ready yet.", http.StatusConflict)
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
	w.Header().Set("Content-Disposition", `attachment; filename="`+filepath.Base(relativePath)+`"`)
	http.ServeFile(w, r, path)
	return nil
}

func scanExport(row rowScanner) (map[string]any, error) {
	var id, budgetID, userID int64
	var format, scope, name, status, progressStage, created string
	var filePath, errorMessage sql.NullString
	var progressPercent float64
	var rowsTotal, rowsProcessed, pages, fileSize sql.NullInt64
	var startedAt, completedAt sql.NullString
	if err := row.Scan(
		&id,
		&budgetID,
		&userID,
		&format,
		&scope,
		&name,
		&filePath,
		&status,
		&errorMessage,
		&progressPercent,
		&progressStage,
		&rowsTotal,
		&rowsProcessed,
		&pages,
		&fileSize,
		&created,
		&startedAt,
		&completedAt,
	); err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "budgetId": budgetID, "userId": userID, "format": format, "scope": scope,
		"fileName": name, "filePath": nullableString(filePath), "status": status,
		"errorMessage": nullableString(errorMessage), "progressPercent": progressPercent,
		"progressStage": progressStage, "rowsTotal": nullableInt(rowsTotal),
		"rowsProcessed": nullableInt(rowsProcessed), "pages": nullableInt(pages),
		"fileSize": nullableInt(fileSize), "createdAt": dateTimeValue(created),
		"startedAt": nullableDateTime(startedAt), "completedAt": nullableDateTime(completedAt),
		"downloadUrl": fmt.Sprintf("/api/exports/download?id=%d", id),
	}, nil
}

func exportSelectSQL(where string) string {
	return `SELECT id, budget_id, user_id, format, scope, file_name, file_path, status, error_message,
progress_percent, progress_stage, rows_total, rows_processed, pages, file_size,
created_at, started_at, completed_at
FROM budget_exports ` + where
}

func exportOptionsPayload(options exportpdf.Options, scope string) map[string]any {
	return map[string]any{
		"exportScope":             scope,
		"tableLanguageMode":       options.TableLanguageMode,
		"tableChineseLanguage":    options.TableChineseLanguage,
		"pdfTheme":                options.PDFTheme,
		"showWorkspace":           options.ShowWorkspace,
		"pdfLanguages":            options.PDFLanguages,
		"signatureLabelMode":      options.SignatureLabelMode,
		"signatureLabelLanguages": options.SignatureLabelLanguage,
	}
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
