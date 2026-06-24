package app

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

func TestGoRoutesCoverPHPLegacyRoutes(t *testing.T) {
	phpRoutes := legacyPHPRoutes(t)
	goRoutes := goRouterRoutes(t)
	extraAllowed := map[string]bool{
		"DELETE /api/currencies":           true,
		"GET /api/admin/database":          true,
		"POST /api/admin/database/migrate": true,
		"POST /api/currencies":             true,
	}

	for _, route := range phpRoutes {
		if !goRoutes[route] {
			t.Fatalf("Go router is missing PHP legacy route %s", route)
		}
	}
	for route := range goRoutes {
		if !containsString(phpRoutes, route) && !extraAllowed[route] {
			t.Fatalf("Go router has unexpected non-legacy route %s", route)
		}
	}
}

func TestExchangeRateListClauseMatchesCurrentRateContract(t *testing.T) {
	where, args, err := exchangeRateListClause(42, exchangeRateFilter{
		From:     "usd",
		To:       "hkd",
		RateDate: "2026-01-02",
		Source:   "bochk",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(where, "NOT (er.source = 'bochk' AND er.provider_rate_type = 'mid')") {
		t.Fatalf("exchange-rate list must hide legacy BOCHK mid rates: %s", where)
	}
	if !strings.Contains(where, "er.source <> 'mastercard'") {
		t.Fatalf("exchange-rate list must hide legacy Mastercard rates: %s", where)
	}
	wantArgs := []any{int64(42), "USD", "HKD", "2026-01-02", "bochk"}
	if len(args) != len(wantArgs) {
		t.Fatalf("args length = %d, want %d: %#v", len(args), len(wantArgs), args)
	}
	for i, want := range wantArgs {
		if args[i] != want {
			t.Fatalf("arg %d = %#v, want %#v", i, args[i], want)
		}
	}
}

func TestArchiveCurrentExchangeRatesDoesNotDeduplicateRuntimeHistory(t *testing.T) {
	if strings.Contains(strings.ToUpper(archiveCurrentExchangeRatesSQL), "NOT EXISTS") {
		t.Fatal("runtime exchange-rate archiving must capture every overwrite, including same-second updates")
	}
}

func TestLatestExchangeRatePrefersCurrentOverHistoryOnSameDate(t *testing.T) {
	content, err := os.ReadFile("exchange_rates.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(content)
	start := strings.Index(source, "func (a *App) latestExchangeRate")
	end := strings.Index(source, "func (a *App) currencyCodeByID")
	if start < 0 || end < start {
		t.Fatal("could not locate latestExchangeRate function")
	}
	body := source[start:end]
	for _, want := range []string{
		"1 AS is_current",
		"0 AS is_current",
		"er.is_current DESC",
		"er.created_at DESC",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("latest exchange-rate lookup must prefer current rows over archived history, missing %q", want)
		}
	}
}

func TestBochkNamedLockUsesDedicatedConnection(t *testing.T) {
	content, err := os.ReadFile("bochk.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(content)
	for _, want := range []string{"a.db.Conn(ctx)", "conn.QueryRowContext", "conn.ExecContext", "conn.Close()"} {
		if !strings.Contains(source, want) {
			t.Fatalf("BOCHK named lock must use one dedicated connection, missing %q", want)
		}
	}
}

func TestManualBochkRefreshUsesSharedNamedLock(t *testing.T) {
	content, err := os.ReadFile("bochk.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(content)
	start := strings.Index(source, "func (a *App) bochkRefresh")
	end := strings.Index(source, "func (a *App) saveBochkRates")
	if start < 0 || end < start {
		t.Fatal("could not locate bochkRefresh function")
	}
	body := source[start:end]
	for _, want := range []string{
		`a.tryNamedLock(r.Context(), "budgetcentre_bochk_refresh")`,
		`EXCHANGE_RATE_REFRESH_IN_PROGRESS`,
		`defer unlock()`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("manual BOCHK refresh must share the refresh lock, missing %q", want)
		}
	}
}

func TestCurrencyResponseMarksAPIManagedCurrencyAsNotDeletable(t *testing.T) {
	response := currencyToResponse(currencyRecord{
		ID:           1,
		Code:         "HKD",
		Name:         "Hong Kong Dollar",
		Symbol:       "HK$",
		IsAPIManaged: true,
	})
	if response["canDelete"] != false {
		t.Fatalf("API-managed currency must not be deletable, got %#v", response["canDelete"])
	}
	if _, ok := response["isEnabled"]; ok {
		t.Fatal("currency response must not expose disabled-state semantics")
	}
}

func legacyPHPRoutes(t *testing.T) []string {
	t.Helper()
	content, err := os.ReadFile(filepath.Join("..", "..", "..", "backend-php-legacy", "src", "App.php"))
	if err != nil {
		t.Fatal(err)
	}
	pattern := regexp.MustCompile(`\['([A-Z]+)', '([^']+)'\]`)
	matches := pattern.FindAllStringSubmatch(string(content), -1)
	routes := make([]string, 0, len(matches))
	for _, match := range matches {
		routes = append(routes, match[1]+" "+match[2])
	}
	sort.Strings(routes)
	return routes
}

func goRouterRoutes(t *testing.T) map[string]bool {
	t.Helper()
	content, err := os.ReadFile("router.go")
	if err != nil {
		t.Fatal(err)
	}
	methodNames := map[string]string{
		"Delete": "DELETE",
		"Get":    "GET",
		"Patch":  "PATCH",
		"Post":   "POST",
		"Put":    "PUT",
	}
	pattern := regexp.MustCompile(`method == http\.Method(\w+) && path == "([^"]+)"`)
	matches := pattern.FindAllStringSubmatch(string(content), -1)
	routes := map[string]bool{}
	for _, match := range matches {
		method, ok := methodNames[match[1]]
		if !ok {
			t.Fatalf("unmapped HTTP method %s", match[1])
		}
		routes[method+" "+match[2]] = true
	}
	return routes
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}
