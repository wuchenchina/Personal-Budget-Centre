using BudgetCentre.PdfRenderer.Theme;
using iText.Kernel.Colors;
using iText.Kernel.Font;
using iText.Layout.Borders;
using iText.Layout.Element;
using iText.Layout.Properties;

namespace BudgetCentre.PdfRenderer;

public sealed partial class PdfExportRenderer
{
    private static Cell BareCell()
    {
        return new Cell()
            .SetBorder(Border.NO_BORDER)
            .SetPadding(0)
            .SetVerticalAlignment(VerticalAlignment.TOP);
    }

    private static Cell TextCell(string text, PdfFont font, float size, float leading, bool money = false, PdfFont? fallbackFont = null)
    {
        return BareCell().Add(ParagraphLines(text, font, size, leading, money, fallbackFont));
    }

    private static PdfFont ThemeMono(PdfTheme theme, FontSet fonts, bool bold = false)
    {
        if (theme.Key == "classic")
        {
            return bold ? fonts.Bold : fonts.Regular;
        }
        return bold ? fonts.CjkBold : fonts.Cjk;
    }

    private static PdfFont ThemeMonoLight(PdfTheme theme, FontSet fonts)
    {
        return theme.Key == "classic" ? fonts.Regular : fonts.Cjk;
    }

    private static PdfFont? ThemeFallback(PdfTheme theme, FontSet fonts)
    {
        return theme.Key == "classic" ? fonts.Cjk : null;
    }

    private static Paragraph ParagraphLines(string text, PdfFont font, float size, float leading, bool money = false, PdfFont? fallbackFont = null)
    {
        var p = new Paragraph()
            .SetFont(font)
            .SetFontSize(size)
            .SetFixedLeading(size * leading)
            .SetMargin(0);
        var lines = text.Replace("\r\n", "\n").Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            if (i > 0)
            {
                p.Add("\n");
            }
            foreach (var t in TextRuns(lines[i].Trim(), font, fallbackFont))
            {
                if (money && i > 0)
                {
                    t.SetFontSize(Math.Max(5.4f, size - 0.8f)).SetFontColor(new DeviceRgb(89, 89, 89));
                }
                p.Add(t);
            }
        }
        return p;
    }

    private static IReadOnlyList<Text> TextRuns(string value, PdfFont primaryFont, PdfFont? fallbackFont)
    {
        if (fallbackFont is null || value.Length == 0 || value.All(v => !NeedsCjkFallback(v)))
        {
            return [new Text(value).SetFont(primaryFont)];
        }

        var runs = new List<Text>();
        var start = 0;
        var fallback = NeedsCjkFallback(value[0]);
        for (var i = 1; i < value.Length; i++)
        {
            var nextFallback = NeedsCjkFallback(value[i]);
            if (nextFallback == fallback)
            {
                continue;
            }
            runs.Add(new Text(value[start..i]).SetFont(fallback ? fallbackFont : primaryFont));
            start = i;
            fallback = nextFallback;
        }
        runs.Add(new Text(value[start..]).SetFont(fallback ? fallbackFont : primaryFont));
        return runs;
    }

    private static bool NeedsCjkFallback(char value)
    {
        return value >= 0x2e80;
    }

    private static void ApplyCellPadding(Cell cell, float vertical, float horizontal)
    {
        cell.SetPaddingTop(vertical)
            .SetPaddingBottom(vertical)
            .SetPaddingLeft(horizontal)
            .SetPaddingRight(horizontal);
    }

    private static void Align(Cell cell, string align)
    {
        switch (align)
        {
            case "right":
                cell.SetTextAlignment(TextAlignment.RIGHT);
                break;
            case "center":
                cell.SetTextAlignment(TextAlignment.CENTER);
                break;
            default:
                cell.SetTextAlignment(TextAlignment.LEFT);
                break;
        }
    }

    private static Border BorderOrNone(DeviceRgb color, float width)
    {
        return width > 0 ? new SolidBorder(color, width) : Border.NO_BORDER;
    }

    private static Cell HeaderCell(
        TableColumn column,
        int index,
        int count,
        PdfTheme theme,
        FontSet fonts,
        PdfTableVisualSpec spec,
        bool bold)
    {
        var cell = TextCell(column.Label, ThemeMono(theme, fonts, bold), spec.HeaderFontSize, spec.HeaderLineHeight, fallbackFont: ThemeFallback(theme, fonts))
            .SetBackgroundColor(theme.HeaderFill)
            .SetFontColor(theme.Key == "civic_blue" ? theme.SectionFill : theme.TextColor)
            .SetVerticalAlignment(VerticalAlignment.MIDDLE)
            .SetKeepTogether(true);
        ApplyCellPadding(cell, spec.HeaderPaddingVertical, spec.HeaderPaddingHorizontal);
        cell.SetBorder(Border.NO_BORDER);
        if (index > 0)
        {
            cell.SetBorderLeft(new SolidBorder(theme.BorderColor, spec.HeaderDividerWidth));
        }
        if (index < count - 1)
        {
            cell.SetBorderRight(new SolidBorder(theme.BorderColor, spec.HeaderDividerWidth));
        }
        cell.SetBorderBottom(BorderOrNone(theme.AccentColor, spec.HeaderBottomBorderWidth));
        Align(cell, column.Align);
        return cell;
    }

    private static Cell DataCell(string text, TableColumn column, PdfTheme theme, FontSet fonts, PdfTableVisualSpec spec, bool bold = false)
    {
        var mono = column.DataType is "money" or "code" or "number";
        var font = mono
            ? bold ? fonts.MonoBold : fonts.Mono
            : ThemeMono(theme, fonts, bold);
        var cell = TextCell(text, font, spec.BodyFontSize, spec.BodyLineHeight, column.DataType == "money", ThemeFallback(theme, fonts))
            .SetKeepTogether(true);
        ApplyCellPadding(cell, spec.BodyPaddingVertical, spec.BodyPaddingHorizontal);
        cell.SetBorder(Border.NO_BORDER);
        cell.SetBorderBottom(BorderOrNone(theme.Key == "civic_blue" ? new DeviceRgb(240, 240, 240) : theme.BorderColor, spec.BodyBottomBorderWidth));
        Align(cell, column.Align);
        return cell;
    }

    private static Cell EmptyCell(string text, int colspan, PdfTheme theme, FontSet fonts, PdfTableVisualSpec spec)
    {
        var cell = TextCell(text, ThemeMono(theme, fonts), spec.BodyFontSize, spec.BodyLineHeight, fallbackFont: ThemeFallback(theme, fonts))
            .SetTextAlignment(TextAlignment.CENTER)
            .SetFontColor(theme.MutedTextColor);
        ApplyCellPadding(cell, Math.Max(spec.BodyPaddingVertical, Mm(1.5f)), spec.BodyPaddingHorizontal);
        cell.SetBorder(Border.NO_BORDER);
        return cell;
    }
}
