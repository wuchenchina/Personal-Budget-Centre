package app

import (
	"context"
	"strings"
)

func (a *App) availableSSOEmail(ctx context.Context, email, subject string) (string, error) {
	if exists, err := a.emailExists(ctx, email); err != nil || !exists {
		return email, err
	}
	local, _, _ := strings.Cut(email, "@")
	local = username(local)
	if local == "" {
		local = "sso"
	}
	subjectPart := username(subject)
	if len(subjectPart) > 20 {
		subjectPart = subjectPart[:20]
	}
	base := local + "+sso-" + stringDefault(subjectPart, "account")
	for i := 0; i < 20; i++ {
		suffix := ""
		if i > 0 {
			suffix = "-" + randomSuffix()
		}
		candidate := base + suffix + "@sso.local"
		exists, err := a.emailExists(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}
	return "sso-" + randomSuffix() + "@sso.local", nil
}

func (a *App) availableSSOUsername(ctx context.Context, userinfo map[string]any, email, subject string) (string, error) {
	local, _, _ := strings.Cut(email, "@")
	candidates := []string{
		username(userinfo["preferred_username"]),
		username(userinfo["username"]),
		username(userinfo["login"]),
		username(userinfo["name"]),
		username(local),
		username("sso-" + subject),
	}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if len(candidate) > 80 {
			candidate = candidate[:80]
		}
		exists, err := a.usernameExists(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}
	for i := 0; i < 5; i++ {
		candidate := "sso-" + randomSuffix()
		exists, err := a.usernameExists(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}
	return "", nil
}

func (a *App) emailExists(ctx context.Context, email string) (bool, error) {
	var count int
	err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE email = ?", email).Scan(&count)
	return count > 0, err
}

func (a *App) usernameExists(ctx context.Context, username string) (bool, error) {
	if username == "" {
		return false, nil
	}
	var count int
	err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE username = ?", username).Scan(&count)
	return count > 0, err
}

func randomSuffix() string {
	value, err := randomHex(4)
	if err != nil {
		return "account"
	}
	return value
}
