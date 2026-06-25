package exportpdf

import (
	"budgetcentre/backend/internal/exportpdf/theme"
	"context"
	"encoding/base64"
	"os"
	"path/filepath"
	"regexp"
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

func TestRenderBudgetHTMLUsesAPIPayloadDataShape(t *testing.T) {
	service := Service{
		LoadBudgetTemplate: func(context.Context, map[string]any) (Template, error) {
			return DefaultTemplate(), nil
		},
	}
	budget := samplePDFBudgetWithTypedSlices()
	html, err := service.RenderHTML(context.Background(), budget, "budget", Options{
		PDFTheme:               "classic",
		PDFLanguages:           []string{"en", "tc"},
		PDFLanguagesExplicit:   true,
		SignatureLabelMode:     "confirmation_signature",
		SignatureLabelLanguage: []string{"en", "tc"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, unwanted := range []string{"No budget items", "No transactions"} {
		if strings.Contains(html, unwanted) {
			t.Fatalf("typed API payload must not render empty table text %q\n%s", unwanted, html)
		}
	}
	for _, want := range []string{
		"Office",
		"Paper",
		"HKD 500.00",
		"HKD 120.50",
		"HKD 12.05",
		"10.00",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("typed API payload HTML missing %q\n%s", want, html)
		}
	}
	if strings.Contains(html, "Paid By") || strings.Contains(html, "付款人") {
		t.Fatalf("solo budget export must not add the group payment column\n%s", html)
	}
}

func TestSignatureRendererUsesLegacyBase64ImageGeometry(t *testing.T) {
	service := Service{
		LoadBudgetTemplate: func(context.Context, map[string]any) (Template, error) {
			return DefaultTemplate(), nil
		},
	}
	html, err := service.RenderHTML(context.Background(), samplePDFBudgetWithTypedSlices(), "budget", Options{
		PDFTheme:               "classic",
		PDFLanguages:           []string{"en", "tc"},
		PDFLanguagesExplicit:   true,
		SignatureLabelMode:     "confirmation_signature",
		SignatureLabelLanguage: []string{"en", "tc"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(html, `<svg class="signature-svg"`) {
		t.Fatalf("signature must use legacy base64 image wrapper, not inline SVG\n%s", html)
	}
	if !strings.Contains(html, `class="signature-svg"`) || !strings.Contains(html, `style="display:inline-block;width:76mm;height:72mm"`) {
		t.Fatalf("signature image missing legacy right-aligned geometry\n%s", html)
	}
	matches := regexp.MustCompile(`src="data:image/svg\+xml;base64,([^"]+)"`).FindStringSubmatch(html)
	if len(matches) != 2 {
		t.Fatalf("signature image base64 payload not found\n%s", html)
	}
	decoded, err := base64.StdEncoding.DecodeString(matches[1])
	if err != nil {
		t.Fatal(err)
	}
	svg := string(decoded)
	for _, want := range []string{
		`width="76mm" height="72mm" viewBox="0 0 76 72"`,
		`<rect x="0" y="0" width="76" height="6"`,
		`<rect x="5" y="39" width="66" height="26"`,
		`font-size="2.55"`,
		`Confirmation Signature`,
	} {
		if !strings.Contains(svg, want) {
			t.Fatalf("signature SVG missing %q\n%s", want, svg)
		}
	}
}

func TestSignatureSVGEmbedsThemeFontsAndUsesTitleFontStack(t *testing.T) {
	service := Service{
		FontDir: "/app/font",
		LoadBudgetTemplate: func(context.Context, map[string]any) (Template, error) {
			return DefaultTemplate(), nil
		},
	}
	budget := samplePDFBudget()
	signatureConfig := budget["signatureConfig"].(map[string]any)
	signatureConfig["customTitleEnabled"] = true
	signatureConfig["title"] = "Preparation & Review Record"
	html, err := service.RenderHTML(context.Background(), budget, "budget", Options{
		PDFTheme:               "classic",
		PDFLanguages:           []string{"en", "tc"},
		PDFLanguagesExplicit:   true,
		SignatureLabelLanguage: []string{"en", "tc"},
	})
	if err != nil {
		t.Fatal(err)
	}
	matches := regexp.MustCompile(`src="data:image/svg\+xml;base64,([^"]+)"`).FindStringSubmatch(html)
	if len(matches) != 2 {
		t.Fatalf("signature image base64 payload not found\n%s", html)
	}
	decoded, err := base64.StdEncoding.DecodeString(matches[1])
	if err != nil {
		t.Fatal(err)
	}
	svg := string(decoded)
	for _, want := range []string{
		`<style>@font-face{font-family:"Arial"`,
		`font-family:"TCSongti"`,
		`font-family:"Songti SC"`,
		`font-family="&#34;SF-Mono&#34;,TCSongti,&#34;Songti TC&#34;,&#34;Songti SC&#34;,monospace"`,
		`Preparation &amp; Review Record`,
	} {
		if !strings.Contains(svg, want) {
			t.Fatalf("signature SVG missing %q\n%s", want, svg)
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

func TestRenderHTMLIncludesThemePDFFontFaces(t *testing.T) {
	service := Service{
		FontDir: "/app/font",
		LoadBudgetTemplate: func(context.Context, map[string]any) (Template, error) {
			return DefaultTemplate(), nil
		},
	}
	cases := []struct {
		name       string
		theme      string
		languages  []string
		want       []string
		unexpected []string
	}{
		{
			name:      "classic/traditional",
			theme:     "classic",
			languages: []string{"en", "tc"},
			want: []string{
				`font-family:"TimesNewRoman";src:url("file:///app/font/Times%20New%20Roman.ttf") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"SF-Mono";src:url("file:///app/font/SF-Mono-Regular.ttf") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"Menlo";src:url("file:///app/font/Menlo.ttc") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"TCSongti";src:url("file:///app/font/Songti-TC-Regular.ttf") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"Songti TC";src:url("file:///app/font/Songti-TC-Regular.ttf") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"Songti SC";src:url("file:///app/font/Songti.ttc") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`--pdf-classic-serif-font-family:TimesNewRoman,TCSongti,"Songti TC","Songti SC",serif`,
			},
			unexpected: []string{
				`font-family:"PingFang HK"`,
			},
		},
		{
			name:      "classic/simplified",
			theme:     "classic",
			languages: []string{"en", "sc"},
			want: []string{
				`font-family:"Songti SC";src:url("file:///app/font/Songti.ttc") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"TCSongti";src:url("file:///app/font/Songti-TC-Regular.ttf") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`--pdf-classic-serif-font-family:TimesNewRoman,"Songti SC",TCSongti,"Songti TC",serif`,
			},
			unexpected: []string{
				`font-family:"PingFang SC"`,
			},
		},
		{
			name:      "hsbc/traditional",
			theme:     "hsbc",
			languages: []string{"en", "tc"},
			want: []string{
				`font-family:"Arial";src:url("file:///app/font/Arial.ttf") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"Arial";src:url("file:///app/font/Arial%20Bold.ttf") format("truetype");font-weight:700;font-style:normal;font-display:block;`,
				`font-family:"PingFang HK";src:url("file:///app/font/PingFang.ttc") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"PingFang SC";src:url("file:///app/font/PingFang.ttc") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`--pdf-sans-font-family:Arial,"PingFang HK","PingFang SC",sans-serif`,
			},
			unexpected: []string{
				`font-family:"TimesNewRoman"`,
				`font-family:"TCSongti"`,
				`font-family:"Songti TC"`,
				`font-family:"Songti SC"`,
			},
		},
		{
			name:      "uswds/simplified",
			theme:     "uswds",
			languages: []string{"en", "sc"},
			want: []string{
				`font-family:"Arial";src:url("file:///app/font/Arial.ttf") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"PingFang SC";src:url("file:///app/font/PingFang.ttc") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`font-family:"PingFang HK";src:url("file:///app/font/PingFang.ttc") format("truetype");font-weight:400;font-style:normal;font-display:block;`,
				`--pdf-sans-font-family:Arial,"PingFang SC","PingFang HK",sans-serif`,
			},
			unexpected: []string{
				`font-family:"TimesNewRoman"`,
				`font-family:"TCSongti"`,
				`font-family:"Songti TC"`,
				`font-family:"Songti SC"`,
			},
		},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			html, err := service.RenderHTML(context.Background(), samplePDFBudget(), "budget", Options{
				PDFTheme:             tt.theme,
				PDFLanguages:         tt.languages,
				PDFLanguagesExplicit: true,
			})
			if err != nil {
				t.Fatal(err)
			}
			for _, want := range tt.want {
				if !strings.Contains(html, want) {
					t.Fatalf("budget HTML missing font-face/CSS %q\n%s", want, html)
				}
			}
			for _, unexpected := range tt.unexpected {
				if strings.Contains(html, unexpected) {
					t.Fatalf("budget HTML contains unexpected font-face/CSS %q\n%s", unexpected, html)
				}
			}
		})
	}
}

func TestOptionsNormalizeExclusiveChineseLanguages(t *testing.T) {
	options := OptionsFromInput(map[string]any{
		"pdfLanguages":            []any{"en", "sc", "tc"},
		"signatureLabelLanguages": []any{"en", "tc", "sc"},
		"tableLanguageMode":       "bilingual",
		"tableChineseLanguage":    "tc",
		"signatureLabelMode":      "signature",
		"showWorkspace":           true,
		"pdfTheme":                "uswds",
	}, "classic", nil)

	if got, want := strings.Join(options.PDFLanguages, ","), "en,sc"; got != want {
		t.Fatalf("PDFLanguages = %q, want %q", got, want)
	}
	if got, want := strings.Join(options.SignatureLabelLanguage, ","), "en,sc"; got != want {
		t.Fatalf("SignatureLabelLanguage = %q, want %q", got, want)
	}

	settingsJSON, err := SettingsJSON(map[string]any{
		"pdfLanguages":            []any{"en", "tc", "sc"},
		"signatureLabelLanguages": []any{"en", "sc", "tc"},
		"signatureLabelMode":      "confirmation",
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(settingsJSON, `"pdfLanguages":["en","tc"]`) {
		t.Fatalf("settings JSON must keep one Chinese PDF language: %s", settingsJSON)
	}
	if !strings.Contains(settingsJSON, `"signatureLabelLanguages":["en","tc"]`) {
		t.Fatalf("settings JSON must align signature Chinese language: %s", settingsJSON)
	}
}

func TestFooterTemplatesFollowThemeChineseFontStack(t *testing.T) {
	cases := []struct {
		name       string
		theme      string
		languages  []string
		want       string
		unexpected string
	}{
		{
			name:       "classic simplified",
			theme:      "classic",
			languages:  []string{"en", "sc"},
			want:       `font-family:SF-Mono,'Songti SC',TCSongti,'Songti TC',monospace`,
			unexpected: `PingFang`,
		},
		{
			name:       "hsbc traditional",
			theme:      "hsbc",
			languages:  []string{"en", "tc"},
			want:       `font-family:Arial,'PingFang HK','PingFang SC',sans-serif`,
			unexpected: `Songti SC`,
		},
		{
			name:       "uswds simplified",
			theme:      "uswds",
			languages:  []string{"en", "sc"},
			want:       `font-family:Arial,'PingFang SC','PingFang HK',sans-serif`,
			unexpected: `Songti`,
		},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			footer := footerTemplateForOptions(theme.ForKey(tt.theme), theme.ScopeBudget, Options{PDFLanguages: tt.languages})
			if !strings.Contains(footer, tt.want) {
				t.Fatalf("footer missing %q: %s", tt.want, footer)
			}
			if strings.Contains(footer, tt.unexpected) {
				t.Fatalf("footer contains unexpected %q: %s", tt.unexpected, footer)
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

func samplePDFBudgetWithTypedSlices() map[string]any {
	budget := samplePDFBudget()
	budget["participants"] = []map[string]any{
		{"id": int64(11), "name": "Alice"},
	}
	budget["items"] = []map[string]any{
		{
			"label":      "Office",
			"category":   "Office",
			"categoryId": int64(1),
			"budget": map[string]any{
				"currency":       "HKD",
				"amountBase":     500.0,
				"amountOriginal": 500.0,
				"rateToBase":     1.0,
			},
			"estimatedActuals": map[string]any{
				"currency":       "HKD",
				"amountBase":     0.0,
				"amountOriginal": 0.0,
				"rateToBase":     1.0,
			},
			"split": map[string]any{
				"splitType":           "personal",
				"paidByParticipantId": int64(11),
				"participants": []map[string]any{
					{"participantId": int64(11), "isIncluded": true},
				},
			},
		},
	}
	budget["transactions"] = []map[string]any{
		{
			"details":             "Paper",
			"category":            "Office",
			"categoryId":          int64(1),
			"paidByParticipantId": int64(11),
			"currency":            "HKD",
			"amountBase":          120.5,
			"amountOriginal":      120.5,
			"pricingConfig": map[string]any{
				"enabled":   1,
				"unitPrice": 12.05,
				"quantity":  10.0,
			},
		},
	}
	budget["signatureConfig"] = map[string]any{
		"enabled":            true,
		"customTitleEnabled": false,
		"sectionAlign":       "right",
		"rows": []map[string]any{
			{
				"displayName":   "Alice",
				"roleLabel":     "Prepared by",
				"showName":      true,
				"showRole":      true,
				"showDateTime":  true,
				"showSignature": true,
				"signedAt":      "2026-01-02 03:04:05",
			},
		},
	}
	return budget
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
