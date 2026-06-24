package exportpdf

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRenderBudgetHTMLUsesLegacyPDFThemeStructure(t *testing.T) {
	service := Service{
		LoadBudgetTemplate: func(context.Context, map[string]any) (Template, error) {
			return DefaultTemplate(), nil
		},
	}
	html, err := service.RenderHTML(context.Background(), samplePDFBudget(), "budget", Options{
		PDFTheme:               "hsbc",
		PDFLanguages:           []string{"en", "tc"},
		PDFLanguagesExplicit:   true,
		SignatureLabelMode:     "confirmation_signature",
		SignatureLabelLanguage: []string{"en", "tc"},
		ShowWorkspace:          true,
		TotalPages:             4,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"hsbc-header",
		"hsbc-meta-table",
		"Main Workspace",
		"template-section",
		"header-left",
		"header-middle",
		"signature-svg",
		"data:image/svg+xml;base64,",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("budget HTML missing %q\n%s", want, html)
		}
	}
	if strings.Contains(html, "signature-grid") {
		t.Fatal("budget HTML must not use the removed HTML-grid signature renderer")
	}
	for _, unwanted := range []string{
		"Budget Summary / 預算摘要",
		"Date: 2026-01-01T00:00:00Z",
		"to 2026-01-31T00:00:00Z",
	} {
		if strings.Contains(html, unwanted) {
			t.Fatalf("budget HTML contains unwanted text %q\n%s", unwanted, html)
		}
	}
	for _, want := range []string{
		"Budget Summary",
		"預算摘要",
		"Date / 日期: 1 January, 2026 to 31 January, 2026",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("budget HTML missing %q\n%s", want, html)
		}
	}
}

func TestRenderBookkeepingHTMLUsesDedicatedLegacyTableStructure(t *testing.T) {
	service := Service{
		LoadBookkeeping: func(context.Context, int64) ([]map[string]any, error) {
			return []map[string]any{
				{
					"transactionType":           "expense",
					"recordDate":                "2026-01-02T00:00:00Z",
					"orderReference":            "THISISALONGREFERENCEWITHOUTSPACES",
					"details":                   "Office supplies",
					"categoryLabel":             "Office",
					"sourceAccountName":         "Cash",
					"currency":                  "HKD",
					"amountOriginal":            120.5,
					"amountBase":                120.5,
					"destinationCurrency":       "USD",
					"destinationAmountOriginal": 15.43,
					"remark":                    "Receipt",
				},
			}, nil
		},
	}
	html, err := service.RenderHTML(context.Background(), samplePDFBudget(), "bookkeeping", Options{
		PDFTheme:             "uswds",
		PDFLanguages:         []string{"en", "tc"},
		PDFLanguagesExplicit: true,
		TotalPages:           2,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"uswds-header",
		"bookkeeping-section",
		"bookkeeping-table",
		"bookkeeping-header-row",
		"bookkeeping-code-cell",
		"bookkeeping-total-row bookkeeping-total-row-first",
		"Expense total",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("bookkeeping HTML missing %q\n%s", want, html)
		}
	}
	if strings.Contains(html, "summary-table") {
		t.Fatal("bookkeeping HTML must not fall back to the budget summary table")
	}
	if strings.Contains(html, "Bookkeeping Ledger / 記帳流水") {
		t.Fatalf("bookkeeping subtitle must follow PHP newline composite labels\n%s", html)
	}
	if strings.Contains(html, "2026-01-02T00:00:00Z") {
		t.Fatalf("bookkeeping record date must not render the raw ISO timestamp\n%s", html)
	}
	for _, want := range []string{
		"Bookkeeping Ledger",
		"記帳流水",
		"2026-01-02",
		"Date / 日期: 1 January, 2026 to 31 January, 2026",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("bookkeeping HTML missing %q\n%s", want, html)
		}
	}
}

