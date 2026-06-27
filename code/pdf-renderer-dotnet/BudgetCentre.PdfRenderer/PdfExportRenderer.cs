using System.Globalization;
using System.Text;
using System.Text.Json;
using BudgetCentre.PdfRenderer.Theme;
using iText.Kernel.Colors;
using iText.Kernel.Font;
using iText.Kernel.Pdf;
using iText.Layout;
using iText.Layout.Borders;
using iText.Layout.Element;
using iText.Layout.Properties;

using IOPath = System.IO.Path;

namespace BudgetCentre.PdfRenderer;

public sealed partial class PdfExportRenderer(RendererConfig config)
{
    public async Task<RenderResult> RenderAsync(
        ExportJob job,
        BudgetInfo budget,
        ExportRepository repository,
        string tempPath,
        CancellationToken cancellationToken)
    {
        var theme = ThemeRegistry.ForKey(job.Options.PdfTheme);
        var fonts = FontSet.Load(config.FontDir, job.Options.PrimaryChineseLanguage(), theme.Key);
        var pageSize = job.Scope == "bookkeeping" ? theme.BookkeepingPageSize : theme.BudgetPageSize;
        var totalRows = await repository.TryCountRowsAsync(job, cancellationToken);

        await repository.UpdateProgressAsync(job.Id, "rendering", 0, totalRows, 3, cancellationToken);

        Directory.CreateDirectory(IOPath.GetDirectoryName(tempPath)!);
        using var writer = new PdfWriter(tempPath);
        using var pdf = new PdfDocument(writer);
        using var document = new Document(pdf, pageSize);
        if (job.Scope == "bookkeeping")
        {
            document.SetMargins(theme.BookkeepingMarginTop, theme.BookkeepingMarginRight, theme.BookkeepingMarginBottom + 14, theme.BookkeepingMarginLeft);
        }
        else
        {
            document.SetMargins(theme.MarginTop, theme.MarginRight, theme.MarginBottom + 14, theme.MarginLeft);
        }
        document.SetFont(fonts.Cjk).SetFontSize(theme.BodyFontSize).SetFontColor(theme.TextColor);

        AddHeader(document, theme, fonts, budget, job);
        if (job.Scope == "bookkeeping")
        {
            await RenderBookkeepingAsync(document, theme, fonts, job, budget, repository, totalRows, cancellationToken);
        }
        else
        {
            await RenderBudgetAsync(document, theme, fonts, job, budget, repository, totalRows, config.FontDir, cancellationToken);
        }

        await repository.UpdateProgressAsync(job.Id, "finalizing", totalRows ?? 0, totalRows, 96, cancellationToken);
        document.Close();
        PdfFooterStamper.Stamp(tempPath, theme, config);

        using var check = new PdfDocument(new PdfReader(tempPath));
        return new RenderResult(check.GetNumberOfPages(), new FileInfo(tempPath).Length);
    }

    private static void AddHeader(Document document, PdfTheme theme, FontSet fonts, BudgetInfo budget, ExportJob job)
    {
        if (theme.Key == "civic_blue")
        {
            document.Add(new Paragraph("").SetBorderTop(new SolidBorder(theme.AccentColor, Mm(1.1f))).SetMarginBottom(Mm(2.2f)));
        }

        if (!theme.HeaderMetaPanel)
        {
            document.Add(HeaderParagraph(budget.Title, theme, fonts, job.Scope == "bookkeeping" ? Math.Min(13, theme.TitleFontSize) : theme.TitleFontSize, 1.25f)
                .SetTextAlignment(TextAlignment.CENTER)
                .SetMarginTop(0)
                .SetMarginBottom(4));
            var headerSubtitle = job.Scope == "bookkeeping" ? Label("bookkeepingLedgerSubtitle", job.Options, true) : budget.OwnerName;
            if (!string.IsNullOrWhiteSpace(headerSubtitle))
            {
                document.Add(HeaderParagraph(headerSubtitle, theme, fonts, job.Scope == "bookkeeping" ? Math.Min(13, theme.SubtitleFontSize) : theme.SubtitleFontSize, 1.25f)
                    .SetTextAlignment(TextAlignment.CENTER)
                    .SetMarginTop(0)
                    .SetMarginBottom(Mm(5)));
            }
            return;
        }

        var header = new Table(UnitValue.CreatePercentArray([64, 36])).UseAllAvailableWidth().SetMarginBottom(Mm(5));
        var titleCell = new Cell().SetBorder(Border.NO_BORDER).SetPadding(0).SetPaddingRight(Mm(8));
        titleCell.Add(HeaderParagraph(budget.Title, theme, fonts, theme.TitleFontSize, 1.12f)
            .SetFontColor(theme.Key == "statement_red" ? theme.AccentColor : theme.SectionFill)
            .SetMargin(0));
        var subtitle = job.Scope == "bookkeeping" ? Label("bookkeepingLedgerSubtitle", job.Options, true) : budget.OwnerName;
        if (!string.IsNullOrWhiteSpace(subtitle))
        {
            var p = HeaderParagraph(subtitle, theme, fonts, theme.SubtitleFontSize, 1.25f)
                .SetFontColor(theme.TextColor)
                .SetMarginTop(Mm(2));
            if (theme.Key == "civic_blue")
            {
                p.SetBorderLeft(new SolidBorder(new DeviceRgb(0, 189, 227), Mm(0.8f))).SetPaddingLeft(Mm(2.4f));
            }
            titleCell.Add(p);
        }
        header.AddCell(titleCell);

        var meta = new Table(UnitValue.CreatePercentArray([42, 58])).UseAllAvailableWidth().SetFontSize(7);
        AddMetaRow(meta, "Export", $"#{job.Id}", theme, fonts);
        AddMetaRow(meta, "Scope", job.Scope, theme, fonts);
        AddMetaRow(meta, "Date", DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + " UTC", theme, fonts);
        if (job.Options.ShowWorkspace && !string.IsNullOrWhiteSpace(budget.WorkspaceName))
        {
            AddMetaRow(meta, "Workspace", budget.WorkspaceName!, theme, fonts);
        }
        header.AddCell(new Cell().SetBorder(Border.NO_BORDER).SetPadding(0).Add(meta));
        document.Add(header);
    }

