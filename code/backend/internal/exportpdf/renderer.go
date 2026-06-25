package exportpdf

import (
	"budgetcentre/backend/internal/exportpdf/theme"
	"encoding/base64"
	"fmt"
	"html"
	"math"
	"net/url"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type pdfRenderer struct {
	fontDir string
}

type pdfTableContext struct {
	Mode              string
	Language          string
	ChineseLanguage   string
	Languages         []string
	Bookkeeping       bool
	BudgetLabels      map[string]string
	BookkeepingLabels map[string]string
	ColumnLabels      map[string]string
	TransactionTypes  map[string]string
	SplitTypes        map[string]string
}

func newPDFRenderer(fontDir string) *pdfRenderer {
	return &pdfRenderer{fontDir: fontDir}
}

func (r *pdfRenderer) renderBudget(budget map[string]any, template Template, options Options) string {
	budget = cloneBudgetForRenderer(budget)
	ctx := newPDFTableContext(options, false)
	titleHTML := multilineBlockHTML(stringValue(budget["title"]), "title-line")
	subtitleHTML := ""
	if subtitle := stringValue(budget["ownerName"]); subtitle != "" {
		subtitleHTML = `<div class="subtitle">` + multilineBlockHTML(subtitle, "subtitle-line") + `</div>`
	}
	period := periodText(budget)
	sections := sectionsByKey(template.Sections)
	budgetSection := localizedSection(sectionOrDefault(sections, "budget_highlights", DefaultTemplate().Sections[0]), ctx)
	transactionSection := localizedSection(sectionOrDefault(sections, "transaction_breakdown", DefaultTemplate().Sections[1]), ctx)
	installmentSection := localizedSection(sectionOrDefault(sections, "installments", DefaultTemplate().Sections[2]), ctx)
	transactionParticipants := []budgetParticipant{}
	if stringValue(budget["participantMode"]) == "group" {
		transactionParticipants = budgetParticipants(budget)
	}
	if len(transactionParticipants) > 0 {
		transactionSection = sectionWithPaymentColumn(transactionSection, ctx)
	}
	if boolValue(budget["pricingEnabled"]) {
		transactionSection = sectionWithPricingColumns(transactionSection, len(transactionParticipants) > 0, ctx)
	}

	pdfTheme := theme.ForKey(options.PDFTheme)
	body := r.headerHTML(budget, titleHTML, subtitleHTML, options, theme.ScopeBudget)
	body += r.renderTable(budgetSection, period, r.budgetRows(budget), r.budgetSummaryRow(budget, ctx), tableText("No budget items", ctx.BudgetLabels["emptyBudgetItems"], ctx), datePrefix(ctx))
	body += r.groupBudgetSectionsHTML(budget, period, ctx)
	body += r.renderTable(transactionSection, period, r.transactionRows(anyList(budget["transactions"]), transactionSection.Columns, budget, transactionParticipants, ctx), nil, tableText("No transactions", ctx.BudgetLabels["emptyTransactions"], ctx), datePrefix(ctx))
	if stringValue(budget["budgetType"]) == "installment" {
		installmentSection = installmentPeriodSection(installmentSection, budget, ctx)
		body += r.renderTable(installmentSection, period, r.installmentRows(budget, ctx), r.installmentSummaryRow(budget, ctx), tableText("No installment targets", ctx.BudgetLabels["emptyInstallments"], ctx), datePrefix(ctx))
	}
	body += newPDFSignatureRenderer(pdfTheme, options).render(budget, options, pdfTheme)
	return r.documentHTML(ctx, options, theme.ScopeBudget, body)
}

func (r *pdfRenderer) renderBookkeeping(budget map[string]any, records []map[string]any, options Options) string {
	budget = cloneBudgetForRenderer(budget)
	ctx := newPDFTableContext(options, true)
	titleHTML := multilineBlockHTML(stringValue(budget["title"]), "title-line")
	subtitle := tableText("Bookkeeping Ledger", ctx.BookkeepingLabels["bookkeepingLedgerSubtitle"], ctx)
	subtitleHTML := `<div class="subtitle">` + multilineBlockHTML(subtitle, "subtitle-line") + `</div>`
	period := periodText(budget)
	section := Section{
		Key:   "bookkeeping_records",
		Title: tableText("Bookkeeping Records", ctx.BookkeepingLabels["bookkeepingRecordsTitle"], ctx),
		Columns: []Column{
			{Key: "type", Label: bookkeepingColumnLabel("type", "Type", ctx), Align: "left", WidthPercent: 10, DataType: "text"},
			{Key: "date", Label: bookkeepingColumnLabel("date", "Date", ctx), Align: "left", WidthPercent: 8, DataType: "date"},
			{Key: "order", Label: bookkeepingColumnLabel("order", "Order No.", ctx), Align: "left", WidthPercent: 14, DataType: "code"},
			{Key: "details", Label: bookkeepingColumnLabel("details", "Details", ctx), Align: "left", WidthPercent: 18, DataType: "text"},
			{Key: "category", Label: bookkeepingColumnLabel("category", "Category", ctx), Align: "left", WidthPercent: 12, DataType: "text"},
			{Key: "accounts", Label: bookkeepingColumnLabel("accounts", "Funds / Accounts", ctx), Align: "left", WidthPercent: 13, DataType: "text"},
			{Key: "amount", Label: bookkeepingColumnLabel("amount", "Amount", ctx), Align: "right", WidthPercent: 11, DataType: "money"},
			{Key: "destination", Label: bookkeepingColumnLabel("destination", "Destination", ctx), Align: "right", WidthPercent: 9, DataType: "money"},
			{Key: "remark", Label: bookkeepingColumnLabel("remark", "Remark", ctx), Align: "left", WidthPercent: 5, DataType: "text"},
		},
	}
	rows := make([][]string, 0, len(records))
	baseCurrency := stringValue(budget["baseCurrency"])
	for _, record := range records {
		rows = append(rows, []string{
			transactionTypeText(stringValue(record["transactionType"]), ctx),
			formatPDFDateOnly(stringValue(record["recordDate"])),
			wrapLongReference(stringValue(record["orderReference"])),
			stringValue(record["details"]),
			stringValue(record["categoryLabel"]),
			accountText(record),
			bookkeepingAmountText(record, baseCurrency),
			destinationAmountText(record),
			stringValue(record["remark"]),
		})
	}
	body := r.headerHTML(budget, titleHTML, subtitleHTML, options, theme.ScopeBookkeeping)
	body += r.renderBookkeepingTable(section, period, rows, r.bookkeepingTotalRows(budget, records, ctx), tableText("No bookkeeping records", ctx.BookkeepingLabels["emptyBookkeepingRecords"], ctx), datePrefix(ctx))
	return r.documentHTML(ctx, options, theme.ScopeBookkeeping, body)
}

func (r *pdfRenderer) documentHTML(ctx pdfTableContext, options Options, scope theme.Scope, body string) string {
	pdfTheme := theme.ForKey(options.PDFTheme)
	fontLanguages := pdfFontLanguages(options, ctx.Languages, scope)
	return "<!doctype html><html lang=\"" + html.EscapeString(documentLanguage(ctx.Language)) + "\"><head><meta charset=\"utf-8\">" +
		"<style>" + r.fontFaceCSS(pdfTheme, fontLanguages) + pdfThemeFontCSS(pdfTheme, ctx.Languages) + pdfTheme.DocumentCSS(scope) + pdfTheme.TableCSS(scope) + signatureCSS(pdfTheme, scope) + "</style></head><body>" +
		body + "</body></html>"
}

func (r *pdfRenderer) fontFaceCSS(pdfTheme theme.Definition, languages []string) string {
	if r.fontDir == "" {
		return ""
	}
	fonts := pdfTheme.FontFaces(primaryPDFChineseLanguage(languages))
	var out strings.Builder
	for _, font := range fonts {
		path := filepath.Join(r.fontDir, font.File)
		out.WriteString("@font-face{font-family:\"")
		out.WriteString(font.Family)
		out.WriteString("\";src:url(\"")
		out.WriteString(fileURL(path))
		out.WriteString("\") format(\"truetype\");font-weight:")
		out.WriteString(font.Weight)
		out.WriteString(";font-style:")
		out.WriteString(font.Style)
		out.WriteString(";font-display:block;}")
	}
	return out.String()
}

func pdfFontLanguages(options Options, languages []string, scope theme.Scope) []string {
	out := append([]string{}, languages...)
	if scope == theme.ScopeBudget {
		out = append(out, options.SignatureLabelLanguage...)
	}
	return out
}

func pdfThemeFontCSS(pdfTheme theme.Definition, languages []string) string {
	return pdfTheme.FontVariableCSS(primaryPDFChineseLanguage(languages))
}

func selectedPDFChineseLanguages(languages []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, language := range languages {
		if (language == "sc" || language == "tc") && !seen[language] {
			seen[language] = true
			out = append(out, language)
		}
	}
	if len(out) == 0 {
		return []string{"tc"}
	}
	return out
}

func primaryPDFChineseLanguage(languages []string) string {
	return selectedPDFChineseLanguages(languages)[0]
}

func (r *pdfRenderer) headerHTML(budget map[string]any, titleHTML, subtitleHTML string, options Options, scope theme.Scope) string {
	totalPages := ""
	if options.TotalPages > 0 {
		totalPages = strconv.Itoa(options.TotalPages)
	}
	return theme.ForKey(options.PDFTheme).HeaderHTML(budget, titleHTML, subtitleHTML, theme.HeaderOptions{ShowWorkspace: options.ShowWorkspace, TotalPages: totalPages}, scope)
}

func signatureCSS(pdfTheme theme.Definition, scope theme.Scope) string {
	if scope != theme.ScopeBudget {
		return ""
	}
	return pdfTheme.SignatureCSS()
}

func (r *pdfRenderer) renderTable(section Section, periodText string, rows [][]string, summary []string, emptyText, datePrefix string) string {
	colspan := len(section.Columns)
	if colspan == 0 {
		return ""
	}
	var out strings.Builder
	out.WriteString(`<div class="template-section"><table class="template-table section-band"><tbody><tr><td>`)
	out.WriteString(escapeCell(singleLineText(section.Title), false))
	out.WriteString(`</td></tr></tbody></table>`)
	if periodText != "" {
		out.WriteString(`<div class="date-line">`)
		out.WriteString(html.EscapeString(datePrefix + periodText))
		out.WriteString(`</div>`)
	}
	colgroup := colgroupHTML(section.Columns)
	out.WriteString(`<table class="template-table column-table">`)
	out.WriteString(colgroup)
	out.WriteString(`<tbody><tr>`)
	for index, column := range section.Columns {
		out.WriteString(`<th class="`)
		out.WriteString(strings.TrimSpace(headerBorderClass(index, len(section.Columns)) + " " + columnClass(column)))
		out.WriteString(`">`)
		out.WriteString(escapeCell(column.Label, false))
		out.WriteString(`</th>`)
	}
	out.WriteString(`</tr></tbody></table><table class="template-table body-table">`)
	out.WriteString(colgroup)
	out.WriteString(`<tbody>`)
	if len(rows) == 0 {
		out.WriteString(`<tr><td class="empty" colspan="`)
		out.WriteString(strconv.Itoa(colspan))
		out.WriteString(`">`)
		out.WriteString(html.EscapeString(emptyText))
		out.WriteString(`</td></tr>`)
	}
	for _, row := range rows {
		out.WriteString(`<tr>`)
		for index, column := range section.Columns {
			value := ""
			if index < len(row) {
				value = row[index]
			}
			out.WriteString(`<td class="`)
			out.WriteString(columnClass(column))
			out.WriteString(`">`)
			out.WriteString(cellHTML(value, column))
			out.WriteString(`</td>`)
		}
		out.WriteString(`</tr>`)
	}
	out.WriteString(`</tbody></table>`)
	if len(summary) > 0 {
		out.WriteString(`<table class="template-table summary-table">`)
		out.WriteString(colgroup)
		out.WriteString(`<tbody><tr>`)
		for index, column := range section.Columns {
			value := ""
			if index < len(summary) {
				value = summary[index]
			}
			out.WriteString(`<td class="`)
			out.WriteString(columnClass(column))
			out.WriteString(`">`)
			out.WriteString(cellHTML(value, column))
			out.WriteString(`</td>`)
		}
		out.WriteString(`</tr></tbody></table>`)
	}
	out.WriteString(`</div>`)
	return out.String()
}

func (r *pdfRenderer) renderBookkeepingTable(section Section, periodText string, rows [][]string, totals [][]string, emptyText, datePrefix string) string {
	amountIndex := 0
	for index, column := range section.Columns {
		if column.Key == "amount" {
			amountIndex = index
			break
		}
	}
	colspan := len(section.Columns)
	if colspan == 0 {
		return ""
	}
	var out strings.Builder
	colgroup := colgroupHTML(section.Columns)
	out.WriteString(`<div class="bookkeeping-section"><table class="bookkeeping-table">`)
	out.WriteString(colgroup)
	out.WriteString(`<thead><tr class="bookkeeping-section-row"><td colspan="`)
	out.WriteString(strconv.Itoa(colspan))
	out.WriteString(`">`)
	out.WriteString(escapeCell(singleLineText(section.Title), false))
	out.WriteString(`</td></tr>`)
	if periodText != "" {
		out.WriteString(`<tr class="bookkeeping-date-row"><td colspan="`)
		out.WriteString(strconv.Itoa(colspan))
		out.WriteString(`">`)
		out.WriteString(html.EscapeString(datePrefix + periodText))
		out.WriteString(`</td></tr>`)
	}
	out.WriteString(`<tr class="bookkeeping-header-row">`)
	for _, column := range section.Columns {
		out.WriteString(`<th class="`)
		out.WriteString(bookkeepingColumnClass(column))
		out.WriteString(`">`)
		out.WriteString(bookkeepingCellHTML(column.Label, column))
		out.WriteString(`</th>`)
	}
	out.WriteString(`</tr></thead><tbody>`)
	if len(rows) == 0 {
		out.WriteString(`<tr class="bookkeeping-empty-row"><td colspan="`)
		out.WriteString(strconv.Itoa(colspan))
		out.WriteString(`">`)
		out.WriteString(html.EscapeString(emptyText))
		out.WriteString(`</td></tr>`)
	}
	for _, row := range rows {
		out.WriteString(`<tr class="bookkeeping-body-row">`)
		for index, column := range section.Columns {
			value := ""
			if index < len(row) {
				value = row[index]
			}
			out.WriteString(`<td class="`)
			out.WriteString(bookkeepingColumnClass(column))
			out.WriteString(`">`)
			out.WriteString(bookkeepingCellHTML(value, column))
			out.WriteString(`</td>`)
		}
		out.WriteString(`</tr>`)
	}
	for index, row := range totals {
		out.WriteString(`<tr class="bookkeeping-total-row`)
		if index == 0 {
			out.WriteString(` bookkeeping-total-row-first`)
		}
		out.WriteString(`">`)
		if amountIndex > 0 {
			out.WriteString(`<td class="bookkeeping-total-label" colspan="`)
			out.WriteString(strconv.Itoa(amountIndex))
			out.WriteString(`">`)
			if len(row) > 0 {
				out.WriteString(bookkeepingCellText(row[0], false))
			}
			out.WriteString(`</td>`)
		}
		for index := amountIndex; index < len(section.Columns); index++ {
			value := ""
			if index == amountIndex && len(row) > 1 {
				value = row[1]
			}
			out.WriteString(`<td class="`)
			out.WriteString(bookkeepingColumnClass(section.Columns[index]))
			out.WriteString(`">`)
			out.WriteString(bookkeepingCellHTML(value, section.Columns[index]))
			out.WriteString(`</td>`)
		}
		out.WriteString(`</tr>`)
	}
	out.WriteString(`</tbody></table></div>`)
	return out.String()
}

func (r *pdfRenderer) budgetRows(budget map[string]any) [][]string {
	items := anyList(budget["items"])
	transactions := anyList(budget["transactions"])
	baseCurrency := stringValue(budget["baseCurrency"])
	rows := make([][]string, 0, len(items))
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		effective := effectiveItemAmounts(item, transactions)
		rows = append(rows, []string{
			itemLabel(item),
			moneyWithSecondary(baseCurrency, effective.BudgetBase, mapValue(item, "budget")),
			moneyWithTransactionBreakdown(baseCurrency, effective.EstimatedBase, effective.EstimatedTransactionTotals),
			money(baseCurrency, effective.VarianceBase),
		})
	}
	return rows
}

