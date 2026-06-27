using System.Text.Json;
using System.Text.Json.Serialization;

namespace BudgetCentre.PdfRenderer;

public sealed record ExportJob
{
    public required long Id { get; init; }
    public required long BudgetId { get; init; }
    public required long UserId { get; init; }
    public required string Scope { get; init; }
    public required string FileName { get; init; }
    public required string JobToken { get; init; }
    public required int Attempt { get; init; }
    public required ExportOptions Options { get; init; }
}

public sealed record ExportOptions
{
    public string ExportScope { get; init; } = "budget";
    public string PdfTheme { get; init; } = "classic";
    public bool ShowWorkspace { get; init; }
    public string[] PdfLanguages { get; init; } = ["en"];
    public string SignatureLabelMode { get; init; } = "confirmation_signature";
    public string[] SignatureLabelLanguages { get; init; } = ["en"];

    public static ExportOptions FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new ExportOptions();
        }
        return JsonSerializer.Deserialize<ExportOptions>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        }) ?? new ExportOptions();
    }

    public string PrimaryChineseLanguage()
    {
        return PdfLanguages.Concat(SignatureLabelLanguages).FirstOrDefault(v => v is "sc" or "tc") ?? "tc";
    }
}

public sealed record BudgetInfo(
    long Id,
    string Title,
    string OwnerName,
    string BaseCurrency,
    string? WorkspaceName,
    string? StartDate,
    string? EndDate,
    string BudgetType,
    string ParticipantMode,
    string InstallmentDisplayMode,
    string InstallmentPeriodUnit,
    bool PricingEnabled,
    string? SignatureConfigJson);

public sealed record LedgerRow(
    string Type,
    string Date,
    string OrderReference,
    string Details,
    string Category,
    string Accounts,
    string Amount,
    decimal AmountBase,
    string Destination,
    string Remark);

public sealed record BookkeepingTotals(decimal IncomeBase, decimal ExpenseBase);

public sealed record BudgetTotals(decimal BudgetBase, decimal EstimatedBase, decimal VarianceBase);

public sealed record BudgetItemRow(
    long Id,
    long? CategoryId,
    string Label,
    string Category,
    string BudgetCurrency,
    decimal BudgetAmountOriginal,
    decimal BudgetRateToBase,
    decimal BudgetAmountBase,
    string EstimatedCurrency,
    decimal EstimatedAmountOriginal,
    decimal EstimatedAmountBase,
    decimal VarianceAmountBase,
    string? InstallmentConfigJson,
    string? PricingConfigJson,
    long? PaidByParticipantId,
    string SplitType,
    string SplitNote);

public sealed record BudgetTransactionRow(
    long Id,
    long? CategoryId,
    string Category,
    long? PaidByParticipantId,
    string PaidByName,
    string TransactionDate,
    string Details,
    string Currency,
    decimal AmountOriginal,
    decimal AmountBase,
    string? ReferenceCurrency,
    decimal? ReferenceAmountOriginal,
    string Remark,
    string? PricingConfigJson,
    string PaymentText);

public sealed record BudgetParticipant(long Id, string Name);

public sealed record ItemSplitParticipant(long ItemId, long ParticipantId, bool IsIncluded, decimal? ShareRatio, decimal? ShareAmountBase);

public sealed record InstallmentPlan(string? PeriodAmountsJson, string? PeriodProgressJson, string? PeriodRemarksJson);

public sealed record TableColumn(string Key, string Label, float Width, string Align = "left", string DataType = "text");

public sealed record TableSection(string Key, string Title, IReadOnlyList<TableColumn> Columns);

public sealed record VisualFixtureBudgetCandidates(
    long? NormalBudgetId,
    long? GroupBudgetId,
    long? PricingBudgetId,
    long? InstallmentBudgetId,
    long? LongTextBudgetId);

public static class JsonValue
{
    public static bool Bool(JsonElement element, string name, bool fallback = false)
    {
        if (element.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            return fallback;
        }
        if (!element.TryGetProperty(name, out var value))
        {
            return fallback;
        }
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number => value.TryGetInt32(out var parsed) ? parsed != 0 : fallback,
            JsonValueKind.String => bool.TryParse(value.GetString(), out var parsed) ? parsed : fallback,
            _ => fallback,
        };
    }

    public static string String(JsonElement element, string name, string fallback = "")
    {
        if (element.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            return fallback;
        }
        return element.TryGetProperty(name, out var value) && value.ValueKind != JsonValueKind.Null
            ? value.ToString()
            : fallback;
    }

    public static decimal Decimal(JsonElement element, params string[] names)
    {
        if (element.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            return 0;
        }
        foreach (var name in names)
        {
            if (!element.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
            {
                continue;
            }
            if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var parsed))
            {
                return parsed;
            }
            if (decimal.TryParse(value.ToString(), out parsed))
            {
                return parsed;
            }
        }
        return 0;
    }

    public static List<decimal> DecimalArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }
            return doc.RootElement.EnumerateArray()
                .Select(v => v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var parsed) ? parsed : 0)
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static List<bool> BoolArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }
            return doc.RootElement.EnumerateArray()
                .Select(v => v.ValueKind == JsonValueKind.True || (v.ValueKind == JsonValueKind.Number && v.GetInt32() != 0))
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static List<string> StringArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }
            return doc.RootElement.EnumerateArray().Select(v => v.ToString()).ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
