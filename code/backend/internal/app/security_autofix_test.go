package app

import (
	"encoding/json"
	"math"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestQueryBoundedIntRejectsOverflowAndClampsRange(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/admin/users?page=999999999999999999999999&pageSize=999999999999999999999999", nil)
	if got := queryBoundedInt(req, "page", 1, math.MaxInt32); got != 0 {
		t.Fatalf("overflowing page = %d, want 0", got)
	}
	if got := queryBoundedInt(req, "pageSize", 0, 100); got != 0 {
		t.Fatalf("overflowing pageSize = %d, want 0", got)
	}

	req = httptest.NewRequest("GET", "/api/admin/users?page=-20&pageSize=999", nil)
	if got := queryBoundedInt(req, "page", 1, math.MaxInt32); got != 1 {
		t.Fatalf("negative page = %d, want min clamp", got)
	}
	if got := queryBoundedInt(req, "pageSize", 0, 100); got != 100 {
		t.Fatalf("large pageSize = %d, want max clamp", got)
	}

	req = httptest.NewRequest("GET", "/api/admin/users?page=999999999", nil)
	if got := queryBoundedInt(req, "page", 1, maxAdminUserListPage); got != maxAdminUserListPage {
		t.Fatalf("large page = %d, want max page %d", got, maxAdminUserListPage)
	}
}

func TestInstallmentIntegerHelpersRejectNativeIntOverflow(t *testing.T) {
	tooLarge := json.Number("9223372036854775808")
	if got, ok := positiveIntValue(tooLarge); ok || got != 0 {
		t.Fatalf("positiveIntValue accepted oversized json.Number: got=%d ok=%v", got, ok)
	}
	if got, ok := nonNegativeIntValue("9223372036854775808"); ok || got != 0 {
		t.Fatalf("nonNegativeIntValue accepted oversized string: got=%d ok=%v", got, ok)
	}
	if strconv.IntSize == 32 {
		if got, ok := positiveIntValue(int64(math.MaxInt32) + 1); ok || got != 0 {
			t.Fatalf("positiveIntValue accepted 32-bit overflow: got=%d ok=%v", got, ok)
		}
	}
}

func TestSMTPAddressAndHeaderSanitizersBlockInjection(t *testing.T) {
	if _, err := sanitizeSMTPAddress("victim@example.com\r\nBcc: attacker@example.com"); err == nil {
		t.Fatal("sanitizeSMTPAddress accepted CRLF injection")
	}
	if got, err := sanitizeSMTPAddress("Budget User <victim@example.com>"); err != nil || got != "victim@example.com" {
		t.Fatalf("sanitizeSMTPAddress = %q, %v; want plain address", got, err)
	}

	subject := sanitizeSMTPHeaderValue("Verify\r\nBcc: attacker@example.com")
	if strings.ContainsAny(subject, "\r\n") {
		t.Fatalf("sanitizeSMTPHeaderValue left newline in %q", subject)
	}
	msg := mailMessage("sender@example.com", "BudgetCentre", "victim@example.com", subject, "body")
	headerBlock := strings.SplitN(msg, "\r\n\r\n", 2)[0]
	if strings.Contains(headerBlock, "Bcc:") {
		t.Fatalf("mail headers contain injected Bcc: %s", headerBlock)
	}
	if strings.Contains(msg, "\r\nbody") {
		t.Fatalf("mail body should be transfer-encoded, got raw message: %q", msg)
	}
}

func TestVerificationEmailBodyDoesNotIncludeUserControlledDisplayName(t *testing.T) {
	body := verificationEmailBody("https://budget.example", "safe-token")
	if strings.Contains(body, "attacker") {
		t.Fatalf("verification body should not contain attacker-controlled content: %q", body)
	}
	if !strings.Contains(body, "https://budget.example/email/verify?token=safe-token") {
		t.Fatalf("verification body missing link: %q", body)
	}
}
