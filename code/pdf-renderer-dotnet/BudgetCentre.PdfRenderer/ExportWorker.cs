namespace BudgetCentre.PdfRenderer;

public sealed class ExportWorker(RendererConfig config, ExportRepository repository, PdfExportRenderer renderer)
{
    private readonly SemaphoreSlim largeJobSlots = new(Math.Max(1, Math.Min(config.LargeJobConcurrency, config.MaxWorkers)));

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var maxWorkers = Math.Max(config.MinWorkers, config.MaxWorkers);
        var workers = Enumerable.Range(0, maxWorkers)
            .Select(index => RunLoopAsync(index, cancellationToken))
            .ToArray();
        await Task.WhenAll(workers);
    }

    private async Task RunLoopAsync(int index, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            ExportJob? job = null;
            try
            {
                if (!await IsWorkerActiveAsync(index, cancellationToken))
                {
                    await Task.Delay(config.PollInterval, cancellationToken);
                    continue;
                }

                job = await repository.ClaimNextJobAsync(cancellationToken);
                if (job is null)
                {
                    await Task.Delay(config.PollInterval, cancellationToken);
                    continue;
                }

                await ProcessJobAsync(job, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"worker {index} failed: {ex}");
                if (job is not null)
                {
                    await repository.FailAsync(job.Id, ex.Message, CancellationToken.None);
                }
                else
                {
                    await Task.Delay(config.PollInterval, cancellationToken);
                }
            }
        }
    }

    private async Task<bool> IsWorkerActiveAsync(int index, CancellationToken cancellationToken)
    {
        if (index < config.MinWorkers)
        {
            return true;
        }
        var claimableJobs = await repository.CountClaimableJobsAsync(cancellationToken);
        var desired = claimableJobs switch
        {
            <= 0 => config.MinWorkers,
            1 => Math.Min(config.MaxWorkers, config.MinWorkers + 1),
            <= 4 => Math.Min(config.MaxWorkers, config.MinWorkers + 2),
            _ => config.MaxWorkers,
        };
        return index < Math.Max(config.MinWorkers, desired);
    }

    private async Task ProcessJobAsync(ExportJob job, CancellationToken cancellationToken)
    {
        if (!repository.VerifyJobToken(job))
        {
            await repository.AuditAsync(job.Id, "invalid_job_token", "PDF export job token verification failed.", null, cancellationToken);
            await repository.FailAsync(job.Id, "PDF export job token verification failed.", cancellationToken);
            return;
        }

        var budget = await repository.LoadBudgetAsync(job.BudgetId, cancellationToken);
        var rowCount = await repository.TryCountRowsAsync(job, cancellationToken) ?? 0;
        var largeLeaseTaken = false;
        var jobsDir = Path.Combine(config.ExportTempDir, "jobs");
        Directory.CreateDirectory(jobsDir);
        var tempPath = Path.Combine(jobsDir, $"{job.Id}-{job.Attempt}.tmp.pdf");
        var leasePath = Path.Combine(jobsDir, $"{job.Id}-{job.Attempt}.lease");
        File.WriteAllText(leasePath, $"{config.WorkerId}\n{DateTime.UtcNow:o}");

        try
        {
            if (rowCount >= config.LargeRowThreshold)
            {
                await largeJobSlots.WaitAsync(cancellationToken);
                largeLeaseTaken = true;
            }
            var result = await renderer.RenderAsync(job, budget, repository, tempPath, cancellationToken);
            ValidatePdf(tempPath);
            var finalName = job.FileName;
            var finalPath = Path.Combine(config.ExportStorageDir, finalName);
            if (File.Exists(finalPath))
            {
                finalName = $"{Path.GetFileNameWithoutExtension(job.FileName)}-{job.Id}.pdf";
                finalPath = Path.Combine(config.ExportStorageDir, finalName);
            }
            File.Move(tempPath, finalPath, overwrite: false);
            await repository.CompleteAsync(job, finalName, new FileInfo(finalPath).Length, result.Pages, cancellationToken);
        }
        finally
        {
            if (largeLeaseTaken)
            {
                largeJobSlots.Release();
            }
            if (File.Exists(leasePath))
            {
                File.Delete(leasePath);
            }
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    private static void ValidatePdf(string path)
    {
        var info = new FileInfo(path);
        if (!info.Exists || info.Length == 0)
        {
            throw new InvalidOperationException("PDF output is empty.");
        }
        using var file = File.OpenRead(path);
        Span<byte> header = stackalloc byte[5];
        if (file.Read(header) != 5 || System.Text.Encoding.ASCII.GetString(header) != "%PDF-")
        {
            throw new InvalidOperationException("PDF output header is invalid.");
        }
    }
}
