package theme

import (
	"strings"
	"testing"
)

func TestNormalizePDFThemeKey(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "classic", in: "classic", want: "classic"},
		{name: "hsbc", in: "hsbc", want: "hsbc"},
		{name: "uswds", in: "uswds", want: "uswds"},
		{name: "legacy alias", in: "statement_red", want: "hsbc"},
		{name: "trim spaces", in: "  hsbc  ", want: "hsbc"},
		{name: "unknown fallback", in: "unknown", want: "classic"},
		{name: "empty fallback", in: "", want: "classic"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := NormalizeKey(tc.in); got != tc.want {
				t.Fatalf("NormalizeKey(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestSupportedPDFThemeRegistry(t *testing.T) {
	for _, key := range []string{"classic", "hsbc", "uswds", "statement_red"} {
		if !IsSupported(key) {
			t.Fatalf("expected %q to be supported", key)
		}
	}

	if IsSupported("unknown") {
		t.Fatal("expected unknown PDF theme to be unsupported")
	}
}

func TestThemeDefinitionsExposeLegacyPDFContract(t *testing.T) {
	cases := []struct {
		key                 string
		budgetMargins       MarginsMM
		bookkeepingMargins  MarginsMM
		signatureWidth      float64
		footerContainsTotal bool
		headerClass         string
	}{
		{key: "classic", budgetMargins: MarginsMM{Top: 29, Right: 29, Bottom: 22, Left: 29}, bookkeepingMargins: MarginsMM{Top: 18, Right: 14, Bottom: 15, Left: 14}, signatureWidth: 152, footerContainsTotal: true, headerClass: "title"},
		{key: "hsbc", budgetMargins: MarginsMM{Top: 16, Right: 16, Bottom: 17, Left: 16}, bookkeepingMargins: MarginsMM{Top: 14, Right: 12, Bottom: 15, Left: 12}, signatureWidth: 178, footerContainsTotal: false, headerClass: "hsbc-header"},
		{key: "uswds", budgetMargins: MarginsMM{Top: 16, Right: 16, Bottom: 17, Left: 16}, bookkeepingMargins: MarginsMM{Top: 14, Right: 12, Bottom: 15, Left: 12}, signatureWidth: 178, footerContainsTotal: true, headerClass: "uswds-header"},
	}

	for _, tc := range cases {
		t.Run(tc.key, func(t *testing.T) {
			def := ForKey(tc.key)
			if def.DocumentCSS(ScopeBudget) == "" || def.TableCSS(ScopeBudget) == "" {
				t.Fatalf("%s budget CSS must be defined", tc.key)
			}
			if def.DocumentCSS(ScopeBookkeeping) == "" || def.TableCSS(ScopeBookkeeping) == "" {
				t.Fatalf("%s bookkeeping CSS must be defined", tc.key)
			}
			if def.SignatureCSS() == "" || def.SignatureFullWidthMM() != tc.signatureWidth {
				t.Fatalf("%s signature contract mismatch", tc.key)
			}
			if got := def.PageMargins(ScopeBudget); got != tc.budgetMargins {
				t.Fatalf("%s budget margins = %+v, want %+v", tc.key, got, tc.budgetMargins)
			}
			if got := def.PageMargins(ScopeBookkeeping); got != tc.bookkeepingMargins {
				t.Fatalf("%s bookkeeping margins = %+v, want %+v", tc.key, got, tc.bookkeepingMargins)
			}
			footer := def.FooterTemplate(ScopeBudget, "tc")
			if !strings.Contains(footer, "pageNumber") {
				t.Fatalf("%s footer must expose pageNumber token", tc.key)
			}
			if strings.Contains(footer, "totalPages") != tc.footerContainsTotal {
				t.Fatalf("%s footer totalPages token presence mismatch: %s", tc.key, footer)
			}
			header := def.HeaderHTML(map[string]any{"workspaceName": "Main Workspace"}, `<div class="title-line">Budget</div>`, `<div class="subtitle"><div class="subtitle-line">Owner</div></div>`, HeaderOptions{ShowWorkspace: true, TotalPages: "12"}, ScopeBudget)
			if !strings.Contains(header, tc.headerClass) {
				t.Fatalf("%s header missing class %q: %s", tc.key, tc.headerClass, header)
			}
			if tc.key != "classic" && (!strings.Contains(header, "Main Workspace") || !strings.Contains(header, "12")) {
				t.Fatalf("%s branded header must include workspace and page count: %s", tc.key, header)
			}
		})
	}
}

func TestThemeSectionBandTitleFontSizeMatchesBudgetCSS(t *testing.T) {
	cases := []struct {
		key  string
		want float64
	}{
		{key: "classic", want: 9},
		{key: "hsbc", want: 10.4},
		{key: "uswds", want: 9.7},
	}

	for _, tc := range cases {
		t.Run(tc.key, func(t *testing.T) {
			def := ForKey(tc.key)
			if got := def.SectionBandTitleFontSizePt(); got != tc.want {
				t.Fatalf("%s section band title font size = %v, want %v", tc.key, got, tc.want)
			}
			wantCSS := `font-size:` + formatPt(tc.want)
			if !strings.Contains(def.TableCSS(ScopeBudget), wantCSS) {
				t.Fatalf("%s budget CSS missing %q: %s", tc.key, wantCSS, def.TableCSS(ScopeBudget))
			}
		})
	}
}
