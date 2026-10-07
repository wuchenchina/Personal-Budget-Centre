using System.Reflection;
using BudgetCentre.PdfRenderer;
using BudgetCentre.PdfRenderer.Theme;
using iText.Kernel.Pdf;
using iText.Kernel.Pdf.Canvas.Parser;
using iText.Layout;
using iText.Layout.Element;
using iText.Layout.Properties;

const string data = """
{"entries":[
 {"id":"main","title":"Primary job / 主要工作","mode":"auto","annualAmount":120000,"annualCurrency":"CNY","monthlyAmount":9000,"workdays":52},
 {"id":"side","title":"Second job / 兼職工作","mode":"daily","dailyAmount":500,"workdays":52},
 {"id":"gift","title":"Unexpected income / 意外收入","mode":"one_off","oneOffAmount":5000,"workdays":26}
]}
""";
var budget = new BudgetInfo(1, "BudgetCentre - Income example", "Sample data", "CNY", "Example workspace", "2024-01-01", "2024-02-29", "regular", "solo", "item", "month", false, null, data);
void Equal(decimal expected, decimal actual, string label)
{
    if (expected != actual) throw new Exception($"{label}: expected {expected}, got {actual}");
}
var income = ExpectedIncomeProjection.Calculate(budget, 50000)!;
Equal(23000, income.Monthly, "multiple jobs");
Equal(5000, income.OneOff, "one-off");
Equal(51000, income.Total, "period total");
Equal(1000, income.Balance, "surplus");
Equal(-9000, ExpectedIncomeProjection.Calculate(budget, 60000)!.Balance, "shortfall");
Equal(0, ExpectedIncomeProjection.Calculate(budget, 51000)!.Balance, "balanced");
Equal(41000, ExpectedIncomeProjection.Calculate(budget with { StartDate = null, EndDate = null }, 0)!.Total, "undated budget");
Equal(1, ExpectedIncomeProjection.PeriodMonths("2024-02-01", "2024-02-29"), "leap month");
Equal(25m / 31m, ExpectedIncomeProjection.PeriodMonths("2026-10-07", "2026-10-31"), "October 7-31 partial month");
var fortyFiveDayBudget = budget with { StartDate = "2026-10-01", EndDate = "2026-11-14", ExpectedIncomeJson = "{\"entries\":[{\"id\":\"daily\",\"title\":\"Daily work\",\"mode\":\"daily\",\"dailyAmount\":100,\"workdays\":45}]}" };
Equal(4500, ExpectedIncomeProjection.Calculate(fortyFiveDayBudget, 0)!.Total, "45 workdays in a 45-day budget");
Equal(12, ExpectedIncomeProjection.PeriodMonths("2024-01-01", "2024-12-31"), "full year");
Equal(1m / 31 + 1m / 29, ExpectedIncomeProjection.PeriodMonths("2024-01-31", "2024-02-01"), "partial months");
Equal(49000, ExpectedIncomeProjection.Calculate(budget with { BaseCurrency = "USD" }, 0)!.Total, "mismatched annual currency falls back to monthly");
Equal(0, ExpectedIncomeProjection.Calculate(budget with { ExpectedIncomeJson = "{\"entries\":[]}" }, 0)!.Total, "empty entries");
if (ExpectedIncomeProjection.Calculate(budget with { ExpectedIncomeJson = null }, 0) != null) throw new Exception("legacy budgets must not gain income settings");
Console.WriteLine("Expected income calculation checks passed.");

if (!args.Contains("--render")) return;
var root = Path.GetFullPath(args[Array.IndexOf(args, "--render") + 1]);
var output = Path.Combine(root, "output/pdf");
Directory.CreateDirectory(output);
var themes = new[] { "classic", "statement_red", "civic_blue" };
var languages = new[] { new[] { "tc" }, new[] { "en" }, new[] { "sc" }, new[] { "ja" }, new[] { "fr" }, new[] { "ru" }, new[] { "de" }, new[] { "en", "tc" } };
var addHeader = typeof(PdfExportRenderer).GetMethod("AddHeader", BindingFlags.Static | BindingFlags.NonPublic)!;
var addIncome = typeof(PdfExportRenderer).GetMethod("AddExpectedIncomeSection", BindingFlags.Static | BindingFlags.NonPublic)!;
var config = new RendererConfig { WorkerId = "income-test", ConnectionString = "", ExportStorageDir = output, ExportTempDir = output, FontDir = Path.Combine(root, "code/font"), LogDir = output, JobSecret = "" };
foreach (var themeKey in themes)
{
    var theme = ThemeRegistry.ForKey(themeKey);
    var path = Path.Combine(output, $"expected-income-{themeKey}.pdf");
    using (var pdf = new PdfDocument(new PdfWriter(path)))
    using (var document = new Document(pdf, theme.BudgetPageSize))
    {
        document.SetMargins(theme.MarginTop, theme.MarginRight, theme.MarginBottom + 14, theme.MarginLeft);
        foreach (var (language, index) in languages.Select((value, index) => (value, index)))
        {
            if (index > 0) document.Add(new AreaBreak(AreaBreakType.NEXT_PAGE));
            var options = new ExportOptions { PdfTheme = themeKey, PdfLanguages = language, SignatureLabelLanguages = language };
            var fonts = FontSet.Load(config.FontDir, options.PrimaryChineseLanguage(), themeKey);
            document.SetFont(fonts.Cjk).SetFontSize(theme.BodyFontSize).SetFontColor(theme.TextColor);
            var job = new ExportJob { Id = 1, BudgetId = 1, UserId = 1, Scope = "budget", FileName = Path.GetFileName(path), JobToken = "fixture", Attempt = 1, Options = options };
            addHeader.Invoke(null, [document, theme, fonts, budget, job]);
            addIncome.Invoke(null, [document, theme, fonts, budget, options, index % 3 == 0 ? 50000m : index % 3 == 1 ? 60000m : 51000m]);
        }
    }
    PdfFooterStamper.Stamp(path, theme, config);
    using var check = new PdfDocument(new PdfReader(path));
    if (check.GetNumberOfPages() != languages.Length) throw new Exception($"Unexpected pagination: {path}");
    for (var page = 1; page <= check.GetNumberOfPages(); page++)
    {
        var text = PdfTextExtractor.GetTextFromPage(check.GetPage(page));
        if (!text.Contains("51000.00") || !text.Contains("5000.00") || !text.Contains("Primary job")) throw new Exception($"Missing income data on page {page}: {path}");
    }
    Console.WriteLine($"Verified {check.GetNumberOfPages()} pages: {path}");
}
