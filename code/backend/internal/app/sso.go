package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) ssoBinding(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	binding, err := a.ssoBindingByUser(r.Context(), s.UserID)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	httpx.WriteOK(w, map[string]any{"binding": binding}, http.StatusOK)
	return nil
}

func (a *App) ssoUnlink(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM user_sso_bindings WHERE user_id = ? AND provider = ?", s.UserID, casdoorProvider); err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"binding": nil}, http.StatusOK)
	return nil
}

func (a *App) ssoMerge(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	switch stringValue(input["action"]) {
	case "begin":
		if s.PasswordHash.Valid {
			return apiError("VALIDATION_ERROR", "Only SSO-only accounts need account merge.", http.StatusUnprocessableEntity)
		}
		binding, err := a.ssoBindingByUser(r.Context(), s.UserID)
		if err != nil {
			return err
		}
		token, err := a.issueSSOMergeToken(s.UserID, binding["subject"].(string))
		if err != nil {
			return err
		}
		httpx.WriteOK(w, map[string]any{"mergeToken": token}, http.StatusOK)
		return nil
	case "complete":
		payload, err := a.ssoMergePayload(input)
		if err != nil {
			return err
		}
		sourceUserID := int64Value(payload["sourceUserId"])
		subject := stringValue(payload["providerSubject"])
		binding, err := a.ssoBindingBySubject(r.Context(), subject)
		if err != nil {
			return err
		}
		if binding["userId"].(int64) != sourceUserID {
			return apiError("SSO_MERGE_TOKEN_INVALID", "SSO account merge token is invalid.", http.StatusUnprocessableEntity)
		}
		if err := a.mergeSSOUser(r.Context(), sourceUserID, s.UserID, subject); err != nil {
			return err
		}
		current, err := a.sessionByToken(r.Context(), s.Token)
		if err != nil {
			return err
		}
		workspace, err := a.sessionWorkspace(r.Context(), current)
		if err != nil {
			return err
		}
		bound, _ := a.ssoBindingByUser(r.Context(), s.UserID)
		httpx.WriteOK(w, map[string]any{"session": a.sessionPayload(current, workspace), "binding": bound}, http.StatusOK)
		return nil
	default:
		return apiError("VALIDATION_ERROR", "Unsupported SSO merge action.", http.StatusUnprocessableEntity)
	}
}

func (a *App) bindCasdoorAccount(r *http.Request, subject string, userinfo map[string]any) (map[string]any, error) {
	s, err := a.currentSession(r)
	if err != nil {
		return nil, err
	}
	existing, err := a.ssoBindingBySubject(r.Context(), subject)
	if err == nil && existing["userId"].(int64) != s.UserID {
		return nil, apiError("SSO_ACCOUNT_ALREADY_BOUND", "This Casdoor account is already linked to another user.", http.StatusConflict)
	}
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if _, err := a.db.ExecContext(r.Context(), ssoUpsertSQL(), s.UserID, casdoorProvider, subject, nullableStringValue(casdoorUsername(userinfo)), nullableStringValue(normalizedEmail(userinfo["email"])), jsonString(userinfo)); err != nil {
		return nil, err
	}
	if avatar := casdoorAvatarURL(userinfo); avatar != "" {
		_, _ = a.db.ExecContext(r.Context(), "UPDATE users SET avatar_url = ? WHERE id = ?", avatar, s.UserID)
	}
	return a.ssoBindingByUser(r.Context(), s.UserID)
}

func (a *App) ssoBindingByUser(ctx context.Context, userID int64) (map[string]any, error) {
	return scanSSOBinding(a.db.QueryRowContext(ctx, `SELECT id, user_id, provider, provider_subject, provider_username, provider_email, linked_at, updated_at
FROM user_sso_bindings WHERE user_id = ? AND provider = ? LIMIT 1`, userID, casdoorProvider))
}

