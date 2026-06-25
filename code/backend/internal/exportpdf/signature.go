package exportpdf

import (
	crand "crypto/rand"
	"encoding/base64"
	"fmt"
	"html"
	"math"
	"math/big"
	"strings"
	"time"
	"unicode/utf8"

	"budgetcentre/backend/internal/exportpdf/theme"
)

type pdfSignatureRenderer struct {
	pdfTheme  theme.Definition
	languages []string
}

type signaturePalette struct {
	TitleFill        string
	TitleStroke      string
	TitleText        string
	Border           string
	Divider          string
	NoteDivider      string
	NoteFill         string
	NoteStroke       string
	BodyText         string
	MutedText        string
	SignatureLine    string
	PatternPrimary   string
	PatternSecondary string
	PatternTertiary  string
	PatternGuide     string
}

type signatureNoteItem struct {
	Primary     string
	Details     string
	HasDateTime bool
}

func newPDFSignatureRenderer(pdfTheme theme.Definition, options Options) pdfSignatureRenderer {
	return pdfSignatureRenderer{
		pdfTheme:  pdfTheme,
		languages: options.SignatureLabelLanguage,
	}
}

func (r pdfSignatureRenderer) render(budget map[string]any, options Options, pdfTheme theme.Definition) string {
	source := mapValue(budget, "signatureConfig")
	if !boolValue(source["enabled"]) {
		return ""
	}
	config := cloneMap(source)
	config["labelMode"] = options.SignatureLabelMode
	config["pdfLanguages"] = stringAnyList(options.SignatureLabelLanguage)
	if len(r.languages) == 0 {
		r.languages = options.SignatureLabelLanguage
	}
	rows := signatureConfigRows(config)
	if len(rows) == 0 {
		return ""
	}

	width := pdfTheme.SignatureFullWidthMM()
	display := "block"
	wrapperStyle := ""
	if stringValue(config["sectionAlign"]) == "right" {
		width = 76
		display = "inline-block"
		wrapperStyle = ` style="text-align:right"`
	}
	svg := r.svg(config, width, pdfTheme)
	height := r.svgHeight(config, width)
	return `<div class="template-section signature-section"` + wrapperStyle + `>` +
		signatureImageHTML(svg, width, height, display) +
		`</div>`
}

func signatureImageHTML(svg string, width, height float64, display string) string {
	return `<img class="signature-svg" src="data:image/svg+xml;base64,` +
		base64.StdEncoding.EncodeToString([]byte(svg)) +
		`" style="display:` + display +
		`;width:` + signatureNumber(width) +
		`mm;height:` + signatureNumber(height) +
		`mm" alt="">`
}

func (r pdfSignatureRenderer) svg(config map[string]any, width float64, pdfTheme theme.Definition) string {
	height := r.svgHeight(config, width)
	titleRows := r.titleRows(r.signatureSectionTitle(config), width)
	titleBandHeight := r.titleBandHeight(titleRows)
	rows := signatureConfigRows(config)
	signingRows := r.signingRows(rows)
	noteRows := r.noteRows(rows)
	palette := signatureThemePalette(pdfTheme)

	var svg strings.Builder
	svg.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" width="`)
	svg.WriteString(signatureNumber(width))
	svg.WriteString(`mm" height="`)
	svg.WriteString(signatureNumber(height))
	svg.WriteString(`mm" viewBox="0 0 `)
	svg.WriteString(signatureNumber(width))
	svg.WriteString(` `)
	svg.WriteString(signatureNumber(height))
	svg.WriteString(`">`)
	svg.WriteString(`<rect x="0" y="0" width="`)
	svg.WriteString(signatureNumber(width))
	svg.WriteString(`" height="`)
	svg.WriteString(signatureNumber(titleBandHeight))
	svg.WriteString(`" fill="`)
	svg.WriteString(palette.TitleFill)
	svg.WriteString(`" stroke="`)
	svg.WriteString(palette.TitleStroke)
	svg.WriteString(`" stroke-width="0.2"/>`)
	svg.WriteString(r.titleSVG(titleRows, palette))
	svg.WriteString(`<rect x="0" y="`)
	svg.WriteString(signatureNumber(titleBandHeight))
	svg.WriteString(`" width="`)
	svg.WriteString(signatureNumber(width))
	svg.WriteString(`" height="`)
	svg.WriteString(signatureNumber(height - titleBandHeight))
	svg.WriteString(`" fill="#fff" stroke="`)
	svg.WriteString(palette.Border)
	svg.WriteString(`" stroke-width="0.2"/>`)

	rowTop := titleBandHeight + 2
	for index, row := range signingRows {
		rowHeight := r.rowHeight(row, config, width)
		if index > 0 {
			svg.WriteString(`<line x1="2" y1="`)
			svg.WriteString(signatureNumber(rowTop - 1.1))
			svg.WriteString(`" x2="`)
			svg.WriteString(signatureNumber(width - 2))
			svg.WriteString(`" y2="`)
			svg.WriteString(signatureNumber(rowTop - 1.1))
			svg.WriteString(`" stroke="`)
			svg.WriteString(palette.Divider)
			svg.WriteString(`" stroke-width="0.16"/>`)
		}
		fields := r.signatureFields(row, config)
		svg.WriteString(r.metaSVG(fields, rowTop, width, palette))
		if boolDefault(row["showSignature"], true) {
			svg.WriteString(r.signatureBoxSVG(config, rowTop, width, maxInt(1, len(fields)), palette))
		}
		rowTop += rowHeight
	}
	if len(noteRows) > 0 {
		if len(signingRows) > 0 {
			svg.WriteString(`<line x1="2" y1="`)
			svg.WriteString(signatureNumber(rowTop - 1.1))
			svg.WriteString(`" x2="`)
			svg.WriteString(signatureNumber(width - 2))
			svg.WriteString(`" y2="`)
			svg.WriteString(signatureNumber(rowTop - 1.1))
			svg.WriteString(`" stroke="`)
			svg.WriteString(palette.NoteDivider)
			svg.WriteString(`" stroke-width="0.14"/>`)
		}
		svg.WriteString(r.notesBlockSVG(noteRows, config, rowTop, width, palette))
	}
	svg.WriteString(`</svg>`)
	return svg.String()
}

