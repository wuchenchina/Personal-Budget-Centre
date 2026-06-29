package app

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"budgetcentre/backend/internal/httpx"

	"golang.org/x/crypto/bcrypt"
)

const passwordResetTokenTTL = 30 * time.Minute

func (a *App) authPasswordResetEmail(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	email := normalizedEmail(input["email"])
	if email == "" {
		return apiError("VALIDATION_ERROR", "A valid email is required.", http.StatusUnprocessableEntity)
	}
	userID, displayName, accountEmail, eligible, err := a.passwordResetEligibleUserByEmail(r.Context(), email)
	if err != nil {
		return err
	}
	if eligible {
		token, err := a.createPasswordResetToken(r.Context(), userID, "email")
		if err != nil {
			return err
		}
		if err := a.sendPasswordResetEmail(accountEmail, displayName, token); err != nil {
			return err
		}
	}
	httpx.WriteOK(w, map[string]any{"sent": true, "email": email}, http.StatusOK)
	return nil
}

func (a *App) authPasswordResetVerify(w http.ResponseWriter, r *http.Request) error {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		return apiError("PASSWORD_RESET_TOKEN_INVALID", "Password reset token is invalid or expired.", http.StatusUnprocessableEntity)
	}
	result, err := a.passwordResetTokenUser(r.Context(), token)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"valid": true, "email": result.email}, http.StatusOK)
	return nil
}

func (a *App) authPasswordResetComplete(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	token := strings.TrimSpace(stringValue(input["token"]))
	next := nonEmptyString(input["password"], input["newPassword"], input["new_password"])
	if token == "" {
		return apiError("PASSWORD_RESET_TOKEN_INVALID", "Password reset token is invalid or expired.", http.StatusUnprocessableEntity)
	}
	if len(next) < 10 {
		return apiError("VALIDATION_ERROR", "Password must be at least 10 characters.", http.StatusUnprocessableEntity)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	tokenHash := sha256Hex(token)
	var tokenID, userID int64
	var passwordHash sql.NullString
	var status string
	err = tx.QueryRowContext(r.Context(), `
SELECT prt.id, prt.user_id, u.password_hash, u.status
FROM password_reset_tokens prt
JOIN users u ON u.id = prt.user_id
WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > UTC_TIMESTAMP()
LIMIT 1
FOR UPDATE`, tokenHash).Scan(&tokenID, &userID, &passwordHash, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			return apiError("PASSWORD_RESET_TOKEN_INVALID", "Password reset token is invalid or expired.", http.StatusUnprocessableEntity)
		}
		return err
	}
	if status != "active" || !passwordHash.Valid {
		return apiError("PASSWORD_RESET_NOT_AVAILABLE", "Password reset is not available for this account.", http.StatusConflict)
	}
	if _, err := tx.ExecContext(r.Context(), "UPDATE users SET password_hash = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?", string(hash), userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(r.Context(), "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?", tokenID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(r.Context(), "DELETE FROM user_sessions WHERE user_id = ?", userID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"changed": true}, http.StatusOK)
	return nil
}

type passwordResetUser struct {
	userID int64
	email  string
}

func (a *App) passwordResetTokenUser(ctx context.Context, token string) (passwordResetUser, error) {
	var result passwordResetUser
	err := a.db.QueryRowContext(ctx, `
SELECT u.id, u.email
FROM password_reset_tokens prt
JOIN users u ON u.id = prt.user_id
WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > UTC_TIMESTAMP()
  AND u.status = 'active' AND u.password_hash IS NOT NULL
LIMIT 1`, sha256Hex(token)).Scan(&result.userID, &result.email)
	if err != nil {
		if err == sql.ErrNoRows {
			return result, apiError("PASSWORD_RESET_TOKEN_INVALID", "Password reset token is invalid or expired.", http.StatusUnprocessableEntity)
		}
		return result, err
	}
	return result, nil
}

func (a *App) passwordResetEligibleUserByEmail(ctx context.Context, email string) (int64, string, string, bool, error) {
	var userID int64
	var displayName, accountEmail, status string
	var passwordHash sql.NullString
	err := a.db.QueryRowContext(ctx, "SELECT id, display_name, email, password_hash, status FROM users WHERE email = ? LIMIT 1", email).Scan(&userID, &displayName, &accountEmail, &passwordHash, &status)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, "", email, false, nil
		}
		return 0, "", email, false, err
	}
	return userID, displayName, accountEmail, status == "active" && passwordHash.Valid, nil
}

func (a *App) createPasswordResetToken(ctx context.Context, userID int64, method string) (string, error) {
	token, err := randomHex(32)
	if err != nil {
		return "", err
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL", userID); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO password_reset_tokens (user_id, token_hash, method, expires_at)
VALUES (?, ?, ?, ?)`, userID, sha256Hex(token), method, time.Now().UTC().Add(passwordResetTokenTTL)); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return token, nil
}

func (a *App) createPasswordResetTokenForUser(ctx context.Context, userID int64, method string) (string, error) {
	var count int
	if err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE id = ? AND status = 'active' AND password_hash IS NOT NULL", userID).Scan(&count); err != nil {
		return "", err
	}
	if count == 0 {
		return "", apiError("PASSWORD_RESET_NOT_AVAILABLE", "Password reset is not available for this account.", http.StatusConflict)
	}
	return a.createPasswordResetToken(ctx, userID, method)
}

func (a *App) sendPasswordResetEmail(email, _ string, token string) error {
	appURL := strings.TrimRight(a.cfg.AppURL, "/")
	if appURL == "" {
		appURL = "http://localhost:5173"
	}
	body := passwordResetEmailBody(appURL, token)
	if err := a.sendMail(email, "重设你的 BudgetCentre 密码", body); err != nil {
		return apiError("MAIL_DELIVERY_FAILED", "Email delivery failed. Please try again later.", http.StatusServiceUnavailable)
	}
	return nil
}

func passwordResetEmailBody(appURL, token string) string {
	link := appURL + "/password/reset?token=" + token
	return `你好：

请打开下面的链接重设你的 BudgetCentre 密码：

` + link + `

此链接 30 分钟内有效，并且只能使用一次。如果不是你本人操作，可以忽略这封邮件。

BudgetCentre`
}