func TestRenderHTMLKeepsAllPDFThemesAvailable(t *testing.T) {
	service := Service{
		LoadBudgetTemplate: func(context.Context, map[string]any) (Template, error) {
			return DefaultTemplate(), nil
		},
		LoadBookkeeping: func(context.Context, int64) ([]map[string]any, error) {
			return samplePDFBookkeepingRecords(), nil
		},
	}
	cases := []struct {
		theme           string
		wantBudget      string
		wantBookkeeping string
	}{
		{"classic", "template-section", "bookkeeping-section"},
		{"hsbc", "hsbc-header", "hsbc-header"},
		{"uswds", "uswds-header", "uswds-header"},
	}
	for _, tt := range cases {
		t.Run(tt.theme+"/budget", func(t *testing.T) {
			html, err := service.RenderHTML(context.Background(), samplePDFBudget(), "budget", Options{
				PDFTheme:             tt.theme,
				PDFLanguages:         []string{"en", "tc"},
				PDFLanguagesExplicit: true,
			})
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(html, tt.wantBudget) {
				t.Fatalf("budget HTML for theme %s missing %q\n%s", tt.theme, tt.wantBudget, html)
			}
		})
		t.Run(tt.theme+"/bookkeeping", func(t *testing.T) {
			html, err := service.RenderHTML(context.Background(), samplePDFBudget(), "bookkeeping", Options{
				PDFTheme:             tt.theme,
				PDFLanguages:         []string{"en", "tc"},
				PDFLanguagesExplicit: true,
			})
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(html, tt.wantBookkeeping) {
				t.Fatalf("bookkeeping HTML for theme %s missing %q\n%s", tt.theme, tt.wantBookkeeping, html)
			}
		})
	}
}

func TestCountPDFPagesFromChromeStyleObjects(t *testing.T) {
	pdf := []byte("%PDF\n1 0 obj<</Type /Pages>>endobj\n2 0 obj<</Type /Page>>endobj\n3 0 obj<</Type /Page>>endobj")
	if got := countPDFPages(pdf); got != 2 {
		t.Fatalf("countPDFPages = %d, want 2", got)
	}
}

func TestWritePDFWithChromeSmoke(t *testing.T) {
	chrome := os.Getenv("BUDGETCENTRE_PDF_CHROME")
	if chrome == "" {
		t.Skip("set BUDGETCENTRE_PDF_CHROME to run the Chrome PDF smoke test")
	}
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "budget.pdf")
	service := Service{
		TempDir:   tempDir,
		ChromeBin: chrome,
		LoadBudgetTemplate: func(context.Context, map[string]any) (Template, error) {
			return DefaultTemplate(), nil
		},
		LoadBookkeeping: func(context.Context, int64) ([]map[string]any, error) {
			return samplePDFBookkeepingRecords(), nil
		},
	}
	options := Options{
		PDFTheme:               "uswds",
		PDFLanguages:           []string{"en", "tc"},
		PDFLanguagesExplicit:   true,
		SignatureLabelMode:     "confirmation_signature",
		SignatureLabelLanguage: []string{"en", "tc"},
		ShowWorkspace:          true,
	}
	if keepHTML := os.Getenv("BUDGETCENTRE_PDF_SMOKE_HTML"); keepHTML != "" {
		html, err := service.RenderHTML(context.Background(), samplePDFBudget(), "budget", Options{
			PDFTheme:               options.PDFTheme,
			PDFLanguages:           options.PDFLanguages,
			PDFLanguagesExplicit:   options.PDFLanguagesExplicit,
			SignatureLabelMode:     options.SignatureLabelMode,
			SignatureLabelLanguage: options.SignatureLabelLanguage,
			ShowWorkspace:          options.ShowWorkspace,
			TotalPages:             1,
			SuppressPageFooter:     true,
		})
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(keepHTML), 0o775); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(keepHTML, []byte(html), 0o664); err != nil {
			t.Fatal(err)
		}
	}
	if err := service.Write(context.Background(), samplePDFBudget(), "budget", options, outputPath); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 || countPDFPages(data) <= 0 {
		t.Fatalf("generated PDF is empty or has no pages: bytes=%d pages=%d", len(data), countPDFPages(data))
	}
	if keepPath := os.Getenv("BUDGETCENTRE_PDF_SMOKE_OUTPUT"); keepPath != "" {
		if err := os.MkdirAll(filepath.Dir(keepPath), 0o775); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(keepPath, data, 0o664); err != nil {
			t.Fatal(err)
		}
	}

	bookkeepingPath := filepath.Join(tempDir, "bookkeeping.pdf")
	if err := service.Write(context.Background(), samplePDFBudget(), "bookkeeping", options, bookkeepingPath); err != nil {
		t.Fatal(err)
	}
	bookkeepingData, err := os.ReadFile(bookkeepingPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(bookkeepingData) == 0 || countPDFPages(bookkeepingData) <= 0 {
		t.Fatalf("generated bookkeeping PDF is empty or has no pages: bytes=%d pages=%d", len(bookkeepingData), countPDFPages(bookkeepingData))
	}
	if keepPath := os.Getenv("BUDGETCENTRE_PDF_BOOKKEEPING_SMOKE_OUTPUT"); keepPath != "" {
		if err := os.MkdirAll(filepath.Dir(keepPath), 0o775); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(keepPath, bookkeepingData, 0o664); err != nil {
			t.Fatal(err)
		}
	}
}