func (r pdfSignatureRenderer) svgHeight(config map[string]any, width float64) float64 {
	rows := signatureConfigRows(config)
	titleBandHeight := r.titleBandHeight(r.titleRows(r.signatureSectionTitle(config), width))
	if len(rows) == 0 {
		return titleBandHeight + 4 + r.minimumRowHeight(width)
	}
	signingRows := r.signingRows(rows)
	total := titleBandHeight + 4
	for _, row := range signingRows {
		total += r.rowHeight(row, config, width)
	}
	total += r.notesBlockHeight(r.noteRows(rows), config, width)
	return total
}

func (r pdfSignatureRenderer) rowHeight(row map[string]any, config map[string]any, width float64) float64 {
	fieldCount := maxInt(1, len(r.signatureFields(row, config)))
	if !boolDefault(row["showSignature"], true) {
		if width <= 80 {
			return math.Max(14, 5.5+float64(fieldCount)*4.2)
		}
		return math.Max(11, 5.5+float64(fieldCount)*4.2)
	}
	if width <= 80 {
		return math.Max(r.minimumRowHeight(width), math.Max(29, 5+float64(fieldCount)*5)+28)
	}
	return math.Max(r.minimumRowHeight(width), 10.5+float64(fieldCount)*5)
}

func (r pdfSignatureRenderer) minimumRowHeight(width float64) float64 {
	if width <= 80 {
		return 62
	}
	return 39
}

func (r pdfSignatureRenderer) signatureFields(row map[string]any, config map[string]any) [][2]string {
	fields := [][2]string{}
	if boolDefault(row["showName"], true) && stringValue(row["displayName"]) != "" {
		fields = append(fields, [2]string{r.signatureMetaLabel(config, "participant"), stringValue(row["displayName"])})
	}
	if boolDefault(row["showRole"], true) && stringValue(row["roleLabel"]) != "" {
		fields = append(fields, [2]string{r.signatureMetaLabel(config, "capacity"), r.signatureRoleForDisplay(config, stringValue(row["roleLabel"]))})
	}
	if boolValue(row["showPosition"]) && stringValue(row["position"]) != "" {
		fields = append(fields, [2]string{r.signatureMetaLabel(config, "position"), r.signaturePositionForDisplay(config, stringValue(row["position"]))})
	}
	if boolValue(row["showEmail"]) && stringValue(row["email"]) != "" {
		fields = append(fields, [2]string{r.signatureMetaLabel(config, "email"), stringValue(row["email"])})
	}
	for _, raw := range anyList(row["customFields"]) {
		field, ok := raw.(map[string]any)
		if !ok || !boolDefault(field["show"], true) {
			continue
		}
		label := stringValue(field["label"])
		value := stringValue(field["value"])
		if label == "" && value == "" {
			continue
		}
		fields = append(fields, [2]string{r.signatureCustomFieldLabelForDisplay(config, label), value})
	}
	if boolDefault(row["showDateTime"], true) {
		fields = append(fields, [2]string{r.signatureMetaLabel(config, "dateTime"), r.signatureDateTimeForDisplay(stringValue(row["signedAt"]))})
	}
	return fields
}

func (r pdfSignatureRenderer) metaSVG(fields [][2]string, rowTop, width float64, palette signaturePalette) string {
	labelX := 3.0
	valueX := 41.0
	valueWidth := 56.0
	if width <= 80 {
		valueX = 25
		valueWidth = 46
	}
	baseline := rowTop + 4
	var svg strings.Builder
	limit := len(fields)
	if limit > 18 {
		limit = 18
	}
	for index := 0; index < limit; index++ {
		field := fields[index]
		y := baseline + float64(index)*5
		labelLines := r.packedTextLines(field[0], valueX-labelX-2, 1.62, 3)
		for lineIndex, line := range labelLines {
			svg.WriteString(r.text(labelX, y+float64(lineIndex)*1.62, line, 1.62, palette.MutedText, "sf-mono-light", "start", ""))
		}
		valueLines := []string{r.fitText(field[1], valueWidth)}
		if strings.Contains(field[1], "\n") {
			valueLines = r.packedTextLines(field[1], valueWidth, 1.62, 3)
		}
		valueSize := 2.55
		if len(valueLines) > 1 {
			valueSize = 1.62
		}
		for lineIndex, line := range valueLines {
			svg.WriteString(r.text(valueX, y+float64(lineIndex)*1.62, line, valueSize, palette.BodyText, "sf-mono", "start", ""))
		}
	}
	return svg.String()
}

func (r pdfSignatureRenderer) notesBlockSVG(rows []map[string]any, config map[string]any, rowTop, width float64, palette signaturePalette) string {
	height := r.notesBlockHeight(rows, config, width)
	x := 2.0
	innerWidth := width - 4
	var svg strings.Builder
	svg.WriteString(`<rect x="`)
	svg.WriteString(signatureNumber(x))
	svg.WriteString(`" y="`)
	svg.WriteString(signatureNumber(rowTop))
	svg.WriteString(`" width="`)
	svg.WriteString(signatureNumber(innerWidth))
	svg.WriteString(`" height="`)
	svg.WriteString(signatureNumber(height))
	svg.WriteString(`" fill="`)
	svg.WriteString(palette.NoteFill)
	svg.WriteString(`" stroke="`)
	svg.WriteString(palette.NoteStroke)
	svg.WriteString(`" stroke-width="0.14"/>`)
	items := r.compactNoteItems(rows, config)
	if len(items) == 0 {
		return svg.String()
	}
	columns := r.noteColumnCount(items, innerWidth)
	gapX := 3.2
	gapY := 1.8
	cellWidth := (innerWidth - float64(columns-1)*gapX) / float64(columns)
	y := rowTop + 2.3
	for start := 0; start < len(items); start += columns {
		end := start + columns
		if end > len(items) {
			end = len(items)
		}
		gridRow := items[start:end]
		rowHeight := 0.0
		for _, item := range gridRow {
			rowHeight = math.Max(rowHeight, r.noteItemHeight(item))
		}
		for columnIndex, item := range gridRow {
			cellX := x + 2 + float64(columnIndex)*(cellWidth+gapX)
			svg.WriteString(r.noteItemSVG(item, cellX, y, cellWidth, palette))
		}
		y += rowHeight + gapY
	}
	return svg.String()
}