func (r *pdfRenderer) budgetSummaryRow(budget map[string]any, ctx pdfTableContext) []string {
	baseCurrency := stringValue(budget["baseCurrency"])
	return []string{
		tableText("Total", ctx.BudgetLabels["total"], ctx),
		money(baseCurrency, effectiveTotal(budget, "budgetBase")),
		money(baseCurrency, effectiveTotal(budget, "estimatedBase")),
		money(baseCurrency, effectiveTotal(budget, "varianceBase")),
	}
}

func (r *pdfRenderer) transactionRows(transactions []any, columns []Column, budget map[string]any, participants []budgetParticipant, ctx pdfTableContext) [][]string {
	baseCurrency := stringValue(budget["baseCurrency"])
	rows := make([][]string, 0, len(transactions))
	for _, raw := range transactions {
		tx, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		row := make([]string, 0, len(columns))
		for _, column := range columns {
			row = append(row, transactionColumnText(tx, column.Key, baseCurrency, participants, ctx))
		}
		rows = append(rows, row)
	}
	return rows
}

func (r *pdfRenderer) installmentRows(budget map[string]any, ctx pdfTableContext) [][]string {
	if !shouldShowInstallmentCategory(budget) {
		return overallInstallmentRows(budget, ctx)
	}
	rows := [][]string{}
	sequence := 1
	transactions := anyList(budget["transactions"])
	for _, raw := range anyList(budget["items"]) {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		config := mapValue(item, "installmentConfig")
		amounts := floatList(config["periodAmounts"])
		progress := boolList(config["periodProgress"])
		remarks := stringList(config["periodRemarks"])
		targetOriginal, _ := installmentTargetAmount(item, config, transactions)
		if len(amounts) == 0 {
			months := int64Value(config["months"])
			if months <= 0 {
				months = int64(len(progress))
			}
			if months <= 0 {
				months = 1
			}
			amounts = make([]float64, months)
			for i := range amounts {
				amounts[i] = roundMoney(targetOriginal / float64(months))
			}
		}
		currency := stringDefault(stringValue(mapValue(item, "budget")["currency"]), stringValue(budget["baseCurrency"]))
		assignedAmount := 0.0
		for index, amount := range amounts {
			done := ""
			if index < len(progress) && progress[index] {
				done = "X"
			}
			remark := ""
			if index < len(remarks) {
				remark = remarks[index]
			}
			assignedAmount = roundMoney(assignedAmount + amount)
			rows = append(rows, []string{
				strconv.Itoa(sequence),
				itemLabel(item),
				installmentPeriodLabel(budget, item, index),
				targetWithRemaining(currency, targetOriginal, math.Max(0, targetOriginal-assignedAmount), ctx),
				money(currency, amount),
				done,
				remark,
			})
			sequence++
		}
	}
	return rows
}

