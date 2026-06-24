package app

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"budgetcentre/backend/internal/exportpdf"
	"budgetcentre/backend/internal/httpx"

	"golang.org/x/crypto/bcrypt"
)

func (a *App) authRegister(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	email := normalizedEmail(input["email"])
	username := username(input["username"])
	displayName := nonEmptyString(input["displayName"], input["display_name"])
	password := stringValue(input["password"])
	if email == "" || username == "" || displayName == "" || len(password) < 10 {
		return apiError("VALIDATION_ERROR", "Email, username, display name and password are required.", http.StatusUnprocessableEntity)
	}
	if exists, err := a.userExists(r.Context(), email, username); err != nil || exists {
		if err != nil {
			return err
		}
		return apiError("EMAIL_ALREADY_EXISTS", "Email or username is already registered.", http.StatusConflict)
	}
	isFirst, err := a.noUsers(r.Context())
	if err != nil {
		return err
	}
	currencyID, err := a.optionalCurrencyID(r.Context(), input["defaultCurrency"])
	if err != nil {
		return err
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(r.Context(), `
INSERT INTO users (email, username, password_hash, display_name, default_currency_id, status, is_admin, email_verified_at)
VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL)`, email, username, string(passwordHash), displayName, nullableInt(currencyID), boolInt(isFirst))
	if err != nil {
		return err
	}
	userID, _ := res.LastInsertId()
	if currencyID.Valid {
		if err := ensureUserCurrencyByIDTx(r.Context(), tx, userID, currencyID.Int64, "catalog"); err != nil {
			return err
		}
	}
	workspaceID, err := a.createWorkspaceTx(r.Context(), tx, userID, displayName+"'s Workspace", "personal", currencyID)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	_ = workspaceID
	token, err := a.createEmailVerificationToken(r.Context(), userID)
	if err != nil {
		return err
	}
	if err := a.sendVerificationEmail(email, displayName, token); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"requiresEmailVerification": true, "email": email}, http.StatusCreated)
	return nil
}

func (a *App) authLogin(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	identifier := strings.TrimSpace(stringDefault(stringValue(input["identifier"]), stringValue(input["email"])))
	password := stringValue(input["password"])
	row := a.db.QueryRowContext(r.Context(), "SELECT id, password_hash, email, display_name, email_verified_at, status FROM users WHERE (email = ? OR username = ?) AND status <> 'disabled' LIMIT 1", strings.ToLower(identifier), identifier)
	var userID int64
	var hash sql.NullString
	var email, displayName, status string
	var verified sql.NullString
	if err := row.Scan(&userID, &hash, &email, &displayName, &verified, &status); err != nil || !hash.Valid || bcrypt.CompareHashAndPassword([]byte(hash.String), []byte(password)) != nil {
		return apiError("INVALID_CREDENTIALS", "Invalid username/email or password.", http.StatusUnauthorized)
	}
	if !verified.Valid {
		token, err := a.createEmailVerificationToken(r.Context(), userID)
		if err != nil {
			return err
		}
		if err := a.sendVerificationEmail(email, displayName, token); err != nil {
			return err
		}
		return apiError("EMAIL_NOT_VERIFIED", "Email verification is required before login. A new verification email has been sent.", http.StatusForbidden)
	}
	if status != "active" {
		return apiError("INVALID_CREDENTIALS", "Invalid username/email or password.", http.StatusUnauthorized)
	}
	workspace, err := a.firstWorkspace(r.Context(), userID)
	if err != nil {
		return err
	}
	return a.issueSession(w, r, userID, workspace)
}

func (a *App) authLogout(w http.ResponseWriter, r *http.Request) error {
	if cookie, err := r.Cookie(a.cfg.SessionCookie); err == nil && cookie.Value != "" {
		_, _ = a.db.ExecContext(r.Context(), "DELETE FROM user_sessions WHERE session_token_hash = ?", sha256Hex(cookie.Value))
	}
	http.SetCookie(w, a.sessionCookie("", time.Now().Add(-time.Hour)))
	httpx.WriteOK(w, map[string]any{}, http.StatusOK)
	return nil
}

func (a *App) authMe(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	workspace, err := a.sessionWorkspace(r.Context(), s)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"session": a.sessionPayload(s, workspace)}, http.StatusOK)
	return nil
}