    private static Paragraph HeaderParagraph(string text, PdfTheme theme, FontSet fonts, float fontSize, float lineHeight)
    {
        return ParagraphLines(text, HeaderTitleFont(theme, fonts), fontSize, lineHeight, fallbackFonts: ThemeFallbacks(fonts));
    }

    private static PdfFont HeaderTitleFont(PdfTheme theme, FontSet fonts)
    {
        if (theme.Key == "classic")
        {
            return fonts.Regular;
        }
        return theme.Key == "civic_blue" ? fonts.CjkBold : fonts.Cjk;
    }

    private static void AddMetaRow(Table table, string label, string value, PdfTheme theme, FontSet fonts)
    {
        var border = new SolidBorder(new DeviceRgb(217, 217, 217), 0.45f);
        table.AddCell(new Cell().SetBorder(Border.NO_BORDER).SetBorderBottom(border).SetPadding(1.6f)
            .Add(ParagraphLines(label, fonts.CjkBold, 7, 1.2f, fallbackFonts: ThemeFallbacks(fonts, true)).SetFontColor(theme.MutedTextColor)));
        table.AddCell(new Cell().SetBorder(Border.NO_BORDER).SetBorderBottom(border).SetPadding(1.6f)
            .Add(ParagraphLines(value, fonts.Cjk, 7, 1.2f, fallbackFonts: ThemeFallbacks(fonts)).SetTextAlignment(TextAlignment.RIGHT)));
    }

    private async Task RenderBookkeepingAsync(
        Document document,
        PdfTheme theme,
        FontSet fonts,
        ExportJob job,
        BudgetInfo budget,
        ExportRepository repository,
        long? totalRows,
        CancellationToken cancellationToken)
    {
        var columns = new[]
        {
            new TableColumn("type", Label("type", job.Options, true), 10),
            new TableColumn("date", Label("date", job.Options, true), 8, DataType: "code"),
            new TableColumn("order", Label("order", job.Options, true), 14, DataType: "code"),
            new TableColumn("details", Label("details", job.Options, true), 18),
            new TableColumn("category", Label("category", job.Options, true), 12),
            new TableColumn("accounts", Label("accounts", job.Options, true), 13),
            new TableColumn("amount", Label("amount", job.Options, true), 11, "right", "money"),
            new TableColumn("destination", Label("destination", job.Options, true), 9, "right", "money"),
            new TableColumn("remark", Label("remark", job.Options, true), 5),
        };

        Table? table = null;
        long processed = 0;
        var nextHeartbeat = DateTime.UtcNow.AddSeconds(2);
        await foreach (var row in repository.StreamBookkeepingRowsAsync(job, cancellationToken))
        {
            table ??= NewBookkeepingTable(columns, theme, fonts, Label("bookkeepingRecordsTitle", job.Options, true), PeriodText(budget), DatePrefix(job.Options, true));
            AddBookkeepingRow(table, columns, theme, fonts, [
                TransactionTypeText(row.Type, job.Options),
                row.Date,
                WrapLongReference(row.OrderReference),
                row.Details,
                row.Category,
                row.Accounts,
                row.Amount,
                row.Destination,
                row.Remark
            ]);

            processed++;
            var heartbeatDue = DateTime.UtcNow >= nextHeartbeat;
            if (processed % config.BatchSize == 0)
            {
                document.Add(table);
                table = null;
                await repository.UpdateProgressAsync(job.Id, "rendering", processed, totalRows, ProgressPercent(processed, totalRows), cancellationToken);
                nextHeartbeat = DateTime.UtcNow.AddSeconds(2);
            }
            else if (heartbeatDue)
            {
                await repository.UpdateProgressAsync(job.Id, "rendering", processed, totalRows, ProgressPercent(processed, totalRows), cancellationToken);
                nextHeartbeat = DateTime.UtcNow.AddSeconds(2);
            }
        }

        table ??= NewBookkeepingTable(columns, theme, fonts, Label("bookkeepingRecordsTitle", job.Options, true), PeriodText(budget), DatePrefix(job.Options, true));
        if (processed == 0)
        {
            AddBookkeepingEmptyRow(table, columns.Length, theme, fonts, Label("emptyBookkeepingRecords", job.Options));
        }

        var totals = await repository.LoadBookkeepingTotalsAsync(job, cancellationToken);
        AddBookkeepingTotalRow(table, columns, Label("bookkeepingIncomeTotal", job.Options, true), Money(budget.BaseCurrency, totals.IncomeBase), theme, fonts, true);
        AddBookkeepingTotalRow(table, columns, Label("bookkeepingExpenseTotal", job.Options, true), Money(budget.BaseCurrency, totals.ExpenseBase), theme, fonts, false);
        document.Add(table);
        await repository.UpdateProgressAsync(job.Id, "rendering", processed, totalRows, 90, cancellationToken);
    }

