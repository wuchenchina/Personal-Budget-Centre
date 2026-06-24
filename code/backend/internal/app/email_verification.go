package app

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) authEmailVerify(w http.ResponseWriter, r *http.Request) error {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		return apiError("VALIDATION_ERROR", "Verification token is required.", http.StatusUnprocessableEntity)
	}
	result, err := a.verifyEmailToken(r.Context(), token)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, result, http.StatusOK)
	return nil
}

func (a *App) authEmailResend(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	email := normalizedEmail(input["email"])
	if email == "" {
		return apiError("VALIDATION_ERROR", "A valid email is required.", http.StatusUnprocessableEntity)
	}
	var userID int64
	var displayName string
	var verified sql.NullString
	err = a.db.QueryRowContext(r.Context(), "SELECT id, display_name, email_verified_at FROM users WHERE email = ? LIMIT 1", email).Scan(&userID, &displayName, &verified)
	if err == nil && !verified.Valid {
		token, err := a.createEmailVerificationToken(r.Context(), userID)
		if err != nil {
			return err
		}
		if err := a.sendVerificationEmail(email, displayName, token); err != nil {
			return err
		}
	}
	httpx.WriteOK(w, map[string]any{"sent": true, "email": email}, http.StatusOK)
	return nil
}

func (a *App) adminUserEmailVerification(w http.ResponseWriter, r *http.Request) error {
	if _, err := a.requireAdmin(r); err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	userID := int64Value(input["id"])
	var email, displayName string
	var verified sql.NullString
	if err := a.db.QueryRowContext(r.Context(), "SELECT email, display_name, email_verified_at FROM users WHERE id = ? LIMIT 1", userID).Scan(&email, &displayName, &verified); err != nil {
		return apiError("USER_NOT_FOUND", "User was not found.", http.StatusNotFound)
	}
	if verified.Valid {
		httpx.WriteOK(w, map[string]any{"sent": false, "email": email, "alreadyVerified": true}, http.StatusOK)
		return nil
	}
	token, err := a.createEmailVerificationToken(r.Context(), userID)
	if err != nil {
		return err
	}
	if err := a.sendVerificationEmail(email, displayName, token); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"sent": true, "email": email, "alreadyVerified": false}, http.StatusOK)
	return nil
}

func (a *App) createEmailVerificationToken(ctx context.Context, userID int64) (string, error) {
	token, err := randomHex(32)
	if err != nil {
		return "", err
	}
	_, err = a.db.ExecContext(ctx, `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
VALUES (?, ?, ?)`, userID, sha256Hex(token), time.Now().UTC().Add(24*time.Hour))
	if err != nil {
		return "", err
	}
	_, err = a.db.ExecContext(ctx, "UPDATE users SET email_verification_sent_at = UTC_TIMESTAMP() WHERE id = ?", userID)
	return token, err
}

func (a *App) createEmailVerificationTokenTx(ctx context.Context, tx *sql.Tx, userID int64) (string, error) {
	token, err := randomHex(32)
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
VALUES (?, ?, ?)`, userID, sha256Hex(token), time.Now().UTC().Add(24*time.Hour))
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx, "UPDATE users SET email_verification_sent_at = UTC_TIMESTAMP() WHERE id = ?", userID)
	return token, err
}

func (a *App) verifyEmailToken(ctx context.Context, token string) (map[string]any, error) {
	hash := sha256Hex(token)
	var id, userID int64
	var email, username string
	var verified sql.NullString
	err := a.db.QueryRowContext(ctx, `SELECT evt.id, evt.user_id, u.email, COALESCE(u.username, ''), u.email_verified_at
FROM email_verification_tokens evt
JOIN users u ON u.id = evt.user_id
WHERE evt.token_hash = ? AND evt.used_at IS NULL AND evt.expires_at > UTC_TIMESTAMP()
LIMIT 1`, hash).Scan(&id, &userID, &email, &username, &verified)
	if err != nil {
		var usedEmail, usedUsername string
		var usedVerified sql.NullString
		usedErr := a.db.QueryRowContext(ctx, `SELECT u.email, COALESCE(u.username, ''), u.email_verified_at
FROM email_verification_tokens evt
JOIN users u ON u.id = evt.user_id
WHERE evt.token_hash = ?
LIMIT 1`, hash).Scan(&usedEmail, &usedUsername, &usedVerified)
		if usedErr == nil && usedVerified.Valid {
			return map[string]any{"verified": true, "alreadyVerified": true, "email": usedEmail, "username": usedUsername}, nil
		}
		return nil, apiError("INVALID_EMAIL_TOKEN", "Verification link is invalid or expired.", http.StatusUnprocessableEntity)
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "UPDATE users SET email_verified_at = UTC_TIMESTAMP(), status = 'active' WHERE id = ?", userID); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE email_verification_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?", id); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	_ = verified
	return map[string]any{"verified": true, "alreadyVerified": false, "email": email, "username": username}, nil
}

func (a *App) sendVerificationEmail(email, displayName, token string) error {
	appURL := strings.TrimRight(a.cfg.AppURL, "/")
	if appURL == "" {
		appURL = "http://localhost:5173"
	}
	link := appURL + "/email/verify?token=" + token
	body := displayName + `，你好：

请打开下面的链接验证你的 BudgetCentre 邮箱：

` + link + `

此链接 24 小时内有效。如果不是你本人操作，可以忽略这封邮件。

BudgetCentre`
	if err := a.sendMail(email, "验证你的 BudgetCentre 邮箱", body); err != nil {
		return apiError("MAIL_DELIVERY_FAILED", "Email delivery failed. Please try again later.", http.StatusServiceUnavailable)
	}
	return nil
}
