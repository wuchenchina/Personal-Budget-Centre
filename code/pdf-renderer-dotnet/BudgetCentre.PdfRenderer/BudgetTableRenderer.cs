using BudgetCentre.PdfRenderer.Theme;
using iText.Layout;
using iText.Layout.Borders;
using iText.Layout.Element;
using iText.Layout.Properties;

namespace BudgetCentre.PdfRenderer;

public sealed partial class PdfExportRenderer
{
    private static void AddSectionTable(
        Document document,
        TableSection section,
        IReadOnlyList<string[]> rows,
        string[]? summary,
        PdfTheme theme,
        FontSet fonts,
        BudgetInfo budget,
        ExportOptions options,
        string? emptyText = null)
    {
        var spec = theme.BudgetTable;
        document.Add(BudgetSectionBand(section.Title, theme, fonts, spec));
        AddBudgetPeriodLine(document, theme, fonts, budget, options, spec);
        document.Add(BudgetHeaderTable(section.Columns, theme, fonts, spec));
        var body = BudgetBodyTable(section.Columns, theme, fonts, spec);
        if (rows.Count == 0)
        {
            body.AddCell(EmptyCell(emptyText ?? "", section.Columns.Count, theme, fonts, spec));
        }
        foreach (var row in rows)
        {
            AddBudgetRow(body, section.Columns, theme, fonts, spec, row);
        }
        document.Add(body);
        if (summary is not null)
        {
            document.Add(BudgetSummaryTable(section.Columns, summary, theme, fonts, spec));
        }
    }

    private static Paragraph BudgetSectionBand(string text, PdfTheme theme, FontSet fonts, PdfTableVisualSpec spec)
    {
        var p = ParagraphLines(SingleLine(text), ThemeMono(theme, fonts), spec.SectionFontSize, spec.SectionLineHeight, fallbackFont: ThemeFallback(theme, fonts))
            .SetBackgroundColor(theme.SectionFill)
            .SetFontColor(theme.SectionTextColor)
            .SetBorder(new SolidBorder(theme.BorderColor, Mm(0.2f)))
            .SetPaddingTop(spec.SectionPaddingTop)
            .SetPaddingBottom(spec.SectionPaddingBottom)
            .SetPaddingLeft(spec.SectionPaddingHorizontal)
            .SetPaddingRight(spec.SectionPaddingHorizontal)
            .SetMarginTop(spec.SectionMarginTop)
            .SetMarginBottom(0)
            .SetKeepWithNext(true);
        return p;
    }

    private static void AddBudgetPeriodLine(Document document, PdfTheme theme, FontSet fonts, BudgetInfo budget, ExportOptions options, PdfTableVisualSpec spec)
    {
        var period = PeriodText(budget);
        if (string.IsNullOrWhiteSpace(period))
        {
            return;
        }
        var p = ParagraphLines(DatePrefix(options, false) + period, ThemeMonoLight(theme, fonts), spec.DateFontSize, spec.DateLineHeight, fallbackFont: ThemeFallback(theme, fonts))
            .SetFontColor(theme.Key == "civic_blue" ? theme.MutedTextColor : theme.TextColor)
            .SetPaddingTop(spec.DatePaddingTop)
            .SetPaddingBottom(spec.DatePaddingBottom)
            .SetPaddingLeft(spec.DatePaddingHorizontal)
            .SetPaddingRight(spec.DatePaddingHorizontal)
            .SetMargin(0)
            .SetBorderTop(BorderOrNone(theme.BorderColor, spec.DateBorderTopWidth))
            .SetBorderBottom(BorderOrNone(theme.Key == "civic_blue" ? new iText.Kernel.Colors.DeviceRgb(223, 225, 226) : theme.BorderColor, spec.DateBorderBottomWidth))
            .SetKeepWithNext(true);
        if (spec.DateUnderline)
        {
            p.SetUnderline(0.4f, -1.2f);
        }
        document.Add(p);
    }

    private static Table BudgetHeaderTable(IReadOnlyList<TableColumn> columns, PdfTheme theme, FontSet fonts, PdfTableVisualSpec spec)
    {
        var table = BaseTable(columns);
        for (var i = 0; i < columns.Count; i++)
        {
            table.AddCell(HeaderCell(columns[i], i, columns.Count, theme, fonts, spec, false));
        }
        return table.SetKeepTogether(true);
    }

    private static Table BudgetBodyTable(IReadOnlyList<TableColumn> columns, PdfTheme theme, FontSet fonts, PdfTableVisualSpec spec)
    {
        return BaseTable(columns)
            .SetFont(ThemeMono(theme, fonts))
            .SetFontSize(spec.BodyFontSize)
            .SetKeepTogether(false);
    }

    private static Table BudgetSummaryTable(IReadOnlyList<TableColumn> columns, string[] summary, PdfTheme theme, FontSet fonts, PdfTableVisualSpec spec)
    {
        var table = BaseTable(columns).SetKeepTogether(true);
        for (var i = 0; i < columns.Count; i++)
        {
            var value = i < summary.Length ? summary[i] : "";
            var cell = DataCell(value, columns[i], theme, fonts, spec, true)
                .SetBackgroundColor(theme.SummaryFill)
                .SetBorderBottom(Border.NO_BORDER)
                .SetBorderTop(new SolidBorder(theme.Key == "civic_blue" ? theme.AccentColor : theme.BorderColor, spec.SummaryTopBorderWidth));
            table.AddCell(cell);
        }
        return table;
    }

    private static void AddBudgetRow(Table table, IReadOnlyList<TableColumn> columns, PdfTheme theme, FontSet fonts, PdfTableVisualSpec spec, string[] values)
    {
        for (var i = 0; i < columns.Count; i++)
        {
            var value = i < values.Length ? values[i] : "";
            table.AddCell(DataCell(value, columns[i], theme, fonts, spec));
        }
    }

    private static Table BaseTable(IReadOnlyList<TableColumn> columns)
    {
        return new Table(UnitValue.CreatePercentArray(columns.Select(c => c.Width).ToArray()))
            .UseAllAvailableWidth()
            .SetMargin(0);
    }
}
