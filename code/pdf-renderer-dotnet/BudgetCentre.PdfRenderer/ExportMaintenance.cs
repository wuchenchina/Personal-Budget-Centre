using MySqlConnector;

namespace BudgetCentre.PdfRenderer;

public sealed partial class ExportRepository
{
    public async Task RunMaintenanceAsync(CancellationToken cancellationToken)
    {
        await FailStaleProcessingJobsAsync(cancellationToken);
        await DeleteExpiredFailedJobsAsync(cancellationToken);
        await EnforceTotalBytesAsync(cancellationToken);
        await DeleteOrphanExportFilesAsync(cancellationToken);
        await DeleteSafeStaleTempFilesAsync(cancellationToken);
    }

    private async Task PruneOldExportsAsync(ExportJob job, CancellationToken cancellationToken)
    {
        var keep = Math.Max(1, EnvironmentInt("EXPORT_RETENTION_PER_BUDGET", 3));
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var select = new MySqlCommand($@"
SELECT id, file_path
FROM budget_exports
WHERE budget_id = @budgetId
  AND format = 'pdf'
  AND scope = @scope
  AND status IN ('completed', 'failed')
  AND id NOT IN (
    SELECT id FROM (
      SELECT id
      FROM budget_exports
      WHERE budget_id = @budgetId AND format = 'pdf' AND scope = @scope AND status = 'completed'
      ORDER BY created_at DESC, id DESC
      LIMIT {keep}
    ) recent_exports
  )
ORDER BY created_at ASC, id ASC", connection);
        select.Parameters.AddWithValue("@budgetId", job.BudgetId);
        select.Parameters.AddWithValue("@scope", job.Scope);
        var stale = new List<(long Id, string? Path)>();
        await using (var reader = await select.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                stale.Add((reader.GetInt64(0), reader.IsDBNull(1) ? null : reader.GetString(1)));
            }
        }

        foreach (var item in stale)
        {
            if (!string.IsNullOrWhiteSpace(item.Path))
            {
                TryDelete(Path.Combine(config.ExportStorageDir, Path.GetFileName(item.Path)));
            }
            await using var delete = new MySqlCommand("DELETE FROM budget_exports WHERE id = @id", connection);
            delete.Parameters.AddWithValue("@id", item.Id);
            await delete.ExecuteNonQueryAsync(cancellationToken);
            await AuditBestEffortAsync(job.Id, "cleanup_retention", $"Removed stale export record {item.Id}.", new { item.Id, item.Path }, cancellationToken);
        }
    }

    private async Task FailStaleProcessingJobsAsync(CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
UPDATE budget_exports
SET status = 'failed',
    progress_stage = 'failed',
    error_message = 'PDF renderer heartbeat expired.',
    locked_by = NULL,
    locked_until = NULL,
    completed_at = UTC_TIMESTAMP()
WHERE status = 'processing'
  AND locked_until IS NOT NULL
  AND locked_until < UTC_TIMESTAMP()", connection);
        var affected = await command.ExecuteNonQueryAsync(cancellationToken);
        if (affected > 0)
        {
            Console.WriteLine($"Marked {affected} stale PDF export job(s) as failed.");
        }
    }