func (r *pdfRenderer) installmentSummaryRow(budget map[string]any, ctx pdfTableContext) []string {
	baseCurrency := stringValue(budget["baseCurrency"])
	if !shouldShowInstallmentCategory(budget) {
		return []string{"", tableText("Total", ctx.BudgetLabels["total"], ctx), money(baseCurrency, effectiveTotal(budget, "budgetBase")), money(baseCurrency, effectiveTotal(budget, "budgetBase")), "", ""}
	}
	return []string{"", tableText("Total", ctx.BudgetLabels["total"], ctx), "", money(baseCurrency, effectiveTotal(budget, "budgetBase")), money(baseCurrency, effectiveTotal(budget, "budgetBase")), "", ""}
}

func (r *pdfRenderer) bookkeepingTotalRows(budget map[string]any, records []map[string]any, ctx pdfTableContext) [][]string {
	baseCurrency := stringValue(budget["baseCurrency"])
	income := 0.0
	expense := 0.0
	for _, record := range records {
		amount := floatValue(record["amountBase"])
		switch stringValue(record["transactionType"]) {
		case "income":
			income += amount
		case "expense":
			expense += amount
		}
	}
	return [][]string{
		{tableText("Income total", ctx.BookkeepingLabels["bookkeepingIncomeTotal"], ctx), money(baseCurrency, income)},
		{tableText("Expense total", ctx.BookkeepingLabels["bookkeepingExpenseTotal"], ctx), money(baseCurrency, expense)},
	}
}

