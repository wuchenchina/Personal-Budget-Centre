package exportpdf

import (
	"math"
	"sort"
	"strconv"
	"strings"
)

type currencyTotal struct {
	Currency       string
	AmountOriginal float64
	AmountBase     float64
}

type effectiveAmounts struct {
	BudgetBase                 float64
	EstimatedBase              float64
	VarianceBase               float64
	EstimatedTransactionTotals []currencyTotal
}

type budgetParticipant struct {
	ID   int64
	Name string
}

type pdfSplitParticipant struct {
	ParticipantID   int64
	IsIncluded      bool
	ShareRatio      *float64
	ShareAmountBase *float64
}

type itemSplit struct {
	PaidByParticipantID int64
	SplitType           string
	Note                string
	Participants        []pdfSplitParticipant
}

type participantSummary struct {
	Participant budgetParticipant
	PaidBase    float64
	ShareBase   float64
	BalanceBase float64
}

type settlementInstruction struct {
	FromParticipantID int64
	ToParticipantID   int64
	AmountBase        float64
}

func sectionWithPaymentColumn(section Section, ctx pdfTableContext) Section {
	for _, column := range section.Columns {
		if column.Key == "paid_by" {
			return section
		}
	}
	insert := 1
	for index, column := range section.Columns {
		if column.Key == "category" {
			insert = index + 1
			break
		}
	}
	column := Column{Key: "paid_by", Label: localizedColumnLabel("paid_by", "Paid By", ctx), Align: "left", WidthPercent: 16, DataType: "text"}
	section.Columns = append(section.Columns, Column{})
	copy(section.Columns[insert+1:], section.Columns[insert:])
	section.Columns[insert] = column
	return section
}

func sectionWithPricingColumns(section Section, hasPaymentColumn bool, ctx pdfTableContext) Section {
	hasUnit := false
	hasQuantity := false
	for _, column := range section.Columns {
		hasUnit = hasUnit || column.Key == "unit_price"
		hasQuantity = hasQuantity || column.Key == "quantity"
	}
	insert := len(section.Columns)
	for index, column := range section.Columns {
		if column.Key == "amount" {
			insert = index
			break
		}
	}
	added := []Column{}
	if !hasUnit {
		added = append(added, Column{Key: "unit_price", Label: localizedColumnLabel("unit_price", "Unit Price", ctx), Align: "right", WidthPercent: 11, DataType: "money"})
	}
	if !hasQuantity {
		added = append(added, Column{Key: "quantity", Label: localizedColumnLabel("quantity", "Quantity", ctx), Align: "right", WidthPercent: 8, DataType: "text"})
	}
	if len(added) > 0 {
		next := append([]Column{}, section.Columns[:insert]...)
		next = append(next, added...)
		next = append(next, section.Columns[insert:]...)
		section.Columns = next
	}
	widths := map[string]float64{
		"transaction_details": 32,
		"category":            16,
		"unit_price":          13,
		"quantity":            8,
		"amount":              14,
		"remark":              17,
	}
	if hasPaymentColumn {
		widths = map[string]float64{"transaction_details": 29, "category": 14, "paid_by": 11, "unit_price": 11, "quantity": 8, "amount": 13, "remark": 14}
	}
	for index := range section.Columns {
		if width := widths[section.Columns[index].Key]; width > 0 {
			section.Columns[index].WidthPercent = width
		}
	}
	return section
}

func transactionColumnText(tx map[string]any, key, baseCurrency string, participants []budgetParticipant, ctx pdfTableContext) string {
	switch key {
	case "transaction_details":
		return stringValue(tx["details"])
	case "category":
		return stringValue(tx["category"])
	case "paid_by":
		return transactionPaymentText(tx, participants, baseCurrency, ctx)
	case "unit_price":
		return pricingUnitPriceText(tx, baseCurrency)
	case "quantity":
		return pricingQuantityText(tx)
	case "amount":
		return transactionAmountText(tx, baseCurrency)
	case "remark":
		return stringValue(tx["remark"])
	default:
		return ""
	}
}

