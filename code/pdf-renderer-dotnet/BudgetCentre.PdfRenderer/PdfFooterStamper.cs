using System.Globalization;
using BudgetCentre.PdfRenderer.Theme;
using iText.IO.Font;
using iText.Kernel.Colors;
using iText.Kernel.Font;
using iText.Kernel.Pdf;
using iText.Kernel.Pdf.Canvas;
using iText.Layout;
using iText.Layout.Element;
using iText.Layout.Properties;

namespace BudgetCentre.PdfRenderer;

public static class PdfFooterStamper
{
    public static void Stamp(string path, PdfTheme theme, RendererConfig config)
    {
        var stamped = path + ".stamped";
        using (var pdf = new PdfDocument(new PdfReader(path), new PdfWriter(stamped)))
        {
            var font = PdfFontFactory.CreateFont(Path.Combine(config.FontDir, "Arial.ttf"), PdfEncodings.IDENTITY_H);
            var total = pdf.GetNumberOfPages();
            for (var pageNumber = 1; pageNumber <= total; pageNumber++)
            {
                var page = pdf.GetPage(pageNumber);
                var pageSize = page.GetPageSize();
                var canvas = new PdfCanvas(page.NewContentStreamAfter(), page.GetResources(), pdf);
                var text = theme.FooterShowsTotalPages
                    ? $"Page {pageNumber} of {total}"
                    : pageNumber.ToString(CultureInfo.InvariantCulture);
                var y = pageSize.GetBottom() + Mm(7);
                if (theme.FooterTopRule)
                {
                    canvas.SaveState()
                        .SetStrokeColor(new DeviceRgb(223, 225, 226))
                        .SetLineWidth(0.45f)
                        .MoveTo(pageSize.GetLeft() + Mm(16), y + Mm(3))
                        .LineTo(pageSize.GetRight() - Mm(16), y + Mm(3))
                        .Stroke()
                        .RestoreState();
                }
                using var layoutCanvas = new Canvas(canvas, pageSize);
                layoutCanvas.ShowTextAligned(
                    new Paragraph(text).SetFont(font).SetFontSize(theme.FooterFontSize).SetFontColor(theme.MutedTextColor),
                    pageSize.GetWidth() / 2,
                    y,
                    TextAlignment.CENTER);
            }
        }
        File.Delete(path);
        File.Move(stamped, path);
    }

    private static float Mm(float value) => value * 72f / 25.4f;
}