    private static async Task RenderBudgetAsync(
        Document document,
        PdfTheme theme,
        FontSet fonts,
        ExportJob job,
        BudgetInfo budget,
        ExportRepository repository,
        long? totalRows,
        string fontDir,
        CancellationToken cancellationToken)
    {
        var items = await repository.LoadBudgetItemsAsync(budget.Id, cancellationToken);
        var transactions = await repository.LoadBudgetTransactionsAsync(budget.Id, cancellationToken);
        var participants = await repository.LoadParticipantsAsync(budget.Id, cancellationToken);
        var splitParticipants = await repository.LoadSplitParticipantsAsync(budget.Id, cancellationToken);
        var overallPlan = await repository.LoadOverallInstallmentPlanAsync(budget.Id, cancellationToken);
        var splitMap = splitParticipants.GroupBy(v => v.ItemId).ToDictionary(v => v.Key, v => v.ToList());
        var totals = EffectiveTotals(items, transactions, splitMap);

        await repository.UpdateProgressAsync(job.Id, "rendering", 1, totalRows, 12, cancellationToken);

        var budgetSection = new TableSection("budget_highlights", Label("budgetHighlightsTitle", job.Options), [
            new TableColumn("category", Label("category", job.Options), 40),
            new TableColumn("budget", Label("budget", job.Options), 20, "right", "money"),
            new TableColumn("estimated_actuals", Label("estimated_actuals", job.Options), 20, "right", "money"),
            new TableColumn("variance", Label("variance", job.Options), 20, "right", "money"),
        ]);
        var budgetRows = items.Select(item =>
        {
            var effective = EffectiveItem(item, transactions, splitMap.GetValueOrDefault(item.Id) ?? []);
            return new[]
            {
                ItemLabel(item),
                MoneyWithSecondary(budget.BaseCurrency, effective.BudgetBase, item.BudgetCurrency, item.BudgetRateToBase),
                MoneyWithTransactionBreakdown(budget.BaseCurrency, effective.EstimatedBase, effective.TransactionTotals),
                Money(budget.BaseCurrency, effective.VarianceBase),
            };
        }).ToList();
        AddSectionTable(document, budgetSection, budgetRows, [Label("total", job.Options), Money(budget.BaseCurrency, totals.BudgetBase), Money(budget.BaseCurrency, totals.EstimatedBase), Money(budget.BaseCurrency, totals.VarianceBase)], theme, fonts, budget, job.Options);

        if (budget.ParticipantMode == "group" && participants.Count > 0)
        {
            AddGroupSections(document, theme, fonts, job.Options, budget, items, transactions, participants, splitMap);
        }
        await repository.UpdateProgressAsync(job.Id, "rendering", KnownProcessed(totalRows, items.Count), totalRows, 35, cancellationToken);

        var transactionColumns = TransactionColumns(job.Options, participants.Count > 0, budget.PricingEnabled);
        var transactionRows = transactions.Select(tx => TransactionRow(tx, transactionColumns, budget.BaseCurrency, job.Options)).ToList();
        AddSectionTable(document, new TableSection("transaction_breakdown", Label("transactionBreakdownTitle", job.Options), transactionColumns), transactionRows, null, theme, fonts, budget, job.Options, Label("emptyTransactions", job.Options));

        await repository.UpdateProgressAsync(job.Id, "rendering", KnownProcessed(totalRows, items.Count + transactions.Count), totalRows, 65, cancellationToken);

        if (budget.BudgetType == "installment")
        {
            var installmentColumns = InstallmentColumns(job.Options, budget.InstallmentDisplayMode != "overall");
            var installmentRows = InstallmentRows(budget, items, transactions, splitMap, overallPlan, totals, job.Options);
            var summary = budget.InstallmentDisplayMode == "overall"
                ? new[] { "", Label("total", job.Options), Money(budget.BaseCurrency, totals.BudgetBase), Money(budget.BaseCurrency, totals.BudgetBase), "", "" }
                : new[] { "", Label("total", job.Options), "", Money(budget.BaseCurrency, totals.BudgetBase), Money(budget.BaseCurrency, totals.BudgetBase), "", "" };
            AddSectionTable(document, new TableSection("installments", Label("installmentsTitle", job.Options), installmentColumns), installmentRows, summary, theme, fonts, budget, job.Options, Label("emptyInstallments", job.Options));
        }

        AddSignatureBlock(document, theme, fonts, job, budget, $"Budget {Money(budget.BaseCurrency, totals.BudgetBase)} · Actual {Money(budget.BaseCurrency, totals.EstimatedBase)} · Variance {Money(budget.BaseCurrency, totals.VarianceBase)}", fontDir);
        await repository.UpdateProgressAsync(job.Id, "rendering", totalRows ?? items.Count + transactions.Count, totalRows, 90, cancellationToken);
    }

