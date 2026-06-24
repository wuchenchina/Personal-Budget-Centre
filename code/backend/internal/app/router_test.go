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
		"DELETE /api/currencies":                      true,
		"GET /api/admin/database":                     true,
		"GET /api/budget-exchange-rates":              true,
		"POST /api/admin/database/migrate":            true,
		"POST /api/budget-exchange-rates":             true,
		"POST /api/budget-exchange-rates/sync-global": true,
		"POST /api/currencies":                        true,
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
	if !strings.Contains(where, "er.source = 'bochk' AND er.workspace_id IS NULL") {
		t.Fatalf("BOCHK provider rates must be global current rows: %s", where)
	}
	if !strings.Contains(where, "er.source <> 'bochk' AND er.workspace_id = ?") {
		t.Fatalf("custom exchange rates must stay scoped to the current workspace: %s", where)
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

func TestLatestExchangeRateKeepsBochkGlobalAndCustomRatesScoped(t *testing.T) {
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
		"er.source = 'bochk' AND er.workspace_id IS NULL",
		"er.source <> 'bochk' AND er.workspace_id = ?",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("latest exchange-rate lookup must keep provider/global and custom/workspace scopes separate, missing %q", want)
		}
	}
}

func TestSaveCurrentExchangeRateOverwritesWithoutRuntimeHistory(t *testing.T) {
	content, err := os.ReadFile("exchange_rates.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(content)
	start := strings.Index(source, "func saveCurrentExchangeRateTx")
	end := strings.Index(source, "func deleteCurrentExchangeRatesTx")
	if start < 0 || end < start {
		t.Fatal("could not locate saveCurrentExchangeRateTx function")
	}
	body := source[start:end]
	if strings.Contains(body, "exchange_rate_history") {
		t.Fatal("runtime exchange-rate saving must overwrite current rows without writing history")
	}
	if !strings.Contains(body, "deleteCurrentExchangeRatesTx") {
		t.Fatal("runtime exchange-rate saving must delete the current row before insert")
	}
}

func TestLatestExchangeRateReadsCurrentRowsOnly(t *testing.T) {
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
	if strings.Contains(body, "exchange_rate_history") {
		t.Fatal("latest exchange-rate lookup must not read archived history")
	}
	for _, want := range []string{"FROM exchange_rates er", "er.created_at DESC", "er.id DESC"} {
		if !strings.Contains(body, want) {
			t.Fatalf("latest exchange-rate lookup must use current rows only, missing %q", want)
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

func TestBochkRefreshWritesGlobalProviderRates(t *testing.T) {
	content, err := os.ReadFile("bochk.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(content)
	start := strings.Index(source, "func (a *App) saveBochkRates")
	end := strings.Index(source, "func fetchBochkFeed")
	if start < 0 || end < start {
		t.Fatal("could not locate saveBochkRates function")
	}
	body := source[start:end]
	if strings.Contains(body, "userID") || strings.Contains(body, "Int64: s.UserID") {
		t.Fatal("BOCHK provider rates must not be owned by the refresh-triggering user")
	}
	if strings.Count(body, "WorkspaceID:       sql.NullInt64{}") < 2 {
		t.Fatal("BOCHK buy/sell current rates must be stored as global workspace-null rates")
	}
	if strings.Count(body, "UserID:            sql.NullInt64{}") < 2 {
		t.Fatal("BOCHK buy/sell current rates must not store user_id")
	}
}

func TestCurrencyResponseUsesDirectoryFieldsOnly(t *testing.T) {
	response := currencyToResponse(currencyRecord{
		ID:            1,
		Code:          "HKD",
		Name:          "Hong Kong Dollar",
		Symbol:        "HK$",
		DecimalPlaces: 2,
		IsEnabled:     true,
	})
	for _, blocked := range []string{"canDelete", "isApiManaged", "providerSource", "providerLastSeenAt"} {
		if _, ok := response[blocked]; ok {
			t.Fatalf("currency response must not expose provider-managed product semantics: %s", blocked)
		}
	}
	if response["isEnabled"] != true {
		t.Fatalf("currency response must expose enabled directory state, got %#v", response["isEnabled"])
	}
}

func TestCurrencyDeleteRemovesOnlyPersonalCurrencyLink(t *testing.T) {
	content, err := os.ReadFile("currencies.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(content)
	start := strings.Index(source, "func (a *App) currencyDelete")
	end := strings.Index(source, "func (a *App) currencyExists")
	if start < 0 || end < start {
		t.Fatal("could not locate currencyDelete function")
	}
	body := source[start:end]
	if !strings.Contains(body, "userVisibleCurrencyUsageCount") {
		t.Fatal("personal currency removal must check visible business usage before unlinking")
	}
	if !strings.Contains(body, "UPDATE user_currencies") || !strings.Contains(body, "is_active = 0") {
		t.Fatal("personal currency removal must deactivate the user_currencies link")
	}
	if strings.Contains(body, "DELETE FROM currencies") || strings.Contains(body, "deleteCurrencyExchangeRateReferences") {
		t.Fatal("personal currency removal must not delete canonical currency or exchange-rate rows")
	}
}

func TestCurrencyUsageCountClosesReferenceRowsBeforeCounting(t *testing.T) {
	content, err := os.ReadFile("currencies.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(content)
	start := strings.Index(source, "func (a *App) currencyUsageCountTx")
	end := strings.Index(source, "func deleteCurrencyExchangeRateReferences")
	if start < 0 || end < start {
		t.Fatal("could not locate currencyUsageCountTx function")
	}
	body := source[start:end]
	closeIndex := strings.Index(body, "rows.Close()")
	usageIndex := strings.Index(body, "currencyColumnUsage")
	if closeIndex < 0 || usageIndex < 0 || closeIndex > usageIndex {
		t.Fatal("currency usage counting must close information_schema rows before issuing per-table counts")
	}
}

func TestNormalizedLogEntryUsesArrayTraceAndObjectQuery(t *testing.T) {
	entry := normalizedLogEntry(map[string]any{
		"id":     "log-1",
		"status": 409,
		"trace":  nil,
		"query":  nil,
	}, "raw")
	if trace, ok := entry["trace"].([]string); !ok || len(trace) != 0 {
		t.Fatalf("trace must normalize to empty string slice, got %#v", entry["trace"])
	}
	if query, ok := entry["query"].(map[string]any); !ok || len(query) != 0 {
		t.Fatalf("query must normalize to empty object, got %#v", entry["query"])
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
