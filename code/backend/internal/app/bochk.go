package app

import (
	"context"
	"database/sql"
	"html"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"budgetcentre/backend/internal/httpx"
)

const (
	bochkSource     = "bochk"
	bochkSourceName = "Bank of China (Hong Kong) Limited"
	bochkSourceURL  = "https://www.bochk.com/whk/rates/exchangeRatesHKD/exchangeRatesHKD-input.action?lang=hk"
)

type bochkFeed struct {
	ProviderUpdatedAt string
	RateDate          string
	FetchedAt         string
	Rates             []bochkRate
}

type bochkRate struct {
	CurrencyCode string
	Label        string
	CustomerSell float64
	CustomerBuy  float64
}

var bochkCurrencyMap = map[string]string{
	"人民幣(在岸)": "CNY",
	"人民幣(離岸)": "CNH",
	"美元":      "USD",
	"英鎊":      "GBP",
	"日圓":      "JPY",
	"澳元":      "AUD",
	"紐元":      "NZD",
	"加元":      "CAD",
	"歐羅":      "EUR",
	"瑞士法郎":    "CHF",
	"丹麥克郎":    "DKK",
	"挪威克郎":    "NOK",
	"瑞典克郎":    "SEK",
	"新加坡元":    "SGD",
	"泰國銖":     "THB",
	"文萊元":     "BND",
	"南非蘭特":    "ZAR",
}

func (a *App) bochkRefresh(w http.ResponseWriter, r *http.Request) error {
	s, input, err := a.sessionInput(r)
	if err != nil {
		return err
	}
	workspaceID := int64Value(firstValue(input, "workspaceId", "workspace_id"))
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	unlock, locked, err := a.tryNamedLock(r.Context(), "budgetcentre_bochk_refresh")
	if err != nil {
		return err
	}
	if !locked {
		return apiError("EXCHANGE_RATE_REFRESH_IN_PROGRESS", "BOCHK exchange rates are already refreshing.", http.StatusConflict)
	}
	defer unlock()

	feed, err := fetchBochkFeed(r.Context())
	if err != nil {
		return err
	}
	saved, skipped, err := a.saveBochkRates(r.Context(), sql.NullInt64{Int64: s.UserID, Valid: true}, feed)
	if err != nil {
		return err
	}
	rates, err := a.exchangeRatesForWorkspace(r.Context(), workspaceID, exchangeRateFilter{RateDate: feed.RateDate, Source: bochkSource})
	if err != nil {
		return err
	}
	httpx.WriteOK(w, map[string]any{"provider": map[string]any{
		"source":            bochkSource,
		"sourceName":        bochkSourceName,
		"sourceUrl":         bochkSourceURL,
		"baseCurrency":      "HKD",
		"rateDate":          feed.RateDate,
		"providerUpdatedAt": feed.ProviderUpdatedAt,
		"fetchedAt":         feed.FetchedAt,
		"saved":             saved,
		"skipped":           uniqueStrings(skipped),
		"rates":             rates,
	}}, http.StatusOK)
	return nil
}

func (a *App) saveBochkRates(ctx context.Context, userID sql.NullInt64, feed bochkFeed) (int, []string, error) {
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, nil, err
	}
	defer tx.Rollback()
	hkdID, err := ensureBochkCurrencyTx(ctx, tx, "HKD", "Hong Kong Dollar")
	if err != nil {
		return 0, nil, err
	}
	saved := 0
	skipped := []string{}
	for _, rate := range feed.Rates {
		currencyID, err := ensureBochkCurrencyTx(ctx, tx, rate.CurrencyCode, rate.Label)
		if err != nil || currencyID == hkdID || rate.CustomerBuy <= 0 {
			skipped = append(skipped, rate.CurrencyCode)
			continue
		}
		if _, err := saveCurrentExchangeRateTx(ctx, tx, currentExchangeRateInput{
			UserID:            userID,
			WorkspaceID:       sql.NullInt64{},
			FromCurrencyID:    currencyID,
			ToCurrencyID:      hkdID,
			Rate:              rate.CustomerBuy,
			RateDate:          feed.RateDate,
			Source:            bochkSource,
			SourceName:        bochkSourceName,
			SourceURL:         bochkSourceURL,
			ProviderRateType:  "customer_buy",
			ProviderSellRate:  rate.CustomerSell,
			ProviderBuyRate:   rate.CustomerBuy,
			ProviderUpdatedAt: feed.ProviderUpdatedAt,
			FetchedAt:         feed.FetchedAt,
			Note:              "BOCHK customer buy rate for " + rate.Label + " to HKD.",
		}); err != nil {
			return 0, nil, err
		}
		saved++
		if rate.CustomerSell <= 0 {
			skipped = append(skipped, rate.CurrencyCode)
			continue
		}
		if _, err := saveCurrentExchangeRateTx(ctx, tx, currentExchangeRateInput{
			UserID:            userID,
			WorkspaceID:       sql.NullInt64{},
			FromCurrencyID:    hkdID,
			ToCurrencyID:      currencyID,
			Rate:              1 / rate.CustomerSell,
			RateDate:          feed.RateDate,
			Source:            bochkSource,
			SourceName:        bochkSourceName,
			SourceURL:         bochkSourceURL,
			ProviderRateType:  "customer_sell",
			ProviderSellRate:  rate.CustomerSell,
			ProviderBuyRate:   rate.CustomerBuy,
			ProviderUpdatedAt: feed.ProviderUpdatedAt,
			FetchedAt:         feed.FetchedAt,
			Note:              "BOCHK customer sell rate for HKD to " + rate.Label + ".",
		}); err != nil {
			return 0, nil, err
		}
		saved++
	}
	return saved, skipped, tx.Commit()
}

