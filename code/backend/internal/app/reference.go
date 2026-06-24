package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"budgetcentre/backend/internal/httpx"
)

func (a *App) currencyID(ctx context.Context, code string) (sql.NullInt64, error) {
	if strings.TrimSpace(code) == "" {
		return sql.NullInt64{}, nil
	}
	var id int64
	err := a.db.QueryRowContext(ctx, "SELECT id FROM currencies WHERE code = ? LIMIT 1", strings.ToUpper(code)).Scan(&id)
	return sql.NullInt64{Int64: id, Valid: err == nil}, err
}

func (a *App) defaultTemplateID(ctx context.Context) (sql.NullInt64, error) {
	var id int64
	err := a.db.QueryRowContext(ctx, "SELECT id FROM budget_templates WHERE template_key = 'personal_living_budget' LIMIT 1").Scan(&id)
	if err != nil {
		return sql.NullInt64{}, nil
	}
	return sql.NullInt64{Int64: id, Valid: true}, nil
}

func (a *App) currencyList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	workspaceID := queryInt(r, "workspaceId")
	budgetID := queryInt(r, "budgetId")
	if budgetID > 0 {
		basics, err := a.budgetBasics(r.Context(), budgetID)
		if err != nil {
			return err
		}
		if err := a.requireBudgetRead(r, budgetID, s.UserID); err != nil {
			return err
		}
		workspaceID = basics.WorkspaceID
	} else if workspaceID > 0 {
		if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor", "viewer", "auditor"); err != nil {
			return err
		}
	}
	currencies, err := a.currenciesForUser(r.Context(), s.UserID, workspaceID, budgetID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"currencies": currenciesToResponse(currencies)}, http.StatusOK)
	return nil
}

func (a *App) currencyPresetList(w http.ResponseWriter, r *http.Request) error {
	currencies, err := a.currencies(r.Context())
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"currencies": currenciesToResponse(currencies)}, http.StatusOK)
	return nil
}

func (a *App) exchangeRateList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	workspaceID := queryInt(r, "workspaceId")
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor", "viewer", "auditor"); err != nil {
		return err
	}
	rates, err := a.exchangeRatesForWorkspace(r.Context(), workspaceID, exchangeRateFilter{
		From:     firstQuery(r, "fromCurrency", "from"),
		To:       firstQuery(r, "toCurrency", "to"),
		RateDate: r.URL.Query().Get("rateDate"),
		Source:   r.URL.Query().Get("source"),
	})
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"rates": rates}, http.StatusOK)
	return nil
}

func (a *App) exchangeRateCreate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	workspaceID := int64Value(firstValue(input, "workspaceId", "workspace_id"))
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	from, err := a.requiredCurrencyID(r.Context(), firstValue(input, "fromCurrency", "from_currency"))
	if err != nil {
		return err
	}
	to, err := a.requiredCurrencyID(r.Context(), firstValue(input, "toCurrency", "to_currency"))
	if err != nil {
		return err
	}
	if from == to {
		return apiError("VALIDATION_ERROR", "Manual exchange rate currencies must differ.", http.StatusUnprocessableEntity)
	}
	rateValue, ok := numericInput(input["rate"])
	if !ok || rateValue <= 0 {
		return apiError("VALIDATION_ERROR", "Exchange rate is required.", http.StatusUnprocessableEntity)
	}
	rateDate := dateString(firstValue(input, "rateDate", "rate_date"))
	if rateDate == "" {
		rateDate = todayDate()
	}
	note := nullableStringValue(input["note"])
	if text := stringValue(input["note"]); len(text) > 500 {
		return apiError("VALIDATION_ERROR", "Exchange rate note must be 500 characters or less.", http.StatusUnprocessableEntity)
	}
	id, err := a.saveCurrentExchangeRate(r.Context(), currentExchangeRateInput{
		UserID:           sql.NullInt64{Int64: s.UserID, Valid: true},
		WorkspaceID:      sql.NullInt64{Int64: workspaceID, Valid: true},
		FromCurrencyID:   from,
		ToCurrencyID:     to,
		Rate:             rateValue,
		RateDate:         rateDate,
		Source:           "manual",
		ProviderRateType: "manual",
		Note:             note,
	})
	if err != nil {
		return err
	}
	rate, err := a.exchangeRateByID(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"rate": rate}, http.StatusOK)
	return nil
}

