using iText.Kernel.Colors;

namespace BudgetCentre.PdfRenderer.Theme;

internal static class PdfThemePrimitives
{
    public static DeviceRgb Rgb(int red, int green, int blue) => new(red, green, blue);

    public static float Mm(float value) => value * 72f / 25.4f;
}
