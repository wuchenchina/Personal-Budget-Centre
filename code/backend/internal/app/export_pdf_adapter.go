package app

import "budgetcentre/backend/internal/exportpdf"

func (a *App) pdfExportOptions(input map[string]any, s *session) exportpdf.Options {
	return exportpdf.OptionsFromInput(input, s.DefaultPDFTheme, nullableString(s.PDFExportSettings))
}
