package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"
)

type session struct {
	ID                int64
	UserID            int64
	CurrentWorkspace  sql.NullInt64
	Email             string
	Username          sql.NullString
	PasswordHash      sql.NullString
	DisplayName       string
	AvatarURL         sql.NullString
	Timezone          string
	Locale            string
	DefaultCurrency   sql.NullString
	DefaultPDFTheme   string
	PDFExportSettings sql.NullString
	Status            string
	IsAdmin           bool
	EmailVerifiedAt   sql.NullString
	Token             string
	TokenHash         string
}

func (a *App) validateCSRF(r *http.Request) error {
	if !unsafeMethod(r.Method) || publicUnsafePath(r.URL.Path) {
		return nil
	}
	cookie, err := r.Cookie(a.cfg.SessionCookie)
	if err != nil || cookie.Value == "" {
		return apiError("UNAUTHENTICATED", "Authentication is required.", http.StatusUnauthorized)
	}
	if !checkHMAC(r.Header.Get("X-CSRF-Token"), csrfToken(cookie.Value)) {
		return apiError("CSRF_TOKEN_INVALID", "CSRF token is missing or invalid.", 419)
	}
	return nil
}

func unsafeMethod(method string) bool {
	return method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch || method == http.MethodDelete
}

func publicUnsafePath(path string) bool {
	switch path {
	case "/api/auth/login", "/api/auth/register", "/api/auth/email/resend", "/api/auth/passkey/login/verify", "/api/callback":
		return true
	default:
		return false
	}
}

func (a *App) currentSession(r *http.Request) (*session, error) {
	cookie, err := r.Cookie(a.cfg.SessionCookie)
	if err != nil || cookie.Value == "" {
		return nil, apiError("UNAUTHENTICATED", "Authentication is required.", http.StatusUnauthorized)
	}
	row := a.db.QueryRowContext(r.Context(), `
SELECT us.id, us.user_id, us.current_workspace_id, u.email, u.username, u.password_hash,
       u.display_name, u.avatar_url, u.timezone, u.locale, dc.code, u.default_pdf_theme,
       u.pdf_export_settings, u.status, u.is_admin, u.email_verified_at
FROM user_sessions us
JOIN users u ON u.id = us.user_id
LEFT JOIN currencies dc ON dc.id = u.default_currency_id
WHERE us.session_token_hash = ? AND us.expires_at > UTC_TIMESTAMP() AND u.status = 'active'
LIMIT 1`, sha256Hex(cookie.Value))
	var s session
	s.Token = cookie.Value
	s.TokenHash = sha256Hex(cookie.Value)
	if err := row.Scan(&s.ID, &s.UserID, &s.CurrentWorkspace, &s.Email, &s.Username, &s.PasswordHash, &s.DisplayName, &s.AvatarURL, &s.Timezone, &s.Locale, &s.DefaultCurrency, &s.DefaultPDFTheme, &s.PDFExportSettings, &s.Status, &s.IsAdmin, &s.EmailVerifiedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, apiError("UNAUTHENTICATED", "Authentication is required.", http.StatusUnauthorized)
		}
		return nil, err
	}
	return &s, nil
}

func (a *App) requireAdmin(r *http.Request) (*session, error) {
	s, err := a.currentSession(r)
	if err != nil {
		return nil, err
	}
	if !s.IsAdmin {
		return nil, apiError("FORBIDDEN", "Admin access is required.", http.StatusForbidden)
	}
	return s, nil
}

func (a *App) sessionPayload(s *session, workspace map[string]any) map[string]any {
	settings := map[string]any{"showWorkspace": false, "pdfLanguages": []any{}, "signatureLabelMode": "confirmation_signature", "signatureLabelLanguages": []any{}}
	if s.PDFExportSettings.Valid && s.PDFExportSettings.String != "" {
		_ = json.Unmarshal([]byte(s.PDFExportSettings.String), &settings)
	}
	return map[string]any{
		"user":      map[string]any{"id": s.UserID, "email": s.Email, "username": nullableString(s.Username), "displayName": s.DisplayName, "avatarUrl": nullableString(s.AvatarURL), "timezone": s.Timezone, "locale": s.Locale, "defaultCurrency": nullableString(s.DefaultCurrency), "defaultPdfTheme": stringDefault(s.DefaultPDFTheme, "classic"), "pdfExportSettings": settings, "status": s.Status, "isAdmin": s.IsAdmin, "emailVerifiedAt": nullableDateTime(s.EmailVerifiedAt), "hasPassword": s.PasswordHash.Valid},
		"workspace": workspace,
		"csrfToken": csrfToken(s.Token),
	}
}

func (a *App) sessionCookie(token string, expires time.Time) *http.Cookie {
	return &http.Cookie{Name: a.cfg.SessionCookie, Value: token, Path: "/", Expires: expires, HttpOnly: true, Secure: strings.HasPrefix(a.cfg.APIURL, "https://") || strings.HasPrefix(a.cfg.AppURL, "https://"), SameSite: http.SameSiteLaxMode}
}

func (a *App) sessionByToken(ctx context.Context, token string) (*session, error) {
	req := &http.Request{Header: http.Header{}}
	req.AddCookie(&http.Cookie{Name: a.cfg.SessionCookie, Value: token})
	return a.currentSession(req.WithContext(ctx))
}

func packedIP(remoteAddr string) any {
	host, _, _ := net.SplitHostPort(remoteAddr)
	ip := net.ParseIP(host)
	if ip == nil {
		return nil
	}
	return []byte(ip)
}