func (a *App) authProfile(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	email := normalizedEmail(input["email"])
	if email == "" {
		return apiError("VALIDATION_ERROR", "A valid email is required.", http.StatusUnprocessableEntity)
	}
	displayName := nonEmptyString(input["displayName"], input["display_name"])
	if displayName == "" || len(displayName) > 120 {
		return apiError("VALIDATION_ERROR", "Display name is required and must be 120 characters or less.", http.StatusUnprocessableEntity)
	}
	if !s.PasswordHash.Valid && strings.ToLower(s.Email) != email {
		return apiError("SSO_ONLY_EMAIL_LOCKED", "SSO-only accounts cannot change email directly. Bind an existing account to merge data.", http.StatusConflict)
	}
	if exists, err := a.emailExistsExcept(r.Context(), email, s.UserID); err != nil || exists {
		if err != nil {
			return err
		}
		return apiError("EMAIL_ALREADY_EXISTS", "Email is already registered.", http.StatusConflict)
	}
	emailChanged := strings.ToLower(s.Email) != email
	hasDefaultCurrency := hasAnyKey(input, "defaultCurrency", "default_currency")
	var defaultCurrencyID sql.NullInt64
	if hasDefaultCurrency {
		defaultCurrencyID, err = a.optionalCurrencyID(r.Context(), firstValue(input, "defaultCurrency", "default_currency"))
		if err != nil {
			return err
		}
	}
	defaultTheme := exportpdf.NormalizeTheme(firstValue(input, "defaultPdfTheme", "default_pdf_theme", s.DefaultPDFTheme))
	settingsJSON, err := exportpdf.SettingsJSON(firstValue(input, "pdfExportSettings", "pdf_export_settings"), nullableString(s.PDFExportSettings))
	if err != nil {
		return err
	}

	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if emailChanged {
		_, err = tx.ExecContext(r.Context(), `
UPDATE users
SET email = ?, display_name = ?, default_pdf_theme = ?, pdf_export_settings = ?, email_verified_at = NULL, updated_at = UTC_TIMESTAMP()
WHERE id = ?`, email, displayName, defaultTheme, settingsJSON, s.UserID)
	} else {
		_, err = tx.ExecContext(r.Context(), `
UPDATE users
SET email = ?, display_name = ?, default_pdf_theme = ?, pdf_export_settings = ?, updated_at = UTC_TIMESTAMP()
WHERE id = ?`, email, displayName, defaultTheme, settingsJSON, s.UserID)
	}
	if err != nil {
		return err
	}
	if hasDefaultCurrency {
		if _, err := tx.ExecContext(r.Context(), "UPDATE users SET default_currency_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?", nullableInt(defaultCurrencyID), s.UserID); err != nil {
			return err
		}
		if defaultCurrencyID.Valid {
			if err := ensureUserCurrencyByIDTx(r.Context(), tx, s.UserID, defaultCurrencyID.Int64, "catalog"); err != nil {
				return err
			}
		}
	}
	var verificationToken string
	if emailChanged {
		verificationToken, err = a.createEmailVerificationTokenTx(r.Context(), tx, s.UserID)
		if err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if verificationToken != "" {
		if err := a.sendVerificationEmail(email, displayName, verificationToken); err != nil {
			return err
		}
	}
	nextSession, err := a.sessionByToken(r.Context(), s.Token)
	if err != nil {
		return err
	}
	workspace, err := a.sessionWorkspace(r.Context(), nextSession)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"session": a.sessionPayload(nextSession, workspace), "emailVerificationSent": emailChanged}, http.StatusOK)
	return nil
}

func (a *App) authPassword(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	if !s.PasswordHash.Valid {
		return apiError("SSO_ONLY_PASSWORD_DISABLED", "SSO-only accounts cannot create a password. Bind an existing account to merge data.", http.StatusConflict)
	}
	if bcrypt.CompareHashAndPassword([]byte(s.PasswordHash.String), []byte(stringValue(input["currentPassword"]))) != nil {
		return apiError("INVALID_CREDENTIALS", "Current password is invalid.", http.StatusUnauthorized)
	}
	next := nonEmptyString(input["password"], input["newPassword"], input["new_password"])
	if len(next) < 10 {
		return apiError("VALIDATION_ERROR", "Password must be at least 10 characters.", http.StatusUnprocessableEntity)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(r.Context(), "UPDATE users SET password_hash = ? WHERE id = ?", string(hash), s.UserID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"changed": true}, http.StatusOK)
	return nil
}

func (a *App) issueSession(w http.ResponseWriter, r *http.Request, userID int64, workspace sql.NullInt64) error {
	token, err := randomHex(32)
	if err != nil {
		return err
	}
	expires := time.Now().UTC().Add(30 * 24 * time.Hour)
	_, err = a.db.ExecContext(r.Context(), `
INSERT INTO user_sessions (user_id, current_workspace_id, session_token_hash, ip_address, user_agent, expires_at)
VALUES (?, ?, ?, ?, ?, ?)`, userID, nullableInt(workspace), sha256Hex(token), packedIP(r.RemoteAddr), r.UserAgent(), expires)
	if err != nil {
		return err
	}
	http.SetCookie(w, a.sessionCookie(token, expires))
	s, err := a.sessionByToken(r.Context(), token)
	if err != nil {
		return err
	}
	ws, err := a.sessionWorkspace(r.Context(), s)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, a.sessionPayload(s, ws), http.StatusOK)
	return nil
}

func (a *App) noUsers(ctx context.Context) (bool, error) {
	var count int
	err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
	return count == 0, err
}

func (a *App) userExists(ctx context.Context, email, username string) (bool, error) {
	var count int
	err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE email = ? OR username = ?", email, username).Scan(&count)
	return count > 0, err
}
