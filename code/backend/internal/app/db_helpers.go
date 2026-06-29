package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func nullableString(value sql.NullString) any {
	if value.Valid {
		return value.String
	}
	return nil
}

func nullableDateOnly(value sql.NullString) any {
	text, ok := cleanNullableText(value)
	if !ok {
		return nil
	}
	if date := dateString(text); date != "" {
		return date
	}
	return text
}

func nullableDateTime(value sql.NullString) any {
	text, ok := cleanNullableText(value)
	if !ok {
		return nil
	}
	return dateTimeValue(text)
}

func dateTimeValue(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	if isZeroDateTime(value) {
		return nil
	}
	if parsed, ok := parseDateTime(value); ok {
		return parsed.UTC().Format(time.RFC3339)
	}
	return value
}

func cleanNullableText(value sql.NullString) (string, bool) {
	if !value.Valid {
		return "", false
	}
	text := strings.TrimSpace(value.String)
	if text == "" || isZeroDateTime(text) {
		return "", false
	}
	return text, true
}

func isZeroDateTime(value string) bool {
	text := strings.TrimSpace(value)
	return text == "0000-00-00" || strings.HasPrefix(text, "0000-00-00 ")
}

func parseDateTime(value string) (time.Time, bool) {
	text := strings.TrimSpace(value)
	if text == "" || isZeroDateTime(text) {
		return time.Time{}, false
	}
	for _, layout := range []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006-01-02",
	} {
		parsed, err := time.Parse(layout, text)
		if err == nil {
			return parsed.UTC(), true
		}
	}
	return time.Time{}, false
}

func nullableInt(value sql.NullInt64) any {
	if value.Valid {
		return value.Int64
	}
	return nil
}

func nullableInt64Value(value any) any {
	if id := int64Value(value); id > 0 {
		return id
	}
	return nil
}

func nullableFloat(value any) any {
	if value == nil {
		return nil
	}
	switch value.(type) {
	case string:
		if stringValue(value) == "" {
			return nil
		}
	}
	return floatValue(value)
}

func nullableStringValue(value any) any {
	if text := stringValue(value); text != "" {
		return text
	}
	return nil
}

func jsonString(value any) any {
	if value == nil {
		return nil
	}
	raw, err := json.Marshal(value)
	if err != nil || string(raw) == "null" {
		return nil
	}
	return string(raw)
}

func jsonMap(raw sql.NullString) map[string]any {
	out := map[string]any{}
	if raw.Valid && raw.String != "" {
		_ = json.Unmarshal([]byte(raw.String), &out)
	}
	return out
}

func jsonArray(raw sql.NullString) []any {
	out := []any{}
	if raw.Valid && raw.String != "" {
		_ = json.Unmarshal([]byte(raw.String), &out)
	}
	return out
}

func parseNullFloat(raw sql.NullString) any {
	if !raw.Valid || raw.String == "" {
		return nil
	}
	value, err := strconv.ParseFloat(raw.String, 64)
	if err != nil {
		return nil
	}
	return value
}

func round4(value float64) float64 {
	return math.Round(value*10000) / 10000
}

func roleID(ctx context.Context, q interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, key, scope string) (int64, error) {
	var id int64
	err := q.QueryRowContext(ctx, "SELECT id FROM roles WHERE role_key = ? AND scope = ? LIMIT 1", key, scope).Scan(&id)
	return id, err
}

func (a *App) optionalCurrencyID(ctx context.Context, value any) (sql.NullInt64, error) {
	code := stringValue(value)
	if code == "" {
		return sql.NullInt64{}, nil
	}
	id, err := a.currencyID(ctx, code)
	if err != nil || !id.Valid {
		return sql.NullInt64{}, apiError("CURRENCY_NOT_FOUND", "Currency is not available.", http.StatusUnprocessableEntity)
	}
	return id, nil
}

func placeholders(count int) string {
	if count <= 0 {
		return ""
	}
	parts := make([]string, count)
	for i := range parts {
		parts[i] = "?"
	}
	return strings.Join(parts, ",")
}

func anySlice[T any](items []T) []any {
	out := make([]any, len(items))
	for i, item := range items {
		out[i] = item
	}
	return out
}