func fetchBochkFeed(ctx context.Context) (bochkFeed, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, bochkSourceURL, nil)
	if err != nil {
		return bochkFeed{}, err
	}
	req.Header.Set("User-Agent", "BudgetCentre/1.0")
	req.Header.Set("Accept", "text/html")
	client := http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return bochkFeed{}, apiError("EXCHANGE_RATE_PROVIDER_FAILED", "BOCHK exchange rate endpoint is unavailable.", http.StatusBadGateway)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return bochkFeed{}, apiError("EXCHANGE_RATE_PROVIDER_FAILED", "BOCHK exchange rate endpoint is unavailable.", http.StatusBadGateway)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return bochkFeed{}, err
	}
	return parseBochkHTML(string(body))
}

type bochkCurrencyMeta struct {
	Name     string
	Symbol   string
	Decimals int
}

var bochkCurrencyMetaByCode = map[string]bochkCurrencyMeta{
	"AUD": {Name: "Australian Dollar", Symbol: "A$", Decimals: 2},
	"BND": {Name: "Brunei Dollar", Symbol: "B$", Decimals: 2},
	"CAD": {Name: "Canadian Dollar", Symbol: "C$", Decimals: 2},
	"CHF": {Name: "Swiss Franc", Symbol: "CHF", Decimals: 2},
	"CNH": {Name: "Offshore Chinese Yuan", Symbol: "CNH¥", Decimals: 2},
	"CNY": {Name: "Chinese Yuan", Symbol: "¥", Decimals: 2},
	"DKK": {Name: "Danish Krone", Symbol: "DKK", Decimals: 2},
	"EUR": {Name: "Euro", Symbol: "€", Decimals: 2},
	"GBP": {Name: "Pound Sterling", Symbol: "£", Decimals: 2},
	"HKD": {Name: "Hong Kong Dollar", Symbol: "HK$", Decimals: 2},
	"JPY": {Name: "Japanese Yen", Symbol: "¥", Decimals: 0},
	"NOK": {Name: "Norwegian Krone", Symbol: "NOK", Decimals: 2},
	"NZD": {Name: "New Zealand Dollar", Symbol: "NZ$", Decimals: 2},
	"SEK": {Name: "Swedish Krona", Symbol: "SEK", Decimals: 2},
	"SGD": {Name: "Singapore Dollar", Symbol: "S$", Decimals: 2},
	"THB": {Name: "Thai Baht", Symbol: "฿", Decimals: 2},
	"USD": {Name: "United States Dollar", Symbol: "$", Decimals: 2},
	"ZAR": {Name: "South African Rand", Symbol: "R", Decimals: 2},
}

