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
	workspaceID := int64Value(input["workspaceId"])
	if err := a.requireWorkspaceRole(r.Context(), workspaceID, s.UserID, "owner", "admin", "editor"); err != nil {
		return err
	}
	feed, err := fetchBochkFeed(r.Context())
	if err != nil {
		return err
	}
	hkdID, err := a.requiredCurrencyID(r.Context(), "HKD")
	if err != nil {
		return err
	}
	saved, skipped, err := a.saveBochkRates(r.Context(), s.UserID, workspaceID, hkdID, feed)
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

func (a *App) saveBochkRates(ctx context.Context, userID, workspaceID, hkdID int64, feed bochkFeed) (int, []string, error) {
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "DELETE FROM exchange_rates WHERE workspace_id = ? AND source = ? AND rate_date = ?", workspaceID, bochkSource, feed.RateDate); err != nil {
		return 0, nil, err
	}
	saved := 0
	skipped := []string{}
	for _, rate := range feed.Rates {
		currencyID, err := a.currencyID(ctx, rate.CurrencyCode)
		if err != nil || !currencyID.Valid || currencyID.Int64 == hkdID {
			skipped = append(skipped, rate.CurrencyCode)
			continue
		}
		if err := insertBochkRate(ctx, tx, userID, workspaceID, currencyID.Int64, hkdID, rate.CustomerBuy, "customer_buy", rate, feed, "BOCHK customer buy rate for "+rate.Label+" to HKD."); err != nil {
			return 0, nil, err
		}
		saved++
		if rate.CustomerSell <= 0 {
			skipped = append(skipped, rate.CurrencyCode)
			continue
		}
		if err := insertBochkRate(ctx, tx, userID, workspaceID, hkdID, currencyID.Int64, 1/rate.CustomerSell, "customer_sell", rate, feed, "BOCHK customer sell rate for HKD to "+rate.Label+"."); err != nil {
			return 0, nil, err
		}
		saved++
	}
	return saved, skipped, tx.Commit()
}

func insertBochkRate(ctx context.Context, tx *sql.Tx, userID, workspaceID, fromID, toID int64, value float64, rateType string, rate bochkRate, feed bochkFeed, note string) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO exchange_rates
(user_id, workspace_id, from_currency_id, to_currency_id, rate, rate_date, source, source_name, source_url,
provider_rate_type, provider_sell_rate, provider_buy_rate, provider_updated_at, fetched_at, note)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		userID, workspaceID, fromID, toID, value, feed.RateDate, bochkSource, bochkSourceName, bochkSourceURL,
		rateType, rate.CustomerSell, rate.CustomerBuy, feed.ProviderUpdatedAt, feed.FetchedAt, note,
	)
	return err
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