func transactionPaymentText(tx map[string]any, participants []budgetParticipant, baseCurrency string, ctx pdfTableContext) string {
	payments := transactionPaymentsFromMap(tx)
	currency := stringDefault(stringValue(tx["currency"]), baseCurrency)
	if len(payments) > 0 {
		out := []string{}
		for _, payment := range payments {
			out = append(out, participantName(int64Value(payment["participantId"]), participants, ctx)+": "+money(currency, floatValue(payment["amountOriginal"])))
		}
		return strings.Join(out, "; ")
	}
	paidBy := int64Value(tx["paidByParticipantId"])
	if paidBy <= 0 {
		return ""
	}
	return participantName(paidBy, participants, ctx)
}

func transactionAmountText(tx map[string]any, baseCurrency string) string {
	currency := stringDefault(stringValue(tx["currency"]), baseCurrency)
	text := money(currency, floatValue(tx["amountOriginal"]))
	if currency != baseCurrency {
		text += "\n" + money(baseCurrency, floatValue(tx["amountBase"]))
	}
	if refCurrency := stringValue(tx["referenceCurrency"]); refCurrency != "" && tx["referenceAmountOriginal"] != nil {
		text += "\nRef " + money(refCurrency, floatValue(tx["referenceAmountOriginal"]))
	}
	return text
}

func pricingUnitPriceText(tx map[string]any, baseCurrency string) string {
	unitPrice := floatValue(tx["amountOriginal"])
	if pricing := mapValue(tx, "pricingConfig"); boolValue(pricing["enabled"]) {
		if value, ok := pricingNumber(pricing, "unitPrice", "unit_price"); ok {
			unitPrice = value
		}
	}
	return money(stringDefault(stringValue(tx["currency"]), baseCurrency), unitPrice)
}

func pricingQuantityText(tx map[string]any) string {
	quantity := 1.0
	if pricing := mapValue(tx, "pricingConfig"); boolValue(pricing["enabled"]) {
		if value, ok := pricingNumber(pricing, "quantity"); ok {
			quantity = value
		}
	}
	return strconv.FormatFloat(quantity, 'f', 2, 64)
}

func pricingNumber(config map[string]any, keys ...string) (float64, bool) {
	for _, key := range keys {
		value, ok := config[key]
		if !ok || value == nil {
			continue
		}
		switch v := value.(type) {
		case string:
			if strings.TrimSpace(v) == "" {
				continue
			}
		}
		return math.Max(0, floatValue(value)), true
	}
	return 0, false
}

func budgetParticipants(budget map[string]any) []budgetParticipant {
	out := []budgetParticipant{}
	for _, raw := range anyList(budget["participants"]) {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := int64Value(item["id"])
		name := stringValue(item["name"])
		if id > 0 && name != "" {
			out = append(out, budgetParticipant{ID: id, Name: name})
		}
	}
	return out
}

func participantName(id int64, participants []budgetParticipant, ctx pdfTableContext) string {
	for _, participant := range participants {
		if participant.ID == id {
			return participant.Name
		}
	}
	return ctx.BudgetLabels["noParticipant"]
}

func effectiveItemAmounts(item map[string]any, transactions []any) effectiveAmounts {
	multiplier := budgetItemAmountMultiplier(item)
	totals := transactionCurrencyTotalsForItem(item, transactions)
	for index := range totals {
		totals[index].AmountOriginal = roundMoney(totals[index].AmountOriginal * multiplier)
		totals[index].AmountBase = roundMoney(totals[index].AmountBase * multiplier)
	}
	estimatedBase := 0.0
	for _, total := range totals {
		estimatedBase += total.AmountBase
	}
	estimatedBase = roundMoney(estimatedBase)
	budgetLeg := mapValue(item, "budget")
	storedBudgetBase := floatValue(budgetLeg["amountBase"])
	budgetOriginal := floatValue(budgetLeg["amountOriginal"])
	budgetBase := roundMoney(storedBudgetBase * multiplier)
	if budgetOriginal == 0 && storedBudgetBase == 0 && len(totals) > 0 {
		budgetBase = estimatedBase
	}
	return effectiveAmounts{
		BudgetBase:                 budgetBase,
		EstimatedBase:              estimatedBase,
		VarianceBase:               roundMoney(budgetBase - estimatedBase),
		EstimatedTransactionTotals: totals,
	}
}

