package app

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/mail"
	"strings"
)

func normalizedEmail(value any) string {
	email := strings.ToLower(stringValue(value))
	if _, err := mail.ParseAddress(email); err != nil {
		return ""
	}
	return email
}

func username(value any) string {
	raw := strings.ToLower(stringValue(value))
	var builder strings.Builder
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
			builder.WriteRune(r)
		}
	}
	return strings.Trim(builder.String(), ".-_")
}

func randomHex(bytes int) (string, error) {
	buffer := make([]byte, bytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func randomURLSafe(bytes int) (string, error) {
	buffer := make([]byte, bytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func csrfToken(token string) string {
	mac := hmac.New(sha256.New, []byte(token))
	mac.Write([]byte("budgetcentre-csrf-v1"))
	return hex.EncodeToString(mac.Sum(nil))
}

func checkHMAC(got, expected string) bool {
	return hmac.Equal([]byte(got), []byte(expected))
}
