using BudgetCentre.PdfRenderer.Theme;
using iText.Layout;

namespace BudgetCentre.PdfRenderer;

public sealed partial class PdfExportRenderer
{
    private static void AddExpectedIncomeSection(Document document, PdfTheme theme, FontSet fonts, BudgetInfo budget, ExportOptions options, decimal plannedExpenses)
    {
        var income = ExpectedIncomeProjection.Calculate(budget, plannedExpenses);
        if (income is null) return;
        var rows = income.Entries.Select(entry => new[]
        {
            entry.Title + "\n" + Label(entry.Mode switch
            {
                "annual" => "netAnnualSalary",
                "daily" => "netDailySalary",
                "one_off" => "incomeOneOff",
                _ => "netMonthlySalary",
            }, options) + ": " + Money(budget.BaseCurrency, entry.Rate) + (entry.Mode == "daily" ? " · " + Label("salaryWorkdays", options) + ": " + entry.Workdays : ""),
            Money(budget.BaseCurrency, entry.Period),
        }).ToList();
        rows.Add([Label("expectedMonthlyIncome", options), Money(budget.BaseCurrency, income.Monthly)]);
        rows.Add([Label("incomeOneOffTotal", options), Money(budget.BaseCurrency, income.OneOff)]);
        rows.Add([Label(budget.StartDate is not null && budget.EndDate is not null ? "expectedPeriodIncome" : "incomeMonthTotal", options), Money(budget.BaseCurrency, income.Total)]);
        rows.Add([Label("incomePlannedExpense", options), Money(budget.BaseCurrency, income.Expenses)]);
        rows.Add([Label("netSalaryNotice", options) + "\n" + Label("incomeProjectionHelp", options) + "\n" + Label("incomeFundingHelp", options), ""]);
        // Reuse the existing two-column expense-summary table proportions and renderer.
        AddSectionTable(document, new TableSection("expected_income", Label("expectedIncome", options), [
            new TableColumn("metric", Label("incomeSourceName", options), 70),
            new TableColumn("amount", Label(budget.StartDate is not null && budget.EndDate is not null ? "expectedPeriodIncome" : "incomeMonthTotal", options), 30, "right", "money"),
        ]), rows, [Label(income.Balance < 0 ? "incomeFundingGap" : income.Balance > 0 ? "incomeFundingSurplus" : "incomeFundingBalanced", options), Money(budget.BaseCurrency, Math.Abs(income.Balance))], theme, fonts, budget, options);
    }
}