func transactionCurrencyTotalsForItem(item map[string]any, transactions []any) []currencyTotal {
	totals := map[string]currencyTotal{}
	for _, raw := range transactionsForItem(item, transactions) {
		tx, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		currency := stringValue(tx["currency"])
		if currency == "" {
			continue
		}
		current := totals[currency]
		current.Currency = currency
		current.AmountOriginal += floatValue(tx["amountOriginal"])
		current.AmountBase += floatValue(tx["amountBase"])
		totals[currency] = current
	}
	keys := sortedKeys(totals)
	out := make([]currencyTotal, 0, len(keys))
	for _, key := range keys {
		total := totals[key]
		total.AmountOriginal = roundMoney(total.AmountOriginal)
		total.AmountBase = roundMoney(total.AmountBase)
		out = append(out, total)
	}
	return out
}

func transactionsForItem(item map[string]any, transactions []any) []any {
	categoryID := int64Value(item["categoryId"])
	label := stringValue(item["label"])
	out := []any{}
	for _, raw := range transactions {
		tx, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		txCategoryID := int64Value(tx["categoryId"])
		if categoryID > 0 {
			if txCategoryID == categoryID {
				out = append(out, raw)
			}
			continue
		}
		if txCategoryID == 0 && stringValue(tx["category"]) == label {
			out = append(out, raw)
		}
	}
	return out
}

func budgetItemAmountMultiplier(item map[string]any) float64 {
	split := mapValue(item, "split")
	if stringValue(split["splitType"]) != "per_person" {
		return 1
	}
	count := 0
	for _, raw := range anyList(split["participants"]) {
		participant, ok := raw.(map[string]any)
		if ok && boolDefault(participant["isIncluded"], true) {
			count++
		}
	}
	if count <= 0 {
		return 1
	}
	return float64(count)
}

func effectiveTotal(budget map[string]any, key string) float64 {
	total := 0.0
	transactions := anyList(budget["transactions"])
	for _, raw := range anyList(budget["items"]) {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		effective := effectiveItemAmounts(item, transactions)
		switch key {
		case "budgetBase":
			total += effective.BudgetBase
		case "estimatedBase":
			total += effective.EstimatedBase
		case "varianceBase":
			total += effective.VarianceBase
		}
	}
	return roundMoney(total)
}

func itemSplitForItem(item map[string]any, participants []budgetParticipant) itemSplit {
	raw := mapValue(item, "split")
	if len(raw) == 0 {
		return defaultEqualSplit(participants)
	}
	splitType := enumString(stringValue(raw["splitType"]), []string{"equal", "personal", "individual", "per_person", "custom_amount", "custom_share", "excluded"}, "equal")
	out := itemSplit{PaidByParticipantID: int64Value(raw["paidByParticipantId"]), SplitType: splitType, Note: stringValue(raw["note"])}
	participantIDs := map[int64]bool{}
	for _, participant := range participants {
		participantIDs[participant.ID] = true
	}
	for _, item := range anyList(raw["participants"]) {
		participant, ok := item.(map[string]any)
		if !ok {
			continue
		}
		participantID := int64Value(participant["participantId"])
		if participantID <= 0 || !participantIDs[participantID] {
			continue
		}
		var ratio *float64
		if participant["shareRatio"] != nil {
			value := floatValue(participant["shareRatio"])
			ratio = &value
		}
		var amount *float64
		if participant["shareAmountBase"] != nil {
			value := floatValue(participant["shareAmountBase"])
			amount = &value
		}
		out.Participants = append(out.Participants, pdfSplitParticipant{
			ParticipantID:   participantID,
			IsIncluded:      boolDefault(participant["isIncluded"], true),
			ShareRatio:      ratio,
			ShareAmountBase: amount,
		})
	}
	if splitType == "personal" && len(out.Participants) == 0 && out.PaidByParticipantID > 0 {
		out.Participants = append(out.Participants, pdfSplitParticipant{ParticipantID: out.PaidByParticipantID, IsIncluded: true})
	}
	if splitType != "excluded" && len(out.Participants) == 0 {
		fallback := defaultEqualSplit(participants)
		fallback.PaidByParticipantID = out.PaidByParticipantID
		fallback.SplitType = splitType
		fallback.Note = out.Note
		return fallback
	}
	return out
}

