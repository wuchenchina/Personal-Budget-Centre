package app

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	wan "github.com/go-webauthn/webauthn/webauthn"
)

const webAuthnSessionFallbackTTL = 5 * time.Minute

func (a *App) storeWebAuthnSession(ctx context.Context, userID sql.NullInt64, typ string, session *wan.SessionData) error {
	raw, err := json.Marshal(session)
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(ctx, `INSERT INTO webauthn_challenges (user_id, challenge, type, session_json, expires_at)
VALUES (?, ?, ?, ?, ?)`, nullableInt(userID), session.Challenge, typ, string(raw), webAuthnSessionExpires(session))
	return err
}

func webAuthnSessionExpires(session *wan.SessionData) time.Time {
	if session != nil && !session.Expires.IsZero() {
		return session.Expires.UTC()
	}
	return time.Now().UTC().Add(webAuthnSessionFallbackTTL)
}

func (a *App) consumeWebAuthnSession(ctx context.Context, challenge, typ string, userID sql.NullInt64) (wan.SessionData, sql.NullInt64, error) {
	query := `SELECT id, user_id, session_json, CAST(used_at AS CHAR), CAST(expires_at AS CHAR)
FROM webauthn_challenges WHERE challenge = ? AND type = ?`
	args := []any{challenge, typ}
	if userID.Valid {
		query += " AND user_id = ?"
		args = append(args, userID.Int64)
	}
	query += " LIMIT 1"

	var id int64
	var challengeUserID sql.NullInt64
	var raw, usedAt, expiresAt sql.NullString
	if err := a.db.QueryRowContext(ctx, query, args...).Scan(&id, &challengeUserID, &raw, &usedAt, &expiresAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return wan.SessionData{}, sql.NullInt64{}, passkeyChallengeError("not_found", typ, userID.Valid, false)
		}
		return wan.SessionData{}, sql.NullInt64{}, err
	}
	if usedAt.Valid && strings.TrimSpace(usedAt.String) != "" {
		return wan.SessionData{}, sql.NullInt64{}, passkeyChallengeError("used", typ, userID.Valid, challengeUserID.Valid)
	}
	expires, ok := parseDateTime(expiresAt.String)
	if !ok || !expires.After(time.Now().UTC()) {
		return wan.SessionData{}, sql.NullInt64{}, passkeyChallengeError("expired", typ, userID.Valid, challengeUserID.Valid)
	}
	if _, err := a.db.ExecContext(ctx, "UPDATE webauthn_challenges SET used_at = UTC_TIMESTAMP() WHERE id = ?", id); err != nil {
		return wan.SessionData{}, sql.NullInt64{}, err
	}
	if !raw.Valid || raw.String == "" {
		return wan.SessionData{}, sql.NullInt64{}, apiErrorWithMeta("PASSKEY_CHALLENGE_SESSION_INVALID", "Passkey challenge session is invalid.", 419, passkeyMeta("consume", map[string]any{"challengeType": typ, "reason": "missing_session_json"}))
	}

	var session wan.SessionData
	if err := json.Unmarshal([]byte(raw.String), &session); err != nil {
		return wan.SessionData{}, sql.NullInt64{}, apiErrorWithMeta("PASSKEY_CHALLENGE_SESSION_INVALID", "Passkey challenge session is invalid.", 419, passkeyMeta("consume", map[string]any{"challengeType": typ, "reason": "invalid_session_json", "webauthnErrorType": "json.Unmarshal"}))
	}
	return session, challengeUserID, nil
}

func passkeyChallengeError(reason, typ string, userWasScoped, challengeUserKnown bool) error {
	return apiErrorWithMeta("PASSKEY_CHALLENGE_INVALID", "Passkey challenge is invalid or expired.", 419, passkeyMeta("consume", map[string]any{
		"challengeType":      typ,
		"reason":             reason,
		"userWasScoped":      userWasScoped,
		"challengeUserKnown": challengeUserKnown,
	}))
}

func (a *App) passkeyUserByID(ctx context.Context, userID int64) (passkeyUser, error) {
	var user passkeyUser
	if err := a.db.QueryRowContext(ctx, "SELECT id, email, display_name FROM users WHERE id = ? AND status = 'active' LIMIT 1", userID).Scan(&user.ID, &user.Email, &user.DisplayName); err != nil {
		return passkeyUser{}, err
	}
	credentials, err := a.storedWebAuthnCredentials(ctx, user.ID)
	if err != nil {
		return passkeyUser{}, err
	}
	user.Credentials = credentials
	return user, nil
}