func (a *App) budgetExchangeRateList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	budgetID := queryInt(r, "budgetId")
	if err := a.requireBudgetRead(r, budgetID, s.UserID); err != nil {
		return err
	}
	rates, err := a.budgetExchangeRates(r.Context(), budgetID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"rates": rates}, http.StatusOK)
	return nil
}

func (a *App) budgetExchangeRateCreate(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	budgetID := int64Value(firstValue(input, "budgetId", "budget_id"))
	if err := a.requireBudgetWrite(r, budgetID, s.UserID); err != nil {
		return err
	}
	from, err := a.requiredCurrencyID(r.Context(), firstValue(input, "fromCurrency", "from_currency"))
	if err != nil {
		return err
	}
	to, err := a.requiredCurrencyID(r.Context(), firstValue(input, "toCurrency", "to_currency"))
	if err != nil {
		return err
	}
	if from == to {
		return apiError("VALIDATION_ERROR", "Budget exchange-rate currencies must differ.", http.StatusUnprocessableEntity)
	}
	rateValue, ok := numericInput(input["rate"])
	if !ok || rateValue <= 0 {
		return apiError("VALIDATION_ERROR", "Exchange rate is required.", http.StatusUnprocessableEntity)
	}
	rateDate := dateString(firstValue(input, "rateDate", "rate_date"))
	if rateDate == "" {
		rateDate = todayDate()
	}
	if text := stringValue(firstValue(input, "note", "sourceNote", "source_note")); len(text) > 500 {
		return apiError("VALIDATION_ERROR", "Exchange rate note must be 500 characters or less.", http.StatusUnprocessableEntity)
	}
	id, err := a.saveBudgetExchangeRate(r.Context(), budgetExchangeRateInput{
		BudgetID:       budgetID,
		UserID:         s.UserID,
		FromCurrencyID: from,
		ToCurrencyID:   to,
		Rate:           rateValue,
		RateDate:       rateDate,
		Note:           nullableStringValue(firstValue(input, "note", "sourceNote", "source_note")),
	})
	if err != nil {
		return err
	}
	rate, err := a.budgetExchangeRateByID(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"rate": rate}, http.StatusOK)
	return nil
}

func (a *App) budgetExchangeRateSyncGlobal(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	budgetID := int64Value(firstValue(input, "budgetId", "budget_id"))
	if err := a.requireBudgetWrite(r, budgetID, s.UserID); err != nil {
		return err
	}
	pairs, ok := input["pairs"].([]any)
	if !ok || len(pairs) == 0 {
		return apiError("VALIDATION_ERROR", "At least one exchange-rate pair is required.", http.StatusUnprocessableEntity)
	}
	applied := []map[string]any{}
	skipped := []map[string]any{}
	for _, raw := range pairs {
		pair, _ := raw.(map[string]any)
		from, err := a.requiredCurrencyID(r.Context(), firstValue(pair, "fromCurrency", "from_currency", "from"))
		if err != nil {
			return err
		}
		to, err := a.requiredCurrencyID(r.Context(), firstValue(pair, "toCurrency", "to_currency", "to"))
		if err != nil {
			return err
		}
		rateDate := dateString(firstValue(pair, "rateDate", "rate_date"))
		global, err := a.latestGlobalExchangeRateWithCross(r.Context(), from, to, rateDate)
		if err != nil {
			return err
		}
		fromCode, _ := a.currencyCodeByID(r.Context(), from)
		toCode, _ := a.currencyCodeByID(r.Context(), to)
		if global == nil {
			skipped = append(skipped, map[string]any{"from": fromCode, "to": toCode, "reason": "GLOBAL_RATE_NOT_FOUND"})
			continue
		}
		id, err := a.saveBudgetExchangeRate(r.Context(), budgetExchangeRateInput{
			BudgetID:       budgetID,
			UserID:         s.UserID,
			FromCurrencyID: from,
			ToCurrencyID:   to,
			Rate:           global.Rate,
			RateDate:       global.RateDate,
			Note:           "Synced from global BOCHK rate.",
		})
		if err != nil {
			return err
		}
		rate, err := a.budgetExchangeRateByID(r.Context(), id)
		if err != nil {
			return err
		}
		applied = append(applied, rate)
	}
	httpx.WriteOK(w, map[string]any{"applied": applied, "skipped": skipped}, http.StatusOK)
	return nil
}

