using BudgetCentre.PdfRenderer.Theme;
using iText.Layout.Borders;
using iText.Layout.Element;
using iText.Layout.Properties;

namespace BudgetCentre.PdfRenderer;

public sealed partial class PdfExportRenderer
{
    private static Table NewBookkeepingTable(
        IReadOnlyList<TableColumn> columns,
        PdfTheme theme,
        FontSet fonts,
        string sectionTitle,
        string period,
        string datePrefix)
    {
        var spec = theme.BookkeepingTable;
        var table = BaseTable(columns)
            .SetFont(ThemeMono(theme, fonts))
            .SetFontSize(spec.BodyFontSize)
            .SetMarginTop(spec.SectionMarginTop)
            .SetKeepTogether(false);

        table.AddHeaderCell(BookkeepingSectionHeader(columns.Count, sectionTitle, theme, fonts, spec));
        if (!string.IsNullOrWhiteSpace(period))
        {
            table.AddHeaderCell(BookkeepingDateHeader(columns.Count, datePrefix + period, theme, fonts, spec));
        }
        for (var i = 0; i < columns.Count; i++)
        {
            table.AddHeaderCell(HeaderCell(columns[i], i, columns.Count, theme, fonts, spec, false));
        }
        return table;
    }

    private static Cell BookkeepingSectionHeader(int columns, string sectionTitle, PdfTheme theme, FontSet fonts, PdfTableVisualSpec spec)
    {
        var cell = new Cell(1, columns)
            .Add(ParagraphLines(SingleLine(sectionTitle), ThemeMono(theme, fonts), spec.SectionFontSize, spec.SectionLineHeight, fallbackFont: ThemeFallback(theme, fonts)))
            .SetBackgroundColor(theme.SectionFill)
            .SetFontColor(theme.SectionTextColor)
            .SetBorder(new SolidBorder(theme.BorderColor, Mm(0.2f)))
            .SetKeepTogether(true);
        ApplyCellPadding(cell, spec.SectionPaddingTop, spec.SectionPaddingHorizontal);
        cell.SetPaddingBottom(spec.SectionPaddingBottom);
        return cell;
    }

    private static Cell BookkeepingDateHeader(int columns, string text, PdfTheme theme, FontSet fonts, PdfTableVisualSpec spec)
    {
        var paragraph = ParagraphLines(text, ThemeMonoLight(theme, fonts), spec.DateFontSize, spec.DateLineHeight, fallbackFont: ThemeFallback(theme, fonts));
        if (spec.DateUnderline)
        {
            paragraph.SetUnderline(0.4f, -1.2f);
        }
        var cell = new Cell(1, columns)
            .Add(paragraph)
            .SetBorder(Border.NO_BORDER)
            .SetBorderTop(BorderOrNone(theme.BorderColor, spec.DateBorderTopWidth))
            .SetBorderBottom(BorderOrNone(theme.Key == "civic_blue" ? new iText.Kernel.Colors.DeviceRgb(223, 225, 226) : theme.BorderColor, spec.DateBorderBottomWidth))
            .SetKeepTogether(true);
        ApplyCellPadding(cell, spec.DatePaddingTop, spec.DatePaddingHorizontal);
        cell.SetPaddingBottom(spec.DatePaddingBottom);
        return cell;
    }

    private static void AddBookkeepingRow(Table table, IReadOnlyList<TableColumn> columns, PdfTheme theme, FontSet fonts, string[] values)
    {
        var spec = theme.BookkeepingTable;
        for (var i = 0; i < columns.Count; i++)
        {
            var value = i < values.Length ? values[i] : "";
            table.AddCell(DataCell(value, columns[i], theme, fonts, spec));
        }
    }

    private static void AddBookkeepingEmptyRow(Table table, int columns, PdfTheme theme, FontSet fonts, string text)
    {
        var spec = theme.BookkeepingTable;
        var cell = new Cell(1, columns)
            .Add(ParagraphLines(text, ThemeMono(theme, fonts), spec.BodyFontSize, spec.BodyLineHeight, fallbackFont: ThemeFallback(theme, fonts)))
            .SetBorder(Border.NO_BORDER)
            .SetTextAlignment(TextAlignment.CENTER)
            .SetFontColor(theme.MutedTextColor);
        ApplyCellPadding(cell, Math.Max(spec.BodyPaddingVertical, Mm(1.5f)), spec.BodyPaddingHorizontal);
        table.AddCell(cell);
    }

    private static void AddBookkeepingTotalRow(Table table, IReadOnlyList<TableColumn> columns, string label, string amount, PdfTheme theme, FontSet fonts, bool first)
    {
        var spec = theme.BookkeepingTable;
        var amountIndex = Math.Max(0, columns.ToList().FindIndex(v => v.Key == "amount"));
        var topWidth = first ? spec.SummaryFirstTopBorderWidth : spec.SummaryTopBorderWidth;
        var topColor = theme.Key == "civic_blue" && first ? theme.AccentColor : theme.BorderColor;

        var labelColspan = Math.Max(1, amountIndex);
        var labelCell = new Cell(1, labelColspan)
            .Add(ParagraphLines(label, ThemeMono(theme, fonts, true), spec.BodyFontSize, spec.BodyLineHeight, fallbackFont: ThemeFallback(theme, fonts)))
            .SetBackgroundColor(theme.SummaryFill)
            .SetTextAlignment(TextAlignment.RIGHT)
            .SetBorder(Border.NO_BORDER)
            .SetBorderTop(new SolidBorder(topColor, topWidth));
        ApplyCellPadding(labelCell, spec.BodyPaddingVertical, spec.BodyPaddingHorizontal);
        table.AddCell(labelCell);

        var amountCell = TextCell(amount, fonts.MonoBold, spec.BodyFontSize, spec.BodyLineHeight, true)
            .SetBackgroundColor(theme.SummaryFill)
            .SetTextAlignment(TextAlignment.RIGHT)
            .SetBorder(Border.NO_BORDER)
            .SetBorderTop(new SolidBorder(topColor, topWidth));
        ApplyCellPadding(amountCell, spec.BodyPaddingVertical, spec.BodyPaddingHorizontal);
        table.AddCell(amountCell);

        var trailing = Math.Max(0, columns.Count - labelColspan - 1);
        if (trailing > 0)
        {
            var trailingCell = new Cell(1, trailing)
                .Add(ParagraphLines("", ThemeMono(theme, fonts, true), spec.BodyFontSize, spec.BodyLineHeight, fallbackFont: ThemeFallback(theme, fonts)))
                .SetBackgroundColor(theme.SummaryFill)
                .SetBorder(Border.NO_BORDER)
                .SetBorderTop(new SolidBorder(topColor, topWidth));
            ApplyCellPadding(trailingCell, spec.BodyPaddingVertical, spec.BodyPaddingHorizontal);
            table.AddCell(trailingCell);
        }
    }
}