    private static void AddGroupSections(
        Document document,
        PdfTheme theme,
        FontSet fonts,
        ExportOptions options,
        BudgetInfo budget,
        List<BudgetItemRow> items,
        List<BudgetTransactionRow> transactions,
        List<BudgetParticipant> participants,
        Dictionary<long, List<ItemSplitParticipant>> splitMap)
    {
        var splitRows = items.Select(item =>
        {
            var split = SplitForItem(item, participants, splitMap.GetValueOrDefault(item.Id) ?? []);
            var effective = EffectiveItem(item, transactions, split.Participants);
            return new[]
            {
                ItemLabel(item),
                ParticipantName(split.PaidByParticipantId, participants, options),
                SplitTypeText(split.SplitType, options),
                SplitParticipantText(split, participants, budget.BaseCurrency, effective.BudgetBase, options),
                Money(budget.BaseCurrency, effective.BudgetBase),
                split.Note,
            };
        }).ToList();
        AddSectionTable(document, new TableSection("group_split_details", Label("groupSplitDetailsTitle", options), [
            new TableColumn("category", Label("category", options), 24),
            new TableColumn("paid_by", Label("paid_by", options), 14),
            new TableColumn("split_type", Label("split_type", options), 16),
            new TableColumn("participants", Label("participants", options), 22),
            new TableColumn("amount", Label("amount", options), 14, "right", "money"),
            new TableColumn("remark", Label("remark", options), 10),
        ]), splitRows, null, theme, fonts, budget, options, Label("emptyGroupSplitDetails", options));

        var summary = BuildGroupSummary(items, transactions, participants, splitMap);
        AddSectionTable(document, new TableSection("group_expense_summary", Label("groupExpenseSummaryTitle", options), [
            new TableColumn("metric", Label("metric", options), 70),
            new TableColumn("amount", Label("amount", options), 30, "right", "money"),
        ]), [
            [LabelLiteral("Shared expense", options), Money(budget.BaseCurrency, summary.SharedExpenseBase)],
            [LabelLiteral("Personal expense", options), Money(budget.BaseCurrency, summary.PersonalExpenseBase)]
        ], [Label("total", options), Money(budget.BaseCurrency, summary.SharedExpenseBase + summary.PersonalExpenseBase)], theme, fonts, budget, options);

        var participantRows = summary.Participants.Select(v => new[]
        {
            v.Participant.Name,
            Money(budget.BaseCurrency, v.PaidBase),
            Money(budget.BaseCurrency, v.ShareBase),
            Money(budget.BaseCurrency, v.BalanceBase),
        }).ToList();
        AddSectionTable(document, new TableSection("group_settlement_summary", Label("groupSettlementSummaryTitle", options), [
            new TableColumn("participant", Label("participant", options), 34),
            new TableColumn("paid", Label("paid", options), 22, "right", "money"),
            new TableColumn("share", Label("share", options), 22, "right", "money"),
            new TableColumn("balance", Label("balance", options), 22, "right", "money"),
        ]), participantRows, [Label("total", options), Money(budget.BaseCurrency, summary.PaidTotalBase), Money(budget.BaseCurrency, summary.ShareTotalBase), Money(budget.BaseCurrency, 0)], theme, fonts, budget, options);

        var settlementRows = summary.Settlements.Select(v => new[]
        {
            ParticipantName(v.FromParticipantId, participants, options),
            ParticipantName(v.ToParticipantId, participants, options),
            Money(budget.BaseCurrency, v.AmountBase),
        }).ToList();
        AddSectionTable(document, new TableSection("settlement_instructions", Label("settlementInstructionsTitle", options), [
            new TableColumn("from", Label("from", options), 38),
            new TableColumn("to", Label("to", options), 38),
            new TableColumn("amount", Label("amount", options), 24, "right", "money"),
        ]), settlementRows, null, theme, fonts, budget, options, Label("emptySettlementInstructions", options));
    }

