<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

use BudgetCentre\Support\PdfLanguages;

final readonly class BudgetPdfTranslations
{
    private const BUDGET = [
        'en' => [
            'budgetHighlightsTitle' => 'Budget Summary',
            'datePrefix' => 'Date: ',
            'emptyBudgetItems' => 'No budget items',
            'emptyGroupSplitDetails' => 'No split details',
            'emptySettlementInstructions' => 'No settlement needed',
            'emptyInstallments' => 'No installment targets',
            'emptyTransactions' => 'No transactions',
            'groupExpenseSummaryTitle' => 'Group Expense Summary',
            'groupSettlementSummaryTitle' => 'Group Settlement Summary',
            'groupSplitDetailsTitle' => 'Group Split Details',
            'installmentsTitle' => 'Installments',
            'noParticipant' => 'Unspecified',
            'remainingLabel' => 'Remaining',
            'settlementInstructionsTitle' => 'Settlement Instructions',
            'total' => 'Total',
            'transactionBreakdownTitle' => 'Transaction Breakdown',
            'columnLabels' => [
                'amount' => 'Amount',
                'balance' => 'Balance',
                'budget' => 'Budget',
                'category' => 'Category',
                'estimated_actuals' => 'Estimated Actuals',
                'from' => 'From',
                'metric' => 'Metric',
                'paid' => 'Paid',
                'paid_by' => 'Paid By',
                'participant' => 'Participant',
                'participants' => 'Participants',
                'period' => 'Period',
                'period_amount' => 'Amount',
                'progress' => 'Progress',
                'remark' => 'Remark',
                'sequence' => 'No.',
                'share' => 'Share',
                'split_type' => 'Split Type',
                'target_amount' => 'Target',
                'to' => 'To',
                'transaction_details' => 'Transaction Details',
                'unit_price' => 'Unit Price',
                'quantity' => 'Quantity',
                'variance' => 'Variance',
            ],
            'metrics' => [
                'personalExpense' => 'Personal expense',
                'sharedExpense' => 'Shared expense',
            ],
            'periodUnits' => ['day' => 'day', 'month' => 'month', 'week' => 'week', 'year' => 'year'],
            'splitTypes' => [
                'custom_amount' => 'Custom amount',
                'custom_share' => 'Custom share',
                'equal' => 'Equal split',
                'excluded' => 'Excluded from settlement',
                'individual' => 'Individual payment',
                'per_person' => 'Same amount per person',
                'personal' => 'Personal',
            ],
        ],
        'sc' => [
            'budgetHighlightsTitle' => '预算摘要',
            'datePrefix' => '日期：',
            'emptyBudgetItems' => '暂无预算项',
            'emptyGroupSplitDetails' => '暂无分摊明细',
            'emptySettlementInstructions' => '无需结算',
            'emptyInstallments' => '暂无分期目标',
            'emptyTransactions' => '暂无交易',
            'groupExpenseSummaryTitle' => '多人费用摘要',
            'groupSettlementSummaryTitle' => '多人结算摘要',
            'groupSplitDetailsTitle' => '多人分摊明细',
            'installmentsTitle' => '分期明细',
            'noParticipant' => '未指定',
            'remainingLabel' => '剩余',
            'settlementInstructionsTitle' => '结算指引',
            'total' => '总计',
            'transactionBreakdownTitle' => '交易明细',
            'columnLabels' => [
                'amount' => '金额',
                'balance' => '差额',
                'budget' => '预算',
                'category' => '类别',
                'estimated_actuals' => '预估实际',
                'from' => '付款方',
                'metric' => '项目',
                'paid' => '已支付',
                'paid_by' => '付款人',
                'participant' => '参与者',
                'participants' => '参与者',
                'period' => '期间',
                'period_amount' => '金额',
                'progress' => '进度',
                'remark' => '备注',
                'sequence' => '序号',
                'share' => '应承担',
                'split_type' => '分摊方式',
                'target_amount' => '目标',
                'to' => '收款方',
                'transaction_details' => '交易详情',
                'unit_price' => '单价',
                'quantity' => '数量',
                'variance' => '差额',
            ],
            'metrics' => ['personalExpense' => '个人费用', 'sharedExpense' => '共同费用'],
            'periodUnits' => ['day' => '日', 'month' => '月', 'week' => '周', 'year' => '年'],
            'splitTypes' => [
                'custom_amount' => '自定义金额',
                'custom_share' => '自定义比例',
                'equal' => '平均分摊',
                'excluded' => '不纳入结算',
                'individual' => '各自付款',
                'per_person' => '每人同额',
                'personal' => '个人自付',
            ],
        ],
        'tc' => [
            'budgetHighlightsTitle' => '預算摘要',
            'datePrefix' => '日期：',
            'emptyBudgetItems' => '暫無預算項',
            'emptyGroupSplitDetails' => '暫無分攤明細',
            'emptySettlementInstructions' => '無需結算',
            'emptyInstallments' => '暫無分期目標',
            'emptyTransactions' => '暫無交易',
            'groupExpenseSummaryTitle' => '多人費用摘要',
            'groupSettlementSummaryTitle' => '多人結算摘要',
            'groupSplitDetailsTitle' => '多人分攤明細',
            'installmentsTitle' => '分期明細',
            'noParticipant' => '未指定',
            'remainingLabel' => '剩餘',
            'settlementInstructionsTitle' => '結算指引',
            'total' => '總計',
            'transactionBreakdownTitle' => '交易明細',
            'columnLabels' => [
                'amount' => '金額',
                'balance' => '差額',
                'budget' => '預算',
                'category' => '類別',
                'estimated_actuals' => '預估實際',
                'from' => '付款方',
                'metric' => '項目',
                'paid' => '已支付',
                'paid_by' => '付款人',
                'participant' => '參與者',
                'participants' => '參與者',
                'period' => '期間',
                'period_amount' => '金額',
                'progress' => '進度',
                'remark' => '備註',
                'sequence' => '序號',
                'share' => '應承擔',
                'split_type' => '分攤方式',
                'target_amount' => '目標',
                'to' => '收款方',
                'transaction_details' => '交易詳情',
                'unit_price' => '單價',
                'quantity' => '數量',
                'variance' => '差額',
            ],
            'metrics' => ['personalExpense' => '個人費用', 'sharedExpense' => '共同費用'],
            'periodUnits' => ['day' => '日', 'month' => '月', 'week' => '週', 'year' => '年'],
            'splitTypes' => [
                'custom_amount' => '自訂金額',
                'custom_share' => '自訂比例',
                'equal' => '平均分攤',
                'excluded' => '不納入結算',
                'individual' => '各自付款',
                'per_person' => '每人同額',
                'personal' => '個人自付',
            ],
        ],
        'ja' => [
            'budgetHighlightsTitle' => '予算概要',
            'datePrefix' => '日付: ',
            'emptyBudgetItems' => '予算項目はありません',
            'emptyGroupSplitDetails' => '分担明細はありません',
            'emptySettlementInstructions' => '精算は不要です',
            'emptyInstallments' => '分割目標はありません',
            'emptyTransactions' => '取引はありません',
            'groupExpenseSummaryTitle' => 'グループ費用概要',
            'groupSettlementSummaryTitle' => 'グループ精算概要',
            'groupSplitDetailsTitle' => 'グループ分担明細',
            'installmentsTitle' => '分割明細',
            'noParticipant' => '未指定',
            'remainingLabel' => '残額',
            'settlementInstructionsTitle' => '精算指示',
            'total' => '合計',
            'transactionBreakdownTitle' => '取引明細',
            'columnLabels' => [
                'amount' => '金額',
                'balance' => '差額',
                'budget' => '予算',
                'category' => 'カテゴリ',
                'estimated_actuals' => '見込実績',
                'from' => '支払元',
                'metric' => '項目',
                'paid' => '支払済',
                'paid_by' => '支払者',
                'participant' => '参加者',
                'participants' => '参加者',
                'period' => '期間',
                'period_amount' => '金額',
                'progress' => '進捗',
                'remark' => '備考',
                'sequence' => '番号',
                'share' => '負担額',
                'split_type' => '分担方式',
                'target_amount' => '目標',
                'to' => '受取先',
                'transaction_details' => '取引詳細',
                'unit_price' => '単価',
                'quantity' => '数量',
                'variance' => '差異',
            ],
            'metrics' => ['personalExpense' => '個人費用', 'sharedExpense' => '共通費用'],
            'periodUnits' => ['day' => '日', 'month' => '月', 'week' => '週', 'year' => '年'],
            'splitTypes' => [
                'custom_amount' => 'カスタム金額',
                'custom_share' => 'カスタム割合',
                'equal' => '均等分担',
                'excluded' => '精算対象外',
                'individual' => '各自支払',
                'per_person' => '一人当たり同額',
                'personal' => '個人負担',
            ],
        ],
        'fr' => [
            'budgetHighlightsTitle' => 'Resume du budget',
            'datePrefix' => 'Date : ',
            'emptyBudgetItems' => 'Aucun poste budgetaire',
            'emptyGroupSplitDetails' => 'Aucun detail de partage',
            'emptySettlementInstructions' => 'Aucun reglement requis',
            'emptyInstallments' => 'Aucun objectif echelonne',
            'emptyTransactions' => 'Aucune transaction',
            'groupExpenseSummaryTitle' => 'Resume des depenses de groupe',
            'groupSettlementSummaryTitle' => 'Resume des reglements de groupe',
            'groupSplitDetailsTitle' => 'Details du partage de groupe',
            'installmentsTitle' => 'Details des echeances',
            'noParticipant' => 'Non specifie',
            'remainingLabel' => 'Restant',
            'settlementInstructionsTitle' => 'Instructions de reglement',
            'total' => 'Total',
            'transactionBreakdownTitle' => 'Details des transactions',
            'columnLabels' => [
                'amount' => 'Montant',
                'balance' => 'Solde',
                'budget' => 'Budget',
                'category' => 'Categorie',
                'estimated_actuals' => 'Reel estime',
                'from' => 'De',
                'metric' => 'Element',
                'paid' => 'Paye',
                'paid_by' => 'Paye par',
                'participant' => 'Participant',
                'participants' => 'Participants',
                'period' => 'Periode',
                'period_amount' => 'Montant',
                'progress' => 'Progression',
                'remark' => 'Remarque',
                'sequence' => 'No.',
                'share' => 'Part',
                'split_type' => 'Mode de partage',
                'target_amount' => 'Objectif',
                'to' => 'A',
                'transaction_details' => 'Details de transaction',
                'unit_price' => 'Prix unitaire',
                'quantity' => 'Quantite',
                'variance' => 'Ecart',
            ],
            'metrics' => ['personalExpense' => 'Depense personnelle', 'sharedExpense' => 'Depense partagee'],
            'periodUnits' => ['day' => 'jour', 'month' => 'mois', 'week' => 'semaine', 'year' => 'an'],
            'splitTypes' => [
                'custom_amount' => 'Montant personnalise',
                'custom_share' => 'Part personnalisee',
                'equal' => 'Partage egal',
                'excluded' => 'Exclu du reglement',
                'individual' => 'Paiement individuel',
                'per_person' => 'Meme montant par personne',
                'personal' => 'Personnel',
            ],
        ],
        'ru' => [
            'budgetHighlightsTitle' => 'Сводка бюджета',
            'datePrefix' => 'Дата: ',
            'emptyBudgetItems' => 'Нет статей бюджета',
            'emptyGroupSplitDetails' => 'Нет деталей распределения',
            'emptySettlementInstructions' => 'Расчет не требуется',
            'emptyInstallments' => 'Нет целей по рассрочке',
            'emptyTransactions' => 'Нет операций',
            'groupExpenseSummaryTitle' => 'Сводка групповых расходов',
            'groupSettlementSummaryTitle' => 'Сводка групповых расчетов',
            'groupSplitDetailsTitle' => 'Детали группового распределения',
            'installmentsTitle' => 'Детали рассрочки',
            'noParticipant' => 'Не указано',
            'remainingLabel' => 'Остаток',
            'settlementInstructionsTitle' => 'Инструкции по расчету',
            'total' => 'Итого',
            'transactionBreakdownTitle' => 'Детали операций',
            'columnLabels' => [
                'amount' => 'Сумма',
                'balance' => 'Баланс',
                'budget' => 'Бюджет',
                'category' => 'Категория',
                'estimated_actuals' => 'Оценка факта',
                'from' => 'От',
                'metric' => 'Показатель',
                'paid' => 'Оплачено',
                'paid_by' => 'Плательщик',
                'participant' => 'Участник',
                'participants' => 'Участники',
                'period' => 'Период',
                'period_amount' => 'Сумма',
                'progress' => 'Прогресс',
                'remark' => 'Примечание',
                'sequence' => 'No.',
                'share' => 'Доля',
                'split_type' => 'Тип распределения',
                'target_amount' => 'Цель',
                'to' => 'Кому',
                'transaction_details' => 'Детали операции',
                'unit_price' => 'Цена',
                'quantity' => 'Кол-во',
                'variance' => 'Отклонение',
            ],
            'metrics' => ['personalExpense' => 'Личные расходы', 'sharedExpense' => 'Общие расходы'],
            'periodUnits' => ['day' => 'день', 'month' => 'месяц', 'week' => 'неделя', 'year' => 'год'],
            'splitTypes' => [
                'custom_amount' => 'Произвольная сумма',
                'custom_share' => 'Произвольная доля',
                'equal' => 'Поровну',
                'excluded' => 'Исключено из расчета',
                'individual' => 'Индивидуальная оплата',
                'per_person' => 'Одинаково на человека',
                'personal' => 'Личное',
            ],
        ],
        'de' => [
            'budgetHighlightsTitle' => 'Budgetuebersicht',
            'datePrefix' => 'Datum: ',
            'emptyBudgetItems' => 'Keine Budgetpositionen',
            'emptyGroupSplitDetails' => 'Keine Aufteilungsdetails',
            'emptySettlementInstructions' => 'Keine Abrechnung erforderlich',
            'emptyInstallments' => 'Keine Ratenziele',
            'emptyTransactions' => 'Keine Transaktionen',
            'groupExpenseSummaryTitle' => 'Gruppenausgaben Uebersicht',
            'groupSettlementSummaryTitle' => 'Gruppenabrechnung Uebersicht',
            'groupSplitDetailsTitle' => 'Gruppenaufteilung Details',
            'installmentsTitle' => 'Ratendetails',
            'noParticipant' => 'Nicht angegeben',
            'remainingLabel' => 'Verbleibend',
            'settlementInstructionsTitle' => 'Abrechnungsanweisungen',
            'total' => 'Summe',
            'transactionBreakdownTitle' => 'Transaktionsdetails',
            'columnLabels' => [
                'amount' => 'Betrag',
                'balance' => 'Saldo',
                'budget' => 'Budget',
                'category' => 'Kategorie',
                'estimated_actuals' => 'Geschaetzter Istwert',
                'from' => 'Von',
                'metric' => 'Position',
                'paid' => 'Bezahlt',
                'paid_by' => 'Bezahlt von',
                'participant' => 'Teilnehmer',
                'participants' => 'Teilnehmer',
                'period' => 'Zeitraum',
                'period_amount' => 'Betrag',
                'progress' => 'Fortschritt',
                'remark' => 'Bemerkung',
                'sequence' => 'Nr.',
                'share' => 'Anteil',
                'split_type' => 'Aufteilung',
                'target_amount' => 'Ziel',
                'to' => 'An',
                'transaction_details' => 'Transaktionsdetails',
                'unit_price' => 'Einzelpreis',
                'quantity' => 'Menge',
                'variance' => 'Abweichung',
            ],
            'metrics' => ['personalExpense' => 'Persoenliche Ausgaben', 'sharedExpense' => 'Gemeinsame Ausgaben'],
            'periodUnits' => ['day' => 'Tag', 'month' => 'Monat', 'week' => 'Woche', 'year' => 'Jahr'],
            'splitTypes' => [
                'custom_amount' => 'Benutzerdefinierter Betrag',
                'custom_share' => 'Benutzerdefinierter Anteil',
                'equal' => 'Gleich aufgeteilt',
                'excluded' => 'Von Abrechnung ausgeschlossen',
                'individual' => 'Individuelle Zahlung',
                'per_person' => 'Gleicher Betrag pro Person',
                'personal' => 'Persoenlich',
            ],
        ],
    ];

    private const BOOKKEEPING = [
        'en' => [
            'bookkeepingLedgerSubtitle' => 'Bookkeeping Ledger',
            'bookkeepingRecordsTitle' => 'Bookkeeping Records',
            'emptyBookkeepingRecords' => 'No bookkeeping records',
            'bookkeepingExpenseTotal' => 'Expense total',
            'bookkeepingIncomeTotal' => 'Income total',
            'datePrefix' => 'Date: ',
            'columns' => [
                'type' => 'Type',
                'date' => 'Date',
                'order' => 'Order No.',
                'details' => 'Details',
                'category' => 'Category',
                'accounts' => 'Funds / Accounts',
                'amount' => 'Amount',
                'destination' => 'Destination',
                'remark' => 'Remark',
            ],
            'transactionTypes' => [
                'cross_border_remittance' => 'Cross-border remittance',
                'expense' => 'Order / expense',
                'fx_exchange' => 'Currency exchange',
                'income' => 'Income',
                'sof' => 'Source of funds',
                'transfer' => 'Transfer',
            ],
        ],
        'sc' => [
            'bookkeepingLedgerSubtitle' => '记账流水',
            'bookkeepingRecordsTitle' => '记账记录',
            'emptyBookkeepingRecords' => '暂无记账记录',
            'bookkeepingExpenseTotal' => '支出总计',
            'bookkeepingIncomeTotal' => '收入总计',
            'datePrefix' => '日期：',
            'columns' => [
                'type' => '交易类型',
                'date' => '日期',
                'order' => '订单号',
                'details' => '交易详情',
                'category' => '分类',
                'accounts' => '资金/账户',
                'amount' => '金额',
                'destination' => '目的金额',
                'remark' => '备注',
            ],
            'transactionTypes' => [
                'cross_border_remittance' => '跨境汇款',
                'expense' => '订单 / 支出',
                'fx_exchange' => '货币兑换',
                'income' => '收入',
                'sof' => '资金来源',
                'transfer' => '资金划转',
            ],
        ],
        'tc' => [
            'bookkeepingLedgerSubtitle' => '記帳流水',
            'bookkeepingRecordsTitle' => '記帳記錄',
            'emptyBookkeepingRecords' => '暫無記帳記錄',
            'bookkeepingExpenseTotal' => '支出總計',
            'bookkeepingIncomeTotal' => '收入總計',
            'datePrefix' => '日期：',
            'columns' => [
                'type' => '交易類型',
                'date' => '日期',
                'order' => '訂單號',
                'details' => '交易詳情',
                'category' => '分類',
                'accounts' => '資金/帳戶',
                'amount' => '金額',
                'destination' => '目的金額',
                'remark' => '備註',
            ],
            'transactionTypes' => [
                'cross_border_remittance' => '跨境匯款',
                'expense' => '訂單 / 支出',
                'fx_exchange' => '貨幣兌換',
                'income' => '收入',
                'sof' => '資金來源',
                'transfer' => '資金劃轉',
            ],
        ],
    ];

    private const BOOKKEEPING_EXTRA = [
        'ja' => [
            'bookkeepingLedgerSubtitle' => '記帳台帳',
            'bookkeepingRecordsTitle' => '記帳記録',
            'emptyBookkeepingRecords' => '記帳記録はありません',
            'bookkeepingExpenseTotal' => '支出合計',
            'bookkeepingIncomeTotal' => '収入合計',
            'datePrefix' => '日付: ',
            'columns' => ['type' => '種類', 'date' => '日付', 'order' => '注文番号', 'details' => '詳細', 'category' => 'カテゴリ', 'accounts' => '資金/口座', 'amount' => '金額', 'destination' => '送金先', 'remark' => '備考'],
            'transactionTypes' => ['cross_border_remittance' => '海外送金', 'expense' => '注文 / 支出', 'fx_exchange' => '通貨交換', 'income' => '収入', 'sof' => '資金源', 'transfer' => '資金移動'],
        ],
        'fr' => [
            'bookkeepingLedgerSubtitle' => 'Grand livre',
            'bookkeepingRecordsTitle' => 'Ecritures',
            'emptyBookkeepingRecords' => 'Aucune ecriture',
            'bookkeepingExpenseTotal' => 'Total depenses',
            'bookkeepingIncomeTotal' => 'Total revenus',
            'datePrefix' => 'Date : ',
            'columns' => ['type' => 'Type', 'date' => 'Date', 'order' => 'No commande', 'details' => 'Details', 'category' => 'Categorie', 'accounts' => 'Fonds / comptes', 'amount' => 'Montant', 'destination' => 'Destination', 'remark' => 'Remarque'],
            'transactionTypes' => ['cross_border_remittance' => 'Virement transfrontalier', 'expense' => 'Commande / depense', 'fx_exchange' => 'Change', 'income' => 'Revenu', 'sof' => 'Source des fonds', 'transfer' => 'Transfert'],
        ],
        'ru' => [
            'bookkeepingLedgerSubtitle' => 'Журнал учета',
            'bookkeepingRecordsTitle' => 'Записи учета',
            'emptyBookkeepingRecords' => 'Нет записей учета',
            'bookkeepingExpenseTotal' => 'Итого расходы',
            'bookkeepingIncomeTotal' => 'Итого доходы',
            'datePrefix' => 'Дата: ',
            'columns' => ['type' => 'Тип', 'date' => 'Дата', 'order' => 'No. заказа', 'details' => 'Детали', 'category' => 'Категория', 'accounts' => 'Средства / счета', 'amount' => 'Сумма', 'destination' => 'Назначение', 'remark' => 'Примечание'],
            'transactionTypes' => ['cross_border_remittance' => 'Трансграничный перевод', 'expense' => 'Заказ / расход', 'fx_exchange' => 'Обмен валюты', 'income' => 'Доход', 'sof' => 'Источник средств', 'transfer' => 'Перевод'],
        ],
        'de' => [
            'bookkeepingLedgerSubtitle' => 'Buchhaltungsjournal',
            'bookkeepingRecordsTitle' => 'Buchungen',
            'emptyBookkeepingRecords' => 'Keine Buchungen',
            'bookkeepingExpenseTotal' => 'Ausgaben gesamt',
            'bookkeepingIncomeTotal' => 'Einnahmen gesamt',
            'datePrefix' => 'Datum: ',
            'columns' => ['type' => 'Typ', 'date' => 'Datum', 'order' => 'Bestellnr.', 'details' => 'Details', 'category' => 'Kategorie', 'accounts' => 'Mittel / Konten', 'amount' => 'Betrag', 'destination' => 'Ziel', 'remark' => 'Bemerkung'],
            'transactionTypes' => ['cross_border_remittance' => 'Grenzueberschreitende Ueberweisung', 'expense' => 'Bestellung / Ausgabe', 'fx_exchange' => 'Waehrungswechsel', 'income' => 'Einnahme', 'sof' => 'Mittelherkunft', 'transfer' => 'Transfer'],
        ],
    ];

    public static function budget(string $language): array
    {
        return self::BUDGET[$language] ?? self::BUDGET['en'];
    }

    public static function budgetComposite(array $languages): array
    {
        return self::composite($languages, [self::class, 'budget']);
    }

    public static function bookkeeping(string $language): array
    {
        return self::BOOKKEEPING[$language] ?? self::BOOKKEEPING_EXTRA[$language] ?? self::BOOKKEEPING['en'];
    }

    public static function bookkeepingComposite(array $languages): array
    {
        return self::composite($languages, [self::class, 'bookkeeping']);
    }

    private static function composite(array $languages, callable $provider): array
    {
        $languages = PdfLanguages::normalizeList($languages);
        $base = $provider($languages[0] ?? 'en');
        foreach ($base as $key => $value) {
            if (is_array($value)) {
                $base[$key] = self::compositeNested($languages, $provider, [$key]);
                continue;
            }

            if ($key === 'datePrefix') {
                $base[$key] = self::datePrefixComposite(array_map(
                    static fn (string $language): string => (string) (($provider($language))[$key] ?? $value),
                    $languages,
                ));
                continue;
            }

            $base[$key] = self::joinUnique(array_map(
                static fn (string $language): string => (string) (($provider($language))[$key] ?? $value),
                $languages,
            ));
        }

        return $base;
    }

    private static function compositeNested(array $languages, callable $provider, array $path): array
    {
        $first = self::nestedValue($provider($languages[0] ?? 'en'), $path);
        if (!is_array($first)) {
            return [];
        }

        $result = [];
        foreach ($first as $key => $value) {
            $nextPath = [...$path, $key];
            if (is_array($value)) {
                $result[$key] = self::compositeNested($languages, $provider, $nextPath);
                continue;
            }

            $result[$key] = self::joinUnique(array_map(
                static fn (string $language): string => (string) (self::nestedValue($provider($language), $nextPath) ?? $value),
                $languages,
            ));
        }

        return $result;
    }

    private static function nestedValue(array $values, array $path): mixed
    {
        foreach ($path as $key) {
            if (!is_array($values) || !array_key_exists($key, $values)) {
                return null;
            }

            $values = $values[$key];
        }

        return $values;
    }

    private static function joinUnique(array $values): string
    {
        return implode("\n", array_values(array_unique(array_filter(
            array_map(static fn (string $value): string => trim($value), $values),
            static fn (string $value): bool => $value !== '',
        ))));
    }

    private static function datePrefixComposite(array $values): string
    {
        $labels = array_values(array_unique(array_filter(
            array_map(
                static fn (string $value): string => trim(rtrim($value, ":\xEF\xBC\x9A ")),
                $values,
            ),
            static fn (string $value): bool => $value !== '',
        )));

        return $labels === [] ? 'Date: ' : implode(' / ', $labels) . ': ';
    }
}
