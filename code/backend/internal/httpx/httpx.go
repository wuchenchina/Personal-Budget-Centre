package httpx

import (
	"encoding/json"
	"net/http"
)

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Meta    map[string]any `json:"meta"`
}

type Envelope struct {
	OK    bool   `json:"ok"`
	Data  any    `json:"data"`
	Error *Error `json:"error"`
}

type APIError struct {
	Code    string
	Message string
	Status  int
	Meta    map[string]any
}

func (err APIError) Error() string { return err.Message }

func WriteOK(w http.ResponseWriter, data any, status int) {
	if data == nil {
		data = map[string]any{}
	}
	writeJSON(w, Envelope{OK: true, Data: data, Error: nil}, status)
}

func WriteError(w http.ResponseWriter, code, message string, status int, meta map[string]any) {
	if meta == nil {
		meta = map[string]any{}
	}
	writeJSON(w, Envelope{
		OK:   false,
		Data: nil,
		Error: &Error{
			Code:    code,
			Message: message,
			Meta:    meta,
		},
	}, status)
}

func writeJSON(w http.ResponseWriter, payload any, status int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