func (r pdfSignatureRenderer) notesBlockHeight(rows []map[string]any, config map[string]any, width float64) float64 {
	items := r.compactNoteItems(rows, config)
	if len(items) == 0 {
		return 0
	}
	innerWidth := width - 4
	columns := r.noteColumnCount(items, innerWidth)
	gapY := 1.8
	contentHeight := 0.0
	rowCount := 0
	for start := 0; start < len(items); start += columns {
		end := start + columns
		if end > len(items) {
			end = len(items)
		}
		rowHeight := 0.0
		for _, item := range items[start:end] {
			rowHeight = math.Max(rowHeight, r.noteItemHeight(item))
		}
		contentHeight += rowHeight
		rowCount++
	}
	return math.Max(7, 4.6+contentHeight+float64(maxInt(0, rowCount-1))*gapY)
}

func (r pdfSignatureRenderer) compactNoteItems(rows []map[string]any, config map[string]any) []signatureNoteItem {
	items := []signatureNoteItem{}
	for _, row := range rows {
		item := r.compactNoteItem(row, config)
		if item.Primary == "" && item.Details == "" {
			continue
		}
		items = append(items, item)
	}
	return items
}

func (r pdfSignatureRenderer) compactNoteItem(row map[string]any, config map[string]any) signatureNoteItem {
	role := ""
	if boolDefault(row["showRole"], true) && stringValue(row["roleLabel"]) != "" {
		role = r.signatureRoleForDisplay(config, stringValue(row["roleLabel"]))
	}
	name := ""
	if boolDefault(row["showName"], true) && stringValue(row["displayName"]) != "" {
		name = stringValue(row["displayName"])
	}
	details := []string{}
	if boolValue(row["showPosition"]) && stringValue(row["position"]) != "" {
		details = append(details, r.noteFieldText(r.signatureMetaLabel(config, "position"), r.signaturePositionForDisplay(config, stringValue(row["position"]))))
	}
	if boolValue(row["showEmail"]) && stringValue(row["email"]) != "" {
		details = append(details, r.noteFieldText(r.signatureMetaLabel(config, "email"), stringValue(row["email"])))
	}
	for _, raw := range anyList(row["customFields"]) {
		field, ok := raw.(map[string]any)
		if !ok || !boolDefault(field["show"], true) {
			continue
		}
		label := stringValue(field["label"])
		value := stringValue(field["value"])
		if label == "" && value == "" {
			continue
		}
		details = append(details, r.noteFieldText(r.signatureCustomFieldLabelForDisplay(config, label), value))
	}
	hasDateTime := boolDefault(row["showDateTime"], true)
	if hasDateTime {
		details = append(details, r.noteFieldText(r.signatureMetaLabel(config, "dateTime"), r.signatureDateTimeForDisplay(stringValue(row["signedAt"]))))
	}
	primary := role
	if role != "" && name != "" {
		primary = r.noteFieldText(role, name)
	} else if name != "" {
		primary = r.noteFieldText(r.signatureMetaLabel(config, "participant"), name)
	}
	if primary == "" && len(details) > 0 {
		primary = details[0]
		details = details[1:]
	}
	filteredDetails := []string{}
	for _, detail := range details {
		if detail != "" {
			filteredDetails = append(filteredDetails, detail)
		}
	}
	return signatureNoteItem{Primary: primary, Details: strings.Join(filteredDetails, " · "), HasDateTime: hasDateTime}
}

func (r pdfSignatureRenderer) noteFieldText(label, value string) string {
	label = strings.TrimSpace(label)
	value = strings.TrimSpace(value)
	if label == "" {
		return value
	}
	if value == "" {
		return label
	}
	return label + " " + value
}

func (r pdfSignatureRenderer) noteColumnCount(items []signatureNoteItem, innerWidth float64) int {
	maxColumns := maxInt(1, minInt(4, len(items), int(math.Floor(innerWidth/32))))
	hasDateTime := false
	for _, item := range items {
		hasDateTime = hasDateTime || item.HasDateTime
	}
	if hasDateTime {
		return maxInt(1, minInt(maxColumns, int(math.Floor(innerWidth/56)), 2))
	}
	longest := 0
	for _, item := range items {
		longest = maxInt(longest, utf8.RuneCountInString(strings.TrimSpace(item.Primary+" "+item.Details)))
	}
	if longest <= 28 {
		return maxColumns
	}
	if longest <= 48 {
		return maxInt(1, minInt(maxColumns, 3))
	}
	return maxInt(1, minInt(maxColumns, 2))
}

func (r pdfSignatureRenderer) noteItemSVG(item signatureNoteItem, x, y, width float64, palette signaturePalette) string {
	svg := r.text(x, y+2.4, r.fitText(item.Primary, width), 2.2, palette.BodyText, "sf-mono", "start", "")
	if strings.TrimSpace(item.Details) != "" {
		svg += r.text(x, y+5, r.fitText(item.Details, width), 1.85, palette.MutedText, "sf-mono-light", "start", "")
	}
	return svg
}

func (r pdfSignatureRenderer) noteItemHeight(item signatureNoteItem) float64 {
	if strings.TrimSpace(item.Details) == "" {
		return 3.2
	}
	return 5.8
}

func (r pdfSignatureRenderer) titleRows(title string, width float64) [][]string {
	parts := []string{}
	for _, part := range strings.Split(title, "\n") {
		part = strings.TrimSpace(part)
		if part != "" {
			parts = append(parts, part)
		}
	}
	if len(parts) == 0 {
		return [][]string{{""}}
	}
	maxWidth := math.Max(36, width-4)
	rows := [][]string{}
	current := []string{}
	currentWidth := 0.0
	gap := 3.0
	for _, part := range parts {
		part = r.fitText(part, maxWidth)
		partWidth := r.estimatedTextWidth(part, 2.35)
		candidateWidth := currentWidth + partWidth
		if len(current) > 0 {
			candidateWidth += gap
		}
		if len(current) > 0 && candidateWidth > maxWidth {
			rows = append(rows, current)
			current = []string{part}
			currentWidth = partWidth
			continue
		}
		current = append(current, part)
		currentWidth = candidateWidth
	}
	if len(current) > 0 {
		rows = append(rows, current)
	}
	if len(rows) > 4 {
		return rows[:4]
	}
	return rows
}

func (r pdfSignatureRenderer) titleBandHeight(rows [][]string) float64 {
	return math.Max(6, 3+float64(len(rows))*3)
}

