using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using BudgetCentre.PdfRenderer.Theme;
using iText.Layout;
using iText.Layout.Element;
using iText.Layout.Properties;
using iText.Svg.Converter;

namespace BudgetCentre.PdfRenderer;

public sealed partial class PdfExportRenderer
{
    private sealed record SignaturePalette(
        string TitleFill,
        string TitleStroke,
        string TitleText,
        string Border,
        string Divider,
        string NoteDivider,
        string NoteFill,
        string NoteStroke,
        string BodyText,
        string MutedText,
        string SignatureLine,
        string PatternPrimary,
        string PatternSecondary,
        string PatternTertiary,
        string PatternGuide);

    private sealed record SignatureMetrics(float LabelSizeMm, float ValueSizeMm, float SmallValueMm, float LineHeightMm, float FieldSpacingMm);
    private sealed record SignatureField(string Label, string Value);
    private sealed record SignatureRow(bool ShowSignature, IReadOnlyList<SignatureField> Fields, string PrimaryNote, string DetailNote, bool HasDateTime);

    private static void AddSignatureBlock(Document document, PdfTheme theme, FontSet fonts, ExportJob job, BudgetInfo budget, string summary, string fontDir)
    {
        if (job.Scope != "budget")
        {
            return;
        }
        var config = ParseJson(budget.SignatureConfigJson);
        if (config.ValueKind == JsonValueKind.Undefined || !JsonValue.Bool(config, "enabled"))
        {
            return;
        }

        var rows = SignatureRows(config, job.Options);
        if (rows.Count == 0)
        {
            return;
        }

        var widthMm = JsonValue.String(config, "sectionAlign") == "right" ? 76f : theme.Signature.FullWidthMm;
        var svg = BuildSignatureSvg(config, rows, widthMm, theme, job.Options, budget, job, summary, fontDir);
        var heightMm = SignatureSvgHeight(config, rows, widthMm, theme, job.Options);

        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(svg));
        var image = SvgConverter.ConvertToImage(stream, document.GetPdfDocument())
            .SetWidth(Mm(widthMm))
            .SetHeight(Mm(heightMm))
            .SetMarginTop(theme.Signature.MarginTop);
        if (widthMm <= 80)
        {
            image.SetHorizontalAlignment(HorizontalAlignment.RIGHT);
        }
        document.Add(image);
    }

    private static string BuildSignatureSvg(
        JsonElement config,
        IReadOnlyList<SignatureRow> rows,
        float width,
        PdfTheme theme,
        ExportOptions options,
        BudgetInfo budget,
        ExportJob job,
        string summary,
        string fontDir)
    {
        var height = SignatureSvgHeight(config, rows, width, theme, options);
        var titleRows = SignatureTitleRows(SignatureSectionTitle(config, options), width, theme);
        var titleBandHeight = SignatureTitleBandHeight(titleRows, theme);
        var signingRows = rows.Where(v => v.ShowSignature).ToList();
        var noteRows = rows.Where(v => !v.ShowSignature && (!string.IsNullOrWhiteSpace(v.PrimaryNote) || !string.IsNullOrWhiteSpace(v.DetailNote))).ToList();
        var palette = SignaturePaletteForTheme(theme);
        var check = ShortHash($"{job.Id}:{budget.Id}:{budget.Title}:{job.Scope}:{summary}");

        var svg = new StringBuilder();
        svg.Append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"")
            .Append(SigNum(width)).Append("mm\" height=\"").Append(SigNum(height)).Append("mm\" viewBox=\"0 0 ")
            .Append(SigNum(width)).Append(' ').Append(SigNum(height)).Append("\">");
        svg.Append(SignatureFontFaceSvgStyle(fontDir, options.PrimaryChineseLanguage(), theme));
        var outerStrokeWidth = 0.2f;
        var outerInset = outerStrokeWidth / 2;
        svg.Append("<rect x=\"0\" y=\"0\" width=\"").Append(SigNum(width)).Append("\" height=\"")
            .Append(SigNum(titleBandHeight)).Append("\" fill=\"").Append(palette.TitleFill).Append("\"/>");
        svg.Append(SignatureTitleSvg(titleRows, palette, theme));
        svg.Append("<rect x=\"0\" y=\"").Append(SigNum(titleBandHeight)).Append("\" width=\"").Append(SigNum(width))
            .Append("\" height=\"").Append(SigNum(height - titleBandHeight)).Append("\" fill=\"#fff\"/>");
        svg.Append(LineSvg(outerInset, titleBandHeight, width - outerInset, titleBandHeight, palette.Border, outerStrokeWidth));

        var rowTop = titleBandHeight + 2;
        for (var index = 0; index < signingRows.Count; index++)
        {
            var row = signingRows[index];
            var rowHeight = SignatureRowHeight(row, width);
            if (index > 0)
            {
                svg.Append(LineSvg(2, rowTop - 1.1f, width - 2, rowTop - 1.1f, palette.Divider, 0.16f));
            }
            var box = SignatureBoxMetrics(rowTop, width, Math.Max(1, row.Fields.Count));
            svg.Append(SignatureBoxSvg(config, rowTop, width, Math.Max(1, row.Fields.Count), palette, check));
            svg.Append(SignatureMetaSvg(row.Fields, rowTop, width, box.X, palette));
            rowTop += rowHeight;
        }

        if (noteRows.Count > 0)
        {
            if (signingRows.Count > 0)
            {
                svg.Append(LineSvg(2, rowTop - 1.1f, width - 2, rowTop - 1.1f, palette.NoteDivider, 0.14f));
            }
            svg.Append(SignatureNotesSvg(noteRows, rowTop, width, palette));
        }
        svg.Append("<rect x=\"").Append(SigNum(outerInset)).Append("\" y=\"").Append(SigNum(outerInset)).Append("\" width=\"")
            .Append(SigNum(width - outerStrokeWidth)).Append("\" height=\"").Append(SigNum(height - outerStrokeWidth))
            .Append("\" fill=\"none\" stroke=\"").Append(palette.Border).Append("\" stroke-width=\"")
            .Append(SigNum(outerStrokeWidth)).Append("\"/>");
        svg.Append("</svg>");
        return svg.ToString();
    }

    private static float SignatureSvgHeight(JsonElement config, IReadOnlyList<SignatureRow> rows, float width, PdfTheme theme, ExportOptions options)
    {
        var titleBandHeight = SignatureTitleBandHeight(SignatureTitleRows(SignatureSectionTitle(config, options), width, theme), theme);
        if (rows.Count == 0)
        {
            return titleBandHeight + 4 + SignatureMinimumRowHeight(width);
        }
        var total = titleBandHeight + 4;
        foreach (var row in rows.Where(v => v.ShowSignature))
        {
            total += SignatureRowHeight(row, width);
        }
        total += SignatureNotesBlockHeight(rows.Where(v => !v.ShowSignature).ToList(), width);
        return total;
    }

    private static float SignatureRowHeight(SignatureRow row, float width)
    {
        var fieldCount = Math.Max(1, row.Fields.Count);
        var metrics = SignatureMetricsDefault();
        if (!row.ShowSignature)
        {
            return width <= 80 ? Math.Max(14, 5.5f + fieldCount * metrics.FieldSpacingMm) : Math.Max(11, 5.5f + fieldCount * metrics.FieldSpacingMm);
        }
        if (width <= 80)
        {
            return Math.Max(SignatureMinimumRowHeight(width), Math.Max(24, 4.6f + fieldCount * metrics.FieldSpacingMm) + 23);
        }
        return Math.Max(SignatureMinimumRowHeight(width), 10.5f + fieldCount * metrics.FieldSpacingMm);
    }

    private static float SignatureMinimumRowHeight(float width) => width <= 80 ? 51 : 39;

    private static SignatureMetrics SignatureMetricsDefault() => new(PtToMm(6), PtToMm(7.2f), PtToMm(6), PtToMm(7.2f), 5);

    private static IReadOnlyList<IReadOnlyList<string>> SignatureTitleRows(string title, float width, PdfTheme theme)
    {
        var fontSize = PtToMm(theme.Signature.TitleFontSize);
        var maxWidth = Math.Max(36, width - 4);
        var rows = new List<IReadOnlyList<string>>();
        var current = new List<string>();
        var currentWidth = 0f;
        foreach (var raw in title.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var part = SignatureFitText(raw, maxWidth);
            var partWidth = SignatureEstimatedTextWidth(part, fontSize);
            var candidateWidth = currentWidth + partWidth + (current.Count > 0 ? 3 : 0);
            if (current.Count > 0 && candidateWidth > maxWidth)
            {
                rows.Add(current);
                current = [part];
                currentWidth = partWidth;
                continue;
            }
            current.Add(part);
            currentWidth = candidateWidth;
        }
        if (current.Count > 0)
        {
            rows.Add(current);
        }
        return rows.Count == 0 ? [[title]] : rows.Take(4).ToList();
    }

    private static float SignatureTitleBandHeight(IReadOnlyList<IReadOnlyList<string>> titleRows, PdfTheme theme)
    {
        var fontSize = PtToMm(theme.Signature.TitleFontSize);
        return Math.Max(theme.Signature.TitleMinHeightMm, theme.Signature.TitlePaddingTopMm * 2 + titleRows.Count * fontSize * theme.Signature.TitleLineHeight);
    }

    private static string SignatureTitleSvg(IReadOnlyList<IReadOnlyList<string>> titleRows, SignaturePalette palette, PdfTheme theme)
    {
        var fontSize = PtToMm(theme.Signature.TitleFontSize);
        var lineHeight = fontSize * theme.Signature.TitleLineHeight;
        var svg = new StringBuilder();
        for (var rowIndex = 0; rowIndex < titleRows.Count; rowIndex++)
        {
            var x = 2f;
            var y = theme.Signature.TitlePaddingTopMm + fontSize + rowIndex * lineHeight;
            foreach (var segment in titleRows[rowIndex])
            {
                svg.Append(SignatureTextSvg(x, y, segment, fontSize, palette.TitleText, "theme-title"));
                x += SignatureEstimatedTextWidth(segment, fontSize) + 3;
            }
        }
        return svg.ToString();
    }

    private sealed record SignatureBoxLayout(float X, float Y, float Width, float Height);

    private static string SignatureMetaSvg(IReadOnlyList<SignatureField> fields, float rowTop, float width, float boxX, SignaturePalette palette)
    {
        var metrics = SignatureMetricsDefault();
        var labelX = 3f;
        var valueX = 37f;
        var valueWidth = Math.Max(32, boxX - valueX - 12);
        if (width <= 80)
        {
            valueX = 25;
            valueWidth = 46;
        }
        var baseline = rowTop + 4;
        var svg = new StringBuilder();
        foreach (var (field, index) in fields.Take(18).Select((field, index) => (field, index)))
        {
            var y = baseline + index * metrics.FieldSpacingMm;
            var labelLines = SignaturePackedTextLines(field.Label, valueX - labelX - 2, metrics.LabelSizeMm, 3);
            for (var lineIndex = 0; lineIndex < labelLines.Count; lineIndex++)
            {
                svg.Append(SignatureTextSvg(labelX, y + lineIndex * metrics.LineHeightMm, labelLines[lineIndex], metrics.LabelSizeMm, palette.MutedText, "sf-mono-light"));
            }
            var valueLines = field.Value.Contains('\n') ? SignaturePackedTextLines(field.Value, valueWidth, metrics.SmallValueMm, 3) : [SignatureFitText(field.Value, valueWidth)];
            var valueSize = valueLines.Count > 1 ? metrics.SmallValueMm : metrics.ValueSizeMm;
            for (var lineIndex = 0; lineIndex < valueLines.Count; lineIndex++)
            {
                svg.Append(SignatureTextSvg(valueX, y + lineIndex * metrics.LineHeightMm, valueLines[lineIndex], valueSize, palette.BodyText, "sf-mono"));
            }
        }
        return svg.ToString();
    }

    private static string SignatureBoxSvg(JsonElement config, float rowTop, float width, int fieldCount, SignaturePalette palette, string check)
    {
        var box = SignatureBoxMetrics(rowTop, width, fieldCount);
        var label = SignatureLabelForDisplay(config);
        var captionLines = label.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Take(7).ToList();
        if (captionLines.Count == 0)
        {
            captionLines.Add(label);
        }
        var captionLineHeight = 2.45f;
        var captionLeft = box.X + 4;
        var captionRight = box.X + box.Width - 4;
        var captionBottomY = box.Y + box.Height - 1.6f;
        var captionY = captionBottomY - (captionLines.Count - 1) * captionLineHeight;
        var lineY = Math.Max(box.Y + 8, captionY - 2);
        var svg = new StringBuilder();
        svg.Append("<rect x=\"").Append(SigNum(box.X)).Append("\" y=\"").Append(SigNum(box.Y)).Append("\" width=\"")
            .Append(SigNum(box.Width)).Append("\" height=\"").Append(SigNum(box.Height)).Append("\" fill=\"#fff\" stroke=\"")
            .Append(palette.Border).Append("\" stroke-width=\"0.2\"/>");
        svg.Append(SignatureSecurityPatternSvg(box.X, box.Y, box.Width, box.Height, palette, check));
        svg.Append(LineSvg(box.X + 4, lineY, box.X + box.Width - 4, lineY, palette.SignatureLine, 0.16f));
        var alignRight = JsonValue.String(config, "labelAlign") == "right";
        foreach (var (line, index) in captionLines.Select((line, index) => (line, index)))
        {
            var text = SignatureFitText(line, captionRight - captionLeft);
            var textWidth = Math.Min(captionRight - captionLeft, SignatureEstimatedTextWidth(text, 1.75f) + 0.35f);
            var textX = alignRight ? captionRight - textWidth : captionLeft;
            svg.Append(SignatureTextSvg(textX, captionY + index * captionLineHeight, text, 1.75f, palette.MutedText, "sf-mono-light"));
        }
        return svg.ToString();
    }

    private static SignatureBoxLayout SignatureBoxMetrics(float rowTop, float width, int fieldCount)
    {
        if (width <= 80)
        {
            return new SignatureBoxLayout(5, rowTop + Math.Max(27, 4.6f + fieldCount * 5), 66, 24);
        }
        return new SignatureBoxLayout(width - 72 - 7, rowTop + 4.5f, 72, 29);
    }

    private static string SignatureSecurityPatternSvg(float x, float y, float width, float height, SignaturePalette palette, string check)
    {
        var innerTop = y + 4.8f;
        var innerBottom = y + height - 7.3f;
        var left = x + 4;
        var right = x + width - 4;
        var middle = y + height / 2 - 0.8f;
        var seed = Math.Abs(check.GetHashCode());
        float J(float min, float max, int salt)
        {
            var value = ((seed + salt * 7919) % 1000) / 999f;
            return min + (max - min) * value;
        }
        var waveGap = J(1.7f, 2.8f, 4);
        var thirdMiddle = middle + J(3.1f, 4.5f, 9);
        var svg = new StringBuilder();
        svg.Append(PathSvg($"M {SigNum(left)} {SigNum(middle)} C {SigNum(x + J(17, 22, 1))} {SigNum(innerTop + J(-0.7f, 0.9f, 2))}, {SigNum(x + width - J(17, 22, 3))} {SigNum(innerBottom + J(-0.8f, 0.8f, 5))}, {SigNum(right)} {SigNum(middle)}", palette.PatternPrimary, 0.18f));
        svg.Append(PathSvg($"M {SigNum(left)} {SigNum(middle + waveGap)} C {SigNum(x + J(18, 23, 6))} {SigNum(innerBottom + J(-0.6f, 0.9f, 7))}, {SigNum(x + width - J(18, 23, 8))} {SigNum(innerTop + J(-0.5f, 0.7f, 10))}, {SigNum(right)} {SigNum(middle + waveGap)}", palette.PatternSecondary, 0.18f));
        svg.Append(PathSvg($"M {SigNum(left + 2)} {SigNum(thirdMiddle)} C {SigNum(x + J(20, 25, 11))} {SigNum(innerTop + J(2.2f, 4, 12))}, {SigNum(x + width - J(20, 25, 13))} {SigNum(innerBottom + J(0.4f, 1.6f, 14))}, {SigNum(right - 2)} {SigNum(thirdMiddle + J(-0.8f, 0.6f, 15))}", palette.PatternPrimary, 0.16f));
        svg.Append(LineSvg(x + 7, y + J(5.7f, 7, 16), x + width - 7, y + height - J(7.8f, 9.3f, 17), palette.PatternTertiary, 0.12f));
        svg.Append(LineSvg(x + width - 7, y + J(5.9f, 7.2f, 18), x + 7, y + height - J(7.7f, 9, 19), palette.PatternTertiary, 0.12f));
        svg.Append(LineSvg(x + 7, y + J(7.7f, 10.2f, 20), x + width - 7, y + J(7.7f, 10.2f, 21), palette.PatternGuide, 0.12f));
        svg.Append(SignatureTextSvg(x + width - 17, y + 4.2f, "CHK " + check[..6], 1.25f, palette.PatternGuide, "sf-mono-light"));
        return svg.ToString();
    }

    private static string SignatureNotesSvg(IReadOnlyList<SignatureRow> rows, float rowTop, float width, SignaturePalette palette)
    {
        var height = SignatureNotesBlockHeight(rows, width);
        var x = 2f;
        var innerWidth = width - 4;
        var svg = new StringBuilder();
        svg.Append("<rect x=\"").Append(SigNum(x)).Append("\" y=\"").Append(SigNum(rowTop)).Append("\" width=\"")
            .Append(SigNum(innerWidth)).Append("\" height=\"").Append(SigNum(height)).Append("\" fill=\"")
            .Append(palette.NoteFill).Append("\" stroke=\"").Append(palette.NoteStroke).Append("\" stroke-width=\"0.14\"/>");
        var items = rows.Where(v => !string.IsNullOrWhiteSpace(v.PrimaryNote) || !string.IsNullOrWhiteSpace(v.DetailNote)).ToList();
        if (items.Count == 0)
        {
            return svg.ToString();
        }
        var columns = SignatureNoteColumnCount(items, innerWidth);
        var gapX = 3.2f;
        var gapY = 1.8f;
        var cellWidth = (innerWidth - (columns - 1) * gapX) / columns;
        var y = rowTop + 2.3f;
        for (var start = 0; start < items.Count; start += columns)
        {
            var grid = items.Skip(start).Take(columns).ToList();
            var rowHeight = grid.Max(SignatureNoteItemHeight);
            for (var columnIndex = 0; columnIndex < grid.Count; columnIndex++)
            {
                var item = grid[columnIndex];
                var cellX = x + 2 + columnIndex * (cellWidth + gapX);
                svg.Append(SignatureTextSvg(cellX, y + 2.4f, SignatureFitText(item.PrimaryNote, cellWidth), 2.2f, palette.BodyText, "sf-mono"));
                if (!string.IsNullOrWhiteSpace(item.DetailNote))
                {
                    svg.Append(SignatureTextSvg(cellX, y + 5, SignatureFitText(item.DetailNote, cellWidth), 1.85f, palette.MutedText, "sf-mono-light"));
                }
            }
            y += rowHeight + gapY;
        }
        return svg.ToString();
    }

    private static float SignatureNotesBlockHeight(IReadOnlyList<SignatureRow> rows, float width)
    {
        var items = rows.Where(v => !string.IsNullOrWhiteSpace(v.PrimaryNote) || !string.IsNullOrWhiteSpace(v.DetailNote)).ToList();
        if (items.Count == 0)
        {
            return 0;
        }
        var innerWidth = width - 4;
        var columns = SignatureNoteColumnCount(items, innerWidth);
        var contentHeight = 0f;
        var rowCount = 0;
        for (var start = 0; start < items.Count; start += columns)
        {
            var grid = items.Skip(start).Take(columns).ToList();
            contentHeight += grid.Max(SignatureNoteItemHeight);
            rowCount++;
        }
        return Math.Max(7, 4.6f + contentHeight + Math.Max(0, rowCount - 1) * 1.8f);
    }

    private static int SignatureNoteColumnCount(IReadOnlyList<SignatureRow> items, float innerWidth)
    {
        var maxColumns = Math.Max(1, Math.Min(Math.Min(4, items.Count), (int)Math.Floor(innerWidth / 32)));
        if (items.Any(v => v.HasDateTime))
        {
            return Math.Max(1, Math.Min(Math.Min(maxColumns, (int)Math.Floor(innerWidth / 56)), 2));
        }
        var longest = items.Select(v => (v.PrimaryNote + " " + v.DetailNote).Trim().Length).DefaultIfEmpty(0).Max();
        if (longest <= 28) return maxColumns;
        if (longest <= 48) return Math.Max(1, Math.Min(maxColumns, 3));
        return Math.Max(1, Math.Min(maxColumns, 2));
    }

    private static float SignatureNoteItemHeight(SignatureRow item) => string.IsNullOrWhiteSpace(item.DetailNote) ? 3.2f : 5.8f;

    private static List<SignatureRow> SignatureRows(JsonElement config, ExportOptions options)
    {
        if (!config.TryGetProperty("rows", out var rowsElement) || rowsElement.ValueKind != JsonValueKind.Array)
        {
            return [];
        }
        return rowsElement.EnumerateArray().Select(row =>
        {
            var fields = SignatureFields(row, config, options).ToList();
            var note = SignatureNote(row, fields, options);
            return new SignatureRow(JsonValue.Bool(row, "showSignature", true), fields, note.Primary, note.Detail, JsonValue.Bool(row, "showDateTime", true));
        }).ToList();
    }

    private static IReadOnlyList<SignatureField> SignatureFields(JsonElement row, JsonElement config, ExportOptions options)
    {
        var fields = new List<SignatureField>();
        AddSignatureField(fields, row, "showName", SignatureMetaLabel("participant", options), JsonValue.String(row, "displayName"), true);
        if (JsonValue.Bool(row, "showRole", true))
        {
            fields.Add(new SignatureField(SignatureMetaLabel("capacity", options), SignatureRole(JsonValue.String(row, "roleLabel"), config, options)));
        }
        AddSignatureField(fields, row, "showPosition", SignatureMetaLabel("position", options), SignaturePosition(JsonValue.String(row, "position"), options), false);
        AddSignatureField(fields, row, "showEmail", SignatureMetaLabel("email", options), JsonValue.String(row, "email"), false);
        if (row.TryGetProperty("customFields", out var customFields) && customFields.ValueKind == JsonValueKind.Array)
        {
            foreach (var field in customFields.EnumerateArray().Take(12))
            {
                if (!JsonValue.Bool(field, "show", true))
                {
                    continue;
                }
                var label = SignatureCustomLabel(JsonValue.String(field, "label"), options);
                var value = JsonValue.String(field, "value");
                if (!string.IsNullOrWhiteSpace(label) || !string.IsNullOrWhiteSpace(value))
                {
                    fields.Add(new SignatureField(label, value));
                }
            }
        }
        if (JsonValue.Bool(row, "showDateTime", true))
        {
            fields.Add(new SignatureField(SignatureMetaLabel("dateTime", options), SignatureDateTime(JsonValue.String(row, "signedAt"))));
        }
        return fields;
    }

    private static void AddSignatureField(List<SignatureField> fields, JsonElement row, string showKey, string label, string value, bool defaultShow)
    {
        if (JsonValue.Bool(row, showKey, defaultShow) && !string.IsNullOrWhiteSpace(value))
        {
            fields.Add(new SignatureField(label, value));
        }
    }

    private static (string Primary, string Detail) SignatureNote(JsonElement row, IReadOnlyList<SignatureField> fields, ExportOptions options)
    {
        var roleLabel = SignatureMetaLabel("capacity", options);
        var nameLabel = SignatureMetaLabel("participant", options);
        var role = fields.FirstOrDefault(v => v.Label == roleLabel)?.Value ?? "";
        var name = fields.FirstOrDefault(v => v.Label == nameLabel)?.Value ?? "";
        var details = fields.Where(v => v.Label != roleLabel && v.Label != nameLabel)
            .Select(v => string.IsNullOrWhiteSpace(v.Label) ? v.Value : $"{v.Label} {v.Value}")
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .ToList();
        var primary = !string.IsNullOrWhiteSpace(role) && !string.IsNullOrWhiteSpace(name)
            ? $"{role} {name}"
            : !string.IsNullOrWhiteSpace(name) ? $"{nameLabel} {name}" : role;
        if (string.IsNullOrWhiteSpace(primary) && details.Count > 0)
        {
            primary = details[0];
            details.RemoveAt(0);
        }
        return (primary, string.Join(" - ", details));
    }

    private static string SignatureSectionTitle(JsonElement config, ExportOptions options)
    {
        if (JsonValue.Bool(config, "customTitleEnabled") && !string.IsNullOrWhiteSpace(JsonValue.String(config, "title")))
        {
            return JsonValue.String(config, "title");
        }
        return JoinWithLanguages("Preparation & Review Record", "製表及覆核記錄", "制表及复核记录", options.SignatureLabelLanguages);
    }

    private static SignaturePalette SignaturePaletteForTheme(PdfTheme theme)
    {
        return theme.Key switch
        {
            "statement_red" => new("#9d9d9d", "#111111", "#000000", "#111111", "#bfbfbf", "#d9d9d9", "#fafafa", "#d9d9d9", "#111111", "#555555", "#8f8f8f", "#eeeeee", "#f1f1f1", "#f3f3f3", "#f4f4f4"),
            "civic_blue" => new("#1a4480", "#1a4480", "#ffffff", "#dfe1e2", "#dfe1e2", "#dfe1e2", "#e7f6f8", "#dfe1e2", "#1b1b1b", "#565c65", "#005ea8", "#e7f6f8", "#dfe1e2", "#eef7fb", "#f5fbfc"),
            _ => new("#a4a4a4", "#7e7e7e", "#000000", "#7e7e7e", "#bfbfbf", "#d9d9d9", "#fafafa", "#d9d9d9", "#111111", "#555555", "#8f8f8f", "#eeeeee", "#f1f1f1", "#f3f3f3", "#f4f4f4"),
        };
    }

    private static string SignatureMetaLabel(string key, ExportOptions options)
    {
        return key switch
        {
            "participant" => JoinWithLanguages("Name", "姓名", "姓名", options.SignatureLabelLanguages),
            "capacity" => JoinWithLanguages("Capacity", "身份", "身份", options.SignatureLabelLanguages),
            "position" => JoinWithLanguages("Position", "職務", "职务", options.SignatureLabelLanguages),
            "email" => JoinWithLanguages("Email", "電子郵件", "电子邮件", options.SignatureLabelLanguages),
            "dateTime" => JoinWithLanguages("Date & Time", "日期及時間", "日期及时间", options.SignatureLabelLanguages),
            _ => key,
        };
    }

    private static string SignatureRole(string value, JsonElement config, ExportOptions options)
    {
        var trimmed = value.Trim();
        var legacy = new HashSet<string>(StringComparer.Ordinal)
        {
            "Confirmation Signature", "Confirmation / Signature", "Participant", "Signer / Confirmer",
            "确认签署", "确认 / 签署", "签核/确认人", "確認簽署", "確認 / 簽署", "簽核/確認人",
        };
        if (string.IsNullOrWhiteSpace(trimmed) || legacy.Contains(trimmed) || trimmed == SignatureLabel(config))
        {
            return JoinWithLanguages("Confirmed by", "確認", "确认", options.SignatureLabelLanguages);
        }
        return TranslateSignaturePhrase(trimmed, SignatureRolePhrases(), options.SignatureLabelLanguages);
    }

    private static string SignaturePosition(string value, ExportOptions options)
    {
        return value.Trim() switch
        {
            "Budget Owner" or "預算負責人" or "预算负责人" => JoinWithLanguages("Budget Owner", "預算負責人", "预算负责人", options.SignatureLabelLanguages),
            "Finance Owner" or "財務負責人" or "财务负责人" => JoinWithLanguages("Finance Owner", "財務負責人", "财务负责人", options.SignatureLabelLanguages),
            var other => other,
        };
    }

    private static string SignatureCustomLabel(string value, ExportOptions options)
    {
        return value.Trim() switch
        {
            "Telephone" or "Tel. No." or "電話號碼" or "电话号码" => JoinWithLanguages("Tel. No.", "電話號碼", "电话号码", options.SignatureLabelLanguages),
            "Mobile" or "Mobile No." or "流動電話號碼" or "流动电话号码" => JoinWithLanguages("Mobile No.", "流動電話號碼", "流动电话号码", options.SignatureLabelLanguages),
            var other => other,
        };
    }

    private static IReadOnlyList<(string En, string Tc, string Sc)> SignatureRolePhrases() =>
    [
        ("Prepared by", "製表", "制表"),
        ("Handled by", "經辦", "经办"),
        ("Checked by", "覆核", "复核"),
        ("Reviewed by", "審核", "审核"),
        ("Approved by", "審批", "审批"),
        ("Audited by", "審計", "审计"),
        ("Confirmed by", "確認", "确认"),
        ("Verified by", "核驗", "核验"),
        ("Authorised by", "授權", "授权"),
        ("Accepted by", "接納", "接纳"),
        ("Acknowledged by", "知悉確認", "知悉确认"),
        ("Reconciled by", "對賬", "对账"),
        ("Documented by", "記錄", "记录"),
        ("Processed by", "處理", "处理"),
        ("Finance reviewed by", "財務覆核", "财务复核"),
    ];

    private static string TranslateSignaturePhrase(string value, IReadOnlyList<(string En, string Tc, string Sc)> phrases, IReadOnlyList<string> languages)
    {
        var trimmed = value.Trim();
        foreach (var phrase in phrases)
        {
            if (trimmed == phrase.En || trimmed == phrase.Tc || trimmed == phrase.Sc)
            {
                return JoinWithLanguages(phrase.En, phrase.Tc, phrase.Sc, languages);
            }
        }
        return trimmed;
    }

    private static string SignatureLabelForDisplay(JsonElement config)
    {
        var label = SignatureLabel(config);
        var language = SignatureLanguage(config);
        if (language is not ("en_sc" or "en_tc"))
        {
            return label;
        }
        var mode = JsonValue.String(config, "labelMode", "confirmation_signature");
        var chinese = language == "en_sc" ? "sc" : "tc";
        var cn = chinese == "sc"
            ? new Dictionary<string, string> { ["confirmation"] = "确认", ["signature"] = "签署" }
            : new Dictionary<string, string> { ["confirmation"] = "確認", ["signature"] = "簽署" };
        var parts = mode == "confirmation_signature" ? new[] { cn["confirmation"], cn["signature"] } : new[] { cn.GetValueOrDefault(mode, cn["signature"]) };
        return label + " " + JoinSignatureLabelParts(parts, JsonValue.String(config, "labelSeparator"));
    }

    private static string SignatureLabel(JsonElement config)
    {
        var language = SignatureLanguage(config);
        var mode = JsonValue.String(config, "labelMode", "confirmation_signature");
        var primary = language is "en_sc" or "en_tc" ? "en" : language;
        var labels = primary switch
        {
            "sc" => new Dictionary<string, string> { ["confirmation"] = "确认", ["signature"] = "签署" },
            "tc" => new Dictionary<string, string> { ["confirmation"] = "確認", ["signature"] = "簽署" },
            _ => new Dictionary<string, string> { ["confirmation"] = "Confirmation", ["signature"] = "Signature" },
        };
        var parts = mode == "confirmation_signature" ? new[] { labels["confirmation"], labels["signature"] } : new[] { labels.GetValueOrDefault(mode, labels["signature"]) };
        return JoinSignatureLabelParts(parts, JsonValue.String(config, "labelSeparator"));
    }

    private static string SignatureLanguage(JsonElement config)
    {
        var language = JsonValue.String(config, "labelLanguage", "en");
        return language is "en" or "sc" or "tc" or "en_sc" or "en_tc" ? language : "en";
    }

    private static string JoinSignatureLabelParts(IReadOnlyList<string> parts, string separator)
    {
        if (parts.Count == 1) return parts[0];
        return separator switch
        {
            "none" => string.Join(" ", parts),
            "line" => string.Join("\n", parts),
            _ => string.Join(" ", parts),
        };
    }

    private static string JoinWithLanguages(string en, string tc, string sc, IReadOnlyList<string> languages)
    {
        var selected = languages.Count == 0 ? ["en"] : languages;
        var parts = new List<string>();
        foreach (var lang in selected)
        {
            var value = lang switch
            {
                "tc" => tc,
                "sc" => sc,
                _ => en,
            };
            if (!parts.Contains(value))
            {
                parts.Add(value);
            }
        }
        return string.Join(parts.Count == 2 && parts[0] == en ? " " : "\n", parts);
    }

    private static string SignatureDateTime(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) : value.Trim();
    }

    private static IReadOnlyList<string> SignaturePackedTextLines(string value, float maxWidth, float fontSize, int maxLines)
    {
        var parts = value.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct().ToList();
        if (parts.Count == 0) return [""];
        var lines = new List<string>();
        var current = "";
        foreach (var part in parts)
        {
            var candidate = current == "" ? part : current + " " + part;
            if (current != "" && SignatureEstimatedTextWidth(candidate, fontSize) > maxWidth)
            {
                lines.Add(current);
                current = part;
                continue;
            }
            current = candidate;
        }
        if (current != "") lines.Add(current);
        return lines.Take(maxLines).Select(v => SignatureFitText(v, maxWidth)).ToList();
    }

    private static string SignatureFitText(string value, float maxWidth)
    {
        var trimmed = value.Trim();
        var limit = Math.Max(10, (int)Math.Floor(maxWidth / 1.25f));
        return trimmed.Length <= limit ? trimmed : trimmed[..Math.Max(1, limit - 1)] + "...";
    }

    private static float SignatureEstimatedTextWidth(string text, float fontSize)
    {
        var width = 0f;
        foreach (var c in text)
        {
            width += c >= 0x2e80 ? fontSize : fontSize * 0.58f;
        }
        return width;
    }

    private static string SignatureFontFaceSvgStyle(string fontDir, string chineseLanguage, PdfTheme theme)
    {
        string cjkFile;
        if (theme.Key is "statement_red" or "civic_blue")
        {
            cjkFile = chineseLanguage == "sc" ? "PingFang-SC-Regular.ttf" : "PingFang-HK-Regular.ttf";
        }
        else
        {
            cjkFile = chineseLanguage == "sc" ? "PingFang-SC-Regular.ttf" : "PingFang-HK-Regular.ttf";
        }
        return "<style>" +
            FontFace("sf-mono", Path.Combine(fontDir, "SF-Mono-Regular.ttf"), "400") +
            FontFace("sf-mono-light", Path.Combine(fontDir, "SF-Mono-Light.ttf"), "300") +
            FontFace("theme-title", Path.Combine(fontDir, cjkFile), theme.Key == "civic_blue" ? "700" : "400") +
            "</style>";
    }

    private static string FontFace(string family, string path, string weight)
    {
        var uri = new Uri(Path.GetFullPath(path)).AbsoluteUri;
        return "@font-face{font-family:'" + family + "';src:url('" + uri + "');font-weight:" + weight + ";font-style:normal;}";
    }

    private static string SignatureTextSvg(float x, float y, string value, float size, string color, string fontFamily)
    {
        return "<text x=\"" + SigNum(x) + "\" y=\"" + SigNum(y) + "\" font-family=\"" + fontFamily + "\" font-size=\"" + SigNum(size) + "\" fill=\"" + color + "\">" + WebUtility.HtmlEncode(value) + "</text>";
    }

    private static string LineSvg(float x1, float y1, float x2, float y2, string color, float width)
    {
        return "<line x1=\"" + SigNum(x1) + "\" y1=\"" + SigNum(y1) + "\" x2=\"" + SigNum(x2) + "\" y2=\"" + SigNum(y2) + "\" stroke=\"" + color + "\" stroke-width=\"" + SigNum(width) + "\"/>";
    }

    private static string PathSvg(string d, string color, float width)
    {
        return "<path d=\"" + d + "\" fill=\"none\" stroke=\"" + color + "\" stroke-width=\"" + SigNum(width) + "\"/>";
    }

    private static float PtToMm(float value) => value * 25.4f / 72f;

    private static string SigNum(float value) => value.ToString("0.###", CultureInfo.InvariantCulture);
}