func defaultEqualSplit(participants []budgetParticipant) itemSplit {
	out := itemSplit{SplitType: "equal"}
	if len(participants) > 0 {
		out.PaidByParticipantID = participants[0].ID
	}
	for _, participant := range participants {
		out.Participants = append(out.Participants, pdfSplitParticipant{ParticipantID: participant.ID, IsIncluded: true})
	}
	return out
}

func includedSplitParticipants(split itemSplit) []pdfSplitParticipant {
	out := []pdfSplitParticipant{}
	for _, participant := range split.Participants {
		if participant.IsIncluded {
			out = append(out, participant)
		}
	}
	return out
}

func sharesForSplit(split itemSplit, participants []pdfSplitParticipant, amountBase float64) map[int64]float64 {
	shares := map[int64]float64{}
	switch split.SplitType {
	case "custom_amount":
		for _, participant := range participants {
			value := 0.0
			if participant.ShareAmountBase != nil {
				value = math.Max(0, *participant.ShareAmountBase)
			}
			shares[participant.ParticipantID] = roundMoney(value)
		}
		return shares
	case "custom_share":
		totalRatio := 0.0
		for _, participant := range participants {
			if participant.ShareRatio != nil {
				totalRatio += math.Max(0, *participant.ShareRatio)
			}
		}
		if totalRatio > 0 {
			for _, participant := range participants {
				ratio := 0.0
				if participant.ShareRatio != nil {
					ratio = math.Max(0, *participant.ShareRatio)
				}
				shares[participant.ParticipantID] = roundMoney(amountBase * ratio / totalRatio)
			}
			return shares
		}
	case "individual":
		explicit := 0.0
		flexible := 0
		for _, participant := range participants {
			if participant.ShareAmountBase != nil {
				explicit += math.Max(0, *participant.ShareAmountBase)
			} else {
				flexible++
			}
		}
		fallback := 0.0
		if flexible > 0 {
			fallback = roundMoney(math.Max(0, amountBase-explicit) / float64(flexible))
		}
		for _, participant := range participants {
			value := fallback
			if participant.ShareAmountBase != nil {
				value = math.Max(0, *participant.ShareAmountBase)
			}
			shares[participant.ParticipantID] = roundMoney(value)
		}
		return shares
	}
	equal := 0.0
	if len(participants) > 0 {
		equal = roundMoney(amountBase / float64(len(participants)))
	}
	for _, participant := range participants {
		shares[participant.ParticipantID] = equal
	}
	return shares
}

