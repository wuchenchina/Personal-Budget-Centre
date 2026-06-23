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

func (a *App) authRegister(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	email := normalizedEmail(input["email"])
	username := username(input["username"])
	displayName := nonEmptyString(input["displayName"], input["display_name"])
	password := stringValue(input["password"])
	if email == "" || username == "" || displayName == "" || len(password) < 8 {
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
	currencyID, _ := a.currencyID(r.Context(), stringDefault(stringValue(input["defaultCurrency"]), "HKD"))
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
VALUES (?, ?, ?, ?, ?, 'active', ?, UTC_TIMESTAMP())`, email, username, string(passwordHash), displayName, nullableInt(currencyID), boolInt(isFirst))
	if err != nil {
		return err
	}
	userID, _ := res.LastInsertId()
	workspaceID, err := a.createWorkspaceTx(r.Context(), tx, userID, displayName+"'s Workspace", "personal", currencyID)
	if err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return a.issueSession(w, r, userID, sql.NullInt64{Int64: workspaceID, Valid: true})
}

func (a *App) authLogin(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	identifier := strings.TrimSpace(stringDefault(stringValue(input["identifier"]), stringValue(input["email"])))
	password := stringValue(input["password"])
	row := a.db.QueryRowContext(r.Context(), "SELECT id, password_hash FROM users WHERE (email = ? OR username = ?) AND status = 'active' LIMIT 1", strings.ToLower(identifier), identifier)
	var userID int64
	var hash sql.NullString
	if err := row.Scan(&userID, &hash); err != nil || !hash.Valid || bcrypt.CompareHashAndPassword([]byte(hash.String), []byte(password)) != nil {
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
	displayName := nonEmptyString(input["displayName"], input["display_name"])
	if displayName == "" {
		return apiError("VALIDATION_ERROR", "Display name is required.", http.StatusUnprocessableEntity)
	}
	_, err = a.db.ExecContext(r.Context(), "UPDATE users SET display_name = ?, default_pdf_theme = ?, pdf_export_settings = ? WHERE id = ?",
		displayName,
		stringDefault(stringValue(input["defaultPdfTheme"]), "classic"),
		jsonString(input["pdfExportSettings"]),
		s.UserID,
	)
	if err != nil {
		return err
	}
	return a.authMe(w, r)
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
	if !s.PasswordHash.Valid || bcrypt.CompareHashAndPassword([]byte(s.PasswordHash.String), []byte(stringValue(input["currentPassword"]))) != nil {
		return apiError("INVALID_CREDENTIALS", "Current password is invalid.", http.StatusUnauthorized)
	}
	next := stringValue(input["newPassword"])
	if len(next) < 8 {
		return apiError("VALIDATION_ERROR", "New password is too short.", http.StatusUnprocessableEntity)
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
