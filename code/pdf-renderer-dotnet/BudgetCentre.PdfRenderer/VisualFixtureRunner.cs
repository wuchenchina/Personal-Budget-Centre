using System.Text.Json;

namespace BudgetCentre.PdfRenderer;

public sealed class VisualFixtureRunner(RendererConfig config, ExportRepository repository, PdfExportRenderer renderer)
{
    private static readonly string[] Themes = ["classic", "statement_red", "civic_blue"];
    private static readonly (string Label, string[] PdfLanguages, string[] SignatureLanguages)[] Languages =
    [
        ("en", ["en"], ["en"]),
        ("tc", ["tc"], ["tc"]),
        ("sc", ["sc"], ["sc"]),
        ("ja", ["ja"], ["ja"]),
        ("fr", ["fr"], ["fr"]),
        ("ru", ["ru"], ["ru"]),
        ("de", ["de"], ["de"]),
        ("en-tc", ["en", "tc"], ["en", "tc"]),
        ("en-sc", ["en", "sc"], ["en", "sc"]),
    ];

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var budgetId = long.TryParse(Environment.GetEnvironmentVariable("PDF_VISUAL_BUDGET_ID"), out var parsed) ? parsed : 1;
        var outputDir = Path.Combine(config.ExportStorageDir, "visual-tests", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss"));
        Directory.CreateDirectory(outputDir);
        var report = new List<string>();
        var candidates = await repository.FindVisualFixtureBudgetCandidatesAsync(budgetId, cancellationToken);
        var budget = await repository.LoadBudgetAsync(candidates.NormalBudgetId ?? budgetId, cancellationToken);
        report.Add($"normal={budget.Id}");

        var fixtureId = 800000L;
        foreach (var theme in Themes)
        {
            foreach (var language in Languages)
            {
                await RenderFixtureAsync(++fixtureId, outputDir, budget, "bookkeeping", theme, language, "none", budget.SignatureConfigJson, cancellationToken);
                await RenderFixtureAsync(++fixtureId, outputDir, budget, "budget", theme, language, "signature-full", SignatureConfig(budget.SignatureConfigJson, "full", "confirmation_signature"), cancellationToken);
                await RenderFixtureAsync(++fixtureId, outputDir, budget, "budget", theme, language, "signature-right", SignatureConfig(budget.SignatureConfigJson, "right", "confirmation_signature"), cancellationToken);
                await RenderFixtureAsync(++fixtureId, outputDir, budget, "budget", theme, language, "signature-confirmation", SignatureConfig(budget.SignatureConfigJson, "full", "confirmation"), cancellationToken);
                await RenderFixtureAsync(++fixtureId, outputDir, budget, "budget", theme, language, "signature-signature", SignatureConfig(budget.SignatureConfigJson, "full", "signature"), cancellationToken);
                await RenderFixtureAsync(++fixtureId, outputDir, budget, "budget", theme, language, "signature-disabled", SignatureDisabledConfig(budget.SignatureConfigJson), cancellationToken);
            }
        }

        await RenderConfigurationFixturesAsync(++fixtureId, outputDir, candidates, cancellationToken, report);
        await File.WriteAllLinesAsync(Path.Combine(outputDir, "VISUAL_FIXTURE_REPORT.txt"), report, cancellationToken);
        Console.WriteLine($"Visual fixtures written to {outputDir}");
    }