func (a *App) exchangeRateConvert(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	workspaceID := int64Value(firstValue(input, "workspaceId", "workspace_id"))
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor", "viewer", "auditor"); err != nil {
		return err
	}
	fromID, err := a.requiredCurrencyID(r.Context(), firstValue(input, "fromCurrency", "from_currency"))
	if err != nil {
		return err
	}
	toID, err := a.requiredCurrencyID(r.Context(), firstValue(input, "toCurrency", "to_currency"))
	if err != nil {
		return err
	}
	amount, ok := numericInput(input["amount"])
	if !ok {
		return apiError("VALIDATION_ERROR", "Amount is required.", http.StatusUnprocessableEntity)
	}
	rateDate := dateString(firstValue(input, "rateDate", "rate_date"))
	conversion, err := a.resolveExchangeRate(r.Context(), workspaceID, fromID, toID, rateDate)
	if err != nil {
		return err
	}
	fromCode, err := a.currencyCodeByID(r.Context(), fromID)
	if err != nil {
		return err
	}
	toCode, err := a.currencyCodeByID(r.Context(), toID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"conversion": map[string]any{
		"from":            fromCode,
		"to":              toCode,
		"amount":          amount,
		"rate":            conversion.Rate,
		"convertedAmount": amount * conversion.Rate,
		"rateDate":        nullableText(conversion.RateDate),
		"source":          conversion.Source,
		"conversionPath":  conversion.ConversionPath,
	}}, http.StatusOK)
	return nil
}

func (a *App) categoryList(w http.ResponseWriter, r *http.Request) error {
	s, err := a.currentSession(r)
	if err != nil {
		return err
	}
	workspaceID := queryInt(r, "workspaceId")
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor", "viewer", "auditor"); err != nil {
		return err
	}
	cats, err := a.categoriesForWorkspace(r.Context(), workspaceID)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"categories": cats}, http.StatusOK)
	return nil
}

func (a *App) templateResponse(w http.ResponseWriter, r *http.Request) error {
	row := a.db.QueryRowContext(r.Context(), "SELECT name, template_key, style_json, structure_json FROM budget_templates WHERE template_key = 'personal_living_budget' LIMIT 1")
	var name, key, styleRaw, structureRaw string
	if err := row.Scan(&name, &key, &styleRaw, &structureRaw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return apiError("TEMPLATE_NOT_FOUND", "Template is missing. Run database/003_seed_template.sql.", http.StatusNotFound)
		}
		return err
	}
	var style, structure map[string]any
	if err := json.Unmarshal([]byte(styleRaw), &style); err != nil {
		return apiError("TEMPLATE_JSON_INVALID", "Template JSON in database is invalid.", http.StatusInternalServerError)
	}
	if err := json.Unmarshal([]byte(structureRaw), &structure); err != nil {
		return apiError("TEMPLATE_JSON_INVALID", "Template JSON in database is invalid.", http.StatusInternalServerError)
	}
	httpx.WriteOK(w, map[string]any{"template": map[string]any{"key": key, "name": name, "style": style, "titleTemplate": structure["titleTemplate"], "subtitleTemplate": structure["subtitleTemplate"], "sections": structure["sections"]}}, http.StatusOK)
	return nil
}