    private async Task DeleteExpiredFailedJobsAsync(CancellationToken cancellationToken)
    {
        var maxAgeDays = Math.Max(1, EnvironmentInt("PDF_EXPORT_FAILED_MAX_AGE_DAYS", 14));
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var select = new MySqlCommand(@"
SELECT id, file_path
FROM budget_exports
WHERE status = 'failed'
  AND COALESCE(completed_at, created_at) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL @days DAY)", connection);
        select.Parameters.AddWithValue("@days", maxAgeDays);
        var items = new List<(long Id, string? Path)>();
        await using (var reader = await select.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                items.Add((reader.GetInt64(0), reader.IsDBNull(1) ? null : reader.GetString(1)));
            }
        }
        await DeleteExportRecordsAsync(connection, items, cancellationToken);
    }

    private async Task EnforceTotalBytesAsync(CancellationToken cancellationToken)
    {
        var maxBytes = EnvironmentLong("PDF_EXPORT_MAX_TOTAL_BYTES", 0);
        if (maxBytes <= 0)
        {
            return;
        }

        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var select = new MySqlCommand(@"
SELECT id, file_path, COALESCE(file_size, 0)
FROM budget_exports
WHERE status = 'completed' AND file_path IS NOT NULL
ORDER BY completed_at DESC, id DESC", connection);
        var rows = new List<(long Id, string Path, long Size)>();
        await using (var reader = await select.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add((reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2)));
            }
        }

        var total = rows.Sum(v => v.Size > 0 ? v.Size : FileSize(v.Path));
        var stale = new List<(long Id, string? Path)>();
        foreach (var row in rows.AsEnumerable().Reverse())
        {
            if (total <= maxBytes)
            {
                break;
            }
            stale.Add((row.Id, row.Path));
            total -= row.Size > 0 ? row.Size : FileSize(row.Path);
        }
        await DeleteExportRecordsAsync(connection, stale, cancellationToken);
    }

    private async Task DeleteOrphanExportFilesAsync(CancellationToken cancellationToken)
    {
        if (!Directory.Exists(config.ExportStorageDir))
        {
            return;
        }
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var select = new MySqlCommand("SELECT file_path FROM budget_exports WHERE status = 'completed' AND file_path IS NOT NULL", connection);
        var known = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using (var reader = await select.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                known.Add(Path.GetFileName(reader.GetString(0)));
            }
        }

        foreach (var file in Directory.EnumerateFiles(config.ExportStorageDir, "*.pdf"))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!known.Contains(Path.GetFileName(file)))
            {
                TryDelete(file);
            }
        }
    }

    private async Task DeleteSafeStaleTempFilesAsync(CancellationToken cancellationToken)
    {
        var jobsDir = Path.Combine(config.ExportTempDir, "jobs");
        if (!Directory.Exists(jobsDir))
        {
            return;
        }

        var maxAgeHours = Math.Max(1, EnvironmentInt("PDF_EXPORT_TMP_MAX_AGE_HOURS", 24));
        var cutoff = DateTime.UtcNow.AddHours(-maxAgeHours);
        foreach (var file in Directory.EnumerateFiles(jobsDir, "*.tmp.pdf"))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var info = new FileInfo(file);
            var lease = file[..^".tmp.pdf".Length] + ".lease";
            if (info.LastWriteTimeUtc > cutoff)
            {
                continue;
            }
            if (File.Exists(lease) && File.GetLastWriteTimeUtc(lease) > cutoff)
            {
                continue;
            }
            if (await IsActiveTempFileAsync(Path.GetFileName(file), cancellationToken))
            {
                continue;
            }
            TryDelete(file);
            TryDelete(lease);
        }
    }

    private async Task<bool> IsActiveTempFileAsync(string fileName, CancellationToken cancellationToken)
    {
        var name = fileName.EndsWith(".tmp.pdf", StringComparison.OrdinalIgnoreCase)
            ? fileName[..^".tmp.pdf".Length]
            : Path.GetFileNameWithoutExtension(fileName);
        var parts = name.Split('-', 2);
        if (parts.Length != 2 || !long.TryParse(parts[0], out var exportId) || !int.TryParse(parts[1], out var attempt))
        {
            return false;
        }
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT COUNT(*)
FROM budget_exports
WHERE id = @id
  AND attempt = @attempt
  AND status = 'processing'
  AND locked_until IS NOT NULL
  AND locked_until >= UTC_TIMESTAMP()", connection);
        command.Parameters.AddWithValue("@id", exportId);
        command.Parameters.AddWithValue("@attempt", attempt);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken) ?? 0) > 0;
    }

    private async Task DeleteExportRecordsAsync(MySqlConnection connection, IEnumerable<(long Id, string? Path)> items, CancellationToken cancellationToken)
    {
        foreach (var item in items)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!string.IsNullOrWhiteSpace(item.Path))
            {
                TryDelete(Path.Combine(config.ExportStorageDir, Path.GetFileName(item.Path)));
            }
            await using var delete = new MySqlCommand("DELETE FROM budget_exports WHERE id = @id", connection);
            delete.Parameters.AddWithValue("@id", item.Id);
            await delete.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private long FileSize(string filePath)
    {
        var path = Path.Combine(config.ExportStorageDir, Path.GetFileName(filePath));
        return File.Exists(path) ? new FileInfo(path).Length : 0;
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    private static int EnvironmentInt(string key, int fallback)
    {
        var value = Environment.GetEnvironmentVariable(key);
        return int.TryParse(value, out var parsed) ? parsed : fallback;
    }

    private static long EnvironmentLong(string key, long fallback)
    {
        var value = Environment.GetEnvironmentVariable(key);
        return long.TryParse(value, out var parsed) ? parsed : fallback;
    }
}
