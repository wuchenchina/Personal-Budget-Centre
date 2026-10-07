using System.Globalization;
using System.Text.Json;

namespace BudgetCentre.PdfRenderer;

public sealed record ProjectedIncomeEntry(string Title, string Mode, decimal Monthly, decimal OneOff, decimal Period, int Workdays, decimal Rate);
public sealed record ExpectedIncomeProjection(IReadOnlyList<ProjectedIncomeEntry> Entries, decimal Monthly, decimal OneOff, decimal Total, decimal Expenses, decimal Balance)
{
    public static ExpectedIncomeProjection? Calculate(BudgetInfo budget, decimal plannedExpenses)
    {
        if (string.IsNullOrWhiteSpace(budget.ExpectedIncomeJson)) return null;
        using var document = JsonDocument.Parse(budget.ExpectedIncomeJson);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object) return null;
        var values = root.TryGetProperty("entries", out var entries) && entries.ValueKind == JsonValueKind.Array
            ? entries.EnumerateArray().ToArray() : [root];
        var months = PeriodMonths(budget.StartDate, budget.EndDate);
        var projected = new List<ProjectedIncomeEntry>();
        foreach (var entry in values)
        {
            var mode = JsonValue.String(entry, "mode", "auto");
            var annual = JsonValue.String(entry, "annualCurrency") == budget.BaseCurrency ? JsonValue.Decimal(entry, "annualAmount") : 0;
            var days = (int)JsonValue.Decimal(entry, "workdays");
            var monthly = mode switch
            {
                "annual" => annual / 12,
                "auto" when annual > 0 => annual / 12,
                "daily" => JsonValue.Decimal(entry, "dailyAmount") * days,
                "one_off" => 0,
                _ => JsonValue.Decimal(entry, "monthlyAmount"),
            };
            var oneOff = mode == "one_off" ? JsonValue.Decimal(entry, "oneOffAmount") : 0;
            var effectiveMode = mode == "auto" ? (annual > 0 ? "annual" : "monthly") : mode;
            projected.Add(new ProjectedIncomeEntry(JsonValue.String(entry, "title"), effectiveMode, monthly, oneOff, monthly * months + oneOff, days, effectiveMode switch { "annual" => annual, "daily" => JsonValue.Decimal(entry, "dailyAmount"), "one_off" => oneOff, _ => monthly }));
        }
        var total = Round(projected.Sum(entry => entry.Period));
        return new ExpectedIncomeProjection(projected, Round(projected.Sum(entry => entry.Monthly)), Round(projected.Sum(entry => entry.OneOff)), total, Round(plannedExpenses), Round(total - plannedExpenses));
    }

    public static decimal PeriodMonths(string? start, string? end)
    {
        if (string.IsNullOrEmpty(start) || string.IsNullOrEmpty(end)) return 1;
        var first = DateOnly.ParseExact(start, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var last = DateOnly.ParseExact(end, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        decimal months = 0;
        for (var cursor = first; cursor <= last;)
        {
            var days = DateTime.DaysInMonth(cursor.Year, cursor.Month);
            var monthEnd = new DateOnly(cursor.Year, cursor.Month, days);
            var segmentEnd = monthEnd < last ? monthEnd : last;
            months += (segmentEnd.DayNumber - cursor.DayNumber + 1m) / days;
            if (segmentEnd == last) break;
            cursor = segmentEnd.AddDays(1);
        }
        return months;
    }

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
