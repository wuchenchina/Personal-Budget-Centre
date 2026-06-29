package app

import (
	"database/sql"
	"fmt"
	"net/http"

	"budgetcentre/backend/internal/httpx"

	"github.com/go-webauthn/webauthn/protocol"
	wan "github.com/go-webauthn/webauthn/webauthn"
)

type passkeyUser struct {
	ID          int64
	Email       string
	DisplayName string
	Credentials []wan.Credential
}

func (u passkeyUser) WebAuthnID() []byte                    { return passkeyUserHandle(u.ID) }
func (u passkeyUser) WebAuthnName() string                  { return u.Email }
func (u passkeyUser) WebAuthnDisplayName() string           { return u.DisplayName }
func (u passkeyUser) WebAuthnCredentials() []wan.Credential { return u.Credentials }

func (a *App) passkeyRegisterOptions(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	if !s.PasswordHash.Valid {
		return apiError("SSO_ONLY_PASSWORD_DISABLED", "SSO-only accounts cannot add passwordless login methods. Bind an existing account to merge data.", http.StatusConflict)
	}
	user, err := a.passkeyUserByID(r.Context(), s.UserID)
	if err != nil {
		return err
	}
	webAuthn, err := a.webAuthn()
	if err != nil {
		return err
	}
	creation, session, err := webAuthn.BeginRegistration(user, wan.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
		ResidentKey:      protocol.ResidentKeyRequirementPreferred,
		UserVerification: protocol.VerificationPreferred,
	}))
	if err != nil {
		return passkeyWebAuthnError("PASSKEY_OPTIONS_FAILED", "Passkey registration options could not be generated.", http.StatusInternalServerError, "registrationOptions", err, map[string]any{"challengeType": "registration", "challengeUserKnown": true})
	}
	if err := a.storeWebAuthnSession(r.Context(), sql.NullInt64{Int64: s.UserID, Valid: true}, "registration", session); err != nil {
		return apiErrorWithMeta("PASSKEY_CHALLENGE_STORE_FAILED", "Passkey challenge could not be stored.", http.StatusInternalServerError, passkeyMeta("store", map[string]any{"challengeType": "registration", "challengeUserKnown": true, "storageErrorType": fmt.Sprintf("%T", err), "storageErrorMessage": err.Error()}))
	}
	httpx.WriteOK(w, map[string]any{"options": creation.Response}, http.StatusOK)
	return nil
}

func (a *App) passkeyRegisterVerify(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	if !s.PasswordHash.Valid {
		return apiError("SSO_ONLY_PASSWORD_DISABLED", "SSO-only accounts cannot add passwordless login methods. Bind an existing account to merge data.", http.StatusConflict)
	}
	raw, err := credentialJSON(input)
	if err != nil {
		return err
	}
	parsed, err := protocol.ParseCredentialCreationResponseBytes(raw)
	if err != nil {
		return passkeyWebAuthnError("PASSKEY_INVALID", "Registration response is invalid.", http.StatusUnprocessableEntity, "parseRegistration", err, map[string]any{"challengeType": "registration"})
	}
	session, _, err := a.consumeWebAuthnSession(r.Context(), parsed.Response.CollectedClientData.Challenge, "registration", sql.NullInt64{Int64: s.UserID, Valid: true})
	if err != nil {
		return err
	}
	user, err := a.passkeyUserByID(r.Context(), s.UserID)
	if err != nil {
		return err
	}
	webAuthn, err := a.webAuthn()
	if err != nil {
		return err
	}
	credential, err := webAuthn.CreateCredential(user, session, parsed)
	if err != nil {
		return passkeyWebAuthnError("PASSKEY_INVALID", "Passkey registration could not be verified.", http.StatusUnprocessableEntity, "verifyRegistration", err, map[string]any{"challengeType": "registration", "challengeUserKnown": true})
	}
	if exists, err := a.passkeyCredentialExists(r.Context(), credential.ID); err != nil || exists {
		if err != nil {
			return err
		}
		return apiError("PASSKEY_EXISTS", "This passkey is already registered.", http.StatusConflict)
	}
	if err := a.insertPasskeyCredential(r.Context(), s.UserID, credential, nullableStringValue(input["deviceName"])); err != nil {
		return err
	}
	return a.writePasskeyCredentials(w, r, s.UserID)
}

