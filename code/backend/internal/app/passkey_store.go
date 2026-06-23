package app

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"

	wan "github.com/go-webauthn/webauthn/webauthn"
)

func (a *App) storeWebAuthnSession(ctx context.Context, userID sql.NullInt64, typ string, session *wan.SessionData) error {
	raw, err := json.Marshal(session)
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(ctx, `INSERT INTO webauthn_challenges (user_id, challenge, type, session_json, expires_at)
VALUES (?, ?, ?, ?, ?)`, nullableInt(userID), session.Challenge, typ, string(raw), session.Expires)
	return err
}

func (a *App) consumeWebAuthnSession(ctx context.Context, challenge, typ string, userID sql.NullInt64) (wan.SessionData, sql.NullInt64, error) {
	query := `SELECT id, user_id, session_json FROM webauthn_challenges
WHERE challenge = ? AND type = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()`
	args := []any{challenge, typ}
	if userID.Valid {
		query += " AND user_id = ?"
		args = append(args, userID.Int64)
	}
	query += " LIMIT 1"

	var id int64
	var challengeUserID sql.NullInt64
	var raw sql.NullString
	if err := a.db.QueryRowContext(ctx, query, args...).Scan(&id, &challengeUserID, &raw); err != nil {
		return wan.SessionData{}, sql.NullInt64{}, apiError("PASSKEY_CHALLENGE_INVALID", "Passkey challenge is invalid or expired.", 419)
	}
	if _, err := a.db.ExecContext(ctx, "UPDATE webauthn_challenges SET used_at = UTC_TIMESTAMP() WHERE id = ?", id); err != nil {
		return wan.SessionData{}, sql.NullInt64{}, err
	}
	if !raw.Valid || raw.String == "" {
		return wan.SessionData{}, sql.NullInt64{}, apiError("PASSKEY_CHALLENGE_INVALID", "Passkey challenge is invalid or expired.", 419)
	}

	var session wan.SessionData
	if err := json.Unmarshal([]byte(raw.String), &session); err != nil {
		return wan.SessionData{}, sql.NullInt64{}, err
	}
	return session, challengeUserID, nil
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
	rows, err := a.db.QueryContext(ctx, "SELECT credential_id, public_key FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC, id DESC", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []wan.Credential
	for rows.Next() {
		var id []byte
		var raw string
		if err := rows.Scan(&id, &raw); err != nil {
			return nil, err
		}

		var credential wan.Credential
		if err := json.Unmarshal([]byte(raw), &credential); err != nil {
			continue
		}
		if len(credential.ID) == 0 {
			credential.ID = id
		}
		out = append(out, credential)
	}
	return out, rows.Err()
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
			"lastUsedAt":     nullableString(lastUsed),
			"createdAt":      nullableString(created),
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
