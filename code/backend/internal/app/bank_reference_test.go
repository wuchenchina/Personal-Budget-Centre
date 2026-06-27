package app

import (
	"sort"
	"testing"
)

var bankReferenceOfficialRateCurrencyCodes = []string{
	"CNY",
	"CNH",
	"USD",
	"GBP",
	"JPY",
	"AUD",
	"NZD",
	"CAD",
	"EUR",
	"CHF",
	"DKK",
	"NOK",
	"SEK",
	"SGD",
	"THB",
	"BND",
	"ZAR",
}

func TestParseBankReferenceHTMLUsesOfficialHKDRateCurrencies(t *testing.T) {
	html := `
<html><body>
<table>
<tr><th>貨幣</th><th>客戶賣出</th><th>客戶買入</th></tr>
<tr><td>人民幣(在岸)</td><td>1.149910</td><td>1.162370</td></tr>
<tr><td>人民幣(離岸)</td><td>1.147120</td><td>1.160510</td></tr>
<tr><td>美元</td><td>7.816900</td><td>7.867100</td></tr>
<tr><td>英鎊</td><td>10.266050</td><td>10.414070</td></tr>
<tr><td>日圓</td><td>0.048200</td><td>0.048860</td></tr>
<tr><td>澳元</td><td>5.384790</td><td>5.461050</td></tr>
<tr><td>紐元</td><td>4.406800</td><td>4.480000</td></tr>
<tr><td>加元</td><td>5.476770</td><td>5.560030</td></tr>
<tr><td>歐羅</td><td>8.861060</td><td>8.985270</td></tr>
<tr><td>瑞士法郎</td><td>9.617730</td><td>9.738260</td></tr>
<tr><td>丹麥克郎</td><td>1.185520</td><td>1.201630</td></tr>
<tr><td>挪威克郎</td><td>0.792250</td><td>0.808000</td></tr>
<tr><td>瑞典克郎</td><td>0.795930</td><td>0.812570</td></tr>
<tr><td>新加坡元</td><td>6.023690</td><td>6.069270</td></tr>
<tr><td>泰國銖</td><td>0.232080</td><td>0.240660</td></tr>
<tr><td>文萊元</td><td>6.023690</td><td>6.069270</td></tr>
<tr><td>南非蘭特</td><td>0.464900</td><td>0.481720</td></tr>
</table>
<p>資料更新於香港時間： 2026/06/24 02:42:55</p>
</body></html>`
	feed, err := parseBankReferenceHTML(html)
	if err != nil {
		t.Fatal(err)
	}
	if feed.ProviderUpdatedAt != "2026-06-24 02:42:55" || feed.RateDate != "2026-06-24" {
		t.Fatalf("unexpected feed date: %#v", feed)
	}
	want := bankReferenceOfficialRateCurrencyCodes
	if len(feed.Rates) != len(want) {
		t.Fatalf("rate count = %d, want %d", len(feed.Rates), len(want))
	}
	for i, code := range want {
		if feed.Rates[i].CurrencyCode != code {
			t.Fatalf("rate %d code = %s, want %s", i, feed.Rates[i].CurrencyCode, code)
		}
	}
	for _, rate := range feed.Rates {
		if rate.CurrencyCode == "TWD" || rate.CurrencyCode == "MOP" {
			t.Fatalf("bank reference HKD feed must not include unsupported legacy currency %s", rate.CurrencyCode)
		}
	}
}

func TestBankReferenceCurrencyMetadataMatchesOfficialHKDFeed(t *testing.T) {
	mapCodes := make([]string, 0, len(bankReferenceCurrencyMap))
	for _, code := range bankReferenceCurrencyMap {
		mapCodes = append(mapCodes, code)
	}
	assertSameCurrencySet(t, "bank reference parser currency map", mapCodes, bankReferenceOfficialRateCurrencyCodes)

	metaCodes := make([]string, 0, len(bankReferenceCurrencyMetaByCode))
	for code := range bankReferenceCurrencyMetaByCode {
		metaCodes = append(metaCodes, code)
	}
	assertSameCurrencySet(t, "bank reference metadata", metaCodes, append([]string{"HKD"}, bankReferenceOfficialRateCurrencyCodes...))
}

func assertSameCurrencySet(t *testing.T, label string, got, want []string) {
	t.Helper()
	got = append([]string(nil), got...)
	want = append([]string(nil), want...)
	sort.Strings(got)
	sort.Strings(want)
	if len(got) != len(want) {
		t.Fatalf("%s count = %d, want %d: got=%v want=%v", label, len(got), len(want), got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s currencies = %v, want %v", label, got, want)
		}
	}
}
