using iText.Kernel.Colors;
using iText.Kernel.Geom;

namespace BudgetCentre.PdfRenderer.Theme;

public sealed record PdfTheme
{
    public required string Key { get; init; }
    public required PageSize BudgetPageSize { get; init; }
    public required PageSize BookkeepingPageSize { get; init; }
    public required float MarginTop { get; init; }
    public required float MarginRight { get; init; }
    public required float MarginBottom { get; init; }
    public required float MarginLeft { get; init; }
    public required float BookkeepingMarginTop { get; init; }
    public required float BookkeepingMarginRight { get; init; }
    public required float BookkeepingMarginBottom { get; init; }
    public required float BookkeepingMarginLeft { get; init; }
    public required float TitleFontSize { get; init; }
    public required float SubtitleFontSize { get; init; }
    public required float BodyFontSize { get; init; }
    public required float BookkeepingBodyFontSize { get; init; }
    public required float BookkeepingHeaderFontSize { get; init; }
    public required float HeaderFontSize { get; init; }
    public required float FooterFontSize { get; init; }
    public required DeviceRgb SectionFill { get; init; }
    public required DeviceRgb SectionTextColor { get; init; }
    public required DeviceRgb HeaderFill { get; init; }
    public required DeviceRgb SummaryFill { get; init; }
    public required DeviceRgb BorderColor { get; init; }
    public required DeviceRgb TextColor { get; init; }
    public required DeviceRgb MutedTextColor { get; init; }
    public required DeviceRgb AccentColor { get; init; }
    public required DeviceRgb WatermarkColor { get; init; }
    public required float BorderWidth { get; init; }
    public required float CellPadding { get; init; }
    public required bool HeaderMetaPanel { get; init; }
    public required bool FooterShowsTotalPages { get; init; }
    public required bool FooterTopRule { get; init; }
    public required PdfTableVisualSpec BudgetTable { get; init; }
    public required PdfTableVisualSpec BookkeepingTable { get; init; }
    public required PdfSignatureVisualSpec Signature { get; init; }
}

public sealed record PdfTableVisualSpec
{
    public required float SectionMarginTop { get; init; }
    public required float SectionFontSize { get; init; }
    public required float SectionLineHeight { get; init; }
    public required float SectionPaddingTop { get; init; }
    public required float SectionPaddingBottom { get; init; }
    public required float SectionPaddingHorizontal { get; init; }
    public required float DateFontSize { get; init; }
    public required float DateLineHeight { get; init; }
    public required float DatePaddingTop { get; init; }
    public required float DatePaddingBottom { get; init; }
    public required float DatePaddingHorizontal { get; init; }
    public required bool DateUnderline { get; init; }
    public required float DateBorderTopWidth { get; init; }
    public required float DateBorderBottomWidth { get; init; }
    public required float HeaderFontSize { get; init; }
    public required float HeaderLineHeight { get; init; }
    public required float HeaderPaddingVertical { get; init; }
    public required float HeaderPaddingHorizontal { get; init; }
    public required float HeaderDividerWidth { get; init; }
    public required float HeaderBottomBorderWidth { get; init; }
    public required float BodyFontSize { get; init; }
    public required float BodyLineHeight { get; init; }
    public required float BodyPaddingVertical { get; init; }
    public required float BodyPaddingHorizontal { get; init; }
    public required float BodyBottomBorderWidth { get; init; }
    public required float SummaryTopBorderWidth { get; init; }
    public required float SummaryFirstTopBorderWidth { get; init; }
    public required float MoneySecondaryFontSize { get; init; }
}

public sealed record PdfSignatureVisualSpec
{
    public required float FullWidthMm { get; init; }
    public required float MarginTop { get; init; }
    public required float SectionTopBorderWidth { get; init; }
    public required float TitleFontSize { get; init; }
    public required float TitleLineHeight { get; init; }
    public required float TitleMinHeightMm { get; init; }
    public required float TitlePaddingTopMm { get; init; }
}
