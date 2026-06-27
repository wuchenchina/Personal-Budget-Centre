using iText.Kernel.Pdf;
using MySqlConnector;

namespace BudgetCentre.PdfRenderer;

public sealed class HealthCheck(RendererConfig config)
{
    private static readonly string[] RequiredFonts =
    [
        "Arial.ttf",
        "Arial Bold.ttf",
        "PingFang-HK-Regular.ttf",
        "PingFang-HK-Semibold.ttf",
        "PingFang-SC-Regular.ttf",
        "PingFang-SC-Semibold.ttf",
        "SF-Mono-Regular.ttf",
        "SF-Mono-Bold.ttf",
        "SF-Mono-Light.ttf",
        "Songti-SC-Regular.ttf",
        "Songti-SC-Bold.ttf",
        "Songti.ttc",
        "Times New Roman.ttf",
        "Times New Roman Bold.ttf",
    ];

    public async Task ThrowIfUnhealthyAsync(CancellationToken cancellationToken)
    {
        EnsureWritable(config.ExportStorageDir);
        EnsureWritable(config.ExportTempDir);
        EnsureWritable(config.LogDir);
        if (string.IsNullOrWhiteSpace(config.JobSecret))
        {
            throw new InvalidOperationException("Missing PDF renderer job secret. Set PDF_RENDERER_JOB_SECRET or APP_KEY.");
        }
        foreach (var font in RequiredFonts)
        {
            var path = Path.Combine(config.FontDir, font);
            if (!File.Exists(path))
            {
                throw new InvalidOperationException($"Missing PDF font: {path}");
            }
        }

        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand("SELECT 1", connection);
        await command.ExecuteScalarAsync(cancellationToken);

        foreach (var theme in new[] { "classic", "statement_red", "civic_blue" })
        {
            _ = Theme.FontSet.Load(config.FontDir, "tc", theme);
            _ = Theme.FontSet.Load(config.FontDir, "sc", theme);
        }

        using var stream = new MemoryStream();
        using var writer = new PdfWriter(stream);
        using var pdf = new PdfDocument(writer);
        pdf.AddNewPage();
    }

    private static void EnsureWritable(string path)
    {
        Directory.CreateDirectory(path);
        var test = Path.Combine(path, $".bc-write-test-{Guid.NewGuid():N}");
        File.WriteAllText(test, "ok");
        File.Delete(test);
    }
}
