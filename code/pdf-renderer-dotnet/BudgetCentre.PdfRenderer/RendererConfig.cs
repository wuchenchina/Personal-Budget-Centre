using MySqlConnector;

namespace BudgetCentre.PdfRenderer;

public sealed record RendererConfig
{
    public required string WorkerId { get; init; }
    public required string ConnectionString { get; init; }
    public required string ExportStorageDir { get; init; }
    public required string ExportTempDir { get; init; }
    public required string FontDir { get; init; }
    public required string LogDir { get; init; }
    public required string JobSecret { get; init; }
    public int MinWorkers { get; init; }
    public int MaxWorkers { get; init; }
    public int BatchSize { get; init; }
    public int LargeRowThreshold { get; init; }
    public int LargeJobConcurrency { get; init; }
    public TimeSpan PollInterval { get; init; }
    public TimeSpan LockTimeout { get; init; }

    public static RendererConfig Load()
    {
        var host = Env("DB_HOST", "172.17.0.1");
        var port = EnvInt("DB_PORT", 3306);
        var database = Env("DB_NAME", "");
        var user = Env("DB_USER", "");
        var password = Env("DB_PASSWORD", "");
        var builder = new MySqlConnectionStringBuilder
        {
            Server = host,
            Port = (uint)port,
            Database = database,
            UserID = user,
            Password = password,
            AllowUserVariables = true,
            ConvertZeroDateTime = true,
            DefaultCommandTimeout = 180,
        };

        return new RendererConfig
        {
            WorkerId = Env("PDF_RENDERER_WORKER_ID", $"pdf-renderer-{Environment.MachineName}-{Environment.ProcessId}"),
            ConnectionString = builder.ConnectionString,
            ExportStorageDir = Env("EXPORT_STORAGE_DIR", "/app/storage/exports"),
            ExportTempDir = Env("EXPORT_TEMP_DIR", "/app/storage/tmp/pdf"),
            FontDir = Env("FONT_DIR", "/app/font"),
            LogDir = Env("APP_LOG_DIR", "/app/storage/logs"),
            JobSecret = Env("PDF_RENDERER_JOB_SECRET", Env("APP_KEY", "")),
            MinWorkers = Math.Max(1, EnvInt("PDF_RENDERER_MIN_WORKERS", 1)),
            MaxWorkers = Math.Max(1, EnvInt("PDF_RENDERER_MAX_WORKERS", 4)),
            BatchSize = Math.Max(100, EnvInt("PDF_RENDERER_BATCH_SIZE", 1000)),
            LargeRowThreshold = Math.Max(1000, EnvInt("PDF_RENDERER_LARGE_ROW_THRESHOLD", 100000)),
            LargeJobConcurrency = Math.Max(1, EnvInt("PDF_RENDERER_LARGE_JOB_CONCURRENCY", 2)),
            PollInterval = TimeSpan.FromMilliseconds(Math.Max(100, EnvInt("PDF_RENDERER_POLL_MS", 100))),
            LockTimeout = TimeSpan.FromSeconds(Math.Max(30, EnvInt("PDF_RENDERER_LOCK_TIMEOUT_SECONDS", 300))),
        };
    }

    private static string Env(string key, string fallback)
    {
        var value = Environment.GetEnvironmentVariable(key);
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }

    private static int EnvInt(string key, int fallback)
    {
        var value = Environment.GetEnvironmentVariable(key);
        return int.TryParse(value, out var parsed) ? parsed : fallback;
    }
}
