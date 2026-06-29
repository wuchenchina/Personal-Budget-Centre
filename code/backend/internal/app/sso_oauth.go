package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"budgetcentre/backend/internal/httpx"
)

const (
	ssoProviderCasdoor = "casdoor"
	ssoProviderLinuxDo = "linux_do"
	oauthPKCECookie    = "budgetcentre_oauth_pkce"
)

type oauthProvider struct {
	ID                    string
	Slug                  string
	Name                  string
	AuthorizationEndpoint string
	TokenEndpoint         string
	UserEndpoint          string
	ClientID              string
	ClientSecret          string
	RedirectURI           string
	Scope                 string
	Logo                  string
	Normalize             func(map[string]any) (map[string]any, error)
}

func (p oauthProvider) configured() bool {
	return p.ID != "" && p.ClientID != "" && p.AuthorizationEndpoint != "" && p.TokenEndpoint != "" && p.UserEndpoint != "" && p.RedirectURI != ""
}

func (p oauthProvider) public() map[string]any {
	return map[string]any{
		"provider": p.ID,
		"slug":     p.Slug,
		"name":     p.Name,
		"logo":     nullableStringValue(p.Logo),
	}
}

func (a *App) ssoProviders(w http.ResponseWriter, _ *http.Request) error {
	providers := []map[string]any{}
	for _, provider := range a.configuredOAuthProviders() {
		providers = append(providers, provider.public())
	}
	httpx.WriteOK(w, map[string]any{"providers": providers}, http.StatusOK)
	return nil
}

func (a *App) configuredOAuthProviders() []oauthProvider {
	providers := []oauthProvider{}
	for _, id := range []string{ssoProviderCasdoor, ssoProviderLinuxDo} {
		provider, err := a.oauthProvider(id)
		if err == nil && provider.configured() {
			providers = append(providers, provider)
		}
	}
	return providers
}

func (a *App) oauthProvider(value string) (oauthProvider, error) {
	switch normalizeSSOProviderID(value) {
	case ssoProviderCasdoor:
		serverURL := strings.TrimRight(a.cfg.CasdoorServerURL, "/")
		if serverURL == "" {
			return oauthProvider{}, apiError("SSO_PROVIDER_NOT_CONFIGURED", "SSO provider is not configured.", http.StatusServiceUnavailable)
		}
		provider := oauthProvider{
			ID:                    ssoProviderCasdoor,
			Slug:                  "casdoor",
			Name:                  stringDefault(a.cfg.CasdoorDisplayName, "Axchen SSO"),
			AuthorizationEndpoint: serverURL + "/login/oauth/authorize",
			TokenEndpoint:         serverURL + "/api/login/oauth/access_token",
			UserEndpoint:          serverURL + "/api/userinfo",
			ClientID:              a.cfg.CasdoorClientID,
			ClientSecret:          a.cfg.CasdoorClientSecret,
			RedirectURI:           a.cfg.CasdoorRedirectURI,
			Scope:                 "profile",
			Normalize:             normalizeCasdoorUserinfo,
		}
		if !provider.configured() {
			return oauthProvider{}, apiError("SSO_PROVIDER_NOT_CONFIGURED", "SSO provider is not configured.", http.StatusServiceUnavailable)
		}
		return provider, nil
	case ssoProviderLinuxDo:
		provider := oauthProvider{
			ID:                    ssoProviderLinuxDo,
			Slug:                  "linux-do",
			Name:                  stringDefault(a.cfg.LinuxDoDisplayName, "Linux Do"),
			AuthorizationEndpoint: a.cfg.LinuxDoAuthorizationEndpoint,
			TokenEndpoint:         a.cfg.LinuxDoTokenEndpoint,
			UserEndpoint:          a.cfg.LinuxDoUserEndpoint,
			ClientID:              a.cfg.LinuxDoClientID,
			ClientSecret:          a.cfg.LinuxDoClientSecret,
			RedirectURI:           a.cfg.LinuxDoRedirectURI,
			Scope:                 stringDefault(a.cfg.LinuxDoScope, "openid profile email"),
			Logo:                  ssoProviderLinuxDo,
			Normalize:             normalizeOAuthUserinfo,
		}
		if !provider.configured() || provider.ClientSecret == "" {
			return oauthProvider{}, apiError("SSO_PROVIDER_NOT_CONFIGURED", "SSO provider is not configured.", http.StatusServiceUnavailable)
		}
		return provider, nil
	default:
		return oauthProvider{}, apiError("SSO_PROVIDER_UNKNOWN", "SSO provider is not supported.", http.StatusNotFound)
	}
}

