using BudgetCentre.PdfRenderer;

var config = RendererConfig.Load();
Directory.CreateDirectory(config.ExportStorageDir);
Directory.CreateDirectory(config.ExportTempDir);
Directory.CreateDirectory(config.LogDir);

Console.WriteLine($"BudgetCentre PDF renderer starting as {config.WorkerId}");

var health = new HealthCheck(config);
await health.ThrowIfUnhealthyAsync(CancellationToken.None);

var repository = new ExportRepository(config);
var renderer = new PdfExportRenderer(config);
if (args.Contains("--visual-fixtures", StringComparer.OrdinalIgnoreCase))
{
    await new VisualFixtureRunner(config, repository, renderer).RunAsync(CancellationToken.None);
    return;
}
if (args.Contains("--visual-review-set", StringComparer.OrdinalIgnoreCase))
{
    await new VisualFixtureRunner(config, repository, renderer).RunReviewSetAsync(CancellationToken.None);
    return;
}

await repository.RunMaintenanceAsync(CancellationToken.None);
var worker = new ExportWorker(config, repository, renderer);

await worker.RunAsync(CancellationToken.None);