func (a *App) ssoBindingBySubject(ctx context.Context, subject string) (map[string]any, error) {
	return scanSSOBinding(a.db.QueryRowContext(ctx, `SELECT id, user_id, provider, provider_subject, provider_username, provider_email, linked_at, updated_at
FROM user_sso_bindings WHERE provider = ? AND provider_subject = ? LIMIT 1`, casdoorProvider, subject))
}

func scanSSOBinding(row rowScanner) (map[string]any, error) {
	var id, userID int64
	var provider, subject, linked, updated string
	var username, email sql.NullString
	if err := row.Scan(&id, &userID, &provider, &subject, &username, &email, &linked, &updated); err != nil {
		return nil, err
	}
	return map[string]any{"id": id, "userId": userID, "provider": provider, "subject": subject, "username": nullableString(username), "email": nullableString(email), "linkedAt": linked, "updatedAt": updated}, nil
}

func upsertSSOBindingTx(ctx context.Context, tx *sql.Tx, userID int64, subject string, userinfo map[string]any) error {
	_, err := tx.ExecContext(ctx, ssoUpsertSQL(), userID, casdoorProvider, subject, nullableStringValue(casdoorUsername(userinfo)), nullableStringValue(normalizedEmail(userinfo["email"])), jsonString(userinfo))
	return err
}

func ssoUpsertSQL() string {
	return `INSERT INTO user_sso_bindings (user_id, provider, provider_subject, provider_username, provider_email, raw_userinfo_json)
VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), provider_username = VALUES(provider_username), provider_email = VALUES(provider_email), raw_userinfo_json = VALUES(raw_userinfo_json), updated_at = UTC_TIMESTAMP()`
}