func (r *pdfRenderer) groupBudgetSectionsHTML(budget map[string]any, period string, ctx pdfTableContext) string {
	if stringValue(budget["participantMode"]) != "group" {
		return ""
	}
	participants := budgetParticipants(budget)
	if len(participants) == 0 {
		return ""
	}
	baseCurrency := stringValue(budget["baseCurrency"])
	summary := groupBudgetSummary(budget, participants)
	out := ""
	out += r.renderTable(localizedSection(Section{Key: "group_split_details", Title: "Group Split Details", Columns: []Column{
		{Key: "category", Label: "Category", Align: "left", WidthPercent: 24, DataType: "text"},
		{Key: "paid_by", Label: "Paid By", Align: "left", WidthPercent: 14, DataType: "text"},
		{Key: "split_type", Label: "Split Type", Align: "left", WidthPercent: 16, DataType: "text"},
		{Key: "participants", Label: "Participants", Align: "left", WidthPercent: 22, DataType: "text"},
		{Key: "amount", Label: "Amount", Align: "right", WidthPercent: 14, DataType: "money"},
		{Key: "remark", Label: "Remark", Align: "left", WidthPercent: 10, DataType: "text"},
	}}, ctx), period, groupSplitRows(budget, participants, baseCurrency, ctx), nil, tableText("No split details", ctx.BudgetLabels["emptyGroupSplitDetails"], ctx), datePrefix(ctx))
	out += r.renderTable(localizedSection(Section{Key: "group_expense_summary", Title: "Group Expense Summary", Columns: []Column{
		{Key: "metric", Label: "Metric", Align: "left", WidthPercent: 70, DataType: "text"},
		{Key: "amount", Label: "Amount", Align: "right", WidthPercent: 30, DataType: "money"},
	}}, ctx), period, [][]string{
		{tableText("Shared expense", "Shared expense", ctx), money(baseCurrency, summary.SharedExpenseBase)},
		{tableText("Personal expense", "Personal expense", ctx), money(baseCurrency, summary.PersonalExpenseBase)},
	}, []string{tableText("Total", ctx.BudgetLabels["total"], ctx), money(baseCurrency, summary.SharedExpenseBase+summary.PersonalExpenseBase)}, "", datePrefix(ctx))
	settlementRows := [][]string{}
	for _, settlement := range summary.Settlements {
		settlementRows = append(settlementRows, []string{participantName(settlement.FromParticipantID, participants, ctx), participantName(settlement.ToParticipantID, participants, ctx), money(baseCurrency, settlement.AmountBase)})
	}
	out += r.renderTable(localizedSection(Section{Key: "group_settlement_summary", Title: "Group Settlement Summary", Columns: []Column{
		{Key: "participant", Label: "Participant", Align: "left", WidthPercent: 34, DataType: "text"},
		{Key: "paid", Label: "Paid", Align: "right", WidthPercent: 22, DataType: "money"},
		{Key: "share", Label: "Share", Align: "right", WidthPercent: 22, DataType: "money"},
		{Key: "balance", Label: "Balance", Align: "right", WidthPercent: 22, DataType: "money"},
	}}, ctx), period, participantSummaryRows(summary.Participants, baseCurrency), []string{tableText("Total", ctx.BudgetLabels["total"], ctx), money(baseCurrency, summary.PaidTotalBase), money(baseCurrency, summary.ShareTotalBase), money(baseCurrency, 0)}, "", datePrefix(ctx))
	out += r.renderTable(localizedSection(Section{Key: "settlement_instructions", Title: "Settlement Instructions", Columns: []Column{
		{Key: "from", Label: "From", Align: "left", WidthPercent: 38, DataType: "text"},
		{Key: "to", Label: "To", Align: "left", WidthPercent: 38, DataType: "text"},
		{Key: "amount", Label: "Amount", Align: "right", WidthPercent: 24, DataType: "money"},
	}}, ctx), period, settlementRows, nil, tableText("No settlement needed", ctx.BudgetLabels["emptySettlementInstructions"], ctx), datePrefix(ctx))
	return out
}

func groupSplitRows(budget map[string]any, participants []budgetParticipant, baseCurrency string, ctx pdfTableContext) [][]string {
	rows := [][]string{}
	transactions := anyList(budget["transactions"])
	for _, raw := range anyList(budget["items"]) {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		split := itemSplitForItem(item, participants)
		effective := effectiveItemAmounts(item, transactions)
		rows = append(rows, []string{
			itemLabel(item),
			participantName(split.PaidByParticipantID, participants, ctx),
			ctx.SplitTypes[split.SplitType],
			splitParticipantText(split, participants, baseCurrency, effective.BudgetBase, ctx),
			money(baseCurrency, effective.BudgetBase),
			split.Note,
		})
	}
	return rows
}

func splitParticipantText(split itemSplit, participants []budgetParticipant, baseCurrency string, amountBase float64, ctx pdfTableContext) string {
	included := includedSplitParticipants(split)
	shares := sharesForSplit(split, included, amountBase)
	lines := []string{}
	for _, participant := range included {
		name := participantName(participant.ParticipantID, participants, ctx)
		shareText := money(baseCurrency, shares[participant.ParticipantID])
		if split.SplitType == "custom_share" && participant.ShareRatio != nil {
			shareText += " (" + strconv.FormatFloat(*participant.ShareRatio, 'f', -1, 64) + ")"
		}
		lines = append(lines, name+": "+shareText)
	}
	return strings.Join(lines, "\n")
}

type groupSummary struct {
	PaidTotalBase       float64
	ShareTotalBase      float64
	SharedExpenseBase   float64
	PersonalExpenseBase float64
	Participants        []participantSummary
	Settlements         []settlementInstruction
}

