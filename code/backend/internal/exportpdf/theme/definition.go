package theme

import (
	"html"
	"strings"
	"time"
)

type staticTheme struct {
	key                    string
	budgetDocumentCSS      string
	budgetTableCSS         string
	bookkeepingDocumentCSS string
	bookkeepingTableCSS    string
	signatureCSS           string
	signatureFullWidthMM   float64
	budgetMargins          MarginsMM
	bookkeepingMargins     MarginsMM
	header                 func(map[string]any, string, string, HeaderOptions, Scope) string
	footer                 func(Scope) string
}

func (t staticTheme) Key() string {
	return t.key
}

func (t staticTheme) DocumentCSS(scope Scope) string {
	if scope == ScopeBookkeeping {
		return t.bookkeepingDocumentCSS
	}
	return t.budgetDocumentCSS
}

func (t staticTheme) TableCSS(scope Scope) string {
	if scope == ScopeBookkeeping {
		return t.bookkeepingTableCSS
	}
	return t.budgetTableCSS
}

func (t staticTheme) SignatureCSS() string {
	return t.signatureCSS
}

func (t staticTheme) SignatureFullWidthMM() float64 {
	return t.signatureFullWidthMM
}

func (t staticTheme) PageMargins(scope Scope) MarginsMM {
	if scope == ScopeBookkeeping {
		return t.bookkeepingMargins
	}
	return t.budgetMargins
}

func (t staticTheme) HeaderHTML(budget map[string]any, titleHTML, subtitleHTML string, options HeaderOptions, scope Scope) string {
	if t.header == nil {
		return classicHeaderHTML(budget, titleHTML, subtitleHTML, options, scope)
	}
	return t.header(budget, titleHTML, subtitleHTML, options, scope)
}

func (t staticTheme) FooterTemplate(scope Scope) string {
	if t.footer == nil {
		return classicFooterTemplate(scope)
	}
	return t.footer(scope)
}

func baseDocumentCSS() string {
	return `*{box-sizing:border-box}html,body{margin:0;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`
}

func classicSignatureCSS() string {
	return `.signature-section{width:100%;margin-top:4mm;page-break-inside:avoid;break-inside:avoid-page;}.signature-svg{display:block;width:100%;height:auto;}`
}

func classicHeaderHTML(_ map[string]any, titleHTML, subtitleHTML string, _ HeaderOptions, _ Scope) string {
	return `<div class="title">` + titleHTML + `</div>` + subtitleHTML
}

func hsbcHeaderHTML(budget map[string]any, titleHTML, subtitleHTML string, options HeaderOptions, _ Scope) string {
	subtitle := strippedText(subtitleHTML)
	rows := [][]string{
		{"Pages", "總頁數", totalPagesText(options)},
		{"Date", "日期", time.Now().Format("2 January 2006")},
	}
	if options.ShowWorkspace {
		if workspace := stringValue(firstNonEmpty(budget["workspaceName"], budget["workspace_name"])); workspace != "" {
			rows = append(rows, []string{"Workspace", "工作區", workspace})
		}
	}
	return `<div class="hsbc-header"><table class="hsbc-header-table"><tr><td class="hsbc-title-cell"><div class="hsbc-title">` +
		titleHTML + `</div></td><td class="hsbc-meta-cell">` + metaTableHTML("hsbc", rows) +
		`</td></tr></table>` + optionalSubtitle("hsbc", subtitle) + `</div>`
}

func uswdsHeaderHTML(budget map[string]any, titleHTML, subtitleHTML string, options HeaderOptions, _ Scope) string {
	subtitle := strippedText(subtitleHTML)
	rows := [][]string{
		{"Pages", "總頁數", totalPagesText(options)},
		{"Date", "日期", time.Now().Format("2 January 2006")},
	}
	if options.ShowWorkspace {
		if workspace := stringValue(firstNonEmpty(budget["workspaceName"], budget["workspace_name"])); workspace != "" {
			rows = append(rows, []string{"Workspace", "工作區", workspace})
		}
	}
	return `<div class="uswds-header"><table class="uswds-header-table"><tr><td class="uswds-title-cell"><div class="uswds-title">` +
		titleHTML + `</div></td><td class="uswds-meta-cell">` + metaTableHTML("uswds", rows) +
		`</td></tr></table>` + optionalSubtitle("uswds", subtitle) + `</div>`
}

func metaTableHTML(prefix string, rows [][]string) string {
	var out strings.Builder
	out.WriteString(`<table class="`)
	out.WriteString(prefix)
	out.WriteString(`-meta-table">`)
	for _, row := range rows {
		label := row[0] + " " + row[1]
		if row[0] == "Date" {
			label = row[0] + " / " + row[1]
		}
		out.WriteString(`<tr><td class="`)
		out.WriteString(prefix)
		out.WriteString(`-meta-label">`)
		out.WriteString(html.EscapeString(label))
		out.WriteString(`</td><td class="`)
		out.WriteString(prefix)
		out.WriteString(`-meta-value">`)
		out.WriteString(html.EscapeString(row[2]))
		out.WriteString(`</td></tr>`)
	}
	out.WriteString(`</table>`)
	return out.String()
}

func optionalSubtitle(prefix, subtitle string) string {
	if subtitle == "" {
		return ""
	}
	return `<div class="` + prefix + `-subtitle">` + html.EscapeString(subtitle) + `</div>`
}

func strippedText(value string) string {
	value = strings.ReplaceAll(value, "</div>", "\n")
	value = strings.ReplaceAll(value, "<br>", "\n")
	value = strings.ReplaceAll(value, "<br/>", "\n")
	value = strings.ReplaceAll(value, "<br />", "\n")
	var out strings.Builder
	inTag := false
	for _, r := range value {
		switch r {
		case '<':
			inTag = true
		case '>':
			inTag = false
		default:
			if !inTag {
				out.WriteRune(r)
			}
		}
	}
	lines := []string{}
	for _, line := range strings.Split(html.UnescapeString(out.String()), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return strings.Join(lines, "\n")
}

func totalPagesText(options HeaderOptions) string {
	if strings.TrimSpace(options.TotalPages) != "" {
		return strings.TrimSpace(options.TotalPages)
	}
	return "{nbpg}"
}

func classicFooterTemplate(_ Scope) string {
	return `<div style="width:100%;font-family:SF-Mono,TCSongti,monospace;font-size:7pt;color:#666;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`
}

func hsbcFooterTemplate(_ Scope) string {
	return `<div style="width:100%;font-family:Arial,TCSongti,sans-serif;font-size:7pt;color:#555;text-align:center;"><span class="pageNumber"></span></div>`
}

func uswdsFooterTemplate(_ Scope) string {
	return `<div style="width:100%;font-family:Arial,TCSongti,sans-serif;font-size:7pt;color:#565c65;text-align:center;border-top:0.2mm solid #dfe1e2;padding-top:1.2mm;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`
}

func firstNonEmpty(values ...any) any {
	for _, value := range values {
		if stringValue(value) != "" {
			return value
		}
	}
	return nil
}

func stringValue(value any) string {
	if v, ok := value.(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func stringsReplaceOnce(value, old, replacement string) string {
	return strings.Replace(value, old, replacement, 1)
}
