# BudgetCentre PDF Renderer

This directory contains the .NET + iText PDF export worker.

The worker is separate from the Go API:

- Go authenticates users and creates queued export jobs.
- The worker claims queued jobs from MySQL.
- The worker reads export data directly from MySQL in batches.
- PDFs are written to `EXPORT_TEMP_DIR` first, then atomically moved into
  `EXPORT_STORAGE_DIR`.
- Worker loops are started up to `PDF_RENDERER_MAX_WORKERS`, but workers above
  `PDF_RENDERER_MIN_WORKERS` only become active when queue depth increases.
- Jobs with at least `PDF_RENDERER_LARGE_ROW_THRESHOLD` rows are additionally
  gated by `PDF_RENDERER_LARGE_JOB_CONCURRENCY` to avoid several very large PDF
  renders saturating CPU and memory at the same time.

`bin/` and `obj/` are local .NET build intermediates. They contain local machine
paths and must not be committed or shipped as source artifacts.

Expected income is exported from the budget's saved income entries, including annual salary snapshots, daily/monthly jobs, and one-off amounts. The funding balance compares expected income for the inclusive budget period with planned expenses; it does not change actual bookkeeping totals. Without dates, recurring income uses one month.

Run the income calculation and rendering checks without a database:

```sh
dotnet run --project code/pdf-renderer-dotnet/BudgetCentre.PdfRenderer.Tests
dotnet run --project code/pdf-renderer-dotnet/BudgetCentre.PdfRenderer.Tests -- --render /absolute/path/to/BudgetCentre
```

The render option requires the existing fonts in `code/font` and writes three theme samples to `output/pdf`. It checks all seven languages and English/Traditional Chinese output using the production income section renderer. These samples use test data and do not exercise database access or the export job queue.