func ensureBochkCurrencyTx(ctx context.Context, tx *sql.Tx, code, label string) (int64, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	meta := bochkCurrencyMetaByCode[code]
	if meta.Name == "" {
		meta = bochkCurrencyMeta{Name: label, Symbol: code, Decimals: 2}
	}
	var id int64
	err := tx.QueryRowContext(ctx, "SELECT id FROM currencies WHERE code = ? LIMIT 1", code).Scan(&id)
	if err == nil {
		_, err = tx.ExecContext(ctx, `UPDATE currencies
SET name = ?, symbol = ?, decimal_places = ?, is_enabled = 1,
    provider_source = 'bochk', is_api_managed = 1, provider_last_seen_at = UTC_TIMESTAMP()
WHERE id = ?`, meta.Name, meta.Symbol, meta.Decimals, id)
		return id, err
	}
	if err != sql.ErrNoRows {
		return 0, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO currencies
(code, name, symbol, decimal_places, is_enabled, provider_source, is_api_managed, provider_last_seen_at)
VALUES (?, ?, ?, ?, 1, 'bochk', 1, UTC_TIMESTAMP())`,
		code, meta.Name, meta.Symbol, meta.Decimals,
	)
	if err != nil {
		return 0, err
	}
	id, _ = res.LastInsertId()
	return id, nil
}

func (a *App) refreshBochkIfStale(ctx context.Context, maxAge time.Duration) error {
	unlock, locked, err := a.tryNamedLock(ctx, "budgetcentre_bochk_refresh")
	if err != nil || !locked {
		return err
	}
	defer unlock()
	due, err := a.bochkRefreshDue(ctx, maxAge)
	if err != nil || !due {
		return err
	}
	feed, err := fetchBochkFeed(ctx)
	if err != nil {
		return err
	}
	saved, skipped, err := a.saveBochkRates(ctx, sql.NullInt64{}, feed)
	if err != nil {
		return err
	}
	a.logger.Info("bochk rates refreshed", "saved", saved, "skipped", skipped, "rateDate", feed.RateDate, "providerUpdatedAt", feed.ProviderUpdatedAt)
	return nil
}

func (a *App) bochkRefreshDue(ctx context.Context, maxAge time.Duration) (bool, error) {
	var latest sql.NullTime
	err := a.db.QueryRowContext(ctx, "SELECT MAX(fetched_at) FROM exchange_rates WHERE source = 'bochk' AND workspace_id IS NULL").Scan(&latest)
	if err != nil {
		return false, err
	}
	if !latest.Valid {
		return true, nil
	}
	return time.Since(latest.Time.UTC()) >= maxAge, nil
}

func (a *App) tryNamedLock(ctx context.Context, name string) (func(), bool, error) {
	conn, err := a.db.Conn(ctx)
	if err != nil {
		return nil, false, err
	}
	var acquired int
	if err := conn.QueryRowContext(ctx, "SELECT GET_LOCK(?, 1)", name).Scan(&acquired); err != nil {
		_ = conn.Close()
		return nil, false, err
	}
	if acquired != 1 {
		_ = conn.Close()
		return func() {}, false, nil
	}
	return func() {
		_, _ = conn.ExecContext(context.Background(), "SELECT RELEASE_LOCK(?)", name)
		_ = conn.Close()
	}, true, nil
}

func parseBochkHTML(raw string) (bochkFeed, error) {
	text := normalizeHTMLText(raw)
	updatePattern := regexp.MustCompile(`資料更新於香港時間：\s*([0-9]{4})/([0-9]{2})/([0-9]{2})\s+([0-9]{2}:[0-9]{2}:[0-9]{2})`)
	matches := updatePattern.FindStringSubmatch(text)
	if len(matches) != 5 {
		return bochkFeed{}, apiError("EXCHANGE_RATE_PROVIDER_INVALID", "BOCHK exchange rate update time is missing.", http.StatusBadGateway)
	}
	updatedAt := matches[1] + "-" + matches[2] + "-" + matches[3] + " " + matches[4]
	feed := bochkFeed{ProviderUpdatedAt: updatedAt, RateDate: updatedAt[:10], FetchedAt: time.Now().UTC().Format("2006-01-02 15:04:05")}
	rowPattern := regexp.MustCompile(`(?is)<tr[^>]*>(.*?)</tr>`)
	cellPattern := regexp.MustCompile(`(?is)<t[dh][^>]*>(.*?)</t[dh]>`)
	for _, row := range rowPattern.FindAllStringSubmatch(raw, -1) {
		cells := []string{}
		for _, cell := range cellPattern.FindAllStringSubmatch(row[1], -1) {
			value := normalizeHTMLText(cell[1])
			if value != "" {
				cells = append(cells, value)
			}
		}
		if len(cells) != 3 || cells[0] == "貨幣" {
			continue
		}
		code := bochkCurrencyMap[cells[0]]
		sell, sellOK := bochkNumber(cells[1])
		buy, buyOK := bochkNumber(cells[2])
		if code == "" || !sellOK || !buyOK {
			continue
		}
		feed.Rates = append(feed.Rates, bochkRate{CurrencyCode: code, Label: cells[0], CustomerSell: sell, CustomerBuy: buy})
	}
	if len(feed.Rates) == 0 {
		return bochkFeed{}, apiError("EXCHANGE_RATE_PROVIDER_EMPTY", "BOCHK exchange rate table could not be parsed.", http.StatusBadGateway)
	}
	return feed, nil
}

func normalizeHTMLText(value string) string {
	tagPattern := regexp.MustCompile(`(?is)<[^>]+>`)
	text := tagPattern.ReplaceAllString(value, " ")
	text = html.UnescapeString(text)
	text = strings.ReplaceAll(text, "\u00a0", " ")
	spacePattern := regexp.MustCompile(`\s+`)
	return strings.TrimSpace(spacePattern.ReplaceAllString(text, " "))
}

func bochkNumber(value string) (float64, bool) {
	normalized := strings.ReplaceAll(strings.TrimSpace(value), ",", "")
	if normalized == "" {
		return 0, false
	}
	out, err := strconv.ParseFloat(normalized, 64)
	return out, err == nil
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}
