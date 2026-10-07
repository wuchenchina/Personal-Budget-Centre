package app

import (
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"regexp"
)

func decodedObject(raw sql.NullString) map[string]any {
	var result map[string]any
	if raw.Valid {
		_ = json.Unmarshal([]byte(raw.String), &result)
	}
	return result
}

func incomeValidationError() error {
	return apiError("VALIDATION_ERROR", "Invalid salary or expected income settings.", http.StatusUnprocessableEntity)
}

func incomeNumber(input map[string]any, key string, max float64, integer bool) (float64, error) {
	raw, ok := input[key]
	if !ok || raw == nil {
		return 0, incomeValidationError()
	}
	value, ok := raw.(float64)
	if !ok || math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > max || (integer && value != math.Trunc(value)) {
		return 0, incomeValidationError()
	}
	return value, nil
}

var salaryCurrencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

func validateAnnualSalary(raw any) (any, error) {
	if raw == nil {
		return nil, nil
	}
	input, ok := raw.(map[string]any)
	if !ok {
		return nil, incomeValidationError()
	}
	mode := stringValue(input["mode"])
	currency := stringValue(input["currency"])
	if !stringIn(mode, []string{"total", "monthly"}) || !salaryCurrencyPattern.MatchString(currency) {
		return nil, incomeValidationError()
	}
	amount, err := incomeNumber(input, "amount", 1e12, false)
	if err != nil || amount <= 0 {
		return nil, incomeValidationError()
	}
	payments, err := incomeNumber(input, "paymentsPerYear", 100, true)
	if err != nil || payments < 1 {
		return nil, incomeValidationError()
	}
	result := map[string]any{"mode": mode, "currency": currency, "amount": amount, "paymentsPerYear": payments}
	annual := amount
	if mode == "monthly" {
		annual *= payments
	}
	result["annualAmount"] = annual
	return jsonString(result), nil
}

// Annual income is copied from the authenticated user's private profile, never accepted from a client.
// Existing snapshots are retained unless the user explicitly chooses to refresh them.
func validateExpectedIncomeEntry(raw any, salary sql.NullString, base string, existing any) (any, error) {
	if raw == nil {
		return nil, nil
	}
	input, ok := raw.(map[string]any)
	if !ok {
		return nil, incomeValidationError()
	}
	mode := stringValue(input["mode"])
	if !stringIn(mode, []string{"auto", "annual", "monthly", "daily", "one_off"}) {
		return nil, incomeValidationError()
	}
	monthly, err := incomeNumber(input, "monthlyAmount", 1e12, false)
	if err != nil {
		return nil, err
	}
	daily, err := incomeNumber(input, "dailyAmount", 1e12, false)
	if err != nil {
		return nil, err
	}
	days, err := incomeNumber(input, "workdays", 31, true)
	if err != nil || days < 1 {
		return nil, incomeValidationError()
	}
	result := map[string]any{"mode": mode, "monthlyAmount": monthly, "dailyAmount": daily, "workdays": days}
	annual := decodedObject(sql.NullString{String: stringValue(existing), Valid: existing != nil})
	if annual != nil && stringValue(annual["annualCurrency"]) == base {
		result["annualAmount"] = annual["annualAmount"]
		result["annualCurrency"] = base
	}
	if mode == "auto" || (mode == "annual" && boolValue(input["refreshAnnual"])) || (mode == "annual" && result["annualAmount"] == nil) {
		profile := decodedObject(salary)
		if profile != nil && stringValue(profile["currency"]) == base {
			result["annualAmount"] = profile["annualAmount"]
			result["annualCurrency"] = base
		} else if mode == "auto" {
			delete(result, "annualAmount")
			delete(result, "annualCurrency")
		} else {
			return nil, incomeValidationError()
		}
	}
	if mode == "annual" && floatValue(result["annualAmount"]) <= 0 {
		return nil, incomeValidationError()
	}
	return jsonString(result), nil
}

// Multiple entries share the budget currency. Snapshots are matched by stable entry IDs.
func validateExpectedIncome(raw any, salary sql.NullString, base string, existing any) (any, error) {
	if raw == nil {
		return nil, nil
	}
	input, ok := raw.(map[string]any)
	if !ok {
		return nil, incomeValidationError()
	}
	rawEntries, ok := input["entries"].([]any)
	if !ok {
		// Preserve compatibility with the original single-entry representation.
		return validateExpectedIncomeEntry(raw, salary, base, existing)
	}
	if len(rawEntries) > 100 {
		return nil, incomeValidationError()
	}
	saved := decodedObject(sql.NullString{String: stringValue(existing), Valid: existing != nil})
	byID := map[string]any{}
	if savedEntries, ok := saved["entries"].([]any); ok {
		for _, rawEntry := range savedEntries {
			if entry, ok := rawEntry.(map[string]any); ok {
				byID[stringValue(entry["id"])] = jsonString(entry)
			}
		}
	} else if saved != nil {
		byID["legacy"] = existing
	}
	entries := []any{}
	seen := map[string]bool{}
	for _, rawEntry := range rawEntries {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			return nil, incomeValidationError()
		}
		id, title := stringValue(entry["id"]), stringValue(entry["title"])
		if id == "" || len(id) > 100 || seen[id] || title == "" || len([]rune(title)) > 160 {
			return nil, incomeValidationError()
		}
		seen[id] = true
		validated, err := validateExpectedIncomeEntry(entry, salary, base, byID[id])
		if err != nil {
			return nil, err
		}
		value := decodedObject(sql.NullString{String: stringValue(validated), Valid: true})
		oneOff, err := incomeNumber(entry, "oneOffAmount", 1e12, false)
		if err != nil {
			return nil, err
		}
		value["id"], value["title"], value["oneOffAmount"] = id, title, oneOff
		entries = append(entries, value)
	}
	return jsonString(map[string]any{"entries": entries}), nil
}
