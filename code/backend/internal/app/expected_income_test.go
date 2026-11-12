package app

import (
	"database/sql"
	"encoding/json"
	"math"
	"testing"
)

func incomeObject(t *testing.T, raw any) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal([]byte(raw.(string)), &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestHourlyIncomeValidationAndPersistence(t *testing.T) {
	for _, method := range []string{"daily", "total"} {
		entry := map[string]any{"id": "hourly", "title": "Hourly work", "mode": "hourly", "monthlyAmount": 0.0, "dailyAmount": 0.0, "oneOffAmount": 0.0, "hourlyAmount": 20.5, "hoursMode": method, "dailyHours": 7.5, "totalHours": 135.25, "workdays": 18.0}
		raw, err := validateExpectedIncome(map[string]any{"entries": []any{entry}}, sql.NullString{}, "CNY", nil, "2026-10-07", "2026-10-31")
		if err != nil {
			t.Fatalf("%s: %v", method, err)
		}
		saved := incomeObject(t, raw)["entries"].([]any)[0].(map[string]any)
		if saved["mode"] != "hourly" || saved["hoursMode"] != method || saved["hourlyAmount"] != 20.5 {
			t.Fatalf("hourly settings lost: %v", saved)
		}
		key, want := "dailyHours", 7.5
		if method == "total" {
			key, want = "totalHours", 135.25
		}
		if saved[key] != want {
			t.Fatalf("hours lost: %v", saved)
		}
		if _, err := validateExpectedIncome(map[string]any{"entries": []any{saved}}, sql.NullString{}, "CNY", raw, "2026-10-07", "2026-10-31"); err != nil {
			t.Fatalf("saved hourly settings cannot be saved again: %v", err)
		}
	}
}

func TestHourlyIncomeRejectsInvalidInputs(t *testing.T) {
	for _, tc := range []struct {
		method, field string
		value         any
	}{
		{"daily", "dailyHours", nil}, {"daily", "dailyHours", 0.0}, {"daily", "dailyHours", 24.01},
		{"daily", "workdays", 26.0}, {"daily", "workdays", 1.5},
		{"total", "totalHours", 0.0}, {"total", "totalHours", 600.01}, {"total", "totalHours", "100"},
		{"total", "hoursMode", "invalid"}, {"total", "hoursMode", nil},
	} {
		entry := map[string]any{"mode": "hourly", "monthlyAmount": 0.0, "dailyAmount": 0.0, "workdays": 18.0, "hourlyAmount": 20.0, "hoursMode": tc.method, "dailyHours": 7.5, "totalHours": 100.5}
		entry[tc.field] = tc.value
		if _, err := validateExpectedIncomeEntry(entry, sql.NullString{}, "CNY", nil, 25); err == nil {
			t.Fatalf("accepted %s %s=%v", tc.method, tc.field, tc.value)
		}
	}
	for _, method := range []string{"daily", "total"} {
		for _, invalid := range []any{nil, "20", -1.0, math.NaN(), math.Inf(1), 1e13} {
			entry := map[string]any{"mode": "hourly", "monthlyAmount": 0.0, "dailyAmount": 0.0, "workdays": 18.0, "hourlyAmount": invalid, "hoursMode": method, "dailyHours": 7.5, "totalHours": 100.5}
			if _, err := validateExpectedIncomeEntry(entry, sql.NullString{}, "CNY", nil, 25); err == nil {
				t.Fatalf("accepted hourlyAmount=%v", invalid)
			}
		}
	}
	// Direct totals are independent of the inactive daily schedule.
	entry := map[string]any{"mode": "hourly", "monthlyAmount": 0.0, "dailyAmount": 0.0, "workdays": 26.0, "hourlyAmount": 0.0, "hoursMode": "total", "dailyHours": nil, "totalHours": 24.0}
	if _, err := validateExpectedIncomeEntry(entry, sql.NullString{}, "CNY", nil, 1); err != nil {
		t.Fatalf("valid direct total rejected: %v", err)
	}
}

func TestAnnualSalaryCalculation(t *testing.T) {
	for _, tc := range []struct {
		mode                   string
		amount, payments, want float64
	}{
		{"total", 160000, 12, 160000}, {"monthly", 10000, 12, 120000}, {"monthly", 10000, 13, 130000}, {"monthly", 10000, 16, 160000},
	} {
		raw, err := validateAnnualSalary(map[string]any{"mode": tc.mode, "amount": tc.amount, "paymentsPerYear": tc.payments, "currency": "CNY", "annualAmount": 999.0})
		if err != nil {
			t.Fatal(err)
		}
		if got := incomeObject(t, raw)["annualAmount"]; got != tc.want {
			t.Fatalf("annual = %v, want %v", got, tc.want)
		}
	}
	if raw, err := validateAnnualSalary(nil); raw != nil || err != nil {
		t.Fatal("clearing salary must be supported")
	}
}

func TestSalaryRejectsInvalidInputs(t *testing.T) {
	for _, field := range []string{"amount", "paymentsPerYear"} {
		for _, invalid := range []any{nil, "100", -1.0, math.Inf(1), math.NaN(), 1e15} {
			input := map[string]any{"mode": "monthly", "amount": 10000.0, "paymentsPerYear": 13.0, "currency": "CNY"}
			input[field] = invalid
			if _, err := validateAnnualSalary(input); err == nil {
				t.Fatalf("accepted %s=%v", field, invalid)
			}
		}
	}
	for _, payments := range []float64{0, 1.5, 101} {
		if _, err := validateAnnualSalary(map[string]any{"mode": "monthly", "amount": 100.0, "paymentsPerYear": payments, "currency": "CNY"}); err == nil {
			t.Fatalf("accepted %v payments", payments)
		}
	}
}

func TestExpectedIncomeProfilePriorityAndSnapshots(t *testing.T) {
	profile := sql.NullString{Valid: true, String: `{"annualAmount":156000,"currency":"CNY"}`}
	saved := `{"mode":"annual","annualAmount":120000,"annualCurrency":"CNY"}`
	for _, tc := range []struct {
		mode     string
		refresh  bool
		currency string
		want     any
		fail     bool
	}{
		{"auto", false, "CNY", 156000.0, false}, {"annual", false, "CNY", 120000.0, false},
		{"annual", true, "CNY", 156000.0, false}, {"monthly", false, "CNY", 120000.0, false},
		{"auto", false, "USD", nil, false}, {"annual", false, "USD", nil, true},
	} {
		input := map[string]any{"mode": tc.mode, "refreshAnnual": tc.refresh, "monthlyAmount": 9000.0, "dailyAmount": 500.0, "workdays": 26.0, "annualAmount": 999999.0}
		raw, err := validateExpectedIncomeEntry(input, profile, tc.currency, saved)
		if tc.fail {
			if err == nil {
				t.Fatal("accepted annual salary in wrong currency")
			}
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		got := incomeObject(t, raw)
		if got["annualAmount"] != tc.want {
			t.Fatalf("%s annual = %v, want %v", tc.mode, got["annualAmount"], tc.want)
		}
		if got["workdays"] != 26.0 || got["monthlyAmount"] != 9000.0 {
			t.Fatal("lost budget settings")
		}
	}
	input := map[string]any{"mode": "annual", "monthlyAmount": 0.0, "dailyAmount": 0.0, "workdays": 26.0}
	if _, err := validateExpectedIncomeEntry(input, sql.NullString{}, "CNY", nil); err == nil {
		t.Fatal("accepted missing profile salary")
	}
}

func TestExpectedIncomeUsesBudgetPeriodForWorkdayLimit(t *testing.T) {
	entry := map[string]any{"mode": "daily", "monthlyAmount": 0.0, "dailyAmount": 500.0, "workdays": 45.0}
	raw, err := validateExpectedIncomeEntry(entry, sql.NullString{}, "CNY", nil, budgetWorkdayLimit("2026-10-01", "2026-11-14"))
	if err != nil {
		t.Fatal(err)
	}
	if got := incomeObject(t, raw)["workdays"]; got != 45.0 {
		t.Fatalf("workdays = %v, want 45", got)
	}
	if _, err := validateExpectedIncomeEntry(map[string]any{"mode": "daily", "monthlyAmount": 0.0, "dailyAmount": 500.0, "workdays": 46.0}, sql.NullString{}, "CNY", nil, budgetWorkdayLimit("2026-10-01", "2026-11-14")); err == nil {
		t.Fatal("accepted more workdays than the 45-day budget period")
	}
}

func TestExpectedIncomeRejectsInvalidWorkdays(t *testing.T) {
	for _, days := range []any{nil, 0.0, -1.0, 26.5, 46.0, "26"} {
		if _, err := validateExpectedIncomeEntry(map[string]any{"mode": "daily", "monthlyAmount": 0.0, "dailyAmount": 500.0, "workdays": days}, sql.NullString{}, "CNY", nil, budgetWorkdayLimit("2026-10-01", "2026-11-14")); err == nil {
			t.Fatalf("accepted workdays %v", days)
		}
	}
}

func TestExpectedIncomeDoesNotAcceptClientAnnualAmount(t *testing.T) {
	input := map[string]any{"mode": "auto", "monthlyAmount": 9000.0, "dailyAmount": 500.0, "workdays": 26.0, "annualAmount": 999999.0, "annualCurrency": "CNY"}
	raw, err := validateExpectedIncomeEntry(input, sql.NullString{}, "CNY", nil)
	if err != nil {
		t.Fatal(err)
	}
	if incomeObject(t, raw)["annualAmount"] != nil {
		t.Fatal("accepted client-provided annual salary")
	}
	if raw, err := validateExpectedIncomeEntry(nil, sql.NullString{}, "CNY", nil); raw != nil || err != nil {
		t.Fatal("clearing expected income must be supported")
	}
}

func TestMultipleIncomeEntriesAndStableSnapshots(t *testing.T) {
	existing := `{"entries":[{"id":"job","annualAmount":120000,"annualCurrency":"CNY"}]}`
	input := map[string]any{"entries": []any{
		map[string]any{"id": "gift", "title": "Gift", "mode": "one_off", "oneOffAmount": 5000.0, "monthlyAmount": 0.0, "dailyAmount": 0.0, "workdays": 26.0},
		map[string]any{"id": "job", "title": "Job", "mode": "annual", "oneOffAmount": 0.0, "monthlyAmount": 0.0, "dailyAmount": 0.0, "workdays": 26.0},
	}}
	raw, err := validateExpectedIncome(input, sql.NullString{}, "CNY", existing, "", "")
	if err != nil {
		t.Fatal(err)
	}
	entries := incomeObject(t, raw)["entries"].([]any)
	if entries[1].(map[string]any)["annualAmount"] != 120000.0 {
		t.Fatal("reordering lost snapshot")
	}
	if entries[0].(map[string]any)["oneOffAmount"] != 5000.0 {
		t.Fatal("lost one-off amount")
	}
	input["entries"].([]any)[0].(map[string]any)["id"] = "job"
	if _, err := validateExpectedIncome(input, sql.NullString{}, "CNY", existing, "", ""); err == nil {
		t.Fatal("accepted duplicate IDs")
	}
	raw, err = validateExpectedIncome(map[string]any{"entries": []any{}}, sql.NullString{}, "CNY", existing, "", "")
	if err != nil || len(incomeObject(t, raw)["entries"].([]any)) != 0 {
		t.Fatal("could not delete all incomes")
	}
}