func (a *App) mergeSSOUser(ctx context.Context, sourceUserID, targetUserID int64, subject string) error {
	if sourceUserID == targetUserID {
		return nil
	}
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "DELETE FROM user_sso_bindings WHERE user_id = ? AND provider = ?", targetUserID, casdoorProvider); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE user_sso_bindings SET user_id = ? WHERE user_id = ? AND provider = ? AND provider_subject = ?", targetUserID, sourceUserID, casdoorProvider, subject); err != nil {
		return err
	}
	if err := deleteDuplicateMemberships(ctx, tx, "workspace_members", "workspace_id", sourceUserID, targetUserID); err != nil {
		return err
	}
	if err := deleteDuplicateMemberships(ctx, tx, "workgroup_members", "workgroup_id", sourceUserID, targetUserID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE source_share FROM budget_shares source_share
JOIN budget_shares target_share ON target_share.budget_id = source_share.budget_id
 AND target_share.principal_type = 'user' AND target_share.principal_id = ?
WHERE source_share.principal_type = 'user' AND source_share.principal_id = ?`, targetUserID, sourceUserID); err != nil {
		return err
	}
	updates := []string{
		"UPDATE user_sessions SET user_id = ? WHERE user_id = ?",
		"UPDATE webauthn_credentials SET user_id = ? WHERE user_id = ?",
		"UPDATE webauthn_challenges SET user_id = ? WHERE user_id = ?",
		"UPDATE workspaces SET owner_user_id = ? WHERE owner_user_id = ?",
		"UPDATE workspace_members SET user_id = ? WHERE user_id = ?",
		"UPDATE workspace_invitations SET invited_by_user_id = ? WHERE invited_by_user_id = ?",
		"UPDATE workgroups SET created_by_user_id = ? WHERE created_by_user_id = ?",
		"UPDATE workgroup_members SET user_id = ? WHERE user_id = ?",
		"UPDATE budget_categories SET user_id = ? WHERE user_id = ?",
		"UPDATE budget_category_aliases SET user_id = ? WHERE user_id = ?",
		"UPDATE exchange_rates SET user_id = ? WHERE user_id = ?",
		"UPDATE budgets SET user_id = ? WHERE user_id = ?",
		"UPDATE budgets SET owner_user_id = ? WHERE owner_user_id = ?",
		"UPDATE budgets SET created_by_user_id = ? WHERE created_by_user_id = ?",
		"UPDATE budget_participants SET member_user_id = ? WHERE member_user_id = ?",
		"UPDATE budget_shares SET principal_id = ? WHERE principal_type = 'user' AND principal_id = ?",
		"UPDATE budget_shares SET created_by_user_id = ? WHERE created_by_user_id = ?",
		"UPDATE budget_exports SET user_id = ? WHERE user_id = ?",
	}
	for _, statement := range updates {
		if _, err := tx.ExecContext(ctx, statement, targetUserID, sourceUserID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM users WHERE id = ?", sourceUserID); err != nil {
		return err
	}
	return tx.Commit()
}

func deleteDuplicateMemberships(ctx context.Context, tx *sql.Tx, table, scopeColumn string, sourceUserID, targetUserID int64) error {
	_, err := tx.ExecContext(ctx, "DELETE source_row FROM "+table+" source_row JOIN "+table+" target_row ON target_row."+scopeColumn+" = source_row."+scopeColumn+" AND target_row.user_id = ? WHERE source_row.user_id = ?", targetUserID, sourceUserID)
	return err
}

func (a *App) ensureActiveUser(ctx context.Context, userID int64) error {
	var count int
	if err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE id = ? AND status = 'active'", userID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return apiError("INVALID_CREDENTIALS", "Invalid SSO account.", http.StatusUnauthorized)
	}
	return nil
}

func (a *App) issueSSOCreateToken(subject string, userinfo map[string]any) (string, error) {
	return a.signedToken(map[string]any{"sub": subject, "exp": time.Now().Add(10 * time.Minute).Unix(), "userinfo": userinfo})
}

func (a *App) userinfoFromSSOCreateToken(input map[string]any) (map[string]any, error) {
	payload, err := a.signedTokenPayload(stringValue(input["ssoCreateToken"]), "SSO_CREATE_TOKEN_INVALID")
	if err != nil {
		return nil, err
	}
	userinfo, ok := payload["userinfo"].(map[string]any)
	if !ok {
		return nil, apiError("SSO_CREATE_TOKEN_INVALID", "SSO account creation token is invalid or expired.", http.StatusUnprocessableEntity)
	}
	return userinfo, nil
}

func (a *App) issueSSOMergeToken(sourceUserID int64, subject string) (string, error) {
	return a.signedToken(map[string]any{"sourceUserId": sourceUserID, "providerSubject": subject, "exp": time.Now().Add(10 * time.Minute).Unix()})
}

func (a *App) ssoMergePayload(input map[string]any) (map[string]any, error) {
	return a.signedTokenPayload(stringValue(input["mergeToken"]), "SSO_MERGE_TOKEN_INVALID")
}

func (a *App) signedToken(payload map[string]any) (string, error) {
	secret, err := a.ssoTokenSecret()
	if err != nil {
		return "", err
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func (a *App) signedTokenPayload(token, code string) (map[string]any, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, apiError(code, "SSO token is invalid.", http.StatusUnprocessableEntity)
	}
	secret, err := a.ssoTokenSecret()
	if err != nil {
		return nil, err
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0]))
	expected := mac.Sum(nil)
	actual, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(expected, actual) {
		return nil, apiError(code, "SSO token is invalid.", http.StatusUnprocessableEntity)
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, apiError(code, "SSO token is invalid.", http.StatusUnprocessableEntity)
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, apiError(code, "SSO token is invalid.", http.StatusUnprocessableEntity)
	}
	if int64Value(payload["exp"]) < time.Now().Unix() {
		return nil, apiError(code, "SSO token is invalid or expired.", http.StatusUnprocessableEntity)
	}
	return payload, nil
}

func (a *App) ssoTokenSecret() (string, error) {
	if a.cfg.AppKey != "" {
		return a.cfg.AppKey, nil
	}
	if a.cfg.CasdoorClientSecret != "" {
		return a.cfg.CasdoorClientSecret, nil
	}
	return "", apiError("SERVER_ERROR", "APP_KEY or CASDOOR_CLIENT_SECRET is required for SSO.", http.StatusServiceUnavailable)
}
