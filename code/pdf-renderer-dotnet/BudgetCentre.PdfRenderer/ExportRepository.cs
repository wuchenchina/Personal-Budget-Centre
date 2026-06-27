using MySqlConnector;

namespace BudgetCentre.PdfRenderer;

public sealed partial class ExportRepository(RendererConfig config)
{
    public async Task<long> CountClaimableJobsAsync(CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT COUNT(*)
FROM budget_exports
WHERE status = 'queued'
   OR (status = 'processing' AND (locked_until IS NULL OR locked_until < UTC_TIMESTAMP()))", connection);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken) ?? 0);
    }

    public async Task<ExportJob?> ClaimNextJobAsync(CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var tx = await connection.BeginTransactionAsync(cancellationToken);

        var claimUntil = DateTime.UtcNow.Add(config.LockTimeout);
        long? id = null;
        await using (var find = new MySqlCommand(@"
SELECT id
FROM budget_exports
WHERE status = 'queued'
   OR (status = 'processing' AND (locked_until IS NULL OR locked_until < UTC_TIMESTAMP()))
ORDER BY created_at ASC, id ASC
LIMIT 1
FOR UPDATE SKIP LOCKED", connection, tx))
        {
            var value = await find.ExecuteScalarAsync(cancellationToken);
            if (value is not null && value != DBNull.Value)
            {
                id = Convert.ToInt64(value);
            }
        }

        if (id is null)
        {
            await tx.CommitAsync(cancellationToken);
            return null;
        }

        await using (var update = new MySqlCommand(@"
UPDATE budget_exports
SET status = 'processing',
    progress_stage = 'claiming',
    progress_percent = 1,
    locked_by = @worker,
    locked_until = @lockedUntil,
    attempt = attempt + 1,
    started_at = COALESCE(started_at, UTC_TIMESTAMP()),
    error_message = NULL
WHERE id = @id", connection, tx))
        {
            update.Parameters.AddWithValue("@worker", config.WorkerId);
            update.Parameters.AddWithValue("@lockedUntil", claimUntil);
            update.Parameters.AddWithValue("@id", id.Value);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        ExportJob? job;
        await using (var read = new MySqlCommand(@"
SELECT id, budget_id, user_id, scope, file_name, job_token, attempt, options_json
FROM budget_exports
WHERE id = @id", connection, tx))
        {
            read.Parameters.AddWithValue("@id", id.Value);
            await using var reader = await read.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                await tx.CommitAsync(cancellationToken);
                return null;
            }
            job = new ExportJob
            {
                Id = reader.GetInt64(0),
                BudgetId = reader.GetInt64(1),
                UserId = reader.GetInt64(2),
                Scope = reader.GetString(3),
                FileName = reader.GetString(4),
                JobToken = reader.IsDBNull(5) ? "" : reader.GetString(5),
                Attempt = reader.GetInt32(6),
                Options = ExportOptions.FromJson(reader.IsDBNull(7) ? null : reader.GetString(7)),
            };
        }

        await tx.CommitAsync(cancellationToken);
        await AuditAsync(job.Id, "claimed", "Job claimed by PDF renderer.", new { job.Attempt }, cancellationToken);
        return job;
    }

    public async Task UpdateProgressAsync(long exportId, string stage, long processed, long? total, decimal percent, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
UPDATE budget_exports
SET progress_stage = @stage,
    rows_processed = @processed,
    rows_total = @total,
    progress_percent = @percent,
    locked_until = @lockedUntil
WHERE id = @id", connection);
        command.Parameters.AddWithValue("@stage", stage);
        command.Parameters.AddWithValue("@processed", processed);
        command.Parameters.AddWithValue("@total", total.HasValue ? total.Value : DBNull.Value);
        command.Parameters.AddWithValue("@percent", percent);
        command.Parameters.AddWithValue("@lockedUntil", DateTime.UtcNow.Add(config.LockTimeout));
        command.Parameters.AddWithValue("@id", exportId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task CompleteAsync(ExportJob job, string fileName, long fileSize, int pages, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
UPDATE budget_exports
SET status = 'completed',
    file_path = @filePath,
    progress_stage = 'completed',
    progress_percent = 100,
    pages = @pages,
    file_size = @fileSize,
    locked_by = NULL,
    locked_until = NULL,
    completed_at = UTC_TIMESTAMP()
WHERE id = @id", connection);
        command.Parameters.AddWithValue("@filePath", fileName);
        command.Parameters.AddWithValue("@pages", pages);
        command.Parameters.AddWithValue("@fileSize", fileSize);
        command.Parameters.AddWithValue("@id", job.Id);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await AuditAsync(job.Id, "completed", "PDF export completed.", new { fileName, fileSize, pages }, cancellationToken);
        await PruneOldExportsAsync(job, cancellationToken);
        await RunMaintenanceAsync(cancellationToken);
    }

    public async Task FailAsync(long exportId, string message, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
UPDATE budget_exports
SET status = 'failed',
    progress_stage = 'failed',
    error_message = @message,
    locked_by = NULL,
    locked_until = NULL,
    completed_at = UTC_TIMESTAMP()
WHERE id = @id", connection);
        command.Parameters.AddWithValue("@message", message.Length > 1800 ? message[..1800] : message);
        command.Parameters.AddWithValue("@id", exportId);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await AuditAsync(exportId, "failed", message, null, cancellationToken);
    }

    public async Task<BudgetInfo> LoadBudgetAsync(long budgetId, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT b.id, b.title, b.owner_name, c.code, w.name,
       DATE_FORMAT(b.start_date, '%Y-%m-%d'),
       DATE_FORMAT(b.end_date, '%Y-%m-%d'),
       b.budget_type,
       b.participant_mode,
       b.installment_display_mode,
       b.installment_period_unit,
       b.pricing_enabled,
       b.signature_config
FROM budgets b
JOIN currencies c ON c.id = b.base_currency_id
LEFT JOIN workspaces w ON w.id = b.workspace_id
WHERE b.id = @budgetId", connection);
        command.Parameters.AddWithValue("@budgetId", budgetId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException($"Budget not found: {budgetId}");
        }
        return new BudgetInfo(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? "" : reader.GetString(2),
            reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.GetString(7),
            reader.GetString(8),
            reader.GetString(9),
            reader.GetString(10),
            reader.GetBoolean(11),
            reader.IsDBNull(12) ? null : reader.GetString(12));
    }

    public async Task<VisualFixtureBudgetCandidates> FindVisualFixtureBudgetCandidatesAsync(long fallbackBudgetId, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);

        async Task<long?> FirstIdAsync(string whereSql)
        {
            await using var command = new MySqlCommand($@"
SELECT b.id
FROM budgets b
WHERE {whereSql}
ORDER BY b.updated_at DESC, b.id DESC
LIMIT 1", connection);
            command.Parameters.AddWithValue("@fallback", fallbackBudgetId);
            var value = await command.ExecuteScalarAsync(cancellationToken);
            return value is null or DBNull ? null : Convert.ToInt64(value);
        }

        var normal = fallbackBudgetId;
        var group = await FirstIdAsync("b.participant_mode = 'group'");
        var pricing = await FirstIdAsync(@"b.pricing_enabled = 1
   OR EXISTS (
        SELECT 1
        FROM budget_items bi
        WHERE bi.budget_id = b.id
          AND bi.pricing_config IS NOT NULL
          AND bi.pricing_config <> ''
          AND bi.pricing_config <> '{}'
      )
   OR EXISTS (
        SELECT 1
        FROM budget_transactions bt
        WHERE bt.budget_id = b.id
          AND bt.pricing_config IS NOT NULL
          AND bt.pricing_config <> ''
          AND bt.pricing_config <> '{}'
      )");
        var installment = await FirstIdAsync(@"b.budget_type = 'installment'
   OR EXISTS (
        SELECT 1
        FROM budget_installment_plans bip
        WHERE bip.budget_id = b.id
      )
   OR EXISTS (
        SELECT 1
        FROM budget_items bi
        WHERE bi.budget_id = b.id
          AND bi.installment_config IS NOT NULL
          AND bi.installment_config <> ''
          AND bi.installment_config <> '{}'
      )");
        var longText = await FirstIdAsync(@"CHAR_LENGTH(b.title) >= 48
   OR EXISTS (
        SELECT 1
        FROM budget_items bi
        LEFT JOIN budget_categories bc ON bc.id = bi.category_id
        WHERE bi.budget_id = b.id
          AND GREATEST(CHAR_LENGTH(bi.label), CHAR_LENGTH(COALESCE(bc.name, ''))) >= 44
      )
   OR EXISTS (
        SELECT 1
        FROM budget_transactions bt
        WHERE bt.budget_id = b.id
          AND (CHAR_LENGTH(bt.details) >= 56 OR CHAR_LENGTH(COALESCE(bt.remark, '')) >= 56)
      )
   OR EXISTS (
        SELECT 1
        FROM budget_bookkeeping_records bbr
        WHERE bbr.budget_id = b.id
          AND (CHAR_LENGTH(COALESCE(bbr.order_reference, '')) >= 28 OR CHAR_LENGTH(bbr.details) >= 56 OR CHAR_LENGTH(COALESCE(bbr.remark, '')) >= 56)
      )");

        return new VisualFixtureBudgetCandidates(normal, group, pricing, installment, longText);
    }

    public async Task<long> CountRowsAsync(ExportJob job, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        var sql = job.Scope == "bookkeeping"
            ? "SELECT COUNT(*) FROM budget_bookkeeping_records WHERE budget_id = @budgetId"
            : "SELECT (SELECT COUNT(*) FROM budget_items WHERE budget_id = @budgetId) + (SELECT COUNT(*) FROM budget_transactions WHERE budget_id = @budgetId)";
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@budgetId", job.BudgetId);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken) ?? 0);
    }

    public async Task<long?> TryCountRowsAsync(ExportJob job, CancellationToken cancellationToken)
    {
        try
        {
            return await CountRowsAsync(job, cancellationToken);
        }
        catch (Exception ex) when (ex is MySqlException or TimeoutException or InvalidOperationException)
        {
            await AuditBestEffortAsync(job.Id, "count_unavailable", "Row count unavailable; export continues with indeterminate progress.", new { error = ex.Message }, cancellationToken);
            return null;
        }
    }

    public async IAsyncEnumerable<LedgerRow> StreamBookkeepingRowsAsync(ExportJob job, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT bbr.transaction_type, DATE_FORMAT(bbr.record_date, '%Y-%m-%d'), COALESCE(bbr.order_reference, ''),
       bbr.details, COALESCE(bbr.category_label, ''),
       TRIM(CONCAT(COALESCE(bbr.source_account_name, ''), CASE WHEN bbr.destination_account_name IS NULL OR bbr.destination_account_name = '' THEN '' ELSE ' -> ' END, COALESCE(bbr.destination_account_name, ''))),
               CONCAT(c.code, ' ', FORMAT(bbr.amount_original, 2)),
       bbr.amount_base,
       COALESCE(CONCAT(dc.code, ' ', FORMAT(bbr.destination_amount_original, 2)), ''),
       COALESCE(bbr.remark, '')
FROM budget_bookkeeping_records bbr
JOIN currencies c ON c.id = bbr.currency_id
LEFT JOIN currencies dc ON dc.id = bbr.destination_currency_id
WHERE bbr.budget_id = @budgetId
ORDER BY bbr.record_date ASC, bbr.sort_order ASC, bbr.id ASC", connection);
        command.Parameters.AddWithValue("@budgetId", job.BudgetId);
        await using var reader = await command.ExecuteReaderAsync(System.Data.CommandBehavior.SequentialAccess, cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            yield return new LedgerRow(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.GetString(6),
                reader.GetDecimal(7),
                reader.GetString(8),
                reader.GetString(9));
        }
    }

    public async Task<BookkeepingTotals> LoadBookkeepingTotalsAsync(ExportJob job, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount_base ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount_base ELSE 0 END), 0)
FROM budget_bookkeeping_records
WHERE budget_id = @budgetId", connection);
        command.Parameters.AddWithValue("@budgetId", job.BudgetId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new BookkeepingTotals(0, 0);
        }
        return new BookkeepingTotals(reader.GetDecimal(0), reader.GetDecimal(1));
    }

    public async Task<List<BudgetParticipant>> LoadParticipantsAsync(long budgetId, CancellationToken cancellationToken)
    {
        var outRows = new List<BudgetParticipant>();
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT id, name
FROM budget_participants
WHERE budget_id = @budgetId
ORDER BY sort_order ASC, id ASC", connection);
        command.Parameters.AddWithValue("@budgetId", budgetId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            outRows.Add(new BudgetParticipant(reader.GetInt64(0), reader.GetString(1)));
        }
        return outRows;
    }

    public async Task<List<BudgetItemRow>> LoadBudgetItemsAsync(long budgetId, CancellationToken cancellationToken)
    {
        var outRows = new List<BudgetItemRow>();
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT bi.id, bi.category_id, bi.label, COALESCE(bc.name, bi.label),
       bc1.code, bi.budget_amount_original, bi.budget_rate_to_base, bi.budget_amount_base,
       ec.code, bi.estimated_amount_original, bi.estimated_amount_base, bi.variance_amount_base,
       bi.installment_config, bi.pricing_config,
       bis.paid_by_participant_id, COALESCE(bis.split_type, 'equal'), COALESCE(bis.note, '')
FROM budget_items bi
LEFT JOIN budget_categories bc ON bc.id = bi.category_id
JOIN currencies bc1 ON bc1.id = bi.budget_currency_id
JOIN currencies ec ON ec.id = bi.estimated_currency_id
LEFT JOIN budget_item_splits bis ON bis.budget_item_id = bi.id
WHERE bi.budget_id = @budgetId
ORDER BY bi.sort_order ASC, bi.id ASC", connection);
        command.Parameters.AddWithValue("@budgetId", budgetId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            outRows.Add(new BudgetItemRow(
                reader.GetInt64(0),
                reader.IsDBNull(1) ? null : reader.GetInt64(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetDecimal(5),
                reader.GetDecimal(6),
                reader.GetDecimal(7),
                reader.GetString(8),
                reader.GetDecimal(9),
                reader.GetDecimal(10),
                reader.GetDecimal(11),
                reader.IsDBNull(12) ? null : reader.GetString(12),
                reader.IsDBNull(13) ? null : reader.GetString(13),
                reader.IsDBNull(14) ? null : reader.GetInt64(14),
                reader.GetString(15),
                reader.GetString(16)));
        }
        return outRows;
    }

    public async Task<List<ItemSplitParticipant>> LoadSplitParticipantsAsync(long budgetId, CancellationToken cancellationToken)
    {
        var outRows = new List<ItemSplitParticipant>();
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT bis.budget_item_id,
       bisp.participant_id,
       bisp.is_included,
       bisp.share_ratio,
       bisp.share_amount_base
FROM budget_item_splits bis
JOIN budget_item_split_participants bisp ON bisp.split_id = bis.id
JOIN budget_items bi ON bi.id = bis.budget_item_id
WHERE bi.budget_id = @budgetId
ORDER BY bis.budget_item_id ASC, bisp.id ASC", connection);
        command.Parameters.AddWithValue("@budgetId", budgetId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            outRows.Add(new ItemSplitParticipant(
                reader.GetInt64(0),
                reader.GetInt64(1),
                reader.GetBoolean(2),
                reader.IsDBNull(3) ? null : reader.GetDecimal(3),
                reader.IsDBNull(4) ? null : reader.GetDecimal(4)));
        }
        return outRows;
    }

    public async Task<List<BudgetTransactionRow>> LoadBudgetTransactionsAsync(long budgetId, CancellationToken cancellationToken)
    {
        var outRows = new List<BudgetTransactionRow>();
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT bt.id, bt.category_id, COALESCE(bc.name, ''),
       bt.paid_by_participant_id, COALESCE(bp.name, ''),
       COALESCE(DATE_FORMAT(bt.transaction_date, '%Y-%m-%d'), ''),
       bt.details, c.code, bt.amount_original, bt.amount_base,
       rc.code, bt.reference_amount_original,
       COALESCE(bt.remark, ''),
       bt.pricing_config,
       COALESCE((
         SELECT GROUP_CONCAT(CONCAT(bp2.name, ': ', c.code, ' ', FORMAT(btp.amount_original, 2)) ORDER BY bp2.sort_order ASC, bp2.id ASC SEPARATOR '; ')
         FROM budget_transaction_payments btp
         JOIN budget_participants bp2 ON bp2.id = btp.participant_id
         WHERE btp.transaction_id = bt.id
       ), '')
FROM budget_transactions bt
LEFT JOIN budget_categories bc ON bc.id = bt.category_id
LEFT JOIN budget_participants bp ON bp.id = bt.paid_by_participant_id
JOIN currencies c ON c.id = bt.currency_id
LEFT JOIN currencies rc ON rc.id = bt.reference_currency_id
WHERE bt.budget_id = @budgetId
ORDER BY bt.transaction_date ASC, bt.sort_order ASC, bt.id ASC", connection);
        command.Parameters.AddWithValue("@budgetId", budgetId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            outRows.Add(new BudgetTransactionRow(
                reader.GetInt64(0),
                reader.IsDBNull(1) ? null : reader.GetInt64(1),
                reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetInt64(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.GetString(6),
                reader.GetString(7),
                reader.GetDecimal(8),
                reader.GetDecimal(9),
                reader.IsDBNull(10) ? null : reader.GetString(10),
                reader.IsDBNull(11) ? null : reader.GetDecimal(11),
                reader.GetString(12),
                reader.IsDBNull(13) ? null : reader.GetString(13),
                reader.GetString(14)));
        }
        return outRows;
    }

    public async Task<InstallmentPlan?> LoadOverallInstallmentPlanAsync(long budgetId, CancellationToken cancellationToken)
    {
        await using var connection = new MySqlConnection(config.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new MySqlCommand(@"
SELECT period_amounts, period_progress, period_remarks
FROM budget_installment_plans
WHERE budget_id = @budgetId AND scope = 'overall'
LIMIT 1", connection);
        command.Parameters.AddWithValue("@budgetId", budgetId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }
        return new InstallmentPlan(
            reader.IsDBNull(0) ? null : reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2));
    }

}