func multilineBlockHTML(value string, lineClass string) string {
	lines := strings.Split(value, "\n")
	out := []string{}
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		out = append(out, `<div class="`+html.EscapeString(lineClass)+`">`+html.EscapeString(line)+`</div>`)
	}
	return strings.Join(out, "")
}

func singleLineText(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

func escapeCell(value string, trim bool) string {
	if trim {
		value = strings.TrimSpace(value)
	}
	lines := strings.Split(value, "\n")
	if len(lines) == 1 {
		return html.EscapeString(value)
	}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if trim {
			line = strings.TrimSpace(line)
		}
		out = append(out, `<span class="cell-line">`+html.EscapeString(line)+`</span>`)
	}
	return strings.Join(out, "")
}

func cellHTML(value string, column Column) string {
	if column.DataType == "money" {
		lines := strings.Split(value, "\n")
		out := make([]string, 0, len(lines))
		for index, line := range lines {
			class := "money-line"
			if index > 0 {
				class += " money-line-secondary"
			}
			out = append(out, `<span class="`+class+`">`+html.EscapeString(strings.TrimSpace(line))+`</span>`)
		}
		return strings.Join(out, "")
	}
	return escapeCell(value, true)
}

func colgroupHTML(columns []Column) string {
	var out strings.Builder
	out.WriteString("<colgroup>")
	for _, column := range columns {
		width := column.WidthPercent
		if width <= 0 {
			width = 25
		}
		out.WriteString(`<col style="width:`)
		out.WriteString(cssNumber(width))
		out.WriteString(`%">`)
	}
	out.WriteString("</colgroup>")
	return out.String()
}

func cssNumber(value float64) string {
	return strings.TrimRight(strings.TrimRight(strconv.FormatFloat(value, 'f', 3, 64), "0"), ".")
}

func columnClass(column Column) string {
	classes := []string{}
	switch column.Align {
	case "right":
		classes = append(classes, "align-right")
	case "center":
		classes = append(classes, "align-center")
	}
	if column.DataType == "money" {
		classes = append(classes, "money-cell")
	}
	return strings.Join(classes, " ")
}

func headerBorderClass(index, total int) string {
	if index == 0 {
		if total == 1 {
			return ""
		}
		return "header-left"
	}
	if index == total-1 {
		return "header-last"
	}
	return "header-middle"
}

func bookkeepingColumnClass(column Column) string {
	classes := []string{}
	switch column.Align {
	case "right":
		classes = append(classes, "bookkeeping-align-right")
	case "center":
		classes = append(classes, "bookkeeping-align-center")
	}
	switch column.DataType {
	case "money":
		classes = append(classes, "bookkeeping-money-cell")
	case "code":
		classes = append(classes, "bookkeeping-code-cell")
	default:
		classes = append(classes, "bookkeeping-text-cell")
	}
	return strings.Join(classes, " ")
}

func bookkeepingCellHTML(value string, column Column) string {
	if column.DataType == "money" {
		lines := strings.Split(value, "\n")
		out := make([]string, 0, len(lines))
		for index, line := range lines {
			class := "bookkeeping-cell-line bookkeeping-money-line"
			if index > 0 {
				class += " bookkeeping-money-line-secondary"
			}
			out = append(out, `<div class="`+class+`">`+html.EscapeString(strings.TrimSpace(line))+`</div>`)
		}
		return strings.Join(out, "")
	}
	if column.DataType == "code" {
		value = wrapLongReference(value)
	}
	return bookkeepingCellText(value, true)
}

func bookkeepingCellText(value string, trim bool) string {
	lines := strings.Split(value, "\n")
	if len(lines) == 1 {
		if trim {
			value = strings.TrimSpace(value)
		}
		return html.EscapeString(value)
	}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if trim {
			line = strings.TrimSpace(line)
		}
		out = append(out, `<div class="bookkeeping-cell-line">`+html.EscapeString(line)+`</div>`)
	}
	return strings.Join(out, "")
}

func fileURL(path string) string {
	u := url.URL{Scheme: "file", Path: filepath.ToSlash(path)}
	return u.String()
}

func sectionsByKey(sections []Section) map[string]Section {
	out := map[string]Section{}
	for _, section := range sections {
		out[section.Key] = section
	}
	return out
}

func sectionOrDefault(sections map[string]Section, key string, fallback Section) Section {
	if section, ok := sections[key]; ok {
		return section
	}
	return fallback
}

func localizedSection(section Section, ctx pdfTableContext) Section {
	section.Title = localizedSectionTitle(section.Key, section.Title, ctx)
	for index := range section.Columns {
		section.Columns[index].Label = localizedColumnLabel(section.Columns[index].Key, section.Columns[index].Label, ctx)
	}
	return section
}

