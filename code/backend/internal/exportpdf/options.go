package exportpdf

import (
	"encoding/json"
	"strings"

	"budgetcentre/backend/internal/exportpdf/theme"
)

type Options struct {
	TableLanguageMode      string
	TableChineseLanguage   string
	PDFTheme               string
	ShowWorkspace          bool
	PDFLanguages           []string
	PDFLanguagesExplicit   bool
	SignatureLabelMode     string
	SignatureLabelLanguage []string
	SuppressPageFooter     bool
	TotalPages             int
}

var supportedPDFLanguages = map[string]bool{
	"en": true,
	"sc": true,
	"tc": true,
	"ja": true,
	"fr": true,
	"ru": true,
	"de": true,
}

func OptionsFromInput(input map[string]any, defaultTheme string, rawSettings any) Options {
	tableLanguageMode := enumString(stringValue(firstValue(input, "tableLanguageMode", "table_language_mode")), []string{"en", "zh", "bilingual"}, "en")
	tableChineseLanguage := enumString(stringValue(firstValue(input, "tableChineseLanguage", "table_chinese_language")), []string{"sc", "tc"}, "tc")
	settings := SettingsFromRaw(rawSettings)

	pdfLanguagesExplicit := hasAnyKey(input, "pdfLanguages", "pdf_languages")
	pdfLanguages := normalizePDFLanguages(firstValue(input, "pdfLanguages", "pdf_languages"), nil)
	if len(pdfLanguages) == 0 {
		if hasAnyKey(settings, "pdfLanguages", "pdf_languages") {
			pdfLanguagesExplicit = true
		}
		pdfLanguages = normalizePDFLanguages(firstValue(settings, "pdfLanguages", "pdf_languages"), nil)
	}
	if len(pdfLanguages) == 0 {
		pdfLanguages = languagesFromLegacyTableOptions(tableLanguageMode, tableChineseLanguage)
	}

	signatureLanguages := normalizePDFLanguages(firstValue(input, "signatureLabelLanguages", "signature_label_languages"), nil)
	if len(signatureLanguages) == 0 {
		signatureLanguages = normalizePDFLanguages(firstValue(settings, "signatureLabelLanguages", "signature_label_languages"), nil)
	}
	if len(signatureLanguages) == 0 {
		signatureLanguages = []string{"en"}
	}
	pdfLanguages, signatureLanguages = alignPDFChineseLanguages(pdfLanguages, signatureLanguages)

	showWorkspace := false
	if hasAnyKey(input, "showWorkspace", "show_workspace") {
		showWorkspace = boolDefault(firstValue(input, "showWorkspace", "show_workspace"), false)
	} else {
		showWorkspace = boolDefault(firstValue(settings, "showWorkspace", "show_workspace"), false)
	}

	signatureMode := stringValue(firstValue(input, "signatureLabelMode", "signature_label_mode"))
	if signatureMode == "" {
		signatureMode = stringValue(firstValue(settings, "signatureLabelMode", "signature_label_mode"))
	}

	return Options{
		TableLanguageMode:      tableLanguageMode,
		TableChineseLanguage:   tableChineseLanguage,
		PDFTheme:               NormalizeTheme(firstValue(input, "pdfTheme", "pdf_theme", "defaultPdfTheme", "default_pdf_theme", defaultTheme)),
		ShowWorkspace:          showWorkspace,
		PDFLanguages:           pdfLanguages,
		PDFLanguagesExplicit:   pdfLanguagesExplicit,
		SignatureLabelMode:     SignatureLabelMode(signatureMode),
		SignatureLabelLanguage: signatureLanguages,
	}
}

func SettingsFromRaw(raw any) map[string]any {
	out := map[string]any{}
	switch value := raw.(type) {
	case string:
		if strings.TrimSpace(value) == "" {
			return out
		}
		_ = json.Unmarshal([]byte(value), &out)
	case map[string]any:
		out = value
	}
	return out
}

func NormalizeTheme(value any) string {
	key := stringValue(value)
	return theme.NormalizeKey(key)
}

