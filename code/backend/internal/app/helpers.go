package app

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

type rowScanner interface {
	Scan(dest ...any) error
}

func readJSON(r *http.Request) (map[string]any, error) {
	if r.Body == nil {
		return map[string]any{}, nil
	}
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(string(body)) == "" {
		return map[string]any{}, nil
	}
	var input map[string]any
	if err := json.Unmarshal(body, &input); err != nil {
		return nil, apiError("INVALID_JSON", "Request body must be a JSON object.", http.StatusBadRequest)
	}
	return input, nil
}