func (a *App) passkeyUserByEmail(ctx context.Context, email string) (passkeyUser, error) {
	var userID int64
	if err := a.db.QueryRowContext(ctx, "SELECT id FROM users WHERE email = ? AND status = 'active' LIMIT 1", email).Scan(&userID); err != nil {
		return passkeyUser{}, err
	}
	return a.passkeyUserByID(ctx, userID)
}

func (a *App) passkeyUserForAssertion(ctx context.Context, rawID, userHandle []byte) (passkeyUser, error) {
	if userID := passkeyUserIDFromHandle(userHandle); userID > 0 {
		return a.passkeyUserByID(ctx, userID)
	}

	var userID int64
	if err := a.db.QueryRowContext(ctx, "SELECT user_id FROM webauthn_credentials WHERE credential_id = ? LIMIT 1", rawID).Scan(&userID); err != nil {
		return passkeyUser{}, err
	}
	return a.passkeyUserByID(ctx, userID)
}

func (a *App) storedWebAuthnCredentials(ctx context.Context, userID int64) ([]wan.Credential, error) {
	rows, err := a.db.QueryContext(ctx, "SELECT credential_id, public_key, sign_count FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC, id DESC", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []wan.Credential
	for rows.Next() {
		var id []byte
		var raw string
		var signCount uint32
		if err := rows.Scan(&id, &raw, &signCount); err != nil {
			return nil, err
		}

		credential, err := webAuthnCredentialFromStorage(id, raw, signCount)
		if err != nil {
			return nil, err
		}
		if len(credential.ID) == 0 {
			credential.ID = id
		}
		out = append(out, credential)
	}
	return out, rows.Err()
}

func webAuthnCredentialFromStorage(id []byte, raw string, signCount uint32) (wan.Credential, error) {
	var credential wan.Credential
	if err := json.Unmarshal([]byte(raw), &credential); err != nil {
		return wan.Credential{}, apiErrorWithMeta("PASSKEY_CREDENTIAL_INVALID", "Stored passkey credential is invalid.", http.StatusInternalServerError, passkeyMeta("loadCredential", map[string]any{"webauthnErrorType": "json.Unmarshal"}))
	}
	if len(credential.PublicKey) > 0 {
		return credential, nil
	}
	legacy, err := legacyWebAuthnCredentialFromStorage(id, raw, signCount)
	if err == nil && len(legacy.PublicKey) > 0 {
		return legacy, nil
	}
	if err != nil {
		return wan.Credential{}, err
	}
	return credential, nil
}

type legacyWebAuthnCredential struct {
	PublicKeyCredentialID string   `json:"publicKeyCredentialId"`
	CredentialPublicKey   string   `json:"credentialPublicKey"`
	Type                  string   `json:"type"`
	Transports            []string `json:"transports"`
	AttestationType       string   `json:"attestationType"`
	AAGUID                string   `json:"aaguid"`
	Counter               any      `json:"counter"`
	BackupEligible        bool     `json:"backupEligible"`
	BackupStatus          bool     `json:"backupStatus"`
}

func legacyWebAuthnCredentialFromStorage(id []byte, raw string, signCount uint32) (wan.Credential, error) {
	var legacy legacyWebAuthnCredential
	if err := json.Unmarshal([]byte(raw), &legacy); err != nil {
		return wan.Credential{}, apiErrorWithMeta("PASSKEY_CREDENTIAL_INVALID", "Stored passkey credential is invalid.", http.StatusInternalServerError, passkeyMeta("loadCredential", map[string]any{"webauthnErrorType": "json.Unmarshal"}))
	}
	if legacy.CredentialPublicKey == "" {
		return wan.Credential{}, nil
	}
	credentialID := id
	if legacy.PublicKeyCredentialID != "" {
		if decoded, err := decodeStoredBase64URL(legacy.PublicKeyCredentialID); err == nil {
			credentialID = decoded
		}
	}
	publicKey, err := decodeStoredBase64URL(legacy.CredentialPublicKey)
	if err != nil {
		return wan.Credential{}, apiErrorWithMeta("PASSKEY_CREDENTIAL_INVALID", "Stored passkey credential is invalid.", http.StatusInternalServerError, passkeyMeta("loadCredential", map[string]any{"reason": "invalid_legacy_public_key", "webauthnErrorType": "base64.DecodeString"}))
	}
	if next := legacyCounter(legacy.Counter); next > signCount {
		signCount = next
	}
	return wan.Credential{
		ID:                credentialID,
		PublicKey:         publicKey,
		AttestationFormat: legacy.AttestationType,
		Transport:         legacyTransports(legacy.Transports),
		Flags: wan.CredentialFlags{
			BackupEligible: legacy.BackupEligible,
			BackupState:    legacy.BackupStatus,
		},
		Authenticator: wan.Authenticator{
			AAGUID:    legacyAAGUID(legacy.AAGUID),
			SignCount: signCount,
		},
	}, nil
}

func decodeStoredBase64URL(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, base64.CorruptInputError(0)
	}
	if decoded, err := base64.RawURLEncoding.DecodeString(value); err == nil {
		return decoded, nil
	}
	return base64.URLEncoding.DecodeString(value)
}