    private static IReadOnlyList<TableColumn> TransactionColumns(ExportOptions options, bool hasParticipants, bool pricingEnabled)
    {
        var columns = new List<TableColumn>
        {
            new("transaction_details", Label("transaction_details", options), hasParticipants ? 29 : pricingEnabled ? 32 : 40),
            new("category", Label("category", options), hasParticipants ? 14 : pricingEnabled ? 16 : 20, "right"),
        };
        if (hasParticipants)
        {
            columns.Add(new("paid_by", Label("paid_by", options), pricingEnabled ? 11 : 16));
        }
        if (pricingEnabled)
        {
            columns.Add(new("unit_price", Label("unit_price", options), hasParticipants ? 11 : 13, "right", "money"));
            columns.Add(new("quantity", Label("quantity", options), 8, "right", "number"));
        }
        columns.Add(new("amount", Label("amount", options), hasParticipants ? 13 : pricingEnabled ? 14 : 20, "right", "money"));
        columns.Add(new("remark", Label("remark", options), hasParticipants ? 14 : pricingEnabled ? 17 : 20, "right"));
        return columns;
    }

    private static string[] TransactionRow(BudgetTransactionRow tx, IReadOnlyList<TableColumn> columns, string baseCurrency, ExportOptions options)
    {
        return columns.Select(column => column.Key switch
        {
            "transaction_details" => tx.Details,
            "category" => tx.Category,
            "paid_by" => string.IsNullOrWhiteSpace(tx.PaymentText) ? tx.PaidByName : tx.PaymentText,
            "unit_price" => PricingUnitPrice(tx, baseCurrency),
            "quantity" => PricingQuantity(tx),
            "amount" => TransactionAmount(tx, baseCurrency),
            "remark" => tx.Remark,
            _ => "",
        }).ToArray();
    }

    private static IReadOnlyList<TableColumn> InstallmentColumns(ExportOptions options, bool showCategory)
    {
        if (!showCategory)
        {
            return [
                new("sequence", Label("sequence", options), options.PdfLanguages.SequenceEqual(["en"]) ? 4 : 6, "center"),
                new("period", Label("period", options), HasChinese(options) ? 19 : 17),
                new("target_amount", Label("target_amount", options), 20, "right", "money"),
                new("period_amount", Label("period_amount", options), HasChinese(options) ? 20 : 21, "right", "money"),
                new("progress", Label("progress", options), 5, "center"),
                new("remark", Label("remark", options), HasChinese(options) ? 30 : 33),
            ];
        }
        return [
            new("sequence", Label("sequence", options), options.PdfLanguages.SequenceEqual(["en"]) ? 4 : 6, "center"),
            new("category", Label("category", options), HasChinese(options) ? 14 : 13),
            new("period", Label("period", options), HasChinese(options) ? 14 : 15),
            new("target_amount", Label("target_amount", options), 17, "right", "money"),
            new("period_amount", Label("period_amount", options), HasChinese(options) ? 17 : 19, "right", "money"),
            new("progress", Label("progress", options), 5, "center"),
            new("remark", Label("remark", options), 27),
        ];
    }

