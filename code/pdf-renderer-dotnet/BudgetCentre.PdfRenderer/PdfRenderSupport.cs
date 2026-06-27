using System.Globalization;
using System.Text;
using System.Text.Json;

namespace BudgetCentre.PdfRenderer;

public sealed partial class PdfExportRenderer
{
    private static decimal RoundMoney(decimal value)
    {
        return Math.Abs(value) < 0.005m ? 0 : Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static string ItemLabel(BudgetItemRow item) => string.IsNullOrWhiteSpace(item.Category) ? item.Label : item.Category;

    private static string ParticipantName(long? id, List<BudgetParticipant> participants, ExportOptions options)
    {
        if (id.HasValue)
        {
            var participant = participants.FirstOrDefault(v => v.Id == id.Value);
            if (participant is not null)
            {
                return participant.Name;
            }
        }
        return Label("noParticipant", options);
    }

    private static string TransactionTypeText(string type, ExportOptions options)
    {
        return type switch
        {
            "income" => Join("Income", "收入", "收入", options),
            "expense" => Join("Order / expense", "訂單 / 支出", "订单 / 支出", options),
            "transfer" => Join("Transfer", "資金劃轉", "资金划转", options),
            "sof" => Join("Source of funds", "資金來源", "资金来源", options),
            "fx_exchange" => Join("Currency exchange", "貨幣兌換", "货币兑换", options),
            "cross_border_remittance" => Join("Cross-border remittance", "跨境匯款", "跨境汇款", options),
            _ => type,
        };
    }

    private static string SplitTypeText(string type, ExportOptions options)
    {
        return type switch
        {
            "custom_amount" => Join("Custom amount", "自訂金額", "自定义金额", options),
            "custom_share" => Join("Custom share", "自訂比例", "自定义比例", options),
            "equal" => Join("Equal split", "平均分攤", "平均分摊", options),
            "excluded" => Join("Excluded from settlement", "不納入結算", "不纳入结算", options),
            "individual" => Join("Individual payment", "各自付款", "各自付款", options),
            "per_person" => Join("Same amount per person", "每人同額", "每人同额", options),
            "personal" => Join("Personal", "個人自付", "个人自付", options),
            _ => type,
        };
    }

    private static string Label(string key, ExportOptions options, bool bookkeeping = false)
    {
        var labels = bookkeeping ? BookkeepingLabels : BudgetLabels;
        if (!labels.TryGetValue(key, out var values))
        {
            values = BudgetLabels.GetValueOrDefault(key, (key, key, key));
        }
        return Join(values.En, values.Tc, values.Sc, options);
    }

    private static string LabelLiteral(string en, ExportOptions options)
    {
        return options.PdfLanguages.Length == 1 && options.PdfLanguages[0] == "en" ? en : en;
    }

    private static string SignatureLabel(ExportOptions options)
    {
        return options.SignatureLabelMode switch
        {
            "confirmation" => Join("Confirmation", "確認", "确认", options),
            "signature" => Join("Signature", "簽署", "签署", options),
            _ => Join("Confirmation / Signature", "確認 / 簽署", "确认 / 签署", options),
        };
    }

    private static string Join(string en, string tc, string sc, ExportOptions options)
    {
        var languages = options.PdfLanguages.Length == 0 ? ["en"] : options.PdfLanguages;
        var parts = new List<string>();
        foreach (var lang in languages)
        {
            var value = lang switch
            {
                "tc" => tc,
                "sc" => sc,
                _ => en,
            };
            if (!parts.Contains(value))
            {
                parts.Add(value);
            }
        }
        return string.Join("\n", parts);
    }

    private static string DatePrefix(ExportOptions options, bool bookkeeping)
    {
        var languages = options.PdfLanguages.Length == 0 ? ["en"] : options.PdfLanguages;
        var labels = new List<string>();
        foreach (var lang in languages)
        {
            var value = bookkeeping
                ? lang switch
                {
                    "tc" => "日期",
                    "sc" => "日期",
                    _ => "Date",
                }
                : lang switch
                {
                    "tc" => "日期",
                    "sc" => "日期",
                    _ => "Date",
                };
            if (!labels.Contains(value))
            {
                labels.Add(value);
            }
        }
        return (labels.Count == 0 ? "Date" : string.Join(" / ", labels)) + ": ";
    }

    private static bool HasChinese(ExportOptions options) => options.PdfLanguages.Any(v => v is "tc" or "sc");

    private static string PeriodText(BudgetInfo budget)
    {
        if (string.IsNullOrWhiteSpace(budget.StartDate) && string.IsNullOrWhiteSpace(budget.EndDate))
        {
            return "";
        }
        return $"{FormatDate(budget.StartDate)} to {FormatDate(budget.EndDate)}";
    }

    private static string FormatDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "";
        }
        return DateTime.TryParse(value, out var parsed) ? parsed.ToString("d MMMM, yyyy", CultureInfo.InvariantCulture) : value;
    }

    private static string InstallmentPeriodLabel(BudgetInfo budget, JsonElement? itemConfig, int index)
    {
        var start = itemConfig.HasValue ? JsonValue.String(itemConfig.Value, "startMonth") : "";
        if (start.Length == 7)
        {
            start += "-01";
        }
        if (string.IsNullOrWhiteSpace(start))
        {
            start = budget.StartDate ?? "";
        }
        if (!DateTime.TryParse(start, out var parsed))
        {
            return "#" + (index + 1).ToString(CultureInfo.InvariantCulture);
        }
        return budget.InstallmentPeriodUnit switch
        {
            "day" => parsed.AddDays(index).ToString("d MMM yyyy", CultureInfo.InvariantCulture),
            "week" => parsed.AddDays(index * 7).ToString("d MMM yyyy", CultureInfo.InvariantCulture),
            "year" => parsed.AddYears(index).ToString("yyyy", CultureInfo.InvariantCulture),
            _ => parsed.AddMonths(index).ToString("MMM yyyy", CultureInfo.InvariantCulture),
        };
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return default;
        }
        try
        {
            return JsonDocument.Parse(json).RootElement.Clone();
        }
        catch (JsonException)
        {
            return default;
        }
    }

    private static string? JsonPropertyRaw(JsonElement element, string name)
    {
        return element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) ? value.GetRawText() : null;
    }

    private static string WrapLongReference(string value)
    {
        if (value.Length <= 18 || value.Any(char.IsWhiteSpace))
        {
            return value;
        }
        var builder = new StringBuilder();
        for (var i = 0; i < value.Length; i += 18)
        {
            if (i > 0) builder.Append('\n');
            builder.Append(value.AsSpan(i, Math.Min(18, value.Length - i)));
        }
        return builder.ToString();
    }

    private static string SingleLine(string value) => string.Join(" ", value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    private static string SafeTitle(string title, int max)
    {
        var clean = SingleLine(title);
        if (clean.Length <= max)
        {
            return clean;
        }
        return clean[..Math.Max(8, max - 9)] + "-" + ShortHash(clean)[..8];
    }

    private static decimal ProgressPercent(long processed, long? total)
    {
        if (!total.HasValue || total.Value <= 0) return processed <= 0 ? 5 : 50;
        return Math.Min(90, Math.Max(5, decimal.Round(processed * 85m / total.Value, 2)));
    }

    private static long KnownProcessed(long? total, int fallback)
    {
        return total.HasValue ? Math.Min(total.Value, fallback) : fallback;
    }

    private static string ShortHash(string value)
    {
        var bytes = System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes)[..10];
    }

    private static float Mm(float value) => value * 72f / 25.4f;

    private static readonly Dictionary<string, (string En, string Tc, string Sc)> BudgetLabels = new()
    {
        ["budgetHighlightsTitle"] = ("Budget Summary", "預算摘要", "预算摘要"),
        ["datePrefix"] = ("Date: ", "日期：", "日期："),
        ["emptyBudgetItems"] = ("No budget items", "暫無預算項", "暂无预算项"),
        ["emptyGroupSplitDetails"] = ("No split details", "暫無分攤明細", "暂无分摊明细"),
        ["emptySettlementInstructions"] = ("No settlement needed", "無需結算", "无需结算"),
        ["emptyInstallments"] = ("No installment targets", "暫無分期目標", "暂无分期目标"),
        ["emptyTransactions"] = ("No transactions", "暫無交易", "暂无交易"),
        ["groupExpenseSummaryTitle"] = ("Group Expense Summary", "多人費用摘要", "多人费用摘要"),
        ["groupSettlementSummaryTitle"] = ("Group Settlement Summary", "多人結算摘要", "多人结算摘要"),
        ["groupSplitDetailsTitle"] = ("Group Split Details", "多人分攤明細", "多人分摊明细"),
        ["installmentsTitle"] = ("Installments", "分期明細", "分期明细"),
        ["noParticipant"] = ("Unspecified", "未指定", "未指定"),
        ["remainingLabel"] = ("Remaining", "剩餘", "剩余"),
        ["settlementInstructionsTitle"] = ("Settlement Instructions", "結算指引", "结算指引"),
        ["total"] = ("Total", "總計", "总计"),
        ["transactionBreakdownTitle"] = ("Transaction Breakdown", "交易明細", "交易明细"),
        ["amount"] = ("Amount", "金額", "金额"),
        ["balance"] = ("Balance", "差額", "差额"),
        ["budget"] = ("Budget", "預算", "预算"),
        ["category"] = ("Category", "類別", "类别"),
        ["estimated_actuals"] = ("Estimated Actuals", "預估實際", "预估实际"),
        ["from"] = ("From", "付款方", "付款方"),
        ["metric"] = ("Metric", "項目", "项目"),
        ["paid"] = ("Paid", "已支付", "已支付"),
        ["paid_by"] = ("Paid By", "付款人", "付款人"),
        ["participant"] = ("Participant", "參與者", "参与者"),
        ["participants"] = ("Participants", "參與者", "参与者"),
        ["period"] = ("Period", "期間", "期间"),
        ["period_amount"] = ("Amount", "金額", "金额"),
        ["progress"] = ("Done", "進度", "进度"),
        ["remark"] = ("Remark", "備註", "备注"),
        ["sequence"] = ("No.", "序號", "序号"),
        ["share"] = ("Share", "應承擔", "应承担"),
        ["split_type"] = ("Split Type", "分攤方式", "分摊方式"),
        ["target_amount"] = ("Target", "目標", "目标"),
        ["to"] = ("To", "收款方", "收款方"),
        ["transaction_details"] = ("Transaction Details", "交易詳情", "交易详情"),
        ["unit_price"] = ("Unit Price", "單價", "单价"),
        ["quantity"] = ("Quantity", "數量", "数量"),
        ["variance"] = ("Variance", "差額", "差额"),
        ["signatureTitle"] = ("Preparation & Review Record", "製表及覆核記錄", "制表及复核记录"),
        ["dateTime"] = ("Date & Time", "日期及時間", "日期及时间"),
    };

    private static readonly Dictionary<string, (string En, string Tc, string Sc)> BookkeepingLabels = new(BudgetLabels)
    {
        ["bookkeepingLedgerSubtitle"] = ("Bookkeeping Ledger", "記帳流水", "记账流水"),
        ["bookkeepingRecordsTitle"] = ("Bookkeeping Records", "記帳記錄", "记账记录"),
        ["emptyBookkeepingRecords"] = ("No bookkeeping records", "暫無記帳記錄", "暂无记账记录"),
        ["bookkeepingExpenseTotal"] = ("Expense total", "支出總計", "支出总计"),
        ["bookkeepingIncomeTotal"] = ("Income total", "收入總計", "收入总计"),
        ["type"] = ("Type", "交易類型", "交易类型"),
        ["date"] = ("Date", "日期", "日期"),
        ["order"] = ("Order No.", "訂單號", "订单号"),
        ["details"] = ("Details", "交易詳情", "交易详情"),
        ["accounts"] = ("Funds / Accounts", "資金/帳戶", "资金/账户"),
        ["destination"] = ("Destination", "目的金額", "目的金额"),
    };

    private sealed record CurrencyTotal(string Currency, decimal AmountOriginal, decimal AmountBase);
    private sealed record EffectiveAmounts(decimal BudgetBase, decimal EstimatedBase, decimal VarianceBase, IReadOnlyList<CurrencyTotal> TransactionTotals);
    private sealed record ItemSplitState(long? PaidByParticipantId, string SplitType, string Note, List<ItemSplitParticipant> Participants);
    private sealed record ParticipantSummary(BudgetParticipant Participant, decimal PaidBase, decimal ShareBase, decimal BalanceBase);
    private sealed record SettlementInstruction(long FromParticipantId, long ToParticipantId, decimal AmountBase);
    private sealed record GroupSummary(decimal PaidTotalBase, decimal ShareTotalBase, decimal SharedExpenseBase, decimal PersonalExpenseBase, List<ParticipantSummary> Participants, List<SettlementInstruction> Settlements);
}