func (r pdfSignatureRenderer) titleSVG(rows [][]string, palette signaturePalette) string {
	var svg strings.Builder
	for rowIndex, row := range rows {
		x := 2.0
		y := 3.75 + float64(rowIndex)*3
		for _, segment := range row {
			svg.WriteString(r.text(x, y, segment, 2.35, palette.TitleText, "sf-mono", "start", ""))
			x += r.estimatedTextWidth(segment, 2.35) + 3
		}
	}
	return svg.String()
}

func (r pdfSignatureRenderer) signingRows(rows []map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, row := range rows {
		if boolDefault(row["showSignature"], true) {
			out = append(out, row)
		}
	}
	return out
}

func (r pdfSignatureRenderer) noteRows(rows []map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, row := range rows {
		if !boolDefault(row["showSignature"], true) {
			out = append(out, row)
		}
	}
	return out
}

func (r pdfSignatureRenderer) signatureBoxSVG(config map[string]any, rowTop, width float64, fieldCount int, palette signaturePalette) string {
	boxWidth := 78.0
	boxHeight := 29.0
	boxX := width - boxWidth - 6
	boxY := rowTop + 4.5
	if width <= 80 {
		boxWidth = 66
		boxHeight = 26
		boxX = 5
		boxY = rowTop + math.Max(31, 5+float64(fieldCount)*5)
	}
	label := r.signatureLabelForDisplay(config)
	captionLines := r.signatureLabelLines(label)
	captionLineHeight := 2.45
	captionAlign := "left"
	if stringValue(config["labelAlign"]) == "right" {
		captionAlign = "right"
	}
	captionLeft := boxX + 4
	captionRight := boxX + boxWidth - 4
	captionBottomY := boxY + boxHeight - 1.6
	captionY := captionBottomY - float64(len(captionLines)-1)*captionLineHeight
	lineY := math.Max(boxY+8, captionY-2)

	var svg strings.Builder
	svg.WriteString(`<rect x="`)
	svg.WriteString(signatureNumber(boxX))
	svg.WriteString(`" y="`)
	svg.WriteString(signatureNumber(boxY))
	svg.WriteString(`" width="`)
	svg.WriteString(signatureNumber(boxWidth))
	svg.WriteString(`" height="`)
	svg.WriteString(signatureNumber(boxHeight))
	svg.WriteString(`" fill="#fff" stroke="`)
	svg.WriteString(palette.Border)
	svg.WriteString(`" stroke-width="0.2"/>`)
	svg.WriteString(r.securityPatternSVG(boxX, boxY, boxWidth, boxHeight, palette))
	svg.WriteString(`<line x1="`)
	svg.WriteString(signatureNumber(boxX + 4))
	svg.WriteString(`" y1="`)
	svg.WriteString(signatureNumber(lineY))
	svg.WriteString(`" x2="`)
	svg.WriteString(signatureNumber(boxX + boxWidth - 4))
	svg.WriteString(`" y2="`)
	svg.WriteString(signatureNumber(lineY))
	svg.WriteString(`" stroke="`)
	svg.WriteString(palette.SignatureLine)
	svg.WriteString(`" stroke-width="0.16"/>`)
	svg.WriteString(r.signatureLabelTextSVG(captionLines, captionLeft, captionRight, captionY, captionLineHeight, captionAlign, palette))
	return svg.String()
}