    private static List<string[]> InstallmentRows(
        BudgetInfo budget,
        List<BudgetItemRow> items,
        List<BudgetTransactionRow> transactions,
        Dictionary<long, List<ItemSplitParticipant>> splitMap,
        InstallmentPlan? overallPlan,
        BudgetTotals totals,
        ExportOptions options)
    {
        if (budget.InstallmentDisplayMode == "overall")
        {
            var amounts = JsonValue.DecimalArray(overallPlan?.PeriodAmountsJson);
            var progress = JsonValue.BoolArray(overallPlan?.PeriodProgressJson);
            var remarks = JsonValue.StringArray(overallPlan?.PeriodRemarksJson);
            if (amounts.Count == 0 && totals.BudgetBase > 0)
            {
                amounts.Add(totals.BudgetBase);
            }
            decimal assigned = 0;
            return amounts.Select((amount, index) =>
            {
                assigned = RoundMoney(assigned + amount);
                return new[]
                {
                    (index + 1).ToString(CultureInfo.InvariantCulture),
                    InstallmentPeriodLabel(budget, null, index),
                    Money(budget.BaseCurrency, totals.BudgetBase) + "\n" + Label("remainingLabel", options) + " " + Money(budget.BaseCurrency, Math.Max(0, totals.BudgetBase - assigned)),
                    Money(budget.BaseCurrency, amount),
                    index < progress.Count && progress[index] ? "X" : "",
                    index < remarks.Count ? remarks[index] : "",
                };
            }).ToList();
        }

        var rows = new List<string[]>();
        var sequence = 1;
        foreach (var item in items)
        {
            var config = ParseJson(item.InstallmentConfigJson);
            var amounts = JsonValue.DecimalArray(JsonPropertyRaw(config, "periodAmounts"));
            var progress = JsonValue.BoolArray(JsonPropertyRaw(config, "periodProgress"));
            var remarks = JsonValue.StringArray(JsonPropertyRaw(config, "periodRemarks"));
            var target = InstallmentTargetAmount(item, transactions, splitMap.GetValueOrDefault(item.Id) ?? [], config);
            if (amounts.Count == 0)
            {
                var months = (int)JsonValue.Decimal(config, "months");
                if (months <= 0)
                {
                    months = progress.Count > 0 ? progress.Count : 1;
                }
                amounts = Enumerable.Range(0, months).Select(_ => RoundMoney(target / months)).ToList();
            }
            decimal assigned = 0;
            for (var i = 0; i < amounts.Count; i++)
            {
                assigned = RoundMoney(assigned + amounts[i]);
                rows.Add([
                    sequence.ToString(CultureInfo.InvariantCulture),
                    ItemLabel(item),
                    InstallmentPeriodLabel(budget, config, i),
                    Money(item.BudgetCurrency, target) + "\n" + Label("remainingLabel", options) + " " + Money(item.BudgetCurrency, Math.Max(0, target - assigned)),
                    Money(item.BudgetCurrency, amounts[i]),
                    i < progress.Count && progress[i] ? "X" : "",
                    i < remarks.Count ? remarks[i] : "",
                ]);
                sequence++;
            }
        }
        return rows;
    }

    private static EffectiveAmounts EffectiveItem(BudgetItemRow item, List<BudgetTransactionRow> transactions, List<ItemSplitParticipant> splitParticipants)
    {
        var multiplier = item.SplitType == "per_person" ? Math.Max(1, splitParticipants.Count(v => v.IsIncluded)) : 1;
        var itemTransactions = transactions.Where(tx =>
            item.CategoryId.HasValue ? tx.CategoryId == item.CategoryId : !tx.CategoryId.HasValue && tx.Category == item.Label).ToList();
        var totals = itemTransactions
            .GroupBy(tx => tx.Currency)
            .Select(group => new CurrencyTotal(group.Key, RoundMoney(group.Sum(v => v.AmountOriginal) * multiplier), RoundMoney(group.Sum(v => v.AmountBase) * multiplier)))
            .OrderBy(v => v.Currency)
            .ToList();
        var estimatedBase = RoundMoney(totals.Sum(v => v.AmountBase));
        var budgetBase = RoundMoney(item.BudgetAmountBase * multiplier);
        if (item.BudgetAmountOriginal == 0 && item.BudgetAmountBase == 0 && totals.Count > 0)
        {
            budgetBase = estimatedBase;
        }
        return new EffectiveAmounts(budgetBase, estimatedBase, RoundMoney(budgetBase - estimatedBase), totals);
    }

    private static BudgetTotals EffectiveTotals(List<BudgetItemRow> items, List<BudgetTransactionRow> transactions, Dictionary<long, List<ItemSplitParticipant>> splitMap)
    {
        decimal budget = 0;
        decimal estimated = 0;
        decimal variance = 0;
        foreach (var item in items)
        {
            var effective = EffectiveItem(item, transactions, splitMap.GetValueOrDefault(item.Id) ?? []);
            budget += effective.BudgetBase;
            estimated += effective.EstimatedBase;
            variance += effective.VarianceBase;
        }
        return new BudgetTotals(RoundMoney(budget), RoundMoney(estimated), RoundMoney(variance));
    }

