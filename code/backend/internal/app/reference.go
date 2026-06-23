package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

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
	rows, err := a.db.QueryContext(r.Context(), "SELECT id, code, name, symbol, decimal_places, is_enabled FROM currencies WHERE is_enabled = 1 ORDER BY code")
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, decimals int64
		var code, name, symbol string
		var enabled bool
		if err := rows.Scan(&id, &code, &name, &symbol, &decimals, &enabled); err != nil {
			return err
		}
		out = append(out, map[string]any{"id": id, "code": code, "name": name, "symbol": symbol, "decimalPlaces": decimals, "isEnabled": enabled})
	}
	httpx.WriteOK(w, map[string]any{"currencies": out}, http.StatusOK)
	return rows.Err()
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
		From:     r.URL.Query().Get("fromCurrency"),
		To:       r.URL.Query().Get("toCurrency"),
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
	workspaceID := int64Value(input["workspaceId"])
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	from, _ := a.currencyID(r.Context(), stringValue(input["fromCurrency"]))
	to, _ := a.currencyID(r.Context(), stringValue(input["toCurrency"]))
	res, err := a.db.ExecContext(r.Context(), "INSERT INTO exchange_rates (user_id, workspace_id, from_currency_id, to_currency_id, rate, rate_date, source, note) VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)", s.UserID, workspaceID, nullableInt(from), nullableInt(to), floatValue(input["rate"]), stringDefault(stringValue(input["rateDate"]), time.Now().Format("2006-01-02")), nullableStringValue(input["note"]))
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	rate, err := a.exchangeRateByID(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"rate": rate}, http.StatusOK)
	return nil
}

func (a *App) exchangeRateConvert(w http.ResponseWriter, r *http.Request) error {
	input, err := readJSON(r)
	if err != nil {
		return err
	}
	from, to := stringValue(input["fromCurrency"]), stringValue(input["toCurrency"])
	amount, rate := floatValue(input["amount"]), 1.0
	if from != to {
		_ = a.db.QueryRowContext(r.Context(), `SELECT rate FROM exchange_rates er JOIN currencies f ON f.id = er.from_currency_id JOIN currencies t ON t.id = er.to_currency_id
WHERE f.code = ? AND t.code = ? AND er.workspace_id <=> ? ORDER BY rate_date DESC, er.id DESC LIMIT 1`, from, to, nullableInt64Value(input["workspaceId"])).Scan(&rate)
	}
	httpx.WriteOK(w, map[string]any{"conversion": map[string]any{"from": from, "to": to, "amount": amount, "rate": rate, "convertedAmount": round4(amount * rate), "rateDate": nil, "source": "manual", "conversionPath": "direct"}}, http.StatusOK)
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
		return err
	}
	var style, structure map[string]any
	_ = json.Unmarshal([]byte(styleRaw), &style)
	_ = json.Unmarshal([]byte(structureRaw), &structure)
	httpx.WriteOK(w, map[string]any{"template": map[string]any{"key": key, "name": name, "style": style, "titleTemplate": structure["titleTemplate"], "subtitleTemplate": structure["subtitleTemplate"], "sections": structure["sections"]}}, http.StatusOK)
	return nil
}
