package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"budgetcentre/backend/internal/exportpdf"
)

func (a *App) pdfExportOptions(input map[string]any, s *session) exportpdf.Options {
	return exportpdf.OptionsFromInput(input, s.DefaultPDFTheme, nullableString(s.PDFExportSettings))
}

func (a *App) writePDFExport(r *http.Request, budget map[string]any, scope string, options exportpdf.Options, outputPath string) error {
	service := exportpdf.Service{
		FontDir:            a.cfg.FontDir,
		TempDir:            a.cfg.ExportTempDir,
		ChromeBin:          a.cfg.ChromeBin,
		LoadBookkeeping:    a.bookkeepingRecordsForBudget,
		LoadBudgetTemplate: a.templateForPDF,
	}
	return service.Write(r.Context(), budget, scope, options, outputPath)
}

func (a *App) templateForPDF(ctx context.Context, budget map[string]any) (exportpdf.Template, error) {
	row := a.db.QueryRowContext(ctx, "SELECT structure_json FROM budget_templates WHERE template_key = ? ORDER BY is_default DESC, id ASC LIMIT 1", exportpdf.TemplateKey(budget))
	var raw sql.NullString
	if err := row.Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return exportpdf.DefaultTemplate(), nil
		}
		return exportpdf.Template{}, err
	}
	if raw.Valid && raw.String != "" {
		return exportpdf.TemplateFromJSON(raw.String), nil
	}
	return exportpdf.DefaultTemplate(), nil
}