func localizedSectionTitle(key, english string, ctx pdfTableContext) string {
	mapping := map[string]string{
		"budget_highlights":        "budgetHighlightsTitle",
		"transaction_breakdown":    "transactionBreakdownTitle",
		"installments":             "installmentsTitle",
		"group_expense_summary":    "groupExpenseSummaryTitle",
		"group_settlement_summary": "groupSettlementSummaryTitle",
		"group_split_details":      "groupSplitDetailsTitle",
		"settlement_instructions":  "settlementInstructionsTitle",
	}
	localized := ctx.BudgetLabels[mapping[key]]
	if localized == "" {
		localized = english
	}
	return tableText(english, localized, ctx)
}

func localizedColumnLabel(key, english string, ctx pdfTableContext) string {
	localized := ctx.ColumnLabels[key]
	if localized == "" {
		localized = english
	}
	if ctx.Mode == "en" {
		return english
	}
	if ctx.Mode == "bilingual" {
		return english + "\n" + localized
	}
	return localized
}

func installmentPeriodSection(section Section, budget map[string]any, ctx pdfTableContext) Section {
	showCategory := shouldShowInstallmentCategory(budget)
	sequenceWidth := 6.0
	if ctx.Mode == "en" {
		sequenceWidth = 4
	}
	targetWidth := 20.0
	amountWidth := 21.0
	remarkWidth := 33.0
	if ctx.Mode != "en" {
		amountWidth = 20
		remarkWidth = 30
	}
	columns := []Column{}
	if showCategory {
		targetWidth = 17
		amountWidth = 19
		if ctx.Mode != "en" {
			amountWidth = 17
		}
		remarkWidth = 27
		categoryWidth := 13.0
		periodWidth := 15.0
		if ctx.Mode != "en" {
			categoryWidth = 14
			periodWidth = 14
		}
		columns = []Column{
			{Key: "sequence", Label: "No.", Align: "center", WidthPercent: sequenceWidth, DataType: "text"},
			{Key: "category", Label: "Category", Align: "left", WidthPercent: categoryWidth, DataType: "text"},
			{Key: "period", Label: "Period", Align: "left", WidthPercent: periodWidth, DataType: "text"},
			{Key: "target_amount", Label: "Target", Align: "right", WidthPercent: targetWidth, DataType: "money"},
			{Key: "period_amount", Label: "Amount", Align: "right", WidthPercent: amountWidth, DataType: "money"},
			{Key: "progress", Label: "Done", Align: "center", WidthPercent: 5, DataType: "text"},
			{Key: "remark", Label: "Remark", Align: "left", WidthPercent: remarkWidth, DataType: "text"},
		}
	} else {
		periodWidth := 17.0
		if ctx.Mode != "en" {
			periodWidth = 19
		}
		columns = []Column{
			{Key: "sequence", Label: "No.", Align: "center", WidthPercent: sequenceWidth, DataType: "text"},
			{Key: "period", Label: "Period", Align: "left", WidthPercent: periodWidth, DataType: "text"},
			{Key: "target_amount", Label: "Target", Align: "right", WidthPercent: targetWidth, DataType: "money"},
			{Key: "period_amount", Label: "Amount", Align: "right", WidthPercent: amountWidth, DataType: "money"},
			{Key: "progress", Label: "Done", Align: "center", WidthPercent: 5, DataType: "text"},
			{Key: "remark", Label: "Remark", Align: "left", WidthPercent: remarkWidth, DataType: "text"},
		}
	}
	for index := range columns {
		columns[index].Label = localizedColumnLabel(columns[index].Key, columns[index].Label, ctx)
	}
	section.Columns = columns
	return section
}

func shouldShowInstallmentCategory(budget map[string]any) bool {
	return stringValue(budget["installmentDisplayMode"]) != "overall"
}

func bookkeepingColumnLabel(key, english string, ctx pdfTableContext) string {
	localized := ctx.ColumnLabels[key]
	if localized == "" {
		localized = english
	}
	return tableText(english, localized, ctx)
}

func tableText(english, localized string, ctx pdfTableContext) string {
	if localized == "" {
		localized = english
	}
	switch ctx.Mode {
	case "en":
		return english
	case "bilingual":
		if english == localized {
			return english
		}
		return english + " " + localized
	default:
		return localized
	}
}

func datePrefix(ctx pdfTableContext) string {
	if ctx.Mode == "en" {
		return "Date: "
	}
	if ctx.Mode == "bilingual" {
		chineseLabel := budgetLabel(ctx.ChineseLanguage, "datePrefix")
		if ctx.Bookkeeping {
			chineseLabel = bookkeepingLabel(ctx.ChineseLanguage, "datePrefix")
		}
		return "Date / " + strings.TrimRight(chineseLabel, ":： ") + ": "
	}
	if ctx.Bookkeeping {
		return ctx.BookkeepingLabels["datePrefix"]
	}
	return ctx.BudgetLabels["datePrefix"]
}

func documentLanguage(language string) string {
	switch language {
	case "sc":
		return "zh-Hans"
	case "tc":
		return "zh-Hant"
	case "ja", "fr", "ru", "de":
		return language
	default:
		return "en"
	}
}

func newPDFTableContext(options Options, bookkeeping bool) pdfTableContext {
	languages := options.PDFLanguages
	if len(languages) == 0 {
		languages = languagesFromLegacyTableOptions(options.TableLanguageMode, options.TableChineseLanguage)
	}
	mode := "composite"
	if options.PDFLanguagesExplicit {
		if len(languages) == 1 && languages[0] == "en" {
			mode = "en"
		}
	} else {
		if len(languages) == 1 && languages[0] == "en" {
			mode = "en"
		}
		if len(languages) == 2 && languages[0] == "en" && (languages[1] == "sc" || languages[1] == "tc") {
			mode = "bilingual"
		}
	}
	lang := "en"
	if len(languages) > 0 {
		lang = languages[0]
	}
	chinese := "tc"
	for _, item := range languages {
		if item == "sc" {
			chinese = "sc"
			break
		}
	}
	return pdfTableContext{
		Mode:              mode,
		Language:          lang,
		ChineseLanguage:   chinese,
		Languages:         languages,
		Bookkeeping:       bookkeeping,
		BudgetLabels:      compositeBudgetLabels(languages),
		BookkeepingLabels: compositeBookkeepingLabels(languages),
		ColumnLabels:      compositeColumnLabels(languages, bookkeeping),
		TransactionTypes:  compositeTransactionTypeLabels(languages),
		SplitTypes:        compositeSplitLabels(languages),
	}
}

