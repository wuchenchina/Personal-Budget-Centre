package app

import "testing"

func TestLoanIncomeRecordValuesCopiesRequiredExpenseFields(t *testing.T) {
	expense := bookkeepingRecordValues{
		transactionType:        "expense",
		recordDate:             "2026-07-11",
		orderReference:         "ORDER-1001",
		details:                "Original expense",
		categoryLabel:          "Meals",
		sourceAccountName:      "ICBC",
		destinationAccountName: "Destination account",
		currencyID:             42,
		amount:                 125.5,
		rate:                   1.234567,
		destinationCurrencyID:  99,
		destinationAmount:      77.7,
		destinationRate:        0.987654,
		remark:                 "Original remark",
		sortOrder:              17,
	}

	income := loanIncomeRecordValues(expense, "借款")

	if income.transactionType != "income" {
		t.Fatalf("transaction type = %q, want income", income.transactionType)
	}
	if income.details != "借款" {
		t.Fatalf("details = %q, want loan details", income.details)
	}
	if income.recordDate != expense.recordDate {
		t.Fatalf("record date = %#v, want %#v", income.recordDate, expense.recordDate)
	}
	if income.sourceAccountName != expense.sourceAccountName {
		t.Fatalf("source account = %#v, want %#v", income.sourceAccountName, expense.sourceAccountName)
	}
	if income.currencyID != expense.currencyID || income.amount != expense.amount || income.rate != expense.rate {
		t.Fatalf("income money values = currency %d amount %f rate %f, want expense values", income.currencyID, income.amount, income.rate)
	}
	if income.sortOrder != expense.sortOrder {
		t.Fatalf("sort order = %d, want %d", income.sortOrder, expense.sortOrder)
	}
	if income.orderReference != nil || income.categoryLabel != nil || income.destinationAccountName != nil || income.remark != nil {
		t.Fatalf("generated income should not copy unrelated expense fields: %#v", income)
	}
	if income.destinationCurrencyID != nil || income.destinationAmount != nil || income.destinationRate != nil {
		t.Fatalf("generated income should not copy destination fields: %#v", income)
	}
}

func TestBookkeepingLoanDetailsAreServerControlledAndLocalized(t *testing.T) {
	cases := map[string]string{
		"en-US": "Loan",
		"sc":    "借款",
		"tc":    "借款",
		"ja":    "借入",
		"fr":    "Prêt",
		"ru":    "Заём",
		"de":    "Darlehen",
		"other": "借款",
	}

	for language, want := range cases {
		if got := bookkeepingLoanDetails(language); got != want {
			t.Errorf("bookkeepingLoanDetails(%q) = %q, want %q", language, got, want)
		}
	}
}
