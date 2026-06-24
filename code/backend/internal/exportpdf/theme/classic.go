package theme

func init() {
	Register("classic", classicPDFTheme)
}

func classicPDFTheme() Definition {
	return staticTheme{
		key:                    "classic",
		fontFaces:              classicFontFaces,
		fontVariableCSS:        classicFontVariableCSS,
		budgetDocumentCSS:      baseDocumentCSS() + `body{font-family:var(--pdf-classic-mono-font-family);color:#000;font-size:7.5pt;}.title{font-family:var(--pdf-classic-serif-font-family);font-size:14pt;font-weight:400;text-align:center;margin:0 0 4mm;}.title-line{display:block;line-height:1.25;}.title sup{font-size:7pt;line-height:0;vertical-align:super;}.subtitle{font-family:var(--pdf-classic-serif-font-family);font-size:14pt;font-weight:400;text-align:center;margin:0 0 7mm;}.subtitle-line{display:block;line-height:1.25;}.page-footer{font-family:var(--pdf-classic-mono-font-family);font-size:7pt;color:#666;text-align:center;}`,
		budgetTableCSS:         `.template-section{width:100%;margin-top:5mm;}.template-section + .template-section{margin-top:7mm;}.template-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}.template-table th,.template-table td{border:0;padding:0.12mm 1.55mm;vertical-align:top;}.section-band td{background:#a4a4a4;border:0.2mm solid #7e7e7e;font-family:var(--pdf-classic-mono-font-family);font-size:9pt;font-weight:400;line-height:1.12;padding-top:0.35mm;padding-bottom:0.35mm;}.date-line{border-top:0.2mm solid #7e7e7e;padding:0.12mm 1.55mm;text-decoration:underline;line-height:1.2;font-family:var(--pdf-classic-mono-light-font-family);font-size:6.8pt;}.column-table th{background:#d7d7d7;font-family:var(--pdf-classic-mono-font-family);font-size:6.8pt;font-weight:400;line-height:1.18;text-align:left;}.column-table .header-left{border-right:0.2mm solid #7e7e7e;}.column-table .header-middle{border-left:0.2mm solid #7e7e7e;border-right:0.2mm solid #7e7e7e;}.column-table .header-last{border-left:0.2mm solid #7e7e7e;}.body-table td,.summary-table td{font-size:6.8pt;line-height:1.32;}.summary-table{border-top:0.35mm solid #5f5f5f;}.summary-table td{background:#d7d7d7;border-top:0;}.align-right{text-align:right;}.align-center{text-align:center;}.money-cell{white-space:normal;}.cell-line{display:block;margin:0;padding:0;line-height:1.24;}.money-line{white-space:nowrap;}.money-line-secondary{font-size:6pt;color:#595959;}.empty{text-align:center;color:#595959;}`,
		bookkeepingDocumentCSS: baseDocumentCSS() + `body{font-family:var(--pdf-classic-mono-font-family);color:#000;font-size:6.8pt;}.title{font-family:var(--pdf-classic-serif-font-family);font-size:13pt;font-weight:400;text-align:center;margin:0 0 3mm;}.title-line{display:block;line-height:1.25;}.title sup{font-size:7pt;line-height:0;vertical-align:super;}.subtitle{font-family:var(--pdf-classic-serif-font-family);font-size:13pt;font-weight:400;text-align:center;margin:0 0 6mm;}.subtitle-line{display:block;line-height:1.25;}.page-footer{font-family:var(--pdf-classic-mono-font-family);font-size:7pt;color:#666;text-align:center;}`,
		bookkeepingTableCSS:    `.bookkeeping-section{width:100%;margin-top:5mm;}.bookkeeping-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}.bookkeeping-table th,.bookkeeping-table td{border:0;padding:0.12mm 1.15mm;vertical-align:top;}.bookkeeping-section-row td{background:#a4a4a4;border:0.2mm solid #7e7e7e;font-family:var(--pdf-classic-mono-font-family);font-size:9pt;font-weight:400;line-height:1.12;padding-top:0.35mm;padding-bottom:0.35mm;}.bookkeeping-date-row td{border-top:0.2mm solid #7e7e7e;text-decoration:underline;line-height:1.2;font-family:var(--pdf-classic-mono-light-font-family);font-size:6.4pt;}.bookkeeping-header-row th{background:#d7d7d7;font-family:var(--pdf-classic-mono-font-family);font-size:6.1pt;font-weight:400;line-height:1.14;text-align:left;}.bookkeeping-header-row th + th{border-left:0.2mm solid #7e7e7e;}.bookkeeping-body-row td{font-size:6.4pt;line-height:1.24;}.bookkeeping-empty-row td{text-align:center;color:#595959;font-size:6.4pt;}.bookkeeping-total-row td{background:#f4f4f4;border-top:0.2mm solid #7e7e7e;font-size:6.4pt;font-weight:700;line-height:1.24;}.bookkeeping-total-row-first td{border-top:0.35mm solid #5f5f5f;}.bookkeeping-total-label{text-align:right;}.bookkeeping-align-right{text-align:right;}.bookkeeping-align-center{text-align:center;}.bookkeeping-text-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-word;}.bookkeeping-code-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-all;}.bookkeeping-money-cell{white-space:normal;}.bookkeeping-cell-line{display:block;margin:0;padding:0;line-height:1.22;}.bookkeeping-money-line{white-space:nowrap;}.bookkeeping-money-line-secondary{font-size:5.8pt;color:#595959;}`,
		signatureCSS:           classicSignatureCSS(),
		signatureFontFamily:    classicSignatureFontFamily,
		signatureFullWidthMM:   152,
		budgetMargins:          MarginsMM{Top: 29, Right: 29, Bottom: 22, Left: 29},
		bookkeepingMargins:     MarginsMM{Top: 18, Right: 14, Bottom: 15, Left: 14},
		header:                 classicHeaderHTML,
		footer:                 classicFooterTemplate,
	}
}

