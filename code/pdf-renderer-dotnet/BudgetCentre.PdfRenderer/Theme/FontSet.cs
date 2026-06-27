using iText.IO.Font;
using iText.Kernel.Font;

namespace BudgetCentre.PdfRenderer.Theme;

public sealed class FontSet
{
    public required PdfFont Regular { get; init; }
    public required PdfFont Bold { get; init; }
    public required PdfFont Cjk { get; init; }
    public required PdfFont CjkBold { get; init; }
    public required IReadOnlyList<PdfFont> CjkFallbacks { get; init; }
    public required IReadOnlyList<PdfFont> CjkBoldFallbacks { get; init; }
    public required PdfFont Mono { get; init; }
    public required PdfFont MonoBold { get; init; }
    public required PdfFont MonoLight { get; init; }
    public required PdfFont Serif { get; init; }
    public required PdfFont SerifBold { get; init; }

    public static FontSet Load(string fontDir, string chineseLanguage, string themeKey)
    {
        var useSansCjk = themeKey is "statement_red" or "civic_blue";
        var cjkRegular = CjkFont(chineseLanguage, useSansCjk, false);
        var cjkBold = CjkFont(chineseLanguage, useSansCjk, true);
        var cjkRegularFallback = CjkFallbackFont(chineseLanguage, useSansCjk, false);
        var cjkBoldFallback = CjkFallbackFont(chineseLanguage, useSansCjk, true);
        var cjk = PdfFontFactory.CreateFont(Path.Combine(fontDir, cjkRegular), PdfEncodings.IDENTITY_H);
        var cjkBoldFont = PdfFontFactory.CreateFont(Path.Combine(fontDir, cjkBold), PdfEncodings.IDENTITY_H);
        var cjkFallback = PdfFontFactory.CreateFont(Path.Combine(fontDir, cjkRegularFallback), PdfEncodings.IDENTITY_H);
        var cjkBoldFallbackFont = PdfFontFactory.CreateFont(Path.Combine(fontDir, cjkBoldFallback), PdfEncodings.IDENTITY_H);
        return new FontSet
        {
            Regular = PdfFontFactory.CreateFont(Path.Combine(fontDir, "Arial.ttf"), PdfEncodings.IDENTITY_H),
            Bold = PdfFontFactory.CreateFont(Path.Combine(fontDir, "Arial Bold.ttf"), PdfEncodings.IDENTITY_H),
            Cjk = cjk,
            CjkBold = cjkBoldFont,
            CjkFallbacks = [cjk, cjkFallback],
            CjkBoldFallbacks = [cjkBoldFont, cjkBoldFallbackFont],
            Mono = PdfFontFactory.CreateFont(Path.Combine(fontDir, "SF-Mono-Regular.ttf"), PdfEncodings.IDENTITY_H),
            MonoBold = PdfFontFactory.CreateFont(Path.Combine(fontDir, "SF-Mono-Bold.ttf"), PdfEncodings.IDENTITY_H),
            MonoLight = PdfFontFactory.CreateFont(Path.Combine(fontDir, "SF-Mono-Light.ttf"), PdfEncodings.IDENTITY_H),
            Serif = PdfFontFactory.CreateFont(Path.Combine(fontDir, "Times New Roman.ttf"), PdfEncodings.IDENTITY_H),
            SerifBold = PdfFontFactory.CreateFont(Path.Combine(fontDir, "Times New Roman Bold.ttf"), PdfEncodings.IDENTITY_H),
        };
    }

    private static string CjkFont(string chineseLanguage, bool sans, bool bold)
    {
        if (sans)
        {
            var family = chineseLanguage == "sc" ? "PingFang-SC" : "PingFang-HK";
            return $"{family}-{(bold ? "Semibold" : "Regular")}.ttf";
        }
        if (chineseLanguage == "sc")
        {
            return $"Songti-SC-{(bold ? "Bold" : "Regular")}.ttf";
        }
        return bold ? "Songti.ttc,2" : "Songti.ttc,4";
    }

    private static string CjkFallbackFont(string chineseLanguage, bool sans, bool bold)
    {
        if (sans)
        {
            var family = chineseLanguage == "sc" ? "PingFang-HK" : "PingFang-SC";
            return $"{family}-{(bold ? "Semibold" : "Regular")}.ttf";
        }
        if (chineseLanguage == "sc")
        {
            return bold ? "Songti.ttc,2" : "Songti.ttc,4";
        }
        return $"Songti-SC-{(bold ? "Bold" : "Regular")}.ttf";
    }
}