    public async Task RunReviewSetAsync(CancellationToken cancellationToken)
    {
        var budgetId = long.TryParse(Environment.GetEnvironmentVariable("PDF_VISUAL_BUDGET_ID"), out var parsed) ? parsed : 1;
        var outputDir = Path.Combine(config.ExportStorageDir, "visual-tests", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-review");
        Directory.CreateDirectory(outputDir);

        var candidates = await repository.FindVisualFixtureBudgetCandidatesAsync(budgetId, cancellationToken);
        var budget = await repository.LoadBudgetAsync(candidates.NormalBudgetId ?? budgetId, cancellationToken);
        var report = new List<string> { $"normal={budget.Id}" };
        var language = Languages.First(v => v.Label == "en");
        var fixtureId = 810000L;

        foreach (var theme in Themes)
        {
            await RenderFixtureAsync(++fixtureId, outputDir, budget, "budget", theme, language, "review", SignatureConfig(budget.SignatureConfigJson, "full", "confirmation_signature"), cancellationToken);
            await RenderFixtureAsync(++fixtureId, outputDir, budget, "bookkeeping", theme, language, "review", budget.SignatureConfigJson, cancellationToken);
        }

        await File.WriteAllLinesAsync(Path.Combine(outputDir, "VISUAL_FIXTURE_REPORT.txt"), report, cancellationToken);
        Console.WriteLine($"Visual review set written to {outputDir}");
    }

    private async Task RenderConfigurationFixturesAsync(
        long startId,
        string outputDir,
        VisualFixtureBudgetCandidates candidates,
        CancellationToken cancellationToken,
        List<string> report)
    {
        var id = startId;
        var language = Languages.First(v => v.Label == "en-tc");
        await RenderCandidateAsync("group", candidates.GroupBudgetId, "budget", "signature-full");
        await RenderCandidateAsync("pricing", candidates.PricingBudgetId, "budget", "signature-full");
        await RenderCandidateAsync("installment", candidates.InstallmentBudgetId, "budget", "signature-full");
        await RenderCandidateAsync("long-text-budget", candidates.LongTextBudgetId, "budget", "signature-full");
        await RenderCandidateAsync("long-text-bookkeeping", candidates.LongTextBudgetId, "bookkeeping", "none");

        async Task RenderCandidateAsync(string label, long? budgetId, string scope, string variant)
        {
            if (!budgetId.HasValue)
            {
                report.Add($"{label}=missing");
                Console.WriteLine($"visual-config|{label}|missing");
                return;
            }

            var budget = await repository.LoadBudgetAsync(budgetId.Value, cancellationToken);
            report.Add($"{label}={budget.Id}");
            var signature = variant == "none"
                ? budget.SignatureConfigJson
                : SignatureConfig(budget.SignatureConfigJson, "full", "confirmation_signature");
            await RenderFixtureAsync(
                ++id,
                outputDir,
                budget,
                scope,
                "statement_red",
                language,
                label,
                signature,
                cancellationToken);
        }
    }

    private async Task RenderFixtureAsync(
        long id,
        string outputDir,
        BudgetInfo sourceBudget,
        string scope,
        string theme,
        (string Label, string[] PdfLanguages, string[] SignatureLanguages) language,
        string variant,
        string? signatureConfig,
        CancellationToken cancellationToken)
    {
        var fileName = $"{scope}-{theme}-{language.Label}-{variant}.pdf";
        var path = Path.Combine(outputDir, fileName);
        var budget = sourceBudget with { SignatureConfigJson = signatureConfig };
        var job = new ExportJob
        {
            Id = id,
            BudgetId = sourceBudget.Id,
            UserId = 1,
            Scope = scope,
            FileName = fileName,
            JobToken = "visual-fixture",
            Attempt = 1,
            Options = new ExportOptions
            {
                ExportScope = scope,
                PdfTheme = theme,
                ShowWorkspace = true,
                PdfLanguages = language.PdfLanguages,
                SignatureLabelMode = SignatureModeForVariant(variant),
                SignatureLabelLanguages = language.SignatureLanguages,
            },
        };
        var result = await renderer.RenderAsync(job, budget, repository, path, cancellationToken);
        Console.WriteLine($"{scope}|{theme}|{language.Label}|{variant}|pages={result.Pages}|{path}");
    }

    private static string SignatureModeForVariant(string variant)
    {
        return variant switch
        {
            "signature-confirmation" => "confirmation",
            "signature-signature" => "signature",
            _ => "confirmation_signature",
        };
    }

    private static string SignatureDisabledConfig(string? json)
    {
        var obj = JsonObject(json);
        obj["enabled"] = false;
        return JsonSerializer.Serialize(obj);
    }

    private static string SignatureConfig(string? json, string align, string mode)
    {
        var obj = JsonObject(json);
        obj["enabled"] = true;
        obj["sectionAlign"] = align;
        obj["labelMode"] = mode;
        if (!obj.TryGetValue("rows", out var rows) || rows is not JsonElement { ValueKind: JsonValueKind.Array })
        {
            obj["rows"] = new[]
            {
                new Dictionary<string, object?>
                {
                    ["displayName"] = "Fixture Signer",
                    ["roleLabel"] = "Confirmed by",
                    ["position"] = "Budget Owner",
                    ["showName"] = true,
                    ["showRole"] = true,
                    ["showPosition"] = true,
                    ["showEmail"] = false,
                    ["showSignature"] = true,
                    ["showDateTime"] = true,
                    ["signedAt"] = "2026-06-27 00:00:00",
                },
                new Dictionary<string, object?>
                {
                    ["displayName"] = "Fixture Note",
                    ["roleLabel"] = "Acknowledged by",
                    ["showName"] = true,
                    ["showRole"] = true,
                    ["showSignature"] = false,
                    ["showDateTime"] = false,
                },
            };
        }
        return JsonSerializer.Serialize(obj);
    }

    private static Dictionary<string, object?> JsonObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
