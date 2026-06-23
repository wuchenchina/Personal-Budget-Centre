package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

func credentialJSON(input map[string]any) ([]byte, error) {
	credential := input["credential"]
	if credential == nil {
		credential = input
	}
	raw, err := json.Marshal(credential)
	if err != nil || bytes.Equal(raw, []byte("null")) {
		return nil, apiError("VALIDATION_ERROR", "Passkey credential payload is required.", http.StatusUnprocessableEntity)
	}
	return raw, nil
}

func passkeyUserHandle(userID int64) []byte {
	return []byte(fmt.Sprintf("user:%d", userID))
}

func passkeyUserIDFromHandle(handle []byte) int64 {
	text := string(handle)
	if !strings.HasPrefix(text, "user:") {
		return 0
	}
	id, _ := strconv.ParseInt(strings.TrimPrefix(text, "user:"), 10, 64)
	return id
}