func classicFontFaces(chineseLanguage string) []FontFace {
	fonts := []FontFace{
		{"Arial", "Arial.ttf", "400", "normal"},
		{"Arial", "Arial Bold.ttf", "700", "normal"},
		{"Arial", "Arial Italic.ttf", "400", "italic"},
		{"Arial", "Arial Bold Italic.ttf", "700", "italic"},
		{"SF-Mono", "SF-Mono-Regular.ttf", "400", "normal"},
		{"SF-Mono", "SF-Mono-Bold.ttf", "700", "normal"},
		{"SF-Mono", "SF-Mono-RegularItalic.ttf", "400", "italic"},
		{"SF-Mono", "SF-Mono-BoldItalic.ttf", "700", "italic"},
		{"SF-Mono-Light", "SF-Mono-Light.ttf", "300", "normal"},
		{"SF-Mono-Light", "SF-Mono-LightItalic.ttf", "300", "italic"},
		{"Menlo", "Menlo.ttc", "400", "normal"},
		{"Menlo", "Menlo.ttc", "700", "normal"},
		{"Menlo", "Menlo.ttc", "400", "italic"},
		{"Menlo", "Menlo.ttc", "700", "italic"},
		{"TimesNewRoman", "Times New Roman.ttf", "400", "normal"},
		{"TimesNewRoman", "Times New Roman Bold.ttf", "700", "normal"},
		{"TimesNewRoman", "Times New Roman Italic.ttf", "400", "italic"},
		{"TimesNewRoman", "Times New Roman Bold Italic.ttf", "700", "italic"},
		{"Times New Roman", "Times New Roman.ttf", "400", "normal"},
		{"Times New Roman", "Times New Roman Bold.ttf", "700", "normal"},
		{"Times New Roman", "Times New Roman Italic.ttf", "400", "italic"},
		{"Times New Roman", "Times New Roman Bold Italic.ttf", "700", "italic"},
	}
	if chineseLanguage == "sc" {
		return append(fonts,
			FontFace{"Songti SC", "Songti.ttc", "400", "normal"},
			FontFace{"Songti SC", "Songti.ttc", "700", "normal"},
		)
	}
	return append(fonts,
		FontFace{"TCSongti", "Songti-TC-Regular.ttf", "400", "normal"},
		FontFace{"TCSongti", "Songti-TC-Bold.ttf", "700", "normal"},
		FontFace{"Songti TC", "Songti-TC-Regular.ttf", "400", "normal"},
		FontFace{"Songti TC", "Songti-TC-Bold.ttf", "700", "normal"},
	)
}

func classicFontVariableCSS(chineseLanguage string) string {
	return `:root{--pdf-classic-mono-font-family:` + classicMonoFontStack(chineseLanguage, false) + `;--pdf-classic-mono-light-font-family:` + classicMonoFontStack(chineseLanguage, true) + `;--pdf-classic-serif-font-family:` + classicSerifFontStack(chineseLanguage) + `;}`
}

func classicMonoFontStack(chineseLanguage string, light bool) string {
	latin := `"SF-Mono"`
	if light {
		latin = `"SF-Mono-Light"`
	}
	if chineseLanguage == "sc" {
		return latin + `,"Songti SC",monospace`
	}
	return latin + `,TCSongti,"Songti TC",monospace`
}

func classicSerifFontStack(chineseLanguage string) string {
	if chineseLanguage == "sc" {
		return `TimesNewRoman,"Songti SC",serif`
	}
	return `TimesNewRoman,TCSongti,"Songti TC",serif`
}

func classicMonoFooterStack(chineseLanguage string) string {
	if chineseLanguage == "sc" {
		return `SF-Mono,'Songti SC',monospace`
	}
	return `SF-Mono,TCSongti,'Songti TC',monospace`
}

func classicSignatureFontFamily(fontRole string, containsCJK bool, chineseLanguage string) string {
	if containsCJK {
		return classicSerifFontStack(chineseLanguage)
	}
	if fontRole == "sf-mono" {
		return "SF-Mono, monospace"
	}
	return fontRole + ", SF-Mono, monospace"
}

func classicFooterTemplate(_ Scope, chineseLanguage string) string {
	return `<div style="width:100%;font-family:` + classicMonoFooterStack(chineseLanguage) + `;font-size:7pt;color:#666;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`
}