func legacyCounter(value any) uint32 {
	switch typed := value.(type) {
	case float64:
		if typed > 0 {
			return uint32(typed)
		}
	case string:
		parsed, _ := strconv.ParseUint(strings.TrimSpace(typed), 10, 32)
		return uint32(parsed)
	}
	return 0
}

func legacyTransports(values []string) []protocol.AuthenticatorTransport {
	out := make([]protocol.AuthenticatorTransport, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, protocol.AuthenticatorTransport(value))
		}
	}
	return out
}

func legacyAAGUID(value string) []byte {
	value = strings.ReplaceAll(strings.TrimSpace(value), "-", "")
	if value == "" {
		return nil
	}
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err == nil && len(decoded) == 16 {
		return decoded
	}
	if len(value) != 32 {
		return nil
	}
	out := make([]byte, 16)
	for i := 0; i < 16; i++ {
		parsed, err := strconv.ParseUint(value[i*2:i*2+2], 16, 8)
		if err != nil {
			return nil
		}
		out[i] = byte(parsed)
	}
	return out
}

func (a *App) passkeyCredentials(ctx context.Context, userID int64) ([]map[string]any, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT id, user_id, credential_id, sign_count, transports_json, backup_eligible, backup_state, device_name, last_used_at, created_at
FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC, id DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id, uid, signCount int64
		var credentialID []byte
		var transportsRaw sql.NullString
		var backupEligible, backupState bool
		var deviceName, lastUsed, created sql.NullString
		if err := rows.Scan(&id, &uid, &credentialID, &signCount, &transportsRaw, &backupEligible, &backupState, &deviceName, &lastUsed, &created); err != nil {
			return nil, err
		}

		transports := []any{}
		if transportsRaw.Valid && transportsRaw.String != "" {
			_ = json.Unmarshal([]byte(transportsRaw.String), &transports)
		}
		out = append(out, map[string]any{
			"id":             id,
			"userId":         uid,
			"credentialId":   base64.RawURLEncoding.EncodeToString(credentialID),
			"signCount":      signCount,
			"transports":     transports,
			"backupEligible": backupEligible,
			"backupState":    backupState,
			"deviceName":     nullableString(deviceName),
			"lastUsedAt":     nullableDateTime(lastUsed),
			"createdAt":      nullableDateTime(created),
		})
	}
	return out, rows.Err()
}

func (a *App) insertPasskeyCredential(ctx context.Context, userID int64, credential *wan.Credential, deviceName any) error {
	raw, err := json.Marshal(credential)
	if err != nil {
		return err
	}
	transports, _ := json.Marshal(credential.Transport)
	_, err = a.db.ExecContext(ctx, `INSERT INTO webauthn_credentials
(user_id, credential_id, public_key, sign_count, transports_json, attestation_type, trust_path_json, backup_eligible, backup_state, device_name)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		userID, credential.ID, string(raw), credential.Authenticator.SignCount, string(transports), credential.AttestationType, "{}", boolInt(credential.Flags.BackupEligible), boolInt(credential.Flags.BackupState), deviceName,
	)
	return err
}

func (a *App) updatePasskeyAfterLogin(ctx context.Context, credential *wan.Credential) error {
	raw, err := json.Marshal(credential)
	if err != nil {
		return err
	}
	transports, _ := json.Marshal(credential.Transport)
	_, err = a.db.ExecContext(ctx, `UPDATE webauthn_credentials
SET public_key = ?, sign_count = ?, transports_json = ?, backup_eligible = ?, backup_state = ?, last_used_at = UTC_TIMESTAMP()
WHERE credential_id = ?`, string(raw), credential.Authenticator.SignCount, string(transports), boolInt(credential.Flags.BackupEligible), boolInt(credential.Flags.BackupState), credential.ID)
	return err
}

func (a *App) passkeyCredentialExists(ctx context.Context, credentialID []byte) (bool, error) {
	var count int
	err := a.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM webauthn_credentials WHERE credential_id = ?", credentialID).Scan(&count)
	return count > 0, err
}
