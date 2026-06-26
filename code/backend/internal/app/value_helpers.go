package app

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func stringValue(value any) string {
	if v, ok := value.(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func nonEmptyString(values ...any) string {
	for _, value := range values {
		if text := stringValue(value); text != "" {
			return text
		}
	}
	return ""
}

func hasAnyKey(input map[string]any, keys ...string) bool {
	for _, key := range keys {
		if _, ok := input[key]; ok {
			return true
		}
	}
	return false
}

func nonEmptyDefault(value any, fallback string) string {
	if text := nonEmptyString(value); text != "" {
		return text
	}
	return fallback
}

func stringDefault(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

func boolValue(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return v == "true" || v == "1"
	default:
		return false
	}
}

func boolDefault(value any, fallback bool) bool {
	if value == nil {
		return fallback
	}
	switch v := value.(type) {
	case bool:
		return v
	case string:
		text := strings.ToLower(strings.TrimSpace(v))
		if text == "" {
			return fallback
		}
		return text == "true" || text == "1" || text == "yes"
	case float64:
		return v != 0
	case int:
		return v != 0
	default:
		return fallback
	}
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func int64Value(value any) int64 {
	switch v := value.(type) {
	case int64:
		return v
	case int:
		return int64(v)
	case float64:
		return int64(v)
	case json.Number:
		out, _ := v.Int64()
		return out
	case string:
		out, _ := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		return out
	default:
		return 0
	}
}

func int64List(value any) []int64 {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]int64, 0, len(items))
	for _, item := range items {
		if id := int64Value(item); id > 0 {
			out = append(out, id)
		}
	}
	return out
}

func uniquePositiveInt64(values []int64) []int64 {
	seen := map[int64]bool{}
	out := make([]int64, 0, len(values))
	for _, value := range values {
		if value <= 0 || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func floatValue(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case string:
		out, _ := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return out
	default:
		return 0
	}
}

func rateOrDefault(value any) float64 {
	if rate := floatValue(value); rate > 0 {
		return rate
	}
	return 1
}

func queryInt(r *http.Request, key string) int64 {
	out, _ := strconv.ParseInt(r.URL.Query().Get(key), 10, 64)
	return out
}

func firstQuery(r *http.Request, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(r.URL.Query().Get(key)); value != "" {
			return value
		}
	}
	return ""
}

func enumString(value string, allowed []string, fallback string) string {
	for _, item := range allowed {
		if value == item {
			return value
		}
	}
	return fallback
}

func nullableDate(value any) any {
	text := dateString(value)
	if text == "" {
		return nil
	}
	return text
}

func dateString(value any) string {
	text := stringValue(value)
	if text == "" {
		return ""
	}
	if len(text) >= len("2006-01-02") {
		text = text[:len("2006-01-02")]
	}
	if _, err := time.Parse("2006-01-02", text); err != nil {
		return ""
	}
	return text
}

func todayDate() string {
	return time.Now().Format("2006-01-02")
}

func nullableText(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func requiredLimitedString(value any, maxLength int, label string) (string, error) {
	text := stringValue(value)
	if text == "" {
		return "", apiError("VALIDATION_ERROR", label+" is required.", http.StatusUnprocessableEntity)
	}
	if len(text) > maxLength {
		return "", apiError("VALIDATION_ERROR", label+" is too long.", http.StatusUnprocessableEntity)
	}
	return text, nil
}

func optionalLimitedString(value any, maxLength int, label string) (any, error) {
	text := stringValue(value)
	if text == "" {
		return nil, nil
	}
	if len(text) > maxLength {
		return nil, apiError("VALIDATION_ERROR", label+" is too long.", http.StatusUnprocessableEntity)
	}
	return text, nil
}