func groupBudgetSummary(budget map[string]any, participants []budgetParticipant) groupSummary {
	totals := map[int64]participantSummary{}
	for _, participant := range participants {
		totals[participant.ID] = participantSummary{Participant: participant}
	}
	transactions := anyList(budget["transactions"])
	sharedExpense := 0.0
	personalExpense := 0.0
	for _, raw := range anyList(budget["items"]) {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		amountBase := effectiveItemAmounts(item, transactions).BudgetBase
		split := itemSplitForItem(item, participants)
		included := includedSplitParticipants(split)
		if split.SplitType == "excluded" || len(included) == 0 {
			continue
		}
		if split.SplitType == "individual" || split.SplitType == "per_person" {
			shares := sharesForSplit(split, included, amountBase)
			for participantID, share := range shares {
				entry := totals[participantID]
				entry.PaidBase = roundMoney(entry.PaidBase + share)
				entry.ShareBase = roundMoney(entry.ShareBase + share)
				totals[participantID] = entry
				personalExpense = roundMoney(personalExpense + share)
			}
			continue
		}
		paidBy := split.PaidByParticipantID
		if paidBy > 0 {
			entry := totals[paidBy]
			entry.PaidBase = roundMoney(entry.PaidBase + amountBase)
			totals[paidBy] = entry
		}
		for participantID, share := range sharesForSplit(split, included, amountBase) {
			entry := totals[participantID]
			entry.ShareBase = roundMoney(entry.ShareBase + share)
			totals[participantID] = entry
		}
		if split.SplitType == "personal" {
			personalExpense = roundMoney(personalExpense + amountBase)
		} else {
			sharedExpense = roundMoney(sharedExpense + amountBase)
		}
	}
	summaries := []participantSummary{}
	paidTotal := 0.0
	shareTotal := 0.0
	for _, participant := range participants {
		entry := totals[participant.ID]
		entry.BalanceBase = roundMoney(entry.PaidBase - entry.ShareBase)
		summaries = append(summaries, entry)
		paidTotal = roundMoney(paidTotal + entry.PaidBase)
		shareTotal = roundMoney(shareTotal + entry.ShareBase)
	}
	return groupSummary{
		PaidTotalBase:       paidTotal,
		ShareTotalBase:      shareTotal,
		SharedExpenseBase:   sharedExpense,
		PersonalExpenseBase: personalExpense,
		Participants:        summaries,
		Settlements:         settlementsFromSummaries(summaries),
	}
}

func participantSummaryRows(summaries []participantSummary, baseCurrency string) [][]string {
	rows := make([][]string, 0, len(summaries))
	for _, summary := range summaries {
		rows = append(rows, []string{
			summary.Participant.Name,
			money(baseCurrency, summary.PaidBase),
			money(baseCurrency, summary.ShareBase),
			money(baseCurrency, summary.BalanceBase),
		})
	}
	return rows
}

func settlementsFromSummaries(summaries []participantSummary) []settlementInstruction {
	type balance struct {
		id     int64
		amount float64
	}
	debtors := []balance{}
	creditors := []balance{}
	for _, summary := range summaries {
		if summary.BalanceBase < -0.005 {
			debtors = append(debtors, balance{id: summary.Participant.ID, amount: -summary.BalanceBase})
		}
		if summary.BalanceBase > 0.005 {
			creditors = append(creditors, balance{id: summary.Participant.ID, amount: summary.BalanceBase})
		}
	}
	sort.Slice(debtors, func(i, j int) bool { return debtors[i].amount > debtors[j].amount })
	sort.Slice(creditors, func(i, j int) bool { return creditors[i].amount > creditors[j].amount })
	out := []settlementInstruction{}
	i, j := 0, 0
	for i < len(debtors) && j < len(creditors) {
		amount := roundMoney(math.Min(debtors[i].amount, creditors[j].amount))
		if amount > 0 {
			out = append(out, settlementInstruction{FromParticipantID: debtors[i].id, ToParticipantID: creditors[j].id, AmountBase: amount})
		}
		debtors[i].amount = roundMoney(debtors[i].amount - amount)
		creditors[j].amount = roundMoney(creditors[j].amount - amount)
		if debtors[i].amount <= 0.005 {
			i++
		}
		if creditors[j].amount <= 0.005 {
			j++
		}
	}
	return out
}

func transactionPaymentsFromMap(tx map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, raw := range anyList(tx["payments"]) {
		payment, ok := raw.(map[string]any)
		if ok && int64Value(payment["participantId"]) > 0 {
			out = append(out, payment)
		}
	}
	return out
}

