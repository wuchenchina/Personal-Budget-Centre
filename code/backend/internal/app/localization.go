package app

import (
	"net/http"
	"strings"
)

func requestLanguage(r *http.Request) string {
	if r == nil {
		return "tc"
	}
	return normalizeAppLanguage(r.Header.Get("Accept-Language"))
}

func normalizeAppLanguage(value string) string {
	for _, rawPart := range strings.Split(value, ",") {
		part := strings.TrimSpace(strings.Split(rawPart, ";")[0])
		if part == "" {
			continue
		}
		language := strings.ToLower(strings.ReplaceAll(part, "_", "-"))
		switch {
		case language == "en" || strings.HasPrefix(language, "en-"):
			return "en"
		case language == "ja" || strings.HasPrefix(language, "ja-") || language == "jp" || strings.HasPrefix(language, "jp-"):
			return "ja"
		case language == "fr" || strings.HasPrefix(language, "fr-"):
			return "fr"
		case language == "ru" || strings.HasPrefix(language, "ru-"):
			return "ru"
		case language == "de" || strings.HasPrefix(language, "de-"):
			return "de"
		case strings.Contains(language, "hans") || strings.HasPrefix(language, "zh-cn") || strings.HasPrefix(language, "zh-sg") || language == "sc":
			return "sc"
		case strings.Contains(language, "hant") || strings.HasPrefix(language, "zh-tw") || strings.HasPrefix(language, "zh-hk") || strings.HasPrefix(language, "zh-mo") || language == "tc":
			return "tc"
		}
	}
	return "tc"
}