func compositeBudgetLabels(languages []string) map[string]string {
	keys := []string{"budgetHighlightsTitle", "datePrefix", "emptyBudgetItems", "emptyGroupSplitDetails", "emptySettlementInstructions", "emptyInstallments", "emptyTransactions", "groupExpenseSummaryTitle", "groupSettlementSummaryTitle", "groupSplitDetailsTitle", "installmentsTitle", "noParticipant", "remainingLabel", "settlementInstructionsTitle", "total", "transactionBreakdownTitle"}
	out := map[string]string{}
	for _, key := range keys {
		if key == "datePrefix" {
			out[key] = joinDatePrefixLabels(languages, func(lang string) string { return budgetLabel(lang, key) })
			continue
		}
		out[key] = joinLabels(languages, func(lang string) string { return budgetLabel(lang, key) })
	}
	return out
}

func compositeBookkeepingLabels(languages []string) map[string]string {
	keys := []string{"bookkeepingLedgerSubtitle", "bookkeepingRecordsTitle", "emptyBookkeepingRecords", "bookkeepingExpenseTotal", "bookkeepingIncomeTotal", "datePrefix"}
	out := map[string]string{}
	for _, key := range keys {
		if key == "datePrefix" {
			out[key] = joinDatePrefixLabels(languages, func(lang string) string { return bookkeepingLabel(lang, key) })
			continue
		}
		out[key] = joinLabels(languages, func(lang string) string { return bookkeepingLabel(lang, key) })
	}
	return out
}

func compositeColumnLabels(languages []string, bookkeeping bool) map[string]string {
	keys := []string{"amount", "balance", "budget", "category", "estimated_actuals", "from", "metric", "paid", "paid_by", "participant", "participants", "period", "period_amount", "progress", "remark", "sequence", "share", "split_type", "target_amount", "to", "transaction_details", "unit_price", "quantity", "variance", "type", "date", "order", "details", "accounts", "destination"}
	out := map[string]string{}
	for _, key := range keys {
		out[key] = joinLabels(languages, func(lang string) string {
			if bookkeeping {
				return bookkeepingColumn(lang, key)
			}
			return budgetColumn(lang, key)
		})
	}
	return out
}

func compositeTransactionTypeLabels(languages []string) map[string]string {
	keys := []string{"cross_border_remittance", "expense", "fx_exchange", "income", "sof", "transfer"}
	out := map[string]string{}
	for _, key := range keys {
		out[key] = joinLabels(languages, func(lang string) string { return transactionTypeLabel(lang, key) })
	}
	return out
}

func compositeSplitLabels(languages []string) map[string]string {
	keys := []string{"custom_amount", "custom_share", "equal", "excluded", "individual", "per_person", "personal"}
	out := map[string]string{}
	for _, key := range keys {
		out[key] = joinLabels(languages, func(lang string) string { return splitTypeLabel(lang, key) })
	}
	return out
}