func overallInstallmentRows(budget map[string]any, ctx pdfTableContext) [][]string {
	plan := mapValue(budget, "overallInstallmentPlan")
	amounts := floatList(plan["periodAmounts"])
	progress := boolList(plan["periodProgress"])
	remarks := stringList(plan["periodRemarks"])
	targetTotal := effectiveTotal(budget, "budgetBase")
	if targetTotal <= 0 {
		return [][]string{}
	}
	if len(amounts) == 0 {
		amounts = []float64{targetTotal}
	}
	baseCurrency := stringValue(budget["baseCurrency"])
	rows := make([][]string, 0, len(amounts))
	assignedAmount := 0.0
	for index, amount := range amounts {
		done := ""
		if index < len(progress) && progress[index] {
			done = "X"
		}
		remark := ""
		if index < len(remarks) {
			remark = remarks[index]
		}
		assignedAmount = roundMoney(assignedAmount + amount)
		rows = append(rows, []string{
			strconv.Itoa(index + 1),
			installmentPeriodLabel(budget, nil, index),
			targetWithRemaining(baseCurrency, targetTotal, math.Max(0, targetTotal-assignedAmount), ctx),
			money(baseCurrency, amount),
			done,
			remark,
		})
	}
	return rows
}

func signatureFields(row map[string]any, options Options) [][2]string {
	labels := signatureMetaLabels(options.SignatureLabelLanguage)
	fields := [][2]string{}
	if boolDefault(row["showName"], true) && stringValue(row["displayName"]) != "" {
		fields = append(fields, [2]string{labels["participant"], stringValue(row["displayName"])})
	}
	if boolDefault(row["showRole"], true) && stringValue(row["roleLabel"]) != "" {
		fields = append(fields, [2]string{labels["capacity"], stringValue(row["roleLabel"])})
	}
	if boolValue(row["showPosition"]) && stringValue(row["position"]) != "" {
		fields = append(fields, [2]string{labels["position"], stringValue(row["position"])})
	}
	if boolValue(row["showEmail"]) && stringValue(row["email"]) != "" {
		fields = append(fields, [2]string{labels["email"], stringValue(row["email"])})
	}
	for _, raw := range anyList(row["customFields"]) {
		field, ok := raw.(map[string]any)
		if !ok || !boolDefault(field["show"], true) {
			continue
		}
		label := stringValue(field["label"])
		value := stringValue(field["value"])
		if label != "" || value != "" {
			fields = append(fields, [2]string{label, value})
		}
	}
	if boolDefault(row["showDateTime"], true) {
		fields = append(fields, [2]string{labels["dateTime"], stringValue(row["signedAt"])})
	}
	return fields
}

func signatureMetaLabels(languages []string) map[string]string {
	keys := []string{"participant", "capacity", "position", "email", "dateTime"}
	out := map[string]string{}
	for _, key := range keys {
		out[key] = joinLabels(languages, func(lang string) string {
			labels := map[string]map[string]string{
				"en": {"participant": "Name", "capacity": "Capacity", "position": "Position", "email": "Email", "dateTime": "Date & Time"},
				"sc": {"participant": "姓名", "capacity": "身份", "position": "职务", "email": "电子邮件", "dateTime": "日期及时间"},
				"tc": {"participant": "姓名", "capacity": "身份", "position": "職務", "email": "電子郵件", "dateTime": "日期及時間"},
			}
			if value := labels[lang][key]; value != "" {
				return value
			}
			return labels["en"][key]
		})
	}
	return out
}

func signatureSectionTitle(languages []string) string {
	return joinLabels(languages, func(lang string) string {
		switch lang {
		case "sc":
			return "制表及复核记录"
		case "tc":
			return "製表及覆核記錄"
		default:
			return "Preparation & Review Record"
		}
	})
}

func signatureLabel(mode string, languages []string) string {
	return joinLabels(languages, func(lang string) string {
		confirmation := "Confirmation"
		signature := "Signature"
		switch lang {
		case "sc":
			confirmation, signature = "确认", "签署"
		case "tc":
			confirmation, signature = "確認", "簽署"
		}
		switch SignatureLabelMode(mode) {
		case "confirmation":
			return confirmation
		case "signature":
			return signature
		default:
			return confirmation + " " + signature
		}
	})
}
