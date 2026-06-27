using System.Security.Cryptography;
using System.Text;
using MySqlConnector;

namespace BudgetCentre.PdfRenderer;

public sealed partial class ExportRepository
{
    public bool VerifyJobToken(ExportJob job)
    {
        if (string.IsNullOrWhiteSpace(job.JobToken) || string.IsNullOrWhiteSpace(config.JobSecret))
        {
            return false;
        }
        var expected = ExportJobToken(config.JobSecret, job.Id, job.BudgetId, job.UserId, job.Scope, job.FileName);
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(expected),
            Encoding.ASCII.GetBytes(job.JobToken));
    }

    public Task AuditAsync(long exportId, string eventName, string message, object? metadata, CancellationToken cancellationToken)
    {
        return AuditAsync(exportId, eventName, message, metadata, config.WorkerId, cancellationToken);
    }

    private async Task AuditAsync(long exportId, string eventName, string message, object? metadata, string? workerId, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
INSERT INTO budget_export_audit_logs (export_id, event, worker_id, message, metadata_json)
VALUES (@exportId, @event, @workerId, @message, @metadata)", connection);
        command.Parameters.AddWithValue("@exportId", exportId);
        command.Parameters.AddWithValue("@event", eventName);
        command.Parameters.AddWithValue("@workerId", string.IsNullOrWhiteSpace(workerId) ? DBNull.Value : workerId);
        command.Parameters.AddWithValue("@message", string.IsNullOrWhiteSpace(message) ? DBNull.Value : Truncate(message, 1000));
        command.Parameters.AddWithValue("@metadata", metadata is null ? DBNull.Value : System.Text.Json.JsonSerializer.Serialize(metadata));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string ExportJobToken(string secret, long exportId, long budgetId, long userId, string scope, string fileName)
    {
        var payload = $"{exportId}|{budgetId}|{userId}|{scope}|{fileName}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
    }

    private async Task AuditBestEffortAsync(long exportId, string eventName, string message, object? metadata, CancellationToken cancellationToken)
    {
        try
        {
            await AuditAsync(exportId, eventName, message, metadata, cancellationToken);
        }
        catch
        {
        }
    }

    private static string Truncate(string value, int maxLength)
    {
        return value.Length <= maxLength ? value : value[..maxLength];
    }
}