func joinLabels(languages []string, label func(string) string) string {
	if len(languages) == 0 {
		languages = []string{"en"}
	}
	out := []string{}
	seen := map[string]bool{}
	for _, lang := range languages {
		value := label(lang)
		if value == "" {
			value = label("en")
		}
		if value != "" && !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	return strings.Join(out, "\n")
}

func joinDatePrefixLabels(languages []string, label func(string) string) string {
	if len(languages) == 0 {
		languages = []string{"en"}
	}
	out := []string{}
	seen := map[string]bool{}
	for _, lang := range languages {
		value := strings.TrimRight(strings.TrimSpace(label(lang)), ":： ")
		if value == "" {
			value = strings.TrimRight(strings.TrimSpace(label("en")), ":： ")
		}
		if value != "" && !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	if len(out) == 0 {
		return "Date: "
	}
	return strings.Join(out, " / ") + ": "
}

func budgetLabel(lang, key string) string {
	labels := map[string]map[string]string{
		"en": {"budgetHighlightsTitle": "Budget Summary", "datePrefix": "Date: ", "emptyBudgetItems": "No budget items", "emptyGroupSplitDetails": "No split details", "emptySettlementInstructions": "No settlement needed", "emptyInstallments": "No installment targets", "emptyTransactions": "No transactions", "groupExpenseSummaryTitle": "Group Expense Summary", "groupSettlementSummaryTitle": "Group Settlement Summary", "groupSplitDetailsTitle": "Group Split Details", "installmentsTitle": "Installments", "noParticipant": "Unspecified", "remainingLabel": "Remaining", "settlementInstructionsTitle": "Settlement Instructions", "total": "Total", "transactionBreakdownTitle": "Transaction Breakdown"},
		"sc": {"budgetHighlightsTitle": "预算摘要", "datePrefix": "日期：", "emptyBudgetItems": "暂无预算项", "emptyGroupSplitDetails": "暂无分摊明细", "emptySettlementInstructions": "无需结算", "emptyInstallments": "暂无分期目标", "emptyTransactions": "暂无交易", "groupExpenseSummaryTitle": "多人费用摘要", "groupSettlementSummaryTitle": "多人结算摘要", "groupSplitDetailsTitle": "多人分摊明细", "installmentsTitle": "分期明细", "noParticipant": "未指定", "remainingLabel": "剩余", "settlementInstructionsTitle": "结算指引", "total": "总计", "transactionBreakdownTitle": "交易明细"},
		"tc": {"budgetHighlightsTitle": "預算摘要", "datePrefix": "日期：", "emptyBudgetItems": "暫無預算項", "emptyGroupSplitDetails": "暫無分攤明細", "emptySettlementInstructions": "無需結算", "emptyInstallments": "暫無分期目標", "emptyTransactions": "暫無交易", "groupExpenseSummaryTitle": "多人費用摘要", "groupSettlementSummaryTitle": "多人結算摘要", "groupSplitDetailsTitle": "多人分攤明細", "installmentsTitle": "分期明細", "noParticipant": "未指定", "remainingLabel": "剩餘", "settlementInstructionsTitle": "結算指引", "total": "總計", "transactionBreakdownTitle": "交易明細"},
	}
	if value := labels[lang][key]; value != "" {
		return value
	}
	return labels["en"][key]
}

func budgetColumn(lang, key string) string {
	columns := map[string]map[string]string{
		"en": {"amount": "Amount", "balance": "Balance", "budget": "Budget", "category": "Category", "estimated_actuals": "Estimated Actuals", "from": "From", "metric": "Metric", "paid": "Paid", "paid_by": "Paid By", "participant": "Participant", "participants": "Participants", "period": "Period", "period_amount": "Amount", "progress": "Progress", "remark": "Remark", "sequence": "No.", "share": "Share", "split_type": "Split Type", "target_amount": "Target", "to": "To", "transaction_details": "Transaction Details", "unit_price": "Unit Price", "quantity": "Quantity", "variance": "Variance"},
		"sc": {"amount": "金额", "balance": "差额", "budget": "预算", "category": "类别", "estimated_actuals": "预估实际", "from": "付款方", "metric": "项目", "paid": "已支付", "paid_by": "付款人", "participant": "参与者", "participants": "参与者", "period": "期间", "period_amount": "金额", "progress": "进度", "remark": "备注", "sequence": "序号", "share": "应承担", "split_type": "分摊方式", "target_amount": "目标", "to": "收款方", "transaction_details": "交易详情", "unit_price": "单价", "quantity": "数量", "variance": "差额"},
		"tc": {"amount": "金額", "balance": "差額", "budget": "預算", "category": "類別", "estimated_actuals": "預估實際", "from": "付款方", "metric": "項目", "paid": "已支付", "paid_by": "付款人", "participant": "參與者", "participants": "參與者", "period": "期間", "period_amount": "金額", "progress": "進度", "remark": "備註", "sequence": "序號", "share": "應承擔", "split_type": "分攤方式", "target_amount": "目標", "to": "收款方", "transaction_details": "交易詳情", "unit_price": "單價", "quantity": "數量", "variance": "差額"},
	}
	if value := columns[lang][key]; value != "" {
		return value
	}
	return columns["en"][key]
}

func bookkeepingLabel(lang, key string) string {
	labels := map[string]map[string]string{
		"en": {"bookkeepingLedgerSubtitle": "Bookkeeping Ledger", "bookkeepingRecordsTitle": "Bookkeeping Records", "emptyBookkeepingRecords": "No bookkeeping records", "bookkeepingExpenseTotal": "Expense total", "bookkeepingIncomeTotal": "Income total", "datePrefix": "Date: "},
		"sc": {"bookkeepingLedgerSubtitle": "记账流水", "bookkeepingRecordsTitle": "记账记录", "emptyBookkeepingRecords": "暂无记账记录", "bookkeepingExpenseTotal": "支出总计", "bookkeepingIncomeTotal": "收入总计", "datePrefix": "日期："},
		"tc": {"bookkeepingLedgerSubtitle": "記帳流水", "bookkeepingRecordsTitle": "記帳記錄", "emptyBookkeepingRecords": "暫無記帳記錄", "bookkeepingExpenseTotal": "支出總計", "bookkeepingIncomeTotal": "收入總計", "datePrefix": "日期："},
	}
	if value := labels[lang][key]; value != "" {
		return value
	}
	return labels["en"][key]
}

func bookkeepingColumn(lang, key string) string {
	columns := map[string]map[string]string{
		"en": {"type": "Type", "date": "Date", "order": "Order No.", "details": "Details", "category": "Category", "accounts": "Funds / Accounts", "amount": "Amount", "destination": "Destination", "remark": "Remark"},
		"sc": {"type": "交易类型", "date": "日期", "order": "订单号", "details": "交易详情", "category": "分类", "accounts": "资金/账户", "amount": "金额", "destination": "目的金额", "remark": "备注"},
		"tc": {"type": "交易類型", "date": "日期", "order": "訂單號", "details": "交易詳情", "category": "分類", "accounts": "資金/帳戶", "amount": "金額", "destination": "目的金額", "remark": "備註"},
	}
	if value := columns[lang][key]; value != "" {
		return value
	}
	return columns["en"][key]
}

func transactionTypeLabel(lang, key string) string {
	labels := map[string]map[string]string{
		"en": {"cross_border_remittance": "Cross-border remittance", "expense": "Order / expense", "fx_exchange": "Currency exchange", "income": "Income", "sof": "Source of funds", "transfer": "Transfer"},
		"sc": {"cross_border_remittance": "跨境汇款", "expense": "订单 / 支出", "fx_exchange": "货币兑换", "income": "收入", "sof": "资金来源", "transfer": "资金划转"},
		"tc": {"cross_border_remittance": "跨境匯款", "expense": "訂單 / 支出", "fx_exchange": "貨幣兌換", "income": "收入", "sof": "資金來源", "transfer": "資金劃轉"},
	}
	if value := labels[lang][key]; value != "" {
		return value
	}
	return labels["en"][key]
}

func splitTypeLabel(lang, key string) string {
	labels := map[string]map[string]string{
		"en": {"custom_amount": "Custom amount", "custom_share": "Custom share", "equal": "Equal split", "excluded": "Excluded from settlement", "individual": "Individual payment", "per_person": "Same amount per person", "personal": "Personal"},
		"sc": {"custom_amount": "自定义金额", "custom_share": "自定义比例", "equal": "平均分摊", "excluded": "不纳入结算", "individual": "各自付款", "per_person": "每人同额", "personal": "个人自付"},
		"tc": {"custom_amount": "自訂金額", "custom_share": "自訂比例", "equal": "平均分攤", "excluded": "不納入結算", "individual": "各自付款", "per_person": "每人同額", "personal": "個人自付"},
	}
	if value := labels[lang][key]; value != "" {
		return value
	}
	return labels["en"][key]
}

func periodText(budget map[string]any) string {
	start := stringValue(budget["startDate"])
	end := stringValue(budget["endDate"])
	if start == "" && end == "" {
		return ""
	}
	return formatPDFDate(start) + " to " + formatPDFDate(end)
}

func formatPDFDate(value string) string {
	if value == "" {
		return ""
	}
	if parsed, ok := parsePDFDate(value); ok {
		return parsed.Format("2 January, 2006")
	}
	return value
}

func formatPDFDateOnly(value string) string {
	if value == "" {
		return ""
	}
	if parsed, ok := parsePDFDate(value); ok {
		return parsed.Format("2006-01-02")
	}
	return value
}

func parsePDFDate(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{
		"2006-01-02",
		"2006-01-02 15:04:05",
		time.RFC3339,
		"2006-01-02T15:04:05Z0700",
		"2006-01-02T15:04:05",
	} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, true
		}
	}
	if len(value) >= len("2006-01-02") {
		if parsed, err := time.Parse("2006-01-02", value[:len("2006-01-02")]); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

func itemLabel(item map[string]any) string {
	if category := stringValue(item["category"]); category != "" {
		return category
	}
	return stringValue(item["label"])
}

func money(currency string, amount float64) string {
	if math.Abs(amount) < 0.005 {
		amount = 0
	}
	return strings.TrimSpace(currency) + " " + strconv.FormatFloat(math.Round(amount*100)/100, 'f', 2, 64)
}

func moneyWithSecondary(baseCurrency string, baseAmount float64, leg map[string]any) string {
	primary := money(baseCurrency, baseAmount)
	currency := stringValue(leg["currency"])
	rate := floatValue(leg["rateToBase"])
	if currency == "" || currency == baseCurrency || rate <= 0 {
		return primary
	}
	return primary + "\n" + money(currency, baseAmount/rate)
}

func moneyWithTransactionBreakdown(baseCurrency string, baseAmount float64, totals []currencyTotal) string {
	primary := money(baseCurrency, baseAmount)
	if len(totals) == 0 || (len(totals) == 1 && totals[0].Currency == baseCurrency) {
		return primary
	}
	lines := []string{primary}
	for _, total := range totals {
		lines = append(lines, money(total.Currency, total.AmountOriginal))
	}
	return strings.Join(lines, "\n")
}

func mapValue(value map[string]any, key string) map[string]any {
	if out, ok := value[key].(map[string]any); ok {
		return out
	}
	return map[string]any{}
}

func stringAnyList(values []string) []any {
	out := make([]any, 0, len(values))
	for _, value := range values {
		out = append(out, value)
	}
	return out
}

func floatList(value any) []float64 {
	items := anyList(value)
	out := make([]float64, 0, len(items))
	for _, item := range items {
		out = append(out, floatValue(item))
	}
	return out
}

func boolList(value any) []bool {
	items := anyList(value)
	out := make([]bool, 0, len(items))
	for _, item := range items {
		out = append(out, boolValue(item))
	}
	return out
}

func stringList(value any) []string {
	items := anyList(value)
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, stringValue(item))
	}
	return out
}

