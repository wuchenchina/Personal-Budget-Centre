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

var koreanOptions = new ExportOptions { PdfLanguages = ["ko"], SignatureLabelLanguages = ["ko"] };
var labelMethod = typeof(PdfExportRenderer).GetMethod("Label", BindingFlags.Static | BindingFlags.NonPublic)!;
foreach (var name in new[] { "BudgetLabels", "BookkeepingLabels" })
{
    var labels = (System.Collections.IDictionary)typeof(PdfExportRenderer).GetField(name, BindingFlags.Static | BindingFlags.NonPublic)!.GetValue(null)!;
    foreach (string key in labels.Keys)
    {
        var label = (string)labelMethod.Invoke(null, [key, koreanOptions, name == "BookkeepingLabels"])!;
        if (!label.Any(c => c >= '\uac00' && c <= '\ud7a3')) throw new Exception($"Missing Korean PDF label: {name}.{key}: {label}");
    }
}
var signatureTitle = typeof(PdfExportRenderer).GetMethod("SignatureSectionTitle", BindingFlags.Static | BindingFlags.NonPublic)!;
using var emptySignature = System.Text.Json.JsonDocument.Parse("{}");
if ((string)signatureTitle.Invoke(null, [emptySignature.RootElement, koreanOptions])! != "작성 및 검토 기록") throw new Exception("Missing Korean signature title");
var metaLabel = typeof(PdfExportRenderer).GetMethod("SignatureMetaLabel", BindingFlags.Static | BindingFlags.NonPublic)!;
foreach (var key in new[] { "participant", "capacity", "position", "email", "dateTime" })
{
    var label = (string)metaLabel.Invoke(null, [key, koreanOptions])!;
    if (!label.Any(c => c >= '\uac00' && c <= '\ud7a3')) throw new Exception($"Missing Korean signature label: {key}");
}
Console.WriteLine("Korean budget and bookkeeping label checks passed.");

if (args.Contains("--check-korean-fonts"))
{
    var fontDir = Path.GetFullPath(args[Array.IndexOf(args, "--check-korean-fonts") + 1]);
    foreach (var key in new[] { "classic", "statement_red", "civic_blue" })
    {
        var fonts = FontSet.Load(fontDir, "tc", key);
        var missing = "예산수입금액서명".Where(c => !fonts.CjkFallbacks.Any(font => font.ContainsGlyph(c))).Distinct().ToArray();
        if (missing.Length > 0) throw new Exception($"Korean glyph coverage ({key}): missing [{new string(missing)}]");
        Console.WriteLine($"Korean glyph coverage ({key}): passed");
    }
}

if (!args.Contains("--render")) return;
var root = Path.GetFullPath(args[Array.IndexOf(args, "--render") + 1]);
var output = Path.Combine(root, "output/pdf");
Directory.CreateDirectory(output);
var themes = new[] { "classic", "statement_red", "civic_blue" };
var languages = new[] { new[] { "tc" }, new[] { "en" }, new[] { "sc" }, new[] { "ja" }, new[] { "fr" }, new[] { "ru" }, new[] { "de" }, new[] { "ko" }, new[] { "en", "tc" } };
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
        if (languages[page - 1].Contains("ko") && (!text.Contains("예상 수입") || !text.Contains("실수령") || !text.Contains("자금"))) throw new Exception($"Missing rendered Korean income labels: {path}");
        if (!text.Contains("51000.00") || !text.Contains("5000.00") || !text.Contains("Primary job")) throw new Exception($"Missing income data on page {page}: {path}");
    }
    Console.WriteLine($"Verified {check.GetNumberOfPages()} pages: {path}");
}