func normalizeSSOProviderID(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "casdoor", "axchen", "axchen-sso", "axchen_sso":
		return ssoProviderCasdoor
	case "linux_do", "linux-do", "linuxdo", "linux do":
		return ssoProviderLinuxDo
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func (a *App) casdoorAuthorize(w http.ResponseWriter, r *http.Request) error {
	return a.oauthAuthorize(w, r, ssoProviderCasdoor)
}

func (a *App) linuxDoAuthorize(w http.ResponseWriter, r *http.Request) error {
	return a.oauthAuthorize(w, r, ssoProviderLinuxDo)
}

func (a *App) oauthAuthorize(w http.ResponseWriter, r *http.Request, providerID string) error {
	provider, err := a.oauthProvider(providerID)
	if err != nil {
		return err
	}
	mode := enumString(r.URL.Query().Get("mode"), []string{"login", "bind", "reset"}, "login")
	if mode == "bind" {
		if _, err := a.currentSession(r); err != nil {
			return err
		}
	}
	state, err := randomURLSafe(32)
	if err != nil {
		return err
	}
	verifier, err := randomURLSafe(64)
	if err != nil {
		return err
	}
	http.SetCookie(w, a.oauthCookie(map[string]string{"provider": provider.ID, "state": state, "codeVerifier": verifier, "mode": mode}, time.Now().Add(10*time.Minute)))
	query := url.Values{}
	query.Set("client_id", provider.ClientID)
	query.Set("response_type", "code")
	query.Set("redirect_uri", provider.RedirectURI)
	query.Set("scope", provider.Scope)
	query.Set("state", state)
	query.Set("code_challenge", codeChallenge(verifier))
	query.Set("code_challenge_method", "S256")
	http.Redirect(w, r, provider.AuthorizationEndpoint+"?"+query.Encode(), http.StatusFound)
	return nil
}

func (a *App) oauthBrowserCallback(w http.ResponseWriter, r *http.Request) error {
	query := r.URL.Query()
	query.Set("sso_callback", "1")
	http.Redirect(w, r, "/?"+query.Encode(), http.StatusFound)
	return nil
}

func (a *App) oauthCallback(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	if stringValue(input["action"]) == "create" {
		provider, subject, userinfo, err := a.ssoCreatePayload(input)
		if err != nil {
			return err
		}
		return a.createAndLoginWithSSO(w, r, provider, subject, userinfo)
	}
	provider, mode, pkce, err := a.oauthCallbackState(w, r, input)
	if err != nil {
		return err
	}
	code := stringValue(input["code"])
	accessToken := stringValue(input["accessToken"])
	var userinfo map[string]any
	if accessToken != "" {
		userinfo, err = a.oauthUserinfoFromToken(r.Context(), provider, accessToken, stringValue(input["idToken"]))
	} else if code != "" {
		userinfo, err = a.oauthUserinfoFromCode(r.Context(), provider, code, pkce["codeVerifier"])
	} else {
		return apiError("VALIDATION_ERROR", "SSO authorization data is required.", http.StatusUnprocessableEntity)
	}
	if err != nil {
		return err
	}
	subject := stringValue(userinfo["sub"])
	if subject == "" {
		return apiErrorWithMeta("SSO_USERINFO_INVALID", "SSO user info is missing subject.", http.StatusBadGateway, map[string]any{"provider": provider.ID, "mode": mode, "phase": "normalize"})
	}
	if mode == "bind" {
		binding, err := a.bindSSOAccount(r, provider, subject, userinfo)
		if err != nil {
			return err
		}
		httpx.WriteOK(w, map[string]any{"binding": binding}, http.StatusOK)
		return nil
	}
	if mode == "reset" {
		return a.resetPasswordWithSSO(w, r, provider, subject)
	}
	return a.loginWithSSO(w, r, provider, subject, userinfo)
}

func (a *App) oauthCallbackState(w http.ResponseWriter, r *http.Request, input map[string]any) (oauthProvider, string, map[string]string, error) {
	pkce, err := a.consumeOAuthCookie(w, r, stringValue(input["state"]))
	if err != nil {
		return oauthProvider{}, "", nil, err
	}
	providerID := normalizeSSOProviderID(pkce["provider"])
	if providerID == "" {
		return oauthProvider{}, "", nil, apiErrorWithMeta("SSO_STATE_INVALID", "SSO callback state is invalid.", http.StatusUnauthorized, map[string]any{"phase": "state"})
	}
	provider, err := a.oauthProvider(providerID)
	if err != nil {
		return oauthProvider{}, "", nil, err
	}
	mode := enumString(pkce["mode"], []string{"login", "bind", "reset"}, "login")
	return provider, mode, pkce, nil
}

func (a *App) loginWithSSO(w http.ResponseWriter, r *http.Request, provider oauthProvider, subject string, userinfo map[string]any) error {
	binding, err := a.ssoBindingBySubject(r.Context(), provider.ID, subject)
	if err != nil {
		if err == sql.ErrNoRows {
			token, err := a.issueSSOCreateToken(provider.ID, subject, userinfo)
			if err != nil {
				return err
			}
			httpx.WriteOK(w, map[string]any{"requiresSsoAccountAction": true, "ssoAccount": publicSSOAccount(provider, subject, userinfo), "ssoCreateToken": token}, http.StatusOK)
			return nil
		}
		return err
	}
	userID := binding["userId"].(int64)
	if err := a.ensureActiveUser(r.Context(), userID); err != nil {
		return err
	}
	if avatar := ssoAvatarURL(userinfo); avatar != "" {
		_, _ = a.db.ExecContext(r.Context(), "UPDATE users SET avatar_url = ? WHERE id = ?", avatar, userID)
	}
	workspace, err := a.firstWorkspace(r.Context(), userID)
	if err != nil {
		return err
	}
	return a.issueSession(w, r, userID, workspace)
}

func (a *App) resetPasswordWithSSO(w http.ResponseWriter, r *http.Request, provider oauthProvider, subject string) error {
	binding, err := a.ssoBindingBySubject(r.Context(), provider.ID, subject)
	if err != nil {
		if err == sql.ErrNoRows {
			return apiError("PASSWORD_RESET_NOT_AVAILABLE", "Password reset is not available for this account.", http.StatusConflict)
		}
		return err
	}
	userID := binding["userId"].(int64)
	token, err := a.createPasswordResetTokenForUser(r.Context(), userID, "sso")
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"passwordResetToken": token}, http.StatusOK)
	return nil
}