func (a *App) passkeyLoginOptions(w http.ResponseWriter, r *http.Request) error {
	var userID sql.NullInt64
	var user passkeyUser
	var err error
	email := normalizedEmail(r.URL.Query().Get("email"))
	if email != "" {
		user, err = a.passkeyUserByEmail(r.Context(), email)
		if err == nil && len(user.Credentials) > 0 {
			userID = sql.NullInt64{Int64: user.ID, Valid: true}
		} else if err != nil && err != sql.ErrNoRows {
			return err
		}
	}
	webAuthn, err := a.webAuthn()
	if err != nil {
		return err
	}
	var assertion *protocol.CredentialAssertion
	var session *wan.SessionData
	if userID.Valid {
		assertion, session, err = webAuthn.BeginLogin(user, wan.WithUserVerification(protocol.VerificationPreferred))
	} else {
		assertion, session, err = webAuthn.BeginDiscoverableLogin(wan.WithUserVerification(protocol.VerificationPreferred))
	}
	if err != nil {
		return passkeyWebAuthnError("PASSKEY_OPTIONS_FAILED", "Passkey login options could not be generated.", http.StatusInternalServerError, "loginOptions", err, map[string]any{"challengeType": "authentication", "challengeUserKnown": userID.Valid})
	}
	if err := a.storeWebAuthnSession(r.Context(), userID, "authentication", session); err != nil {
		return apiErrorWithMeta("PASSKEY_CHALLENGE_STORE_FAILED", "Passkey challenge could not be stored.", http.StatusInternalServerError, passkeyMeta("store", map[string]any{"challengeType": "authentication", "challengeUserKnown": userID.Valid, "storageErrorType": fmt.Sprintf("%T", err), "storageErrorMessage": err.Error()}))
	}
	httpx.WriteOK(w, map[string]any{"options": assertion.Response}, http.StatusOK)
	return nil
}

func (a *App) passkeyLoginVerify(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	raw, err := credentialJSON(input)
	if err != nil {
		return err
	}
	parsed, err := protocol.ParseCredentialRequestResponseBytes(raw)
	if err != nil {
		return passkeyWebAuthnError("PASSKEY_INVALID", "Authentication response is invalid.", http.StatusUnprocessableEntity, "parseAuthentication", err, map[string]any{"challengeType": "authentication"})
	}
	session, challengeUserID, err := a.consumeWebAuthnSession(r.Context(), parsed.Response.CollectedClientData.Challenge, "authentication", sql.NullInt64{})
	if err != nil {
		return err
	}
	webAuthn, err := a.webAuthn()
	if err != nil {
		return err
	}
	var userID int64
	var credential *wan.Credential
	if challengeUserID.Valid {
		user, err := a.passkeyUserByID(r.Context(), challengeUserID.Int64)
		if err != nil {
			return err
		}
		credential, err = webAuthn.ValidateLogin(user, session, parsed)
		userID = user.ID
	} else {
		var authed passkeyUser
		if len(parsed.Response.UserHandle) == 0 {
			authed, err = a.passkeyUserForAssertion(r.Context(), parsed.RawID, nil)
			if err == nil {
				session.UserID = authed.WebAuthnID()
				credential, err = webAuthn.ValidateLogin(authed, session, parsed)
			}
		} else {
			discovered, nextCredential, validateErr := webAuthn.ValidatePasskeyLogin(func(rawID, userHandle []byte) (wan.User, error) {
				user, err := a.passkeyUserForAssertion(r.Context(), rawID, userHandle)
				if err != nil {
					return nil, err
				}
				authed = user
				return user, nil
			}, session, parsed)
			err = validateErr
			credential = nextCredential
			if item, ok := discovered.(passkeyUser); ok {
				authed = item
			}
		}
		userID = authed.ID
	}
	if err != nil || credential == nil || userID <= 0 {
		return passkeyVerifyError(err, challengeUserID.Valid, len(parsed.Response.UserHandle) == 0, credential != nil, userID > 0)
	}
	if err := a.updatePasskeyAfterLogin(r.Context(), credential); err != nil {
		return err
	}
	workspace, err := a.firstWorkspace(r.Context(), userID)
	if err != nil {
		return err
	}
	return a.issueSession(w, r, userID, workspace)
}

func (a *App) passkeyResetOptions(w http.ResponseWriter, r *http.Request) error {
	email := normalizedEmail(r.URL.Query().Get("email"))
	if email == "" {
		return apiError("VALIDATION_ERROR", "A valid email is required.", http.StatusUnprocessableEntity)
	}
	user, err := a.passkeyUserByEmail(r.Context(), email)
	if err != nil {
		if err == sql.ErrNoRows {
			return apiError("PASSWORD_RESET_NOT_AVAILABLE", "Password reset is not available for this account.", http.StatusConflict)
		}
		return err
	}
	if _, _, _, eligible, err := a.passwordResetEligibleUserByEmail(r.Context(), email); err != nil {
		return err
	} else if !eligible || len(user.Credentials) == 0 {
		return apiError("PASSWORD_RESET_NOT_AVAILABLE", "Password reset is not available for this account.", http.StatusConflict)
	}
	webAuthn, err := a.webAuthn()
	if err != nil {
		return err
	}
	assertion, session, err := webAuthn.BeginLogin(user, wan.WithUserVerification(protocol.VerificationPreferred))
	if err != nil {
		return passkeyWebAuthnError("PASSKEY_OPTIONS_FAILED", "Passkey reset options could not be generated.", http.StatusInternalServerError, "resetOptions", err, map[string]any{"challengeType": "authentication", "challengeUserKnown": true})
	}
	if err := a.storeWebAuthnSession(r.Context(), sql.NullInt64{Int64: user.ID, Valid: true}, "authentication", session); err != nil {
		return apiErrorWithMeta("PASSKEY_CHALLENGE_STORE_FAILED", "Passkey challenge could not be stored.", http.StatusInternalServerError, passkeyMeta("store", map[string]any{"challengeType": "authentication", "challengeUserKnown": true, "storageErrorType": fmt.Sprintf("%T", err), "storageErrorMessage": err.Error()}))
	}
	httpx.WriteOK(w, map[string]any{"options": assertion.Response}, http.StatusOK)
	return nil
}

