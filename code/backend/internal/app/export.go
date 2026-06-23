package app

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) exportList(w http.ResponseWriter, r *http.Request) error {
	rows, err := a.db.QueryContext(r.Context(), "SELECT id, budget_id, user_id, format, file_name, file_path, status, error_message, created_at FROM budget_exports WHERE budget_id = ? ORDER BY created_at DESC", queryInt(r, "budgetId"))
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
	budgetID := int64Value(input["budgetId"])
	if _, err := a.budgetDetailPayload(r, budgetID, s.UserID); err != nil {
		return err
	}
	if err := os.MkdirAll(a.cfg.ExportDir, 0o755); err != nil {
		return err
	}
	fileName := fmt.Sprintf("budget-%d-%d.pdf", budgetID, time.Now().Unix())
	path := filepath.Join(a.cfg.ExportDir, fileName)
	content := []byte("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return err
	}
	res, err := a.db.ExecContext(r.Context(), "INSERT INTO budget_exports (budget_id, user_id, format, file_name, file_path, status) VALUES (?, ?, 'pdf', ?, ?, 'completed')", budgetID, s.UserID, fileName, fileName)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	row := a.db.QueryRowContext(r.Context(), "SELECT id, budget_id, user_id, format, file_name, file_path, status, error_message, created_at FROM budget_exports WHERE id = ?", id)
	export, err := scanExport(row)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"export": export}, http.StatusOK)
	return nil
}

func (a *App) exportDownload(w http.ResponseWriter, r *http.Request) error {
	row := a.db.QueryRowContext(r.Context(), "SELECT file_name, file_path FROM budget_exports WHERE id = ?", queryInt(r, "id"))
	var name string
	var filePath sql.NullString
	if err := row.Scan(&name, &filePath); err != nil {
		return apiError("EXPORT_NOT_FOUND", "Export was not found.", http.StatusNotFound)
	}
	relativePath := name
	if filePath.Valid && filePath.String != "" {
		relativePath = filePath.String
	}
	path := filepath.Join(a.cfg.ExportDir, filepath.Base(relativePath))
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filepath.Base(name)+`"`)
	http.ServeFile(w, r, path)
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
