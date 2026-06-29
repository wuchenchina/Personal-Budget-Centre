package app

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"testing"
)

func TestLegacyWebAuthnCredentialFromStorage(t *testing.T) {
	credentialID := []byte("credential-id")
	publicKey := []byte{0xa5, 0x01, 0x02, 0x03, 0x26}
	raw, err := json.Marshal(map[string]any{
		"publicKeyCredentialId": base64.RawURLEncoding.EncodeToString(credentialID),
		"type":                  "public-key",
		"credentialPublicKey":   base64.RawURLEncoding.EncodeToString(publicKey),
		"counter":               7,
		"attestationType":       "none",
		"transports":            []string{"hybrid", "internal"},
		"backupEligible":        true,
		"backupStatus":          true,
		"aaguid":                "fbfc3007-154e-4ecc-8c0b-6e020557d7bd",
	})
	if err != nil {
		t.Fatal(err)
	}

	credential, err := webAuthnCredentialFromStorage([]byte("wrong-id"), string(raw), 0)
	if err != nil {
		t.Fatal(err)
	}
	if string(credential.ID) != string(credentialID) {
		t.Fatalf("credential id = %q, want %q", credential.ID, credentialID)
	}
	if string(credential.PublicKey) != string(publicKey) {
		t.Fatalf("public key = %x, want %x", credential.PublicKey, publicKey)
	}
	if credential.Authenticator.SignCount != 7 {
		t.Fatalf("sign count = %d, want 7", credential.Authenticator.SignCount)
	}
	if credential.AttestationFormat != "none" {
		t.Fatalf("attestation format = %q, want none", credential.AttestationFormat)
	}
	if len(credential.Transport) != 2 {
		t.Fatalf("transports = %#v, want 2 values", credential.Transport)
	}
	if !credential.Flags.BackupEligible || !credential.Flags.BackupState {
		t.Fatalf("backup flags not restored: %#v", credential.Flags)
	}
	if got := hex.EncodeToString(credential.Authenticator.AAGUID); got != "fbfc3007154e4ecc8c0b6e020557d7bd" {
		t.Fatalf("aaguid = %s", got)
	}
}