    private static GroupSummary BuildGroupSummary(
        List<BudgetItemRow> items,
        List<BudgetTransactionRow> transactions,
        List<BudgetParticipant> participants,
        Dictionary<long, List<ItemSplitParticipant>> splitMap)
    {
        var totals = participants.ToDictionary(p => p.Id, p => new ParticipantSummary(p, 0, 0, 0));
        decimal shared = 0;
        decimal personal = 0;
        foreach (var item in items)
        {
            var split = SplitForItem(item, participants, splitMap.GetValueOrDefault(item.Id) ?? []);
            var amountBase = EffectiveItem(item, transactions, split.Participants).BudgetBase;
            var included = split.Participants.Where(v => v.IsIncluded).ToList();
            if (split.SplitType == "excluded" || included.Count == 0)
            {
                continue;
            }
            if (split.SplitType is "individual" or "per_person")
            {
                foreach (var (participantId, share) in SharesForSplit(split, included, amountBase))
                {
                    if (!totals.TryGetValue(participantId, out var entry)) continue;
                    totals[participantId] = entry with { PaidBase = RoundMoney(entry.PaidBase + share), ShareBase = RoundMoney(entry.ShareBase + share) };
                    personal = RoundMoney(personal + share);
                }
                continue;
            }
            if (split.PaidByParticipantId.HasValue && totals.TryGetValue(split.PaidByParticipantId.Value, out var paidEntry))
            {
                totals[split.PaidByParticipantId.Value] = paidEntry with { PaidBase = RoundMoney(paidEntry.PaidBase + amountBase) };
            }
            foreach (var (participantId, share) in SharesForSplit(split, included, amountBase))
            {
                if (!totals.TryGetValue(participantId, out var entry)) continue;
                totals[participantId] = entry with { ShareBase = RoundMoney(entry.ShareBase + share) };
            }
            if (split.SplitType == "personal")
            {
                personal = RoundMoney(personal + amountBase);
            }
            else
            {
                shared = RoundMoney(shared + amountBase);
            }
        }

        var rows = participants.Select(p =>
        {
            var entry = totals[p.Id];
            return entry with { BalanceBase = RoundMoney(entry.PaidBase - entry.ShareBase) };
        }).ToList();
        return new GroupSummary(RoundMoney(rows.Sum(v => v.PaidBase)), RoundMoney(rows.Sum(v => v.ShareBase)), shared, personal, rows, Settlements(rows));
    }

    private static List<SettlementInstruction> Settlements(List<ParticipantSummary> summaries)
    {
        var debtors = summaries.Where(v => v.BalanceBase < -0.005m).Select(v => (v.Participant.Id, Amount: -v.BalanceBase)).OrderByDescending(v => v.Amount).ToList();
        var creditors = summaries.Where(v => v.BalanceBase > 0.005m).Select(v => (v.Participant.Id, v.BalanceBase)).OrderByDescending(v => v.BalanceBase).ToList();
        var outRows = new List<SettlementInstruction>();
        var i = 0;
        var j = 0;
        while (i < debtors.Count && j < creditors.Count)
        {
            var amount = RoundMoney(Math.Min(debtors[i].Amount, creditors[j].BalanceBase));
            if (amount > 0)
            {
                outRows.Add(new SettlementInstruction(debtors[i].Id, creditors[j].Id, amount));
            }
            debtors[i] = (debtors[i].Id, RoundMoney(debtors[i].Amount - amount));
            creditors[j] = (creditors[j].Id, RoundMoney(creditors[j].BalanceBase - amount));
            if (debtors[i].Amount <= 0.005m) i++;
            if (creditors[j].BalanceBase <= 0.005m) j++;
        }
        return outRows;
    }

    private static ItemSplitState SplitForItem(BudgetItemRow item, List<BudgetParticipant> participants, List<ItemSplitParticipant> splitParticipants)
    {
        var participantIds = participants.Select(v => v.Id).ToHashSet();
        var filtered = splitParticipants.Where(v => participantIds.Contains(v.ParticipantId)).ToList();
        if (item.SplitType == "personal" && filtered.Count == 0 && item.PaidByParticipantId.HasValue)
        {
            filtered.Add(new ItemSplitParticipant(item.Id, item.PaidByParticipantId.Value, true, null, null));
        }
        if (item.SplitType != "excluded" && filtered.Count == 0)
        {
            filtered = participants.Select(p => new ItemSplitParticipant(item.Id, p.Id, true, null, null)).ToList();
        }
        return new ItemSplitState(item.PaidByParticipantId ?? participants.FirstOrDefault()?.Id, item.SplitType, item.SplitNote, filtered);
    }