func SettingsJSON(raw any, currentRaw any) (string, error) {
	current := SettingsFromRaw(currentRaw)
	settings := SettingsFromRaw(raw)
	if raw == nil {
		settings = current
	}
	pdfLanguages := normalizePDFLanguages(firstValueMap(settings, current, "pdfLanguages", "pdf_languages"), []string{"en"})
	signatureLanguages := normalizePDFLanguages(firstValueMap(settings, current, "signatureLabelLanguages", "signature_label_languages"), []string{"en"})
	pdfLanguages, signatureLanguages = alignPDFChineseLanguages(pdfLanguages, signatureLanguages)
	out := map[string]any{
		"showWorkspace":           boolDefault(firstValueMap(settings, current, "showWorkspace", "show_workspace"), false),
		"pdfLanguages":            pdfLanguages,
		"signatureLabelMode":      SignatureLabelMode(firstValueMap(settings, current, "signatureLabelMode", "signature_label_mode")),
		"signatureLabelLanguages": signatureLanguages,
	}
	encoded, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func normalizePDFLanguages(value any, fallback []string) []string {
	var raw []any
	switch v := value.(type) {
	case []any:
		raw = v
	case []string:
		raw = make([]any, 0, len(v))
		for _, item := range v {
			raw = append(raw, item)
		}
	case string:
		text := strings.TrimSpace(v)
		if text == "" {
			return normalizePDFLanguages(fallback, nil)
		}
		var decoded []any
		if json.Unmarshal([]byte(text), &decoded) == nil {
			raw = decoded
		} else {
			for _, part := range strings.FieldsFunc(text, func(r rune) bool { return r == ',' || r == ' ' || r == '\n' || r == '\t' }) {
				raw = append(raw, part)
			}
		}
	default:
		if fallback == nil {
			return []string{}
		}
		return normalizePDFLanguages(fallback, nil)
	}

	out := []string{}
	seen := map[string]bool{}
	for _, item := range raw {
		language := stringValue(item)
		if !supportedPDFLanguages[language] || seen[language] {
			continue
		}
		seen[language] = true
		out = append(out, language)
	}
	if len(out) == 0 && fallback != nil {
		return normalizePDFLanguages(fallback, nil)
	}
	return excludeConflictingChineseLanguage(out, selectedChineseLanguage(out))
}

func alignPDFChineseLanguages(pdfLanguages []string, signatureLanguages []string) ([]string, []string) {
	chinese := selectedChineseLanguage(pdfLanguages)
	if chinese == "" {
		chinese = selectedChineseLanguage(signatureLanguages)
	}
	if chinese == "" {
		return pdfLanguages, signatureLanguages
	}
	return excludeConflictingChineseLanguage(pdfLanguages, chinese), excludeConflictingChineseLanguage(signatureLanguages, chinese)
}

func selectedChineseLanguage(languages []string) string {
	for _, language := range languages {
		if language == "sc" || language == "tc" {
			return language
		}
	}
	return ""
}

func excludeConflictingChineseLanguage(languages []string, keep string) []string {
	if keep != "sc" && keep != "tc" {
		return languages
	}
	firstChineseIndex := -1
	for index, language := range languages {
		if language == "sc" || language == "tc" {
			firstChineseIndex = index
			break
		}
	}
	if firstChineseIndex < 0 {
		return languages
	}
	out := make([]string, 0, len(languages))
	inserted := false
	for index, language := range languages {
		if language == "sc" || language == "tc" {
			if !inserted && index == firstChineseIndex {
				out = append(out, keep)
				inserted = true
			}
			continue
		}
		out = append(out, language)
	}
	return out
}

func languagesFromLegacyTableOptions(mode, chineseLanguage string) []string {
	if chineseLanguage != "sc" && chineseLanguage != "tc" {
		chineseLanguage = "tc"
	}
	switch mode {
	case "zh":
		return []string{chineseLanguage}
	case "bilingual":
		return []string{"en", chineseLanguage}
	default:
		return []string{"en"}
	}
}

func SignatureLabelMode(value any) string {
	switch stringValue(value) {
	case "confirmation_signature", "confirmation", "signature":
		return stringValue(value)
	default:
		return "confirmation_signature"
	}
}

func hasAnyKey(input map[string]any, keys ...string) bool {
	for _, key := range keys {
		if _, ok := input[key]; ok {
			return true
		}
	}
	return false
}

func firstValueMap(primary map[string]any, fallback map[string]any, keys ...string) any {
	for _, key := range keys {
		if value, ok := primary[key]; ok {
			return value
		}
	}
	for _, key := range keys {
		if value, ok := fallback[key]; ok {
			return value
		}
	}
	return nil
}
