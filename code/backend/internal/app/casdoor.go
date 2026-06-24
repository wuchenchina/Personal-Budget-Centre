package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"budgetcentre/backend/internal/httpx"
)

const casdoorProvider = "casdoor"
const casdoorPKCECookie = "budgetcentre_casdoor_pkce"

func (a *App) casdoorAuthorize(w http.ResponseWriter, r *http.Request) error {
	mode := enumString(r.URL.Query().Get("mode"), []string{"login", "bind"}, "login")
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
	http.SetCookie(w, a.casdoorCookie(map[string]string{"state": state, "codeVerifier": verifier, "mode": mode}, time.Now().Add(10*time.Minute)))
	query := url.Values{}
	query.Set("client_id", a.cfg.CasdoorClientID)
	query.Set("response_type", "code")
	query.Set("redirect_uri", a.cfg.CasdoorRedirectURI)
	query.Set("scope", "profile")
	query.Set("state", state)
	query.Set("code_challenge", codeChallenge(verifier))
	query.Set("code_challenge_method", "S256")
	http.Redirect(w, r, strings.TrimRight(a.cfg.CasdoorServerURL, "/")+"/login/oauth/authorize?"+query.Encode(), http.StatusFound)
	return nil
}

func (a *App) casdoorBrowserCallback(w http.ResponseWriter, r *http.Request) error {
	query := r.URL.Query()
	query.Set("casdoor_callback", "1")
	http.Redirect(w, r, "/?"+query.Encode(), http.StatusFound)
	return nil
}

func (a *App) casdoorCallback(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	if stringValue(input["action"]) == "create" {
		userinfo, err := a.userinfoFromSSOCreateToken(input)
		if err != nil {
			return err
		}
		subject := stringValue(userinfo["sub"])
		if subject == "" {
			return apiError("CASDOOR_USERINFO_INVALID", "Casdoor user info is missing subject.", http.StatusBadGateway)
		}
		return a.createAndLoginWithCasdoor(w, r, subject, userinfo)
	}
	pkce, err := a.consumeCasdoorCookie(w, r, stringValue(input["state"]))
	if err != nil {
		return err
	}
	mode := stringDefault(pkce["mode"], enumString(stringValue(input["mode"]), []string{"login", "bind"}, "login"))
	code := stringValue(input["code"])
	accessToken := stringValue(input["accessToken"])
	var userinfo map[string]any
	if accessToken != "" {
		userinfo, err = a.casdoorUserinfoFromToken(r.Context(), accessToken, stringValue(input["idToken"]))
	} else if code != "" {
		userinfo, err = a.casdoorUserinfoFromCode(r.Context(), code, pkce["codeVerifier"])
	} else {
		return apiError("VALIDATION_ERROR", "Casdoor authorization data is required.", http.StatusUnprocessableEntity)
	}
	if err != nil {
		return err
	}
	subject := stringValue(userinfo["sub"])
	if subject == "" {
		return apiError("CASDOOR_USERINFO_INVALID", "Casdoor user info is missing subject.", http.StatusBadGateway)
	}
	if mode == "bind" {
		binding, err := a.bindCasdoorAccount(r, subject, userinfo)
		if err != nil {
			return err
		}
		httpx.WriteOK(w, map[string]any{"binding": binding}, http.StatusOK)
		return nil
	}
	return a.loginWithCasdoor(w, r, subject, userinfo)
}

func (a *App) loginWithCasdoor(w http.ResponseWriter, r *http.Request, subject string, userinfo map[string]any) error {
	binding, err := a.ssoBindingBySubject(r.Context(), subject)
	if err != nil {
		if err == sql.ErrNoRows {
			token, err := a.issueSSOCreateToken(subject, userinfo)
			if err != nil {
				return err
			}
			httpx.WriteOK(w, map[string]any{"requiresSsoAccountAction": true, "ssoAccount": publicCasdoorAccount(subject, userinfo), "ssoCreateToken": token}, http.StatusOK)
			return nil
		}
		return err
	}
	userID := binding["userId"].(int64)
	if err := a.ensureActiveUser(r.Context(), userID); err != nil {
		return err
	}
	if avatar := casdoorAvatarURL(userinfo); avatar != "" {
		_, _ = a.db.ExecContext(r.Context(), "UPDATE users SET avatar_url = ? WHERE id = ?", avatar, userID)
	}
	workspace, err := a.firstWorkspace(r.Context(), userID)
	if err != nil {
		return err
	}
	return a.issueSession(w, r, userID, workspace)
}