func (r pdfSignatureRenderer) signatureLabelLines(label string) []string {
	lines := []string{}
	for _, line := range strings.Split(label, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	if len(lines) == 0 {
		lines = []string{strings.TrimSpace(label)}
	}
	if len(lines) > 7 {
		return lines[:7]
	}
	return lines
}

func (r pdfSignatureRenderer) signatureLabelTextSVG(lines []string, left, right, y, lineHeight float64, align string, palette signaturePalette) string {
	var svg strings.Builder
	maxWidth := right - left
	for index, line := range lines {
		text := r.fitText(line, maxWidth)
		textWidth := math.Min(maxWidth, r.estimatedTextWidth(text, 1.75)+0.35)
		textX := left
		extra := ""
		if align == "right" {
			textX = right - textWidth
			extra = ` textLength="` + signatureNumber(textWidth) + `" lengthAdjust="spacingAndGlyphs"`
		}
		svg.WriteString(r.text(textX, y+float64(index)*lineHeight, text, 1.75, palette.MutedText, "sf-mono-light", "start", extra))
	}
	return svg.String()
}

func (r pdfSignatureRenderer) securityPatternSVG(x, y, width, height float64, palette signaturePalette) string {
	innerTop := y + 4.8
	innerBottom := y + height - 7.3
	left := x + 4
	right := x + width - 4
	middle := y + height/2 - 0.8
	waveOneTop := innerTop + randomFloat(-0.7, 0.9)
	waveOneBottom := innerBottom + randomFloat(-0.8, 0.8)
	waveTwoTop := innerTop + randomFloat(-0.5, 0.7)
	waveTwoBottom := innerBottom + randomFloat(-0.6, 0.9)
	waveGap := randomFloat(1.7, 2.8)
	crossStartY := y + randomFloat(5.7, 7)
	crossEndY := y + height - randomFloat(7.8, 9.3)
	counterCrossStartY := y + randomFloat(5.9, 7.2)
	counterCrossEndY := y + height - randomFloat(7.7, 9)
	guideY := y + randomFloat(7.7, 10.2)
	thirdMiddle := middle + randomFloat(3.1, 4.5)
	return `<path d="M ` + signatureNumber(left) + ` ` + signatureNumber(middle) +
		` C ` + signatureNumber(x+randomFloat(17, 22)) + ` ` + signatureNumber(waveOneTop) +
		`, ` + signatureNumber(x+width-randomFloat(17, 22)) + ` ` + signatureNumber(waveOneBottom) +
		`, ` + signatureNumber(right) + ` ` + signatureNumber(middle) +
		`" fill="none" stroke="` + palette.PatternPrimary + `" stroke-width="0.18"/>` +
		`<path d="M ` + signatureNumber(left) + ` ` + signatureNumber(middle+waveGap) +
		` C ` + signatureNumber(x+randomFloat(18, 23)) + ` ` + signatureNumber(waveTwoBottom) +
		`, ` + signatureNumber(x+width-randomFloat(18, 23)) + ` ` + signatureNumber(waveTwoTop) +
		`, ` + signatureNumber(right) + ` ` + signatureNumber(middle+waveGap) +
		`" fill="none" stroke="` + palette.PatternSecondary + `" stroke-width="0.18"/>` +
		`<path d="M ` + signatureNumber(left+2) + ` ` + signatureNumber(thirdMiddle) +
		` C ` + signatureNumber(x+randomFloat(20, 25)) + ` ` + signatureNumber(innerTop+randomFloat(2.2, 4)) +
		`, ` + signatureNumber(x+width-randomFloat(20, 25)) + ` ` + signatureNumber(innerBottom+randomFloat(0.4, 1.6)) +
		`, ` + signatureNumber(right-2) + ` ` + signatureNumber(thirdMiddle+randomFloat(-0.8, 0.6)) +
		`" fill="none" stroke="` + palette.PatternPrimary + `" stroke-width="0.16"/>` +
		`<line x1="` + signatureNumber(x+7) + `" y1="` + signatureNumber(crossStartY) + `" x2="` + signatureNumber(x+width-7) + `" y2="` + signatureNumber(crossEndY) + `" stroke="` + palette.PatternTertiary + `" stroke-width="0.12"/>` +
		`<line x1="` + signatureNumber(x+width-7) + `" y1="` + signatureNumber(counterCrossStartY) + `" x2="` + signatureNumber(x+7) + `" y2="` + signatureNumber(counterCrossEndY) + `" stroke="` + palette.PatternTertiary + `" stroke-width="0.12"/>` +
		`<line x1="` + signatureNumber(x+7) + `" y1="` + signatureNumber(guideY) + `" x2="` + signatureNumber(x+width-7) + `" y2="` + signatureNumber(guideY+randomFloat(-0.35, 0.35)) + `" stroke="` + palette.PatternGuide + `" stroke-width="0.12"/>`
}

func (r pdfSignatureRenderer) text(x, y float64, value string, size float64, color, font, anchor, extraAttributes string) string {
	anchorAttribute := ""
	if anchor != "start" {
		anchorAttribute = ` text-anchor="` + anchor + `"`
	}
	fontFamily := html.EscapeString(r.fontFamily(value, font))
	return `<text x="` + signatureNumber(x) + `" y="` + signatureNumber(y) + `" font-family="` + fontFamily +
		`" font-size="` + signatureNumber(size) + `" fill="` + color + `"` +
		anchorAttribute + extraAttributes + `>` + html.EscapeString(value) + `</text>`
}

func (r pdfSignatureRenderer) fitText(value string, maxWidth float64) string {
	trimmed := strings.TrimSpace(value)
	limit := maxInt(10, int(math.Floor(maxWidth/1.25)))
	runes := []rune(trimmed)
	if len(runes) <= limit {
		return trimmed
	}
	return string(runes[:limit-1]) + "..."
}

func (r pdfSignatureRenderer) packedTextLines(value string, maxWidth, fontSize float64, maxLines int) []string {
	parts := []string{}
	seen := map[string]bool{}
	for _, part := range strings.Split(value, "\n") {
		part = strings.TrimSpace(part)
		if part == "" || seen[part] {
			continue
		}
		seen[part] = true
		parts = append(parts, part)
	}
	if len(parts) == 0 {
		return []string{""}
	}
	lines := []string{}
	current := ""
	for _, part := range parts {
		candidate := part
		if current != "" {
			candidate = current + " " + part
		}
		if current != "" && r.estimatedTextWidth(candidate, fontSize) > maxWidth {
			lines = append(lines, current)
			current = part
			continue
		}
		current = candidate
	}
	if current != "" {
		lines = append(lines, current)
	}
	if len(lines) > maxLines {
		lines = lines[:maxLines]
	}
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		out = append(out, r.fitText(line, maxWidth))
	}
	return out
}

func (r pdfSignatureRenderer) estimatedTextWidth(text string, fontSize float64) float64 {
	width := 0.0
	for _, char := range text {
		if usesCJKFont(char) {
			width += fontSize
			continue
		}
		if char >= 0x0400 && char <= 0x04ff {
			width += fontSize * 0.7
		} else {
			width += fontSize * 0.58
		}
	}
	return width
}

func (r pdfSignatureRenderer) fontFamily(value string, font string) string {
	for _, char := range value {
		if usesCJKFont(char) {
			return r.pdfTheme.SignatureFontFamily(font, true, primaryPDFChineseLanguage(r.languages))
		}
	}
	return r.pdfTheme.SignatureFontFamily(font, false, primaryPDFChineseLanguage(r.languages))
}

func (r pdfSignatureRenderer) signatureSectionTitle(config map[string]any) string {
	if boolValue(firstValue(config, "customTitleEnabled", "custom_title_enabled")) && stringValue(config["title"]) != "" {
		return stringValue(config["title"])
	}
	if languages, ok := signaturePDFLanguages(config); ok {
		return joinUniqueStrings(mapStrings(languages, func(language string) string {
			return defaultSignatureSectionTitle(language)
		}))
	}
	return defaultSignatureSectionTitle(signatureInfoLanguage(config))
}

func (r pdfSignatureRenderer) signatureMetaLabel(config map[string]any, key string) string {
	if languages, ok := signaturePDFLanguages(config); ok {
		return joinUniqueStrings(mapStrings(languages, func(language string) string {
			return r.signatureMetaLabel(signatureConfigForLanguage(config, language), key)
		}))
	}
	labels := signatureMetaLabelMap()
	language := signatureInfoLanguage(config)
	if signatureIsBilingual(language) {
		chinese := signatureChineseLanguage(language)
		return labels["en"][key] + " " + labels[chinese][key]
	}
	return labels[signaturePrimaryLanguage(language)][key]
}

func (r pdfSignatureRenderer) signatureRoleForDisplay(config map[string]any, value string) string {
	if languages, ok := signaturePDFLanguages(config); ok {
		return joinUniqueStrings(mapStrings(languages, func(language string) string {
			return r.signatureRoleForDisplay(signatureConfigForLanguage(config, language), value)
		}))
	}
	trimmed := strings.TrimSpace(value)
	language := signatureInfoLanguage(config)
	legacyRoleLabels := []string{
		"Confirmation Signature", "Confirmation / Signature", "Participant", "Signer / Confirmer",
		"确认签署", "确认 / 签署", "签核/确认人", "確認簽署", "確認 / 簽署", "簽核/確認人",
	}
	if trimmed == "" || stringInSlice(trimmed, legacyRoleLabels) || trimmed == r.signatureLabel(config) {
		return signaturePhraseForLanguage(signatureRolePhrases()[6], language)
	}
	return translateSignaturePhrase(trimmed, signatureRolePhrases(), language)
}