// The SVG signature path has independent font handling; verify its actual PDF output.
var addSignature = typeof(PdfExportRenderer).GetMethod("AddSignatureBlock", BindingFlags.Static | BindingFlags.NonPublic)!;
const string koreanSignatureConfig = """
{"enabled":true,"rows":[{"displayName":"김민수","roleLabel":"Approved by","position":"Budget Owner","showSignature":true,"showName":true,"showRoleLabel":true,"showPosition":true,"showEmail":true,"email":"name@example.com","showDateTime":true,"signedAt":"2026-10-08 10:00:00"}]}
""";
foreach (var themeKey in themes)
{
    var theme = ThemeRegistry.ForKey(themeKey);
    var path = Path.Combine(output, $"korean-signature-{themeKey}.pdf");
    using (var pdf = new PdfDocument(new PdfWriter(path)))
    using (var document = new Document(pdf, theme.BudgetPageSize))
    {
        document.SetMargins(theme.MarginTop, theme.MarginRight, theme.MarginBottom + 14, theme.MarginLeft);
        var options = koreanOptions with { PdfTheme = themeKey };
        var fonts = FontSet.Load(config.FontDir, "tc", themeKey);
        var job = new ExportJob { Id = 1, BudgetId = 1, UserId = 1, Scope = "budget", FileName = Path.GetFileName(path), JobToken = "fixture", Attempt = 1, Options = options };
        addSignature.Invoke(null, [document, theme, fonts, job, budget with { SignatureConfigJson = koreanSignatureConfig }, "Korean signature fixture", config.FontDir]);
    }
    using var check = new PdfDocument(new PdfReader(path));
    var text = PdfTextExtractor.GetTextFromPage(check.GetPage(1));
    foreach (var expected in new[] { "작성 및 검토 기록", "이름", "김민수", "승인자", "예산 담당자", "확인 / 서명" })
        if (!text.Contains(expected)) throw new Exception($"Missing Korean signature text [{expected}] in {path}: {text}");
    Console.WriteLine($"Verified Korean signature: {path}");
}

var newLedgerTable = typeof(PdfExportRenderer).GetMethod("NewBookkeepingTable", BindingFlags.Static | BindingFlags.NonPublic)!;
var addLedgerRow = typeof(PdfExportRenderer).GetMethod("AddBookkeepingRow", BindingFlags.Static | BindingFlags.NonPublic)!;
foreach (var themeKey in themes)
{
    var theme = ThemeRegistry.ForKey(themeKey);
    var path = Path.Combine(output, $"korean-bookkeeping-{themeKey}.pdf");
    using (var pdf = new PdfDocument(new PdfWriter(path)))
    using (var document = new Document(pdf, theme.BookkeepingPageSize))
    {
        document.SetMargins(theme.BookkeepingMarginTop, theme.BookkeepingMarginRight, theme.BookkeepingMarginBottom + 14, theme.BookkeepingMarginLeft);
        var fonts = FontSet.Load(config.FontDir, "tc", themeKey);
        string LabelFor(string key) => (string)labelMethod.Invoke(null, [key, koreanOptions, true])!;
        var columns = new[] {
            new TableColumn("type", LabelFor("type"), 10), new TableColumn("date", LabelFor("date"), 8, DataType: "code"),
            new TableColumn("order", LabelFor("order"), 14, DataType: "code"), new TableColumn("details", LabelFor("details"), 18),
            new TableColumn("category", LabelFor("category"), 12), new TableColumn("accounts", LabelFor("accounts"), 13),
            new TableColumn("amount", LabelFor("amount"), 11, "right", "money"), new TableColumn("destination", LabelFor("destination"), 9, "right", "money"),
            new TableColumn("remark", LabelFor("remark"), 5)
        };
        var table = (Table)newLedgerTable.Invoke(null, [columns, theme, fonts, LabelFor("bookkeepingRecordsTitle"), "2026-10-08", "날짜: "])!;
        addLedgerRow.Invoke(null, [table, columns, theme, fonts, new[] { "수입", "2026-10-08", "REF-001", "급여 입금", "급여", "은행 계좌", "KRW 100000.00", "KRW 100000.00", "완료" }]);
        document.Add(table);
    }
    using var check = new PdfDocument(new PdfReader(path));
    var text = PdfTextExtractor.GetTextFromPage(check.GetPage(1));
    foreach (var expected in new[] { "회계 기록", "거래 유형", "수입", "급여 입금", "은행 계좌" })
        if (!text.Contains(expected)) throw new Exception($"Missing Korean ledger text [{expected}] in {path}: {text}");
    Console.WriteLine($"Verified Korean bookkeeping: {path}");
}
