package theme

import (
	"strings"
)

const defaultPDFTheme = "classic"

type Scope string

const (
	ScopeBudget      Scope = "budget"
	ScopeBookkeeping Scope = "bookkeeping"
)

type MarginsMM struct {
	Top    float64
	Right  float64
	Bottom float64
	Left   float64
}

type HeaderOptions struct {
	ShowWorkspace bool
	TotalPages    string
}

type Definition interface {
	Key() string
	DocumentCSS(scope Scope) string
	TableCSS(scope Scope) string
	SignatureCSS() string
	SignatureFullWidthMM() float64
	PageMargins(scope Scope) MarginsMM
	HeaderHTML(budget map[string]any, titleHTML, subtitleHTML string, options HeaderOptions, scope Scope) string
	FooterTemplate(scope Scope) string
}

var (
	pdfThemeFactories = map[string]func() Definition{}
	pdfThemeAliases   = map[string]string{}
)

func ForKey(key string) Definition {
	if factory, ok := pdfThemeFactories[NormalizeKey(key)]; ok {
		return factory()
	}
	return pdfThemeFactories[defaultPDFTheme]()
}

func IsSupported(key string) bool {
	key = strings.TrimSpace(key)
	if key == "" {
		return false
	}
	if _, ok := pdfThemeAliases[key]; ok {
		return true
	}
	_, ok := pdfThemeFactories[key]
	return ok
}

func NormalizeKey(key string) string {
	key = strings.TrimSpace(key)
	if alias, ok := pdfThemeAliases[key]; ok {
		key = alias
	}
	if _, ok := pdfThemeFactories[key]; ok {
		return key
	}
	return defaultPDFTheme
}

func Register(key string, factory func() Definition, aliases ...string) {
	key = strings.TrimSpace(key)
	if key == "" || factory == nil {
		panic("invalid PDF theme registration")
	}
	if _, exists := pdfThemeFactories[key]; exists {
		panic("duplicate PDF theme registration: " + key)
	}
	pdfThemeFactories[key] = factory
	for _, alias := range aliases {
		alias = strings.TrimSpace(alias)
		if alias == "" {
			continue
		}
		pdfThemeAliases[alias] = key
	}
}
