package app

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) appendAppLog(r *http.Request, err error) {
	if err == nil {
		return
	}
	path := a.cfg.AppLogFile
	if path == "" {
		return
	}
	if mkErr := os.MkdirAll(filepath.Dir(path), 0o755); mkErr != nil {
		return
	}
	entry := map[string]any{
		"id":        randomLogID(),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"level":     "error",
		"code":      "INTERNAL_SERVER_ERROR",
		"status":    http.StatusInternalServerError,
		"message":   err.Error(),
		"exception": "error",
		"file":      "",
		"line":      nil,
		"method":    r.Method,
		"path":      r.URL.Path,
		"query":     redactedQuery(r),
		"ipAddress": r.RemoteAddr,
		"userAgent": r.UserAgent(),
		"trace":     []string{},
	}
	var apiErr httpx.APIError
	if errors.As(err, &apiErr) {
		entry["code"] = apiErr.Code
		entry["status"] = apiErr.Status
		entry["message"] = apiErr.Message
		entry["exception"] = "APIError"
	}
	raw, marshalErr := json.Marshal(entry)
	if marshalErr != nil {
		return
	}
	file, openErr := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if openErr != nil {
		return
	}
	defer file.Close()
	_, _ = file.Write(append(raw, '\n'))
}

func (a *App) recentLogs(limit int) map[string]any {
	if limit < 20 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}
	path := a.cfg.AppLogFile
	entries := []map[string]any{}
	file, err := os.Open(path)
	if err != nil {
		return map[string]any{"path": path, "entries": entries}
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	lines := []string{}
	for scanner.Scan() {
		text := strings.TrimSpace(scanner.Text())
		if text != "" {
			lines = append(lines, text)
		}
	}
	for i := len(lines) - 1; i >= 0 && len(entries) < limit; i-- {
		var entry map[string]any
		if err := json.Unmarshal([]byte(lines[i]), &entry); err == nil {
			entries = append(entries, normalizedLogEntry(entry, lines[i]))
		}
	}
	return map[string]any{"path": path, "entries": entries}
}

func normalizedLogEntry(entry map[string]any, raw string) map[string]any {
	out := map[string]any{
		"id":        stringDefault(stringValue(entry["id"]), sha256Hex(raw)),
		"timestamp": stringValue(entry["timestamp"]),
		"level":     stringDefault(stringValue(entry["level"]), "error"),
		"code":      stringDefault(stringValue(entry["code"]), "SERVER_ERROR"),
		"status":    int64Value(entry["status"]),
		"message":   stringValue(entry["message"]),
		"exception": stringValue(entry["exception"]),
		"file":      stringValue(entry["file"]),
		"line":      entry["line"],
		"method":    entry["method"],
		"path":      entry["path"],
		"query":     normalizedLogObject(entry["query"]),
		"ipAddress": entry["ipAddress"],
		"userAgent": entry["userAgent"],
		"trace":     normalizedLogTrace(entry["trace"]),
	}
	if out["status"] == int64(0) {
		out["status"] = http.StatusInternalServerError
	}
	return out
}

func normalizedLogTrace(value any) []string {
	raw, ok := value.([]any)
	if !ok {
		if typed, ok := value.([]string); ok {
			return typed
		}
		return []string{}
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		text := stringValue(item)
		if text != "" {
			out = append(out, text)
		}
	}
	return out
}

func normalizedLogObject(value any) map[string]any {
	raw, ok := value.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return raw
}

func redactedQuery(r *http.Request) map[string]any {
	out := map[string]any{}
	for key, values := range r.URL.Query() {
		lower := strings.ToLower(key)
		if strings.Contains(lower, "token") || strings.Contains(lower, "password") || strings.Contains(lower, "secret") {
			out[key] = "[redacted]"
			continue
		}
		if len(values) == 1 {
			out[key] = values[0]
		} else {
			out[key] = values
		}
	}
	return out
}

func randomLogID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return sha256Hex(time.Now().String())[:16]
	}
	return hex.EncodeToString(buffer)
}
