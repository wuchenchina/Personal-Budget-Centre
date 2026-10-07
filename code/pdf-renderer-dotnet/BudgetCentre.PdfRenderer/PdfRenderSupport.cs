using System.Globalization;
using System.Text;
using System.Text.Json;

namespace BudgetCentre.PdfRenderer;

public sealed partial class PdfExportRenderer
{
    private static decimal RoundMoney(decimal value)
    {
        return Math.Abs(value) < 0.005m ? 0 : Math.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static string ItemLabel(BudgetItemRow item) => string.IsNullOrWhiteSpace(item.Category) ? item.Label : item.Category;

    private static string ParticipantName(long? id, List<BudgetParticipant> participants, ExportOptions options)
    {
        if (id.HasValue)
        {
            var participant = participants.FirstOrDefault(v => v.Id == id.Value);
            if (participant is not null)
            {
                return participant.Name;
            }
        }
        return Label("noParticipant", options);
    }

    private static string TransactionTypeText(string type, ExportOptions options)
    {
        return type switch
        {
            "income" => Join(Text("Income", "收入", "收入", "収入", "Revenu", "Доход", "Einnahme"), options),
            "expense" => Join(Text("Order / expense", "訂單 / 支出", "订单 / 支出", "注文 / 支出", "Commande / dépense", "Заказ / расход", "Bestellung / Ausgabe"), options),
            "transfer" => Join(Text("Transfer", "資金劃轉", "资金划转", "振替", "Virement", "Перевод", "Überweisung"), options),
            "sof" => Join(Text("Source of funds", "資金來源", "资金来源", "資金源", "Source des fonds", "Источник средств", "Mittelherkunft"), options),
            "fx_exchange" => Join(Text("Currency exchange", "貨幣兌換", "货币兑换", "通貨両替", "Change de devise", "Обмен валюты", "Währungswechsel"), options),
            "cross_border_remittance" => Join(Text("Cross-border remittance", "跨境匯款", "跨境汇款", "海外送金", "Virement transfrontalier", "Трансграничный перевод", "Grenzüberschreitende Überweisung"), options),
            _ => type,
        };
    }

    private static string SplitTypeText(string type, ExportOptions options)
    {
        return type switch
        {
            "custom_amount" => Join(Text("Custom amount", "自訂金額", "自定义金额", "カスタム金額", "Montant personnalisé", "Своя сумма", "Benutzerdefinierter Betrag"), options),
            "custom_share" => Join(Text("Custom share", "自訂比例", "自定义比例", "カスタム比率", "Part personnalisée", "Своя доля", "Benutzerdefinierter Anteil"), options),
            "equal" => Join(Text("Equal split", "平均分攤", "平均分摊", "均等分割", "Partage égal", "Равное распределение", "Gleichmäßige Aufteilung"), options),
            "excluded" => Join(Text("Excluded from settlement", "不納入結算", "不纳入结算", "精算対象外", "Exclu du règlement", "Исключено из расчета", "Von der Abrechnung ausgeschlossen"), options),
            "individual" => Join(Text("Individual payment", "各自付款", "各自付款", "個別支払い", "Paiement individuel", "Индивидуальный платеж", "Einzelzahlung"), options),
            "per_person" => Join(Text("Same amount per person", "每人同額", "每人同额", "1 人あたり同額", "Même montant par personne", "Одинаковая сумма на человека", "Gleicher Betrag pro Person"), options),
            "personal" => Join(Text("Personal", "個人自付", "个人自付", "個人負担", "Personnel", "Личное", "Persönlich"), options),
            _ => type,
        };
    }

    private static string Label(string key, ExportOptions options, bool bookkeeping = false)
    {
        var labels = bookkeeping ? BookkeepingLabels : BudgetLabels;
        if (!labels.TryGetValue(key, out var values))
        {
            values = BudgetLabels.GetValueOrDefault(key, Text(key, key, key, key, key, key, key));
        }
        return Join(values, options);
    }

    private static string SignatureLabel(ExportOptions options)
    {
        return options.SignatureLabelMode switch
        {
            "confirmation" => Join(Text("Confirmation", "確認", "确认", "確認", "Confirmation", "Подтверждение", "Bestätigung"), options),
            "signature" => Join(Text("Signature", "簽署", "签署", "署名", "Signature", "Подпись", "Unterschrift"), options),
            _ => Join(Text("Confirmation / Signature", "確認 / 簽署", "确认 / 签署", "確認 / 署名", "Confirmation / signature", "Подтверждение / подпись", "Bestätigung / Unterschrift"), options),
        };
    }

    private static LocalizedText Text(string en, string tc, string sc, string ja, string fr, string ru, string de) =>
        new(en, tc, sc, ja, fr, ru, de);

    private static string Join(LocalizedText text, ExportOptions options) => JoinWithLanguages(text, options.PdfLanguages);

    private static string JoinWithLanguages(LocalizedText text, IReadOnlyList<string> languages)
    {
        var selected = languages.Count == 0 ? ["en"] : languages;
        var parts = new List<string>();
        foreach (var lang in selected)
        {
            var value = lang switch
            {
                "tc" => text.Tc,
                "sc" => text.Sc,
                "ja" => text.Ja,
                "fr" => text.Fr,
                "ru" => text.Ru,
                "de" => text.De,
                _ => text.En,
            };
            if (!parts.Contains(value))
            {
                parts.Add(value);
            }
        }
        return string.Join("\n", parts);
    }

    private static string DatePrefix(ExportOptions options, bool bookkeeping)
    {
        var languages = options.PdfLanguages.Length == 0 ? ["en"] : options.PdfLanguages;
        var labels = new List<string>();
        foreach (var lang in languages)
        {
            var value = bookkeeping
                ? lang switch
                {
                    "tc" => "日期",
                    "sc" => "日期",
                    "ja" => "日付",
                    "fr" => "Date",
                    "ru" => "Дата",
                    "de" => "Datum",
                    _ => "Date",
                }
                : lang switch
                {
                    "tc" => "日期",
                    "sc" => "日期",
                    "ja" => "日付",
                    "fr" => "Date",
                    "ru" => "Дата",
                    "de" => "Datum",
                    _ => "Date",
                };
            if (!labels.Contains(value))
            {
                labels.Add(value);
            }
        }
        return (labels.Count == 0 ? "Date" : string.Join(" / ", labels)) + ": ";
    }

    private static bool HasChinese(ExportOptions options) => options.PdfLanguages.Any(v => v is "tc" or "sc");

    private static string PeriodText(BudgetInfo budget)
    {
        if (string.IsNullOrWhiteSpace(budget.StartDate) && string.IsNullOrWhiteSpace(budget.EndDate))
        {
            return "";
        }
        return $"{FormatDate(budget.StartDate)} to {FormatDate(budget.EndDate)}";
    }

    private static string FormatDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "";
        }
        return DateTime.TryParse(value, out var parsed) ? parsed.ToString("d MMMM, yyyy", CultureInfo.InvariantCulture) : value;
    }

    private static string InstallmentPeriodLabel(BudgetInfo budget, JsonElement? itemConfig, int index)
    {
        var start = itemConfig.HasValue ? JsonValue.String(itemConfig.Value, "startMonth") : "";
        if (start.Length == 7)
        {
            start += "-01";
        }
        if (string.IsNullOrWhiteSpace(start))
        {
            start = budget.StartDate ?? "";
        }
        if (!DateTime.TryParse(start, out var parsed))
        {
            return "#" + (index + 1).ToString(CultureInfo.InvariantCulture);
        }
        return budget.InstallmentPeriodUnit switch
        {
            "day" => parsed.AddDays(index).ToString("d MMM yyyy", CultureInfo.InvariantCulture),
            "week" => parsed.AddDays(index * 7).ToString("d MMM yyyy", CultureInfo.InvariantCulture),
            "year" => parsed.AddYears(index).ToString("yyyy", CultureInfo.InvariantCulture),
            _ => parsed.AddMonths(index).ToString("MMM yyyy", CultureInfo.InvariantCulture),
        };
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return default;
        }
        try
        {
            return JsonDocument.Parse(json).RootElement.Clone();
        }
        catch (JsonException)
        {
            return default;
        }
    }

    private static string? JsonPropertyRaw(JsonElement element, string name)
    {
        return element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) ? value.GetRawText() : null;
    }

    private static string WrapLongReference(string value)
    {
        if (value.Length <= 18 || value.Any(char.IsWhiteSpace))
        {
            return value;
        }
        var builder = new StringBuilder();
        for (var i = 0; i < value.Length; i += 18)
        {
            if (i > 0) builder.Append('\n');
            builder.Append(value.AsSpan(i, Math.Min(18, value.Length - i)));
        }
        return builder.ToString();
    }

    private static string SingleLine(string value) => string.Join(" ", value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    private static string SafeTitle(string title, int max)
    {
        var clean = SingleLine(title);
        if (clean.Length <= max)
        {
            return clean;
        }
        return clean[..Math.Max(8, max - 9)] + "-" + ShortHash(clean)[..8];
    }

    private static decimal ProgressPercent(long processed, long? total)
    {
        if (!total.HasValue || total.Value <= 0) return processed <= 0 ? 5 : 50;
        return Math.Min(90, Math.Max(5, decimal.Round(processed * 85m / total.Value, 2)));
    }

    private static long KnownProcessed(long? total, int fallback)
    {
        return total.HasValue ? Math.Min(total.Value, fallback) : fallback;
    }

    private static string ShortHash(string value)
    {
        var bytes = System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes)[..10];
    }

    private static float Mm(float value) => value * 72f / 25.4f;

    private static readonly Dictionary<string, LocalizedText> BudgetLabels = new()
    {
        ["expectedIncome"] = Text("Expected income", "預計收入", "预计收入", "収入見込み", "Revenu prévisionnel", "Ожидаемый доход", "Erwartetes Einkommen"),
        ["incomeSourceName"] = Text("Income source", "收入來源", "收入来源", "収入源", "Source de revenu", "Источник дохода", "Einkommensquelle"),
        ["expectedMonthlyIncome"] = Text("Expected monthly income", "預計每月收入", "预计每月收入", "月収見込み", "Revenu mensuel prévisionnel", "Ожидаемый месячный доход", "Erwartetes Monatseinkommen"),
        ["expectedPeriodIncome"] = Text("Expected income for budget period", "Budget期間預計收入", "Budget期间预计收入", "予算期間の収入見込み", "Revenu prévu sur la période du budget", "Ожидаемый доход за период бюджета", "Erwartetes Einkommen im Budgetzeitraum"),
        ["incomeMonthTotal"] = Text("One-month income including one-off amounts", "單月預計收入（含一次性收入）", "单月预计收入（含一次性收入）", "一時収入を含む1か月の収入見込み", "Revenu prévu sur un mois, montants ponctuels compris", "Доход за один месяц с разовыми суммами", "Erwartetes Monatseinkommen einschließlich Einmalbeträgen"),
        ["incomeOneOffTotal"] = Text("One-off income total", "一次性收入總計", "一次性收入总计", "一時収入合計", "Total des revenus ponctuels", "Всего разовых доходов", "Einmalige Einnahmen gesamt"),
        ["incomePlannedExpense"] = Text("Planned budget expenses", "預算支出", "预算支出", "予算支出", "Dépenses budgétées", "Плановые расходы бюджета", "Geplante Budgetausgaben"),
        ["incomeFundingGap"] = Text("Funding shortfall", "資金缺口", "资金缺口", "資金不足", "Déficit de financement", "Дефицит средств", "Finanzierungslücke"),
        ["incomeFundingSurplus"] = Text("Funding surplus", "資金盈餘", "资金盈余", "資金余剰", "Excédent de financement", "Избыток средств", "Finanzierungsüberschuss"),
        ["incomeFundingBalanced"] = Text("Funding balanced", "資金平衡", "资金平衡", "資金収支均衡", "Financement équilibré", "Средства сбалансированы", "Finanzierung ausgeglichen"),
        ["netMonthlySalary"] = Text("Monthly take-home salary", "到手月薪", "到手月薪", "手取り月給", "Salaire mensuel net", "Месячная зарплата на руки", "Nettomonatsgehalt"),
        ["netDailySalary"] = Text("Daily take-home salary", "到手日薪", "到手日薪", "手取り日給", "Salaire journalier net", "Дневная зарплата на руки", "Nettotageslohn"),
        ["netAnnualSalary"] = Text("Annual take-home salary", "到手年薪", "到手年薪", "手取り年収", "Salaire annuel net", "Годовая зарплата на руки", "Nettojahresgehalt"),
        ["incomeOneOff"] = Text("One-off / unexpected income", "一次性／意外收入", "一次性／意外收入", "一時・臨時収入", "Revenu ponctuel / imprévu", "Разовый / неожиданный доход", "Einmalige / unerwartete Einnahme"),
        ["netSalaryNotice"] = Text("Tax, social insurance and housing fund deductions are not calculated. Enter your actual take-home pay.", "暫不支援個稅、五險一金的測算或剝離，請填寫實際到手薪資。", "暂不支持个税、五险一金的测算或剥离，请填写实际到手薪资。", "所得税、社会保険、住宅積立金の計算・控除には未対応です。実際の手取り額を入力してください。", "Les impôts, cotisations sociales et cotisations au fonds logement ne sont pas calculés. Saisissez le salaire réellement perçu.", "Расчёт и вычет налогов, социальных взносов и взносов в жилищный фонд не поддерживаются. Укажите фактическую сумму на руки.", "Steuern, Sozialabgaben und Wohnungsfondsbeiträge werden nicht berechnet oder abgezogen. Geben Sie den tatsächlich ausgezahlten Nettolohn ein."),
        ["incomeFundingHelp"] = Text("Balance = expected income for the budget period − planned budget expenses. One-off income is counted once. Without dates, recurring income assumes one month. Actual transactions are excluded.", "餘額 = Budget期間預計收入 − 預算支出。一次性收入僅計算一次；無日期時經常性收入按一個月計算，不混入實際記帳收入。", "余额 = Budget期间预计收入 − 预算支出。一次性收入仅计算一次；无日期时经常性收入按一个月计算，不混入实际记账收入。", "収支＝予算期間の収入見込み－予算支出。一時収入は1回のみ計上し、日付未設定の継続収入は1か月分として計算します。実際の取引は含めません。", "Solde = revenu prévu sur la période − dépenses budgétées. Les revenus ponctuels comptent une seule fois. Sans dates, les revenus récurrents couvrent un mois. Les transactions réelles sont exclues.", "Баланс = ожидаемый доход за период − плановые расходы бюджета. Разовые доходы учитываются один раз. Без дат регулярный доход рассчитан за один месяц. Фактические операции не включены.", "Saldo = erwartetes Einkommen im Budgetzeitraum − geplante Ausgaben. Einmalige Einnahmen zählen einmal. Ohne Datum wird ein Monat für laufendes Einkommen angenommen. Tatsächliche Buchungen werden nicht einbezogen."),
        ["incomeProjectionHelp"] = Text("Estimate only, not a recorded transaction. Annual salary is spread evenly over 12 months; partial months are prorated by calendar days.", "僅為估算，不計入實際收入記帳。年薪平均分攤至12個月；不足整月按日曆日比例計算。", "仅为估算，不计入实际收入记账。年薪平均分摊至12个月；不足整月按日历日比例计算。", "試算のみで、収入取引には記録されません。年収は12か月に均等配分し、端数月は暦日で日割りします。", "Estimation uniquement, sans écriture comptable. Le salaire annuel est réparti sur 12 mois ; les mois partiels sont proratisés par jours calendaires.", "Это прогноз, а не записанная операция. Годовой доход распределяется равномерно на 12 месяцев; неполные месяцы рассчитываются по календарным дням.", "Nur eine Schätzung, keine gebuchte Einnahme. Das Jahresgehalt wird auf 12 Monate verteilt; Teilmonate werden nach Kalendertagen anteilig berechnet."),
        ["salaryWorkdays"] = Text("Workdays in budget period", "預算期間工作日數", "预算期间工作日数", "月の勤務日数", "Jours travaillés sur la période du budget", "Рабочих дней за период бюджета", "Arbeitstage im Budgetzeitraum"),

        ["budgetHighlightsTitle"] = Text("Budget Summary", "預算摘要", "预算摘要", "予算概要", "Résumé du budget", "Сводка бюджета", "Budgetübersicht"),
        ["datePrefix"] = Text("Date: ", "日期：", "日期：", "日付：", "Date : ", "Дата: ", "Datum: "),
        ["emptyBudgetItems"] = Text("No budget items", "暫無預算項", "暂无预算项", "予算項目はありません", "Aucun poste budgétaire", "Нет статей бюджета", "Keine Budgetposten"),
        ["emptyGroupSplitDetails"] = Text("No split details", "暫無分攤明細", "暂无分摊明细", "分割明細はありません", "Aucun détail de partage", "Нет деталей распределения", "Keine Aufteilungsdetails"),
        ["emptySettlementInstructions"] = Text("No settlement needed", "無需結算", "无需结算", "精算は不要です", "Aucun règlement nécessaire", "Расчет не требуется", "Keine Abrechnung erforderlich"),
        ["emptyInstallments"] = Text("No installment targets", "暫無分期目標", "暂无分期目标", "積立目標はありません", "Aucun objectif d'échelonnement", "Нет целей рассрочки", "Keine Ratenziele"),
        ["emptyTransactions"] = Text("No transactions", "暫無交易", "暂无交易", "取引はありません", "Aucune transaction", "Нет транзакций", "Keine Transaktionen"),
        ["groupExpenseSummaryTitle"] = Text("Group Expense Summary", "多人費用摘要", "多人费用摘要", "グループ費用概要", "Résumé des dépenses de groupe", "Сводка групповых расходов", "Gruppenausgabenübersicht"),
        ["groupSettlementSummaryTitle"] = Text("Group Settlement Summary", "多人結算摘要", "多人结算摘要", "グループ精算概要", "Résumé du règlement de groupe", "Сводка группового расчета", "Gruppenabrechnungsübersicht"),
        ["groupSplitDetailsTitle"] = Text("Group Split Details", "多人分攤明細", "多人分摊明细", "グループ分割明細", "Détails du partage de groupe", "Детали группового распределения", "Gruppenaufteilungsdetails"),
        ["installmentsTitle"] = Text("Installments", "分期明細", "分期明细", "積立明細", "Échéances", "Рассрочки", "Raten"),
        ["noParticipant"] = Text("Unspecified", "未指定", "未指定", "未指定", "Non spécifié", "Не указано", "Nicht angegeben"),
        ["remainingLabel"] = Text("Remaining", "剩餘", "剩余", "残り", "Restant", "Осталось", "Verbleibend"),
        ["settlementInstructionsTitle"] = Text("Settlement Instructions", "結算指引", "结算指引", "精算指示", "Instructions de règlement", "Инструкции по расчету", "Abrechnungsanweisungen"),
        ["total"] = Text("Total", "總計", "总计", "合計", "Total", "Итого", "Gesamt"),
        ["transactionBreakdownTitle"] = Text("Transaction Breakdown", "交易明細", "交易明细", "取引内訳", "Détail des transactions", "Разбивка транзакций", "Transaktionsaufschlüsselung"),
        ["amount"] = Text("Amount", "金額", "金额", "金額", "Montant", "Сумма", "Betrag"),
        ["balance"] = Text("Balance", "差額", "差额", "残高", "Solde", "Баланс", "Saldo"),
        ["budget"] = Text("Budget", "預算", "预算", "予算", "Budget", "Бюджет", "Budget"),
        ["category"] = Text("Category", "類別", "类别", "カテゴリ", "Catégorie", "Категория", "Kategorie"),
        ["date"] = Text("Date", "日期", "日期", "日付", "Date", "Дата", "Datum"),
        ["estimated_actuals"] = Text("Estimated Actuals", "預估實際", "预估实际", "見込実績", "Réel estimé", "Оценка факта", "Geschätzte Istwerte"),
        ["export"] = Text("Export", "匯出", "导出", "エクスポート", "Export", "Экспорт", "Export"),
        ["from"] = Text("From", "付款方", "付款方", "支払元", "De", "От", "Von"),
        ["metric"] = Text("Metric", "項目", "项目", "指標", "Indicateur", "Показатель", "Kennzahl"),
        ["paid"] = Text("Paid", "已支付", "已支付", "支払済み", "Payé", "Оплачено", "Bezahlt"),
        ["paid_by"] = Text("Paid By", "付款人", "付款人", "支払者", "Payé par", "Плательщик", "Bezahlt von"),
        ["participant"] = Text("Participant", "參與者", "参与者", "参加者", "Participant", "Участник", "Teilnehmer"),
        ["participants"] = Text("Participants", "參與者", "参与者", "参加者", "Participants", "Участники", "Teilnehmer"),
        ["period"] = Text("Period", "期間", "期间", "期間", "Période", "Период", "Zeitraum"),
        ["period_amount"] = Text("Amount", "金額", "金额", "金額", "Montant", "Сумма", "Betrag"),
        ["personalExpense"] = Text("Personal expense", "個人自付", "个人自付", "個人負担", "Dépense personnelle", "Личный расход", "Persönliche Ausgabe"),
        ["progress"] = Text("Done", "進度", "进度", "完了", "Terminé", "Готово", "Erledigt"),
        ["remark"] = Text("Remark", "備註", "备注", "備考", "Remarque", "Примечание", "Bemerkung"),
        ["sequence"] = Text("No.", "序號", "序号", "番号", "N°", "№", "Nr."),
        ["share"] = Text("Share", "應承擔", "应承担", "負担分", "Part", "Доля", "Anteil"),
        ["sharedExpense"] = Text("Shared expense", "共同支出", "共同支出", "共有費用", "Dépense partagée", "Общий расход", "Gemeinsame Ausgabe"),
        ["scope"] = Text("Scope", "範圍", "范围", "範囲", "Périmètre", "Область", "Umfang"),
        ["split_type"] = Text("Split Type", "分攤方式", "分摊方式", "分割方式", "Type de partage", "Тип распределения", "Aufteilungsart"),
        ["target_amount"] = Text("Target", "目標", "目标", "目標", "Objectif", "Цель", "Ziel"),
        ["to"] = Text("To", "收款方", "收款方", "受取先", "À", "Кому", "An"),
        ["transaction_details"] = Text("Transaction Details", "交易詳情", "交易详情", "取引詳細", "Détails de transaction", "Детали транзакции", "Transaktionsdetails"),
        ["unit_price"] = Text("Unit Price", "單價", "单价", "単価", "Prix unitaire", "Цена за единицу", "Einzelpreis"),
        ["quantity"] = Text("Quantity", "數量", "数量", "数量", "Quantité", "Количество", "Menge"),
        ["variance"] = Text("Variance", "差額", "差额", "差異", "Écart", "Отклонение", "Abweichung"),
        ["workspace"] = Text("Workspace", "工作區", "工作区", "ワークスペース", "Espace de travail", "Рабочая область", "Arbeitsbereich"),
        ["signatureTitle"] = Text("Preparation & Review Record", "製表及覆核記錄", "制表及复核记录", "作成・確認記録", "Registre de préparation et de revue", "Запись подготовки и проверки", "Erstellungs- und Prüfvermerk"),
        ["dateTime"] = Text("Date & Time", "日期及時間", "日期及时间", "日時", "Date et heure", "Дата и время", "Datum und Uhrzeit"),
    };

    private static readonly Dictionary<string, LocalizedText> BookkeepingLabels = new(BudgetLabels)
    {
        ["bookkeepingLedgerSubtitle"] = Text("Bookkeeping Ledger", "記帳流水", "记账流水", "記帳元帳", "Grand livre de comptabilité", "Журнал учета", "Buchhaltungsjournal"),
        ["bookkeepingRecordsTitle"] = Text("Bookkeeping Records", "記帳記錄", "记账记录", "記帳記録", "Enregistrements comptables", "Учетные записи", "Buchhaltungsdatensätze"),
        ["emptyBookkeepingRecords"] = Text("No bookkeeping records", "暫無記帳記錄", "暂无记账记录", "記帳記録はありません", "Aucun enregistrement comptable", "Нет учетных записей", "Keine Buchhaltungsdatensätze"),
        ["bookkeepingExpenseTotal"] = Text("Expense total", "支出總計", "支出总计", "支出合計", "Total des dépenses", "Итого расходов", "Ausgaben gesamt"),
        ["bookkeepingIncomeTotal"] = Text("Income total", "收入總計", "收入总计", "収入合計", "Total des revenus", "Итого доходов", "Einnahmen gesamt"),
        ["type"] = Text("Type", "交易類型", "交易类型", "種類", "Type", "Тип", "Typ"),
        ["date"] = Text("Date", "日期", "日期", "日付", "Date", "Дата", "Datum"),
        ["order"] = Text("Order No.", "訂單號", "订单号", "注文番号", "N° de commande", "№ заказа", "Bestellnr."),
        ["details"] = Text("Details", "交易詳情", "交易详情", "詳細", "Détails", "Детали", "Details"),
        ["accounts"] = Text("Funds / Accounts", "資金/帳戶", "资金/账户", "資金 / 口座", "Fonds / comptes", "Средства / счета", "Mittel / Konten"),
        ["destination"] = Text("Destination", "目的金額", "目的金额", "宛先金額", "Destination", "Назначение", "Zielbetrag"),
    };

    private sealed record LocalizedText(string En, string Tc, string Sc, string Ja, string Fr, string Ru, string De);

    private sealed record CurrencyTotal(string Currency, decimal AmountOriginal, decimal AmountBase);
    private sealed record EffectiveAmounts(decimal BudgetBase, decimal EstimatedBase, decimal VarianceBase, IReadOnlyList<CurrencyTotal> TransactionTotals);
    private sealed record ItemSplitState(long? PaidByParticipantId, string SplitType, string Note, List<ItemSplitParticipant> Participants);
    private sealed record ParticipantSummary(BudgetParticipant Participant, decimal PaidBase, decimal ShareBase, decimal BalanceBase);
    private sealed record SettlementInstruction(long FromParticipantId, long ToParticipantId, decimal AmountBase);
    private sealed record GroupSummary(decimal PaidTotalBase, decimal ShareTotalBase, decimal SharedExpenseBase, decimal PersonalExpenseBase, List<ParticipantSummary> Participants, List<SettlementInstruction> Settlements);
}