func roundMoney(value float64) float64 {
	if math.Abs(value) < 0.005 {
		return 0
	}
	return math.Round(value*100) / 100
}

func installmentTargetAmount(item map[string]any, config map[string]any, transactions []any) (float64, float64) {
	periodAmounts := floatList(config["periodAmounts"])
	configuredTotal := 0.0
	hasConfiguredTotal := false
	if config["totalAmount"] != nil {
		configuredTotal = floatValue(config["totalAmount"])
		hasConfiguredTotal = true
	} else if len(periodAmounts) > 0 {
		for _, amount := range periodAmounts {
			configuredTotal += amount
		}
		hasConfiguredTotal = true
	}
	if boolValue(config["enabled"]) && hasConfiguredTotal && configuredTotal > 0 {
		rate := floatValue(mapValue(item, "budget")["rateToBase"])
		if rate <= 0 {
			rate = 1
		}
		return configuredTotal, configuredTotal * rate
	}
	effective := effectiveItemAmounts(item, transactions)
	rate := floatValue(mapValue(item, "budget")["rateToBase"])
	original := effective.BudgetBase
	if rate > 0 {
		original = roundMoney(effective.BudgetBase / rate)
	}
	return original, effective.BudgetBase
}

func targetWithRemaining(currency string, targetAmount, remainingAmount float64, ctx pdfTableContext) string {
	return money(currency, targetAmount) + "\n" + tableText("Remaining", ctx.BudgetLabels["remainingLabel"], ctx) + " " + money(currency, remainingAmount)
}

func installmentPeriodLabel(budget map[string]any, item map[string]any, index int) string {
	start := ""
	if item != nil {
		start = stringValue(mapValue(item, "installmentConfig")["startMonth"])
	}
	if start != "" && len(start) == len("2006-01") {
		start += "-01"
	}
	if start == "" {
		start = stringValue(budget["startDate"])
	}
	parsed, ok := parsePDFDate(start)
	if !ok {
		return "#" + strconv.Itoa(index+1)
	}
	unit := stringValue(budget["installmentPeriodUnit"])
	switch unit {
	case "day":
		return parsed.AddDate(0, 0, index).Format("2 Jan 2006")
	case "week":
		return parsed.AddDate(0, 0, index*7).Format("2 Jan 2006")
	case "year":
		return parsed.AddDate(index, 0, 0).Format("2006")
	default:
		return parsed.AddDate(0, index, 0).Format("Jan 2006")
	}
}

func periodLabel(index int, unit string, ctx pdfTableContext) string {
	if unit == "" {
		unit = "month"
	}
	labels := map[string]string{"day": "day", "week": "week", "month": "month", "year": "year"}
	if ctx.ChineseLanguage == "sc" {
		labels = map[string]string{"day": "日", "week": "周", "month": "月", "year": "年"}
	}
	if ctx.ChineseLanguage == "tc" && ctx.Mode != "en" {
		labels = map[string]string{"day": "日", "week": "週", "month": "月", "year": "年"}
	}
	return fmt.Sprintf("%d %s", index, labels[unit])
}

func wrapLongReference(value string) string {
	if len(value) <= 18 || strings.ContainsAny(value, " \n\t") {
		return value
	}
	parts := []string{}
	for len(value) > 18 {
		parts = append(parts, value[:18])
		value = value[18:]
	}
	if value != "" {
		parts = append(parts, value)
	}
	return strings.Join(parts, "\n")
}

func accountText(record map[string]any) string {
	source := stringValue(record["sourceAccountName"])
	destination := stringValue(record["destinationAccountName"])
	if source != "" && destination != "" {
		return source + "\n-> " + destination
	}
	if source != "" {
		return source
	}
	return destination
}

func bookkeepingAmountText(record map[string]any, baseCurrency string) string {
	currency := stringDefault(stringValue(record["currency"]), baseCurrency)
	amount := floatValue(record["amountOriginal"])
	base := floatValue(record["amountBase"])
	if base == 0 {
		base = amount
	}
	text := money(currency, amount)
	if currency == baseCurrency {
		return text
	}
	return text + "\n" + money(baseCurrency, base)
}

func destinationAmountText(record map[string]any) string {
	currency := stringValue(record["destinationCurrency"])
	if currency == "" || record["destinationAmountOriginal"] == nil {
		return ""
	}
	return money(currency, floatValue(record["destinationAmountOriginal"]))
}

func transactionTypeText(txType string, ctx pdfTableContext) string {
	english := transactionTypeLabel("en", txType)
	localized := ctx.TransactionTypes[txType]
	return tableText(english, localized, ctx)
}

func base64SVG(svg string) string {
	return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))
}

func sortedKeys[T any](items map[string]T) []string {
	keys := make([]string, 0, len(items))
	for key := range items {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