func (a *App) createAndLoginWithSSO(w http.ResponseWriter, r *http.Request, provider oauthProvider, subject string, userinfo map[string]any) error {
	if _, err := a.ssoBindingBySubject(r.Context(), provider.ID, subject); err == nil {
		return a.loginWithSSO(w, r, provider, subject, userinfo)
	}
	email := normalizedEmail(userinfo["email"])
	if email == "" {
		return apiError("SSO_EMAIL_REQUIRED", "SSO account must provide an email before a BudgetCentre account can be created.", http.StatusUnprocessableEntity)
	}
	displayName := ssoDisplayName(userinfo)
	accountEmail, err := a.availableSSOEmail(r.Context(), email, subject)
	if err != nil {
		return err
	}
	username, err := a.availableSSOUsername(r.Context(), userinfo, email, subject)
	if err != nil {
		return err
	}
	currencyID := sql.NullInt64{}
	isFirst, err := a.noUsers(r.Context())
	if err != nil {
		return err
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(r.Context(), `INSERT INTO users
(email, username, password_hash, display_name, avatar_url, default_currency_id, status, is_admin, email_verified_at)
VALUES (?, ?, NULL, ?, ?, ?, 'active', ?, UTC_TIMESTAMP())`,
		accountEmail, nullableStringValue(username), displayName, nullableStringValue(ssoAvatarURL(userinfo)), nullableInt(currencyID), boolInt(isFirst),
	)
	if err != nil {
		return err
	}
	userID, _ := res.LastInsertId()
	workspaceID, err := a.createWorkspaceTx(r.Context(), tx, userID, displayName+" Personal", "personal", currencyID)
	if err != nil {
		return err
	}
	if err := upsertSSOBindingTx(r.Context(), tx, userID, provider.ID, subject, userinfo); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return a.issueSession(w, r, userID, sql.NullInt64{Int64: workspaceID, Valid: true})
}

func (a *App) oauthUserinfoFromCode(ctx context.Context, provider oauthProvider, code, verifier string) (map[string]any, error) {
	payload := url.Values{}
	payload.Set("grant_type", "authorization_code")
	payload.Set("client_id", provider.ClientID)
	payload.Set("code", code)
	payload.Set("redirect_uri", provider.RedirectURI)
	if verifier != "" {
		payload.Set("code_verifier", verifier)
	}
	if provider.ClientSecret != "" {
		payload.Set("client_secret", provider.ClientSecret)
	}
	tokenResponse, err := oauthPostForm(ctx, provider, "token", payload)
	if err != nil {
		return nil, err
	}
	if tokenError := stringValue(tokenResponse["error"]); tokenError != "" {
		return nil, apiErrorWithMeta("SSO_TOKEN_REJECTED", stringDefault(stringValue(tokenResponse["error_description"]), tokenError), http.StatusBadGateway, oauthResponseMeta(provider, "token", http.StatusOK, tokenResponse))
	}
	accessToken := stringValue(tokenResponse["access_token"])
	if accessToken == "" {
		return nil, apiErrorWithMeta("SSO_TOKEN_INVALID", "SSO token response is missing access token.", http.StatusBadGateway, oauthResponseMeta(provider, "token", http.StatusOK, tokenResponse))
	}
	return a.oauthUserinfoFromToken(ctx, provider, accessToken, stringValue(tokenResponse["id_token"]))
}

func (a *App) oauthUserinfoFromToken(ctx context.Context, provider oauthProvider, accessToken, idToken string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, provider.UserEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	decoded, err := doOAuthJSON(req, provider, "userinfo")
	if err != nil {
		return nil, err
	}
	normalized, err := provider.Normalize(decoded)
	if err != nil {
		return nil, addOAuthMeta(err, provider, "normalize", nil)
	}
	if claims := jwtPayload(idToken); claims != nil {
		for key, value := range claims {
			if _, ok := normalized[key]; !ok {
				normalized[key] = value
			}
		}
	}
	return normalized, nil
}

func oauthPostForm(ctx context.Context, provider oauthProvider, phase string, values url.Values) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, provider.TokenEndpoint, bytes.NewBufferString(values.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	return doOAuthJSON(req, provider, phase)
}

func doOAuthJSON(req *http.Request, provider oauthProvider, phase string) (map[string]any, error) {
	client := http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, apiErrorWithMeta("SSO_REQUEST_FAILED", "SSO endpoint is unavailable.", http.StatusBadGateway, oauthErrorMeta(provider, phase, map[string]any{"upstreamErrorType": fmt.Sprintf("%T", err)}))
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	var decoded map[string]any
	if err := json.Unmarshal(body, &decoded); err != nil {
		return nil, apiErrorWithMeta("SSO_RESPONSE_INVALID", "SSO provider returned invalid JSON.", http.StatusBadGateway, oauthErrorMeta(provider, phase, map[string]any{"upstreamStatus": resp.StatusCode, "upstreamBodyBytes": len(body)}))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, apiErrorWithMeta("SSO_REQUEST_REJECTED", stringDefault(stringValue(decoded["error_description"]), stringDefault(stringValue(decoded["message"]), http.StatusText(resp.StatusCode))), http.StatusBadGateway, oauthResponseMeta(provider, phase, resp.StatusCode, decoded))
	}
	return decoded, nil
}

func addOAuthMeta(err error, provider oauthProvider, phase string, extra map[string]any) error {
	var apiErr httpx.APIError
	if !errors.As(err, &apiErr) {
		return err
	}
	meta := map[string]any{}
	for key, value := range apiErr.Meta {
		meta[key] = value
	}
	for key, value := range oauthErrorMeta(provider, phase, extra) {
		if _, ok := meta[key]; !ok {
			meta[key] = value
		}
	}
	return httpx.APIError{Code: apiErr.Code, Message: apiErr.Message, Status: apiErr.Status, Meta: meta}
}

func oauthResponseMeta(provider oauthProvider, phase string, status int, decoded map[string]any) map[string]any {
	meta := oauthErrorMeta(provider, phase, map[string]any{"upstreamStatus": status})
	if upstreamError := stringValue(decoded["error"]); upstreamError != "" {
		meta["upstreamError"] = upstreamError
	}
	if upstreamMessage := nonEmptyString(decoded["error_description"], decoded["message"], decoded["error_msg"], decoded["msg"]); upstreamMessage != "" {
		meta["upstreamMessage"] = upstreamMessage
	}
	return meta
}

func oauthErrorMeta(provider oauthProvider, phase string, extra map[string]any) map[string]any {
	meta := map[string]any{
		"provider": provider.ID,
		"phase":    phase,
	}
	for key, value := range extra {
		if value != nil && value != "" {
			meta[key] = value
		}
	}
	return meta
}

func (a *App) oauthCookie(payload map[string]string, expires time.Time) *http.Cookie {
	raw, _ := json.Marshal(payload)
	return &http.Cookie{Name: oauthPKCECookie, Value: base64.RawURLEncoding.EncodeToString(raw), Path: "/", Expires: expires, HttpOnly: true, Secure: strings.HasPrefix(a.cfg.APIURL, "https://") || strings.HasPrefix(a.cfg.AppURL, "https://"), SameSite: http.SameSiteLaxMode}
}

func (a *App) consumeOAuthCookie(w http.ResponseWriter, r *http.Request, state string) (map[string]string, error) {
	http.SetCookie(w, a.oauthCookie(map[string]string{}, time.Now().Add(-time.Hour)))
	cookie, err := r.Cookie(oauthPKCECookie)
	if err != nil || cookie.Value == "" {
		return nil, apiErrorWithMeta("SSO_STATE_INVALID", "SSO callback state is invalid.", http.StatusUnauthorized, map[string]any{"phase": "state", "reason": "missing_cookie"})
	}
	raw, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil {
		return nil, apiErrorWithMeta("SSO_STATE_INVALID", "SSO callback state is invalid.", http.StatusUnauthorized, map[string]any{"phase": "state", "reason": "invalid_cookie_encoding"})
	}
	var payload map[string]string
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, apiErrorWithMeta("SSO_STATE_INVALID", "SSO callback state is invalid.", http.StatusUnauthorized, map[string]any{"phase": "state", "reason": "invalid_cookie_json"})
	}
	expected := payload["state"]
	if expected == "" || state == "" || !checkHMAC(expected, state) {
		return nil, apiErrorWithMeta("SSO_STATE_INVALID", "SSO callback state is invalid.", http.StatusUnauthorized, map[string]any{"phase": "state", "reason": "state_mismatch"})
	}
	return payload, nil
}

func codeChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