func samplePDFBudget() map[string]any {
	return map[string]any{
		"id":             int64(7),
		"title":          "Demo Budget",
		"ownerName":      "Budget Owner",
		"workspaceName":  "Main Workspace",
		"startDate":      "2026-01-01T00:00:00Z",
		"endDate":        "2026-01-31T00:00:00Z",
		"baseCurrency":   "HKD",
		"budgetType":     "regular",
		"pricingEnabled": true,
		"items": []any{
			map[string]any{
				"label":      "Office",
				"category":   "Office",
				"categoryId": int64(1),
				"budget": map[string]any{
					"currency":       "HKD",
					"amountBase":     500.0,
					"amountOriginal": 500.0,
					"rateToBase":     1.0,
				},
			},
		},
		"transactions": []any{
			map[string]any{
				"details":        "Paper",
				"category":       "Office",
				"categoryId":     int64(1),
				"currency":       "HKD",
				"amountBase":     120.5,
				"amountOriginal": 120.5,
				"pricingConfig": map[string]any{
					"enabled":   true,
					"unitPrice": 12.05,
					"quantity":  10.0,
				},
			},
		},
		"signatureConfig": map[string]any{
			"enabled":            true,
			"customTitleEnabled": false,
			"sectionAlign":       "right",
			"rows": []any{
				map[string]any{
					"displayName":   "Alice",
					"roleLabel":     "Prepared by",
					"showName":      true,
					"showRole":      true,
					"showDateTime":  true,
					"showSignature": true,
					"signedAt":      "2026-01-02 03:04:05",
				},
			},
		},
	}
}

func samplePDFBookkeepingRecords() []map[string]any {
	return []map[string]any{
		{
			"transactionType":           "expense",
			"recordDate":                "2026-01-02",
			"orderReference":            "THISISALONGREFERENCEWITHOUTSPACES",
			"details":                   "Office supplies",
			"categoryLabel":             "Office",
			"sourceAccountName":         "Cash",
			"destinationAccountName":    "Card",
			"currency":                  "HKD",
			"amountOriginal":            120.5,
			"amountBase":                120.5,
			"destinationCurrency":       "USD",
			"destinationAmountOriginal": 15.43,
			"remark":                    "Receipt",
		},
		{
			"transactionType": "income",
			"recordDate":      "2026-01-03",
			"details":         "Reimbursement",
			"categoryLabel":   "Income",
			"currency":        "HKD",
			"amountOriginal":  50.0,
			"amountBase":      50.0,
		},
	}
}