    private static Dictionary<long, decimal> SharesForSplit(ItemSplitState split, List<ItemSplitParticipant> participants, decimal amountBase)
    {
        var shares = new Dictionary<long, decimal>();
        switch (split.SplitType)
        {
            case "custom_amount":
                foreach (var p in participants)
                {
                    shares[p.ParticipantId] = RoundMoney(Math.Max(0, p.ShareAmountBase ?? 0));
                }
                return shares;
            case "custom_share":
                var totalRatio = participants.Sum(v => Math.Max(0, v.ShareRatio ?? 0));
                if (totalRatio > 0)
                {
                    foreach (var p in participants)
                    {
                        shares[p.ParticipantId] = RoundMoney(amountBase * Math.Max(0, p.ShareRatio ?? 0) / totalRatio);
                    }
                    return shares;
                }
                break;
            case "individual":
                var explicitTotal = participants.Where(v => v.ShareAmountBase.HasValue).Sum(v => Math.Max(0, v.ShareAmountBase!.Value));
                var flexible = participants.Count(v => !v.ShareAmountBase.HasValue);
                var fallback = flexible > 0 ? RoundMoney(Math.Max(0, amountBase - explicitTotal) / flexible) : 0;
                foreach (var p in participants)
                {
                    shares[p.ParticipantId] = RoundMoney(p.ShareAmountBase.HasValue ? Math.Max(0, p.ShareAmountBase.Value) : fallback);
                }
                return shares;
        }
        var equal = participants.Count > 0 ? RoundMoney(amountBase / participants.Count) : 0;
        foreach (var p in participants)
        {
            shares[p.ParticipantId] = equal;
        }
        return shares;
    }

    private static string SplitParticipantText(ItemSplitState split, List<BudgetParticipant> participants, string baseCurrency, decimal amountBase, ExportOptions options)
    {
        var included = split.Participants.Where(v => v.IsIncluded).ToList();
        var shares = SharesForSplit(split, included, amountBase);
        return string.Join("\n", included.Select(v =>
        {
            var share = Money(baseCurrency, shares.GetValueOrDefault(v.ParticipantId));
            if (split.SplitType == "custom_share" && v.ShareRatio.HasValue)
            {
                share += $" ({v.ShareRatio.Value:0.######})";
            }
            return $"{ParticipantName(v.ParticipantId, participants, options)}: {share}";
        }));
    }

    private static decimal InstallmentTargetAmount(BudgetItemRow item, List<BudgetTransactionRow> transactions, List<ItemSplitParticipant> splitParticipants, JsonElement config)
    {
        var configured = JsonValue.Decimal(config, "totalAmount", "total_amount");
        if (JsonValue.Bool(config, "enabled") && configured > 0)
        {
            return configured;
        }
        var rate = item.BudgetRateToBase <= 0 ? 1 : item.BudgetRateToBase;
        return RoundMoney(EffectiveItem(item, transactions, splitParticipants).BudgetBase / rate);
    }

    private static string PricingUnitPrice(BudgetTransactionRow tx, string baseCurrency)
    {
        var config = ParseJson(tx.PricingConfigJson);
        var price = tx.AmountOriginal;
        if (JsonValue.Bool(config, "enabled"))
        {
            var configured = JsonValue.Decimal(config, "unitPrice", "unit_price");
            if (configured > 0)
            {
                price = configured;
            }
        }
        return Money(string.IsNullOrWhiteSpace(tx.Currency) ? baseCurrency : tx.Currency, price);
    }

    private static string PricingQuantity(BudgetTransactionRow tx)
    {
        var config = ParseJson(tx.PricingConfigJson);
        var quantity = JsonValue.Bool(config, "enabled") ? JsonValue.Decimal(config, "quantity") : 1;
        if (quantity <= 0)
        {
            quantity = 1;
        }
        return quantity.ToString("0.##", CultureInfo.InvariantCulture);
    }

    private static string TransactionAmount(BudgetTransactionRow tx, string baseCurrency)
    {
        var text = Money(tx.Currency, tx.AmountOriginal);
        if (tx.Currency != baseCurrency)
        {
            text += "\n" + Money(baseCurrency, tx.AmountBase);
        }
        if (!string.IsNullOrWhiteSpace(tx.ReferenceCurrency) && tx.ReferenceAmountOriginal.HasValue)
        {
            text += "\nRef " + Money(tx.ReferenceCurrency, tx.ReferenceAmountOriginal.Value);
        }
        return text;
    }

    private static string MoneyWithSecondary(string baseCurrency, decimal baseAmount, string currency, decimal rateToBase)
    {
        var primary = Money(baseCurrency, baseAmount);
        if (string.IsNullOrWhiteSpace(currency) || currency == baseCurrency || rateToBase <= 0)
        {
            return primary;
        }
        return primary + "\n" + Money(currency, RoundMoney(baseAmount / rateToBase));
    }

    private static string MoneyWithTransactionBreakdown(string baseCurrency, decimal baseAmount, IReadOnlyList<CurrencyTotal> totals)
    {
        var primary = Money(baseCurrency, baseAmount);
        if (totals.Count == 0 || (totals.Count == 1 && totals[0].Currency == baseCurrency))
        {
            return primary;
        }
        return primary + "\n" + string.Join("\n", totals.Select(v => Money(v.Currency, v.AmountOriginal)));
    }

    private static string Money(string currency, decimal amount)
    {
        if (Math.Abs(amount) < 0.005m)
        {
            amount = 0;
        }
        return $"{currency} {amount:0.00}";
    }

}

public sealed record RenderResult(int Pages, long FileSize);