func (a *App) passkeyResetVerify(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	raw, err := credentialJSON(input)
	if err != nil {
		return err
	}
	parsed, err := protocol.ParseCredentialRequestResponseBytes(raw)
	if err != nil {
		return passkeyWebAuthnError("PASSKEY_INVALID", "Authentication response is invalid.", http.StatusUnprocessableEntity, "parseResetAuthentication", err, map[string]any{"challengeType": "authentication"})
	}
	session, challengeUserID, err := a.consumeWebAuthnSession(r.Context(), parsed.Response.CollectedClientData.Challenge, "authentication", sql.NullInt64{})
	if err != nil {
		return err
	}
	if !challengeUserID.Valid {
		return apiError("PASSKEY_INVALID", "Passkey reset could not be verified.", http.StatusUnauthorized)
	}
	webAuthn, err := a.webAuthn()
	if err != nil {
		return err
	}
	user, err := a.passkeyUserByID(r.Context(), challengeUserID.Int64)
	if err != nil {
		return err
	}
	credential, err := webAuthn.ValidateLogin(user, session, parsed)
	if err != nil || credential == nil {
		return passkeyVerifyError(err, true, len(parsed.Response.UserHandle) == 0, credential != nil, user.ID > 0)
	}
	if err := a.updatePasskeyAfterLogin(r.Context(), credential); err != nil {
		return err
	}
	token, err := a.createPasswordResetTokenForUser(r.Context(), user.ID, "passkey")
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"passwordResetToken": token}, http.StatusOK)
	return nil
}

func passkeyVerifyError(err error, challengeUserKnown, blankUserHandle, credentialVerified, userResolved bool) error {
	extra := map[string]any{
		"challengeType":      "authentication",
		"challengeUserKnown": challengeUserKnown,
		"blankUserHandle":    blankUserHandle,
		"credentialVerified": credentialVerified,
		"userResolved":       userResolved,
	}
	if err == nil {
		extra["reason"] = "missing_credential_or_user"
		return apiErrorWithMeta("PASSKEY_INVALID", "Passkey login could not be verified.", http.StatusUnauthorized, passkeyMeta("verifyAuthentication", extra))
	}
	return passkeyWebAuthnError("PASSKEY_INVALID", "Passkey login could not be verified.", http.StatusUnauthorized, "verifyAuthentication", err, extra)
}

func passkeyWebAuthnError(code, message string, status int, phase string, err error, extra map[string]any) error {
	if extra == nil {
		extra = map[string]any{}
	}
	if err != nil {
		extra["webauthnErrorType"] = fmt.Sprintf("%T", err)
		extra["webauthnErrorMessage"] = err.Error()
	}
	return apiErrorWithMeta(code, message, status, passkeyMeta(phase, extra))
}

func passkeyMeta(phase string, extra map[string]any) map[string]any {
	meta := map[string]any{"phase": phase}
	for key, value := range extra {
		if value != nil && value != "" {
			meta[key] = value
		}
	}
	return meta
}

func (a *App) passkeyCredentialList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	return a.writePasskeyCredentials(w, r, s.UserID)
}

func (a *App) passkeyCredentialUpdate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "UPDATE webauthn_credentials SET device_name = ? WHERE id = ? AND user_id = ?", nullableStringValue(input["deviceName"]), int64Value(input["id"]), s.UserID); err != nil {
		return err
	}
	return a.writePasskeyCredentials(w, r, s.UserID)
}

func (a *App) passkeyCredentialDelete(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?", int64Value(input["id"]), s.UserID); err != nil {
		return err
	}
	return a.writePasskeyCredentials(w, r, s.UserID)
}

func (a *App) writePasskeyCredentials(w http.ResponseWriter, r *http.Request, userID int64) error {
	credentials, err := a.passkeyCredentials(r.Context(), userID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"credentials": credentials}, http.StatusOK)
	return nil
}

func (a *App) webAuthn() (*wan.WebAuthn, error) {
	return wan.New(&wan.Config{
		RPID:          a.cfg.WebAuthnRPID,
		RPDisplayName: a.cfg.WebAuthnRPName,
		RPOrigins:     []string{a.cfg.WebAuthnOrigin},
	})
}