func (a *App) createAndLoginWithCasdoor(w http.ResponseWriter, r *http.Request, subject string, userinfo map[string]any) error {
	if _, err := a.ssoBindingBySubject(r.Context(), subject); err == nil {
		return a.loginWithCasdoor(w, r, subject, userinfo)
	}
	email := normalizedEmail(userinfo["email"])
	if email == "" {
		return apiError("SSO_EMAIL_REQUIRED", "Casdoor account must provide an email before a BudgetCentre account can be created.", http.StatusUnprocessableEntity)
	}
	displayName := casdoorDisplayName(userinfo)
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
		accountEmail, nullableStringValue(username), displayName, nullableStringValue(casdoorAvatarURL(userinfo)), nullableInt(currencyID), boolInt(isFirst),
	)
	if err != nil {
		return err
	}
	userID, _ := res.LastInsertId()
	workspaceID, err := a.createWorkspaceTx(r.Context(), tx, userID, displayName+" Personal", "personal", currencyID)
	if err != nil {
		return err
	}
	if err := upsertSSOBindingTx(r.Context(), tx, userID, subject, userinfo); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return a.issueSession(w, r, userID, sql.NullInt64{Int64: workspaceID, Valid: true})
}

func (a *App) casdoorUserinfoFromCode(ctx context.Context, code, verifier string) (map[string]any, error) {
	payload := url.Values{}
	payload.Set("grant_type", "authorization_code")
	payload.Set("client_id", a.cfg.CasdoorClientID)
	payload.Set("code", code)
	payload.Set("redirect_uri", a.cfg.CasdoorRedirectURI)
	if verifier != "" {
		payload.Set("code_verifier", verifier)
	}
	if a.cfg.CasdoorClientSecret != "" {
		payload.Set("client_secret", a.cfg.CasdoorClientSecret)
	}
	tokenResponse, err := a.casdoorPostForm(ctx, strings.TrimRight(a.cfg.CasdoorServerURL, "/")+"/api/login/oauth/access_token", payload)
	if err != nil {
		return nil, err
	}
	if tokenError := stringValue(tokenResponse["error"]); tokenError != "" {
		return nil, apiError("CASDOOR_TOKEN_REJECTED", stringDefault(stringValue(tokenResponse["error_description"]), tokenError), http.StatusBadGateway)
	}
	accessToken := stringValue(tokenResponse["access_token"])
	if accessToken == "" {
		return nil, apiError("CASDOOR_TOKEN_INVALID", "Casdoor token response is missing access token.", http.StatusBadGateway)
	}
	return a.casdoorUserinfoFromToken(ctx, accessToken, stringValue(tokenResponse["id_token"]))
}

func (a *App) casdoorUserinfoFromToken(ctx context.Context, accessToken, idToken string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(a.cfg.CasdoorServerURL, "/")+"/api/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	decoded, err := doCasdoorJSON(req)
	if err != nil {
		return nil, err
	}
	normalized, err := normalizeCasdoorUserinfo(decoded)
	if err != nil {
		return nil, err
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

func (a *App) casdoorPostForm(ctx context.Context, endpoint string, values url.Values) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewBufferString(values.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	return doCasdoorJSON(req)
}

func doCasdoorJSON(req *http.Request) (map[string]any, error) {
	client := http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, apiError("CASDOOR_REQUEST_FAILED", "Casdoor endpoint is unavailable.", http.StatusBadGateway)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	var decoded map[string]any
	if err := json.Unmarshal(body, &decoded); err != nil {
		return nil, apiError("CASDOOR_RESPONSE_INVALID", "Casdoor returned invalid JSON.", http.StatusBadGateway)
	}
	return decoded, nil
}

func (a *App) casdoorCookie(payload map[string]string, expires time.Time) *http.Cookie {
	raw, _ := json.Marshal(payload)
	return &http.Cookie{Name: casdoorPKCECookie, Value: base64.RawURLEncoding.EncodeToString(raw), Path: "/", Expires: expires, HttpOnly: true, Secure: strings.HasPrefix(a.cfg.APIURL, "https://") || strings.HasPrefix(a.cfg.AppURL, "https://"), SameSite: http.SameSiteLaxMode}
}

func (a *App) consumeCasdoorCookie(w http.ResponseWriter, r *http.Request, state string) (map[string]string, error) {
	http.SetCookie(w, a.casdoorCookie(map[string]string{}, time.Now().Add(-time.Hour)))
	cookie, err := r.Cookie(casdoorPKCECookie)
	if err != nil || cookie.Value == "" {
		return map[string]string{}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil {
		return map[string]string{}, nil
	}
	var payload map[string]string
	if err := json.Unmarshal(raw, &payload); err != nil {
		return map[string]string{}, nil
	}
	expected := payload["state"]
	if expected == "" || state == "" || !checkHMAC(expected, state) {
		return nil, apiError("CASDOOR_STATE_INVALID", "Casdoor callback state is invalid.", http.StatusUnauthorized)
	}
	return payload, nil
}

func codeChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