func (r pdfSignatureRenderer) signaturePositionForDisplay(config map[string]any, value string) string {
	if languages, ok := signaturePDFLanguages(config); ok {
		return joinUniqueStrings(mapStrings(languages, func(language string) string {
			return r.signaturePositionForDisplay(signatureConfigForLanguage(config, language), value)
		}))
	}
	return translateSignaturePhrase(strings.TrimSpace(value), signaturePositionPhrases(), signatureInfoLanguage(config))
}

func (r pdfSignatureRenderer) signatureCustomFieldLabelForDisplay(config map[string]any, value string) string {
	if languages, ok := signaturePDFLanguages(config); ok {
		return joinUniqueStrings(mapStrings(languages, func(language string) string {
			return r.signatureCustomFieldLabelForDisplay(signatureConfigForLanguage(config, language), value)
		}))
	}
	trimmed := strings.TrimSpace(value)
	language := signatureInfoLanguage(config)
	for _, labels := range signatureCustomMetaLabels() {
		if labels["telephone"] == trimmed {
			return signatureCustomMetaLabel("telephone", language)
		}
		if labels["mobile"] == trimmed {
			return signatureCustomMetaLabel("mobile", language)
		}
	}
	return value
}

func (r pdfSignatureRenderer) signatureDateTimeForDisplay(value string) string {
	if strings.TrimSpace(value) == "" {
		return time.Now().Format("2006-01-02 15:04:05")
	}
	return strings.TrimSpace(value)
}

func (r pdfSignatureRenderer) signatureLabelForDisplay(config map[string]any) string {
	if languages, ok := signaturePDFLanguages(config); ok {
		return joinUniqueStrings(mapStrings(languages, func(language string) string {
			return r.signatureLabelForDisplay(signatureConfigForLanguage(config, language))
		}))
	}
	label := r.signatureLabel(config)
	language := signatureLanguage(config)
	if !signatureIsBilingual(language) {
		return label
	}
	chinese := signatureChineseLanguage(language)
	mode := SignatureLabelMode(stringValue(config["labelMode"]))
	labels := map[string]map[string]string{
		"sc": {"confirmation": "确认", "signature": "签署"},
		"tc": {"confirmation": "確認", "signature": "簽署"},
	}[chinese]
	parts := []string{labels["confirmation"], labels["signature"]}
	if mode != "confirmation_signature" {
		parts = []string{labels[mode]}
	}
	return label + " " + joinSignatureLabelParts(parts, stringValue(config["labelSeparator"]))
}

func (r pdfSignatureRenderer) signatureLabel(config map[string]any) string {
	if languages, ok := signaturePDFLanguages(config); ok {
		return joinUniqueStrings(mapStrings(languages, func(language string) string {
			return r.signatureLabel(signatureConfigForLanguage(config, language))
		}))
	}
	language := signatureLanguage(config)
	primary := signaturePrimaryLanguage(language)
	labels := signatureLabelMap()[primary]
	mode := SignatureLabelMode(stringValue(config["labelMode"]))
	parts := []string{labels["confirmation"], labels["signature"]}
	if mode != "confirmation_signature" {
		parts = []string{labels[mode]}
	}
	return joinSignatureLabelParts(parts, stringValue(config["labelSeparator"]))
}

func signatureConfigRows(config map[string]any) []map[string]any {
	rows := []map[string]any{}
	for _, raw := range anyList(config["rows"]) {
		row, ok := raw.(map[string]any)
		if ok {
			rows = append(rows, row)
		}
	}
	return rows
}

func cloneMap(input map[string]any) map[string]any {
	out := make(map[string]any, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func signatureThemePalette(pdfTheme theme.Definition) signaturePalette {
	switch pdfTheme.Key() {
	case "hsbc":
		return signaturePalette{
			TitleFill: "#9d9d9d", TitleStroke: "#111111", TitleText: "#000000", Border: "#111111",
			Divider: "#bfbfbf", NoteDivider: "#d9d9d9", NoteFill: "#fafafa", NoteStroke: "#d9d9d9",
			BodyText: "#111111", MutedText: "#555555", SignatureLine: "#8f8f8f",
			PatternPrimary: "#eeeeee", PatternSecondary: "#f1f1f1", PatternTertiary: "#f3f3f3", PatternGuide: "#f4f4f4",
		}
	case "uswds":
		return signaturePalette{
			TitleFill: "#1a4480", TitleStroke: "#1a4480", TitleText: "#ffffff", Border: "#dfe1e2",
			Divider: "#dfe1e2", NoteDivider: "#dfe1e2", NoteFill: "#e7f6f8", NoteStroke: "#dfe1e2",
			BodyText: "#1b1b1b", MutedText: "#565c65", SignatureLine: "#005ea8",
			PatternPrimary: "#e7f6f8", PatternSecondary: "#dfe1e2", PatternTertiary: "#eef7fb", PatternGuide: "#f5fbfc",
		}
	default:
		return signaturePalette{
			TitleFill: "#a4a4a4", TitleStroke: "#7e7e7e", TitleText: "#000000", Border: "#7e7e7e",
			Divider: "#bfbfbf", NoteDivider: "#d9d9d9", NoteFill: "#fafafa", NoteStroke: "#d9d9d9",
			BodyText: "#111111", MutedText: "#555555", SignatureLine: "#8f8f8f",
			PatternPrimary: "#eeeeee", PatternSecondary: "#f1f1f1", PatternTertiary: "#f3f3f3", PatternGuide: "#f4f4f4",
		}
	}
}

func signaturePDFLanguages(config map[string]any) ([]string, bool) {
	if _, ok := config["pdfLanguages"]; !ok {
		if _, ok := config["pdf_languages"]; !ok {
			return nil, false
		}
	}
	languages := normalizePDFLanguages(firstValue(config, "pdfLanguages", "pdf_languages"), []string{"en"})
	return languages, true
}

func signatureConfigForLanguage(config map[string]any, language string) map[string]any {
	next := cloneMap(config)
	delete(next, "pdfLanguages")
	delete(next, "pdf_languages")
	next["labelLanguage"] = language
	next["infoLanguage"] = language
	return next
}

func signatureLanguage(config map[string]any) string {
	language := stringValue(config["labelLanguage"])
	if stringInSlice(language, []string{"en", "sc", "tc", "ja", "fr", "ru", "de", "en_sc", "en_tc"}) {
		return language
	}
	return "en"
}

func signatureInfoLanguage(config map[string]any) string {
	language := stringValue(config["infoLanguage"])
	if stringInSlice(language, []string{"en", "sc", "tc", "ja", "fr", "ru", "de", "en_sc", "en_tc"}) {
		return language
	}
	return signatureLanguage(config)
}

func signaturePrimaryLanguage(language string) string {
	if signatureIsBilingual(language) {
		return "en"
	}
	return language
}

func signatureChineseLanguage(language string) string {
	if language == "en_sc" {
		return "sc"
	}
	return "tc"
}

func signatureIsBilingual(language string) bool {
	return language == "en_sc" || language == "en_tc"
}

func defaultSignatureSectionTitle(language string) string {
	switch language {
	case "en_sc":
		return "Preparation & Review Record 制表及复核记录"
	case "en_tc":
		return "Preparation & Review Record 製表及覆核記錄"
	}
	return map[string]string{
		"en": "Preparation & Review Record",
		"sc": "制表及复核记录",
		"tc": "製表及覆核記錄",
		"ja": "作成及び確認記録",
		"fr": "Dossier de preparation et de revue",
		"ru": "Запись подготовки и проверки",
		"de": "Erstellungs- und Pruefprotokoll",
	}[signaturePrimaryLanguage(language)]
}

func signatureLabelMap() map[string]map[string]string {
	return map[string]map[string]string{
		"en": {"confirmation": "Confirmation", "signature": "Signature"},
		"sc": {"confirmation": "确认", "signature": "签署"},
		"tc": {"confirmation": "確認", "signature": "簽署"},
		"ja": {"confirmation": "確認", "signature": "署名"},
		"fr": {"confirmation": "Confirmation", "signature": "Signature"},
		"ru": {"confirmation": "Подтверждение", "signature": "Подпись"},
		"de": {"confirmation": "Bestaetigung", "signature": "Unterschrift"},
	}
}

func signatureMetaLabelMap() map[string]map[string]string {
	return map[string]map[string]string{
		"en": {"participant": "Name", "capacity": "Capacity", "position": "Position", "email": "Email", "dateTime": "Date & Time"},
		"sc": {"participant": "姓名", "capacity": "身份", "position": "职务", "email": "电子邮件", "dateTime": "日期及时间"},
		"tc": {"participant": "姓名", "capacity": "身份", "position": "職務", "email": "電子郵件", "dateTime": "日期及時間"},
		"ja": {"participant": "氏名", "capacity": "役割", "position": "職位", "email": "メール", "dateTime": "日時"},
		"fr": {"participant": "Nom", "capacity": "Qualite", "position": "Poste", "email": "E-mail", "dateTime": "Date et heure"},
		"ru": {"participant": "Имя", "capacity": "Роль", "position": "Должность", "email": "Email", "dateTime": "Дата и время"},
		"de": {"participant": "Name", "capacity": "Funktion", "position": "Position", "email": "E-Mail", "dateTime": "Datum und Uhrzeit"},
	}
}

func signatureCustomMetaLabels() map[string]map[string]string {
	return map[string]map[string]string{
		"en": {"telephone": "Tel. No.", "mobile": "Mobile No."},
		"sc": {"telephone": "电话号码", "mobile": "流动电话号码"},
		"tc": {"telephone": "電話號碼", "mobile": "流動電話號碼"},
		"ja": {"telephone": "電話番号", "mobile": "携帯電話番号"},
		"fr": {"telephone": "Telephone", "mobile": "Mobile"},
		"ru": {"telephone": "Телефон", "mobile": "Мобильный"},
		"de": {"telephone": "Telefon", "mobile": "Mobiltelefon"},
	}
}

func signatureCustomMetaLabel(key, language string) string {
	labels := signatureCustomMetaLabels()
	if signatureIsBilingual(language) {
		chinese := signatureChineseLanguage(language)
		return labels["en"][key] + " " + labels[chinese][key]
	}
	return labels[signaturePrimaryLanguage(language)][key]
}

func signatureRolePhrases() []map[string]string {
	return []map[string]string{
		{"en": "Prepared by", "sc": "制表", "tc": "製表", "ja": "作成者", "fr": "Prepare par", "ru": "Подготовил", "de": "Erstellt von"},
		{"en": "Handled by", "sc": "经办", "tc": "經辦", "ja": "取扱者", "fr": "Traite par", "ru": "Обработал", "de": "Bearbeitet von"},
		{"en": "Checked by", "sc": "复核", "tc": "覆核", "ja": "照合者", "fr": "Verifie par", "ru": "Проверил", "de": "Geprueft von"},
		{"en": "Reviewed by", "sc": "审核", "tc": "審核", "ja": "レビュー者", "fr": "Revu par", "ru": "Рассмотрел", "de": "Ueberprueft von"},
		{"en": "Approved by", "sc": "审批", "tc": "審批", "ja": "承認者", "fr": "Approuve par", "ru": "Утвердил", "de": "Genehmigt von"},
		{"en": "Audited by", "sc": "审计", "tc": "審計", "ja": "監査者", "fr": "Audite par", "ru": "Аудировал", "de": "Revidiert von"},
		{"en": "Confirmed by", "sc": "确认", "tc": "確認", "ja": "確認者", "fr": "Confirme par", "ru": "Подтвердил", "de": "Bestaetigt von"},
		{"en": "Verified by", "sc": "核验", "tc": "核驗", "ja": "検証者", "fr": "Verifie par", "ru": "Проверил", "de": "Verifiziert von"},
		{"en": "Authorised by", "sc": "授权", "tc": "授權", "ja": "権限者", "fr": "Autorise par", "ru": "Авторизовал", "de": "Autorisiert von"},
		{"en": "Accepted by", "sc": "接纳", "tc": "接納", "ja": "受領者", "fr": "Accepte par", "ru": "Принял", "de": "Akzeptiert von"},
		{"en": "Acknowledged by", "sc": "知悉确认", "tc": "知悉確認", "ja": "確認済み", "fr": "Pris connaissance par", "ru": "Ознакомлен", "de": "Zur Kenntnis genommen von"},
		{"en": "Reconciled by", "sc": "对账", "tc": "對賬", "ja": "照合者", "fr": "Rapproche par", "ru": "Сверил", "de": "Abgestimmt von"},
		{"en": "Documented by", "sc": "记录", "tc": "記錄", "ja": "記録者", "fr": "Documente par", "ru": "Задокументировал", "de": "Dokumentiert von"},
		{"en": "Processed by", "sc": "处理", "tc": "處理", "ja": "処理者", "fr": "Traite par", "ru": "Обработал", "de": "Verarbeitet von"},
		{"en": "Finance reviewed by", "sc": "财务复核", "tc": "財務覆核", "ja": "財務レビュー", "fr": "Revu par finance", "ru": "Финансовая проверка", "de": "Finanziell geprueft von"},
	}
}

func signaturePositionPhrases() []map[string]string {
	return []map[string]string{
		{"en": "Account Holder", "sc": "账户持有人", "tc": "帳戶持有人", "ja": "口座名義人", "fr": "Titulaire du compte", "ru": "Владелец счета", "de": "Kontoinhaber"},
		{"en": "Budget Owner", "sc": "预算负责人", "tc": "預算負責人", "ja": "予算責任者", "fr": "Responsable budget", "ru": "Владелец бюджета", "de": "Budgetverantwortlicher"},
		{"en": "Finance Owner", "sc": "财务负责人", "tc": "財務負責人", "ja": "財務責任者", "fr": "Responsable financier", "ru": "Финансовый владелец", "de": "Finanzverantwortlicher"},
		{"en": "Finance Officer", "sc": "财务专员", "tc": "財務專員", "ja": "財務担当者", "fr": "Agent financier", "ru": "Финансовый специалист", "de": "Finanzsachbearbeiter"},
		{"en": "Accounts Officer", "sc": "会计专员", "tc": "會計專員", "ja": "会計担当者", "fr": "Agent comptable", "ru": "Бухгалтер", "de": "Buchhaltung"},
		{"en": "Relationship Manager", "sc": "客户经理", "tc": "客戶經理", "ja": "リレーション担当", "fr": "Charge de relation", "ru": "Менеджер по работе", "de": "Kundenbetreuer"},
		{"en": "Operations Officer", "sc": "运营专员", "tc": "營運專員", "ja": "業務担当者", "fr": "Agent operations", "ru": "Операционный специалист", "de": "Operations-Sachbearbeiter"},
		{"en": "Compliance Reviewer", "sc": "合规复核", "tc": "合規覆核", "ja": "コンプライアンス審査", "fr": "Controle conformite", "ru": "Проверка комплаенса", "de": "Compliance-Pruefer"},
		{"en": "Reviewer", "sc": "复核人", "tc": "覆核人", "ja": "レビュー担当", "fr": "Relecteur", "ru": "Рецензент", "de": "Pruefer"},
		{"en": "Approver", "sc": "审批人", "tc": "審批人", "ja": "承認者", "fr": "Approbateur", "ru": "Утверждающий", "de": "Genehmiger"},
		{"en": "Internal Auditor", "sc": "内部审计", "tc": "內部審計", "ja": "内部監査", "fr": "Auditeur interne", "ru": "Внутренний аудитор", "de": "Interner Auditor"},
		{"en": "External Auditor", "sc": "外部审计", "tc": "外部審計", "ja": "外部監査", "fr": "Auditeur externe", "ru": "Внешний аудитор", "de": "Externer Auditor"},
		{"en": "Authorised Representative", "sc": "授权代表", "tc": "授權代表", "ja": "権限代表者", "fr": "Representant autorise", "ru": "Уполномоченный представитель", "de": "Bevollmaechtigter Vertreter"},
	}
}

func translateSignaturePhrase(value string, phrases []map[string]string, language string) string {
	for _, phrase := range phrases {
		for _, translated := range phrase {
			if value == translated {
				return signaturePhraseForLanguage(phrase, language)
			}
		}
	}
	return value
}

func signaturePhraseForLanguage(phrase map[string]string, language string) string {
	if signatureIsBilingual(language) {
		return phrase["en"] + " " + phrase[signatureChineseLanguage(language)]
	}
	if value := phrase[signaturePrimaryLanguage(language)]; value != "" {
		return value
	}
	return phrase["en"]
}

func joinSignatureLabelParts(parts []string, separator string) string {
	if len(parts) == 1 {
		return parts[0]
	}
	switch separator {
	case "none":
		return strings.Join(parts, "")
	case "line":
		return strings.Join(parts, "\n")
	default:
		return strings.Join(parts, " ")
	}
}

func joinUniqueStrings(parts []string) string {
	out := []string{}
	seen := map[string]bool{}
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" || seen[part] {
			continue
		}
		seen[part] = true
		out = append(out, part)
	}
	return strings.Join(out, " ")
}

func mapStrings(values []string, mapper func(string) string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = append(out, mapper(value))
	}
	return out
}

func stringInSlice(value string, values []string) bool {
	for _, item := range values {
		if value == item {
			return true
		}
	}
	return false
}

func usesCJKFont(char rune) bool {
	return (char >= 0x3040 && char <= 0x30ff) ||
		(char >= 0x3400 && char <= 0x9fff) ||
		(char >= 0xf900 && char <= 0xfaff) ||
		(char >= 0xff00 && char <= 0xffef)
}

func signatureNumber(value float64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", value), "0"), ".")
}

func randomFloat(min, max float64) float64 {
	if max <= min {
		return min
	}
	scale := int64(math.Round((max-min)*100)) + 1
	n, err := crand.Int(crand.Reader, big.NewInt(scale))
	if err != nil {
		return min
	}
	return min + float64(n.Int64())/100
}

func maxInt(values ...int) int {
	out := values[0]
	for _, value := range values[1:] {
		if value > out {
			out = value
		}
	}
	return out
}

func minInt(values ...int) int {
	out := values[0]
	for _, value := range values[1:] {
		if value < out {
			out = value
		}
	}
	return out
}
