<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

final readonly class BudgetPdfDocumentRenderer
{
    private const TABLE_TEXT = [
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
                'variance' => '差额',
            ],
            'metrics' => [
                'personalExpense' => '个人费用',
                'sharedExpense' => '共同费用',
            ],
            'periodUnits' => [
                'day' => '日',
                'month' => '月',
                'week' => '周',
                'year' => '年',
            ],
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
                'variance' => '差額',
            ],
            'metrics' => [
                'personalExpense' => '個人費用',
                'sharedExpense' => '共同費用',
            ],
            'periodUnits' => [
                'day' => '日',
                'month' => '月',
                'week' => '週',
                'year' => '年',
            ],
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
    ];

    public function __construct(
        private BudgetPdfFormatter $formatter = new BudgetPdfFormatter(),
        private BudgetPdfTableRenderer $tableRenderer = new BudgetPdfTableRenderer(),
        private BudgetPdfSignatureRenderer $signatureRenderer = new BudgetPdfSignatureRenderer(),
    ) {
    }

    public function render(array $budget, array $template, array $options = []): string
    {
        $tableContext = $this->tableContext($options);
        $title = trim((string) $budget['title']);
        $subtitle = trim((string) $budget['ownerName']);
        $titleHtml = $title === ''
            ? ''
            : $this->multilineBlockHtml($title, 'title-line');
        $subtitleHtml = $subtitle === ''
            ? ''
            : '<div class="subtitle">' . $this->multilineBlockHtml($subtitle, 'subtitle-line') . '</div>';
        $periodText = $this->formatter->periodText($budget);
        $sections = $this->sectionsByKey($template);
        $budgetSection = $this->localizedTemplateSection(
            $sections['budget_highlights'] ?? $this->defaultBudgetSection(),
            $tableContext,
        );
        $transactionSection = $this->localizedTemplateSection(
            $sections['transaction_breakdown'] ?? $this->defaultTransactionSection(),
            $tableContext,
        );
        $installmentSection = $this->localizedTemplateSection(
            $sections['installments'] ?? $this->defaultInstallmentSection(),
            $tableContext,
        );
        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];

        return '<!doctype html><html lang="' . $this->documentLanguage($tableContext) . '"><head><meta charset="utf-8">'
            . '<style>'
            . $this->baseCss()
            . $this->tableRenderer->css()
            . $this->signatureRenderer->css()
            . '</style></head><body>'
            . '<htmlpagefooter name="budgetPageFooter"><div class="page-footer">Page {PAGENO} of {nbpg}</div></htmlpagefooter>'
            . '<div class="title">' . $titleHtml . '</div>'
            . $subtitleHtml
            . $this->tableRenderer->render(
                $budgetSection,
                $periodText,
                $this->budgetRows($budget, $transactions, $tableContext),
                $this->summaryRow($budget, $tableContext),
                $this->tableText('No budget items', $tableContext['labels']['emptyBudgetItems'], $tableContext),
                $this->datePrefix($tableContext),
            )
            . $this->groupBudgetSectionsHtml($budget, $periodText, $tableContext)
            . $this->tableRenderer->render(
                $transactionSection,
                $periodText,
                $this->transactionRows($transactions, (string) $budget['baseCurrency']),
                null,
                $this->tableText('No transactions', $tableContext['labels']['emptyTransactions'], $tableContext),
                $this->datePrefix($tableContext),
            )
            . (
                ($budget['budgetType'] ?? 'regular') === 'installment'
                    ? $this->tableRenderer->render(
                        $this->installmentPeriodSection($installmentSection, $budget, $tableContext),
                        $periodText,
                        $this->installmentRows($budget, $tableContext),
                        $this->installmentSummaryRow($budget, $tableContext),
                        $this->tableText('No installment targets', $tableContext['labels']['emptyInstallments'], $tableContext),
                        $this->datePrefix($tableContext),
                    )
                    : ''
            )
            . $this->signatureRenderer->render($budget)
            . '</body></html>';
    }

    private function baseCss(): string
    {
        return '@page{margin:29mm 29mm 22mm;footer:html_budgetPageFooter;}'
            . 'body{font-family:"SF-Mono",TCSongti,monospace;color:#000;font-size:7.5pt;}'
            . '.title{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 4mm;}'
            . '.title-line{display:block;line-height:1.25;}'
            . '.title sup{font-size:7pt;line-height:0;vertical-align:super;}'
            . '.subtitle{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 7mm;}'
            . '.subtitle-line{display:block;line-height:1.25;}'
            . '.page-footer{font-family:"SF-Mono",TCSongti,monospace;font-size:7pt;color:#666;text-align:center;}';
    }

    private function tableContext(array $options): array
    {
        $mode = $options['tableLanguageMode'] ?? 'en';
        $chineseLanguage = $options['tableChineseLanguage'] ?? 'tc';
        $mode = in_array($mode, ['en', 'zh', 'bilingual'], true) ? (string) $mode : 'en';
        $chineseLanguage = in_array($chineseLanguage, ['sc', 'tc'], true)
            ? (string) $chineseLanguage
            : 'tc';

        return [
            'mode' => $mode,
            'chineseLanguage' => $chineseLanguage,
            'labels' => self::TABLE_TEXT[$chineseLanguage],
        ];
    }

    private function localizedTemplateSection(array $section, array $context): array
    {
        if ($context['mode'] === 'en') {
            return $section;
        }

        $title = match ((string) ($section['key'] ?? '')) {
            'budget_highlights' => $context['labels']['budgetHighlightsTitle'],
            'group_expense_summary' => $context['labels']['groupExpenseSummaryTitle'],
            'group_settlement_summary' => $context['labels']['groupSettlementSummaryTitle'],
            'group_split_details' => $context['labels']['groupSplitDetailsTitle'],
            'settlement_instructions' => $context['labels']['settlementInstructionsTitle'],
            'transaction_breakdown' => $context['labels']['transactionBreakdownTitle'],
            'installments' => $context['labels']['installmentsTitle'],
            default => (string) ($section['title'] ?? ''),
        };

        return [
            ...$section,
            'title' => $context['mode'] === 'bilingual'
                ? (string) ($section['title'] ?? '') . ' ' . $title
                : $title,
            'columns' => array_map(
                fn (array $column): array => $this->localizedTemplateColumn($column, $context),
                is_array($section['columns'] ?? null) ? $section['columns'] : [],
            ),
        ];
    }

    private function localizedTemplateColumn(array $column, array $context): array
    {
        if ($context['mode'] === 'en') {
            return $column;
        }

        $localizedLabel = $context['labels']['columnLabels'][(string) ($column['key'] ?? '')]
            ?? (string) ($column['label'] ?? '');

        return [
            ...$column,
            'label' => $context['mode'] === 'bilingual'
                ? (string) ($column['label'] ?? '') . "\n" . $localizedLabel
                : $localizedLabel,
        ];
    }

    private function tableText(string $english, string $chinese, array $context): string
    {
        if ($context['mode'] === 'bilingual') {
            return $english . ' ' . $chinese;
        }

        return $context['mode'] === 'zh' ? $chinese : $english;
    }

    private function datePrefix(array $context): string
    {
        if ($context['mode'] === 'bilingual') {
            return 'Date: ' . $context['labels']['datePrefix'];
        }

        return $context['mode'] === 'zh' ? $context['labels']['datePrefix'] : 'Date: ';
    }

    private function documentLanguage(array $context): string
    {
        if ($context['mode'] === 'en') {
            return 'en';
        }

        return $context['chineseLanguage'] === 'sc' ? 'zh-Hans' : 'zh-Hant';
    }

    private function multilineBlockHtml(string $value, string $lineClass): string
    {
        $lines = preg_split('/\R/u', $value);
        if ($lines === false) {
            return $this->formatter->escapeHtml($value);
        }

        return implode('', array_map(
            fn (string $line): string => '<div class="' . $lineClass . '">' . $this->formatter->escapeHtml($line) . '</div>',
            array_values(array_filter(
                array_map(static fn (string $line): string => trim($line), $lines),
                static fn (string $line): bool => $line !== '',
            )),
        ));
    }

    private function budgetRows(array $budget, array $transactions, array $context): array
    {
        return array_map(
            function (array $item) use ($budget, $transactions, $context): array {
                $effective = $this->effectiveItemAmounts($item, $transactions);

                return [
                    $this->itemLabelWithInstallment($item, $context),
                    $this->moneyWithSecondary((string) $budget['baseCurrency'], $effective['budgetBase'], $item['budget'] ?? []),
                    $this->moneyWithTransactionBreakdown((string) $budget['baseCurrency'], $effective['estimatedBase'], $effective['estimatedTransactionTotals']),
                    $this->formatter->templateMoney((string) $budget['baseCurrency'], $effective['varianceBase']),
                ];
            },
            is_array($budget['items'] ?? null) ? $budget['items'] : [],
        );
    }

    private function groupBudgetSectionsHtml(array $budget, string $periodText, array $context): string
    {
        if (($budget['participantMode'] ?? 'solo') !== 'group') {
            return '';
        }

        $participants = $this->budgetParticipants($budget);
        if ($participants === []) {
            return '';
        }

        $summary = $this->groupBudgetSummary($budget, $participants);
        $baseCurrency = (string) $budget['baseCurrency'];

        return $this->tableRenderer->render(
            $this->groupSplitDetailsSection($context),
            $periodText,
            $this->groupSplitDetailRows($budget, $participants, $baseCurrency, $context),
            null,
            $this->tableText(
                'No split details',
                $context['labels']['emptyGroupSplitDetails'],
                $context,
            ),
            $this->datePrefix($context),
        )
            . $this->tableRenderer->render(
                $this->groupExpenseSummarySection($context),
                $periodText,
                [
                    [
                        $this->tableText(
                            'Shared expense',
                            $context['labels']['metrics']['sharedExpense'],
                            $context,
                        ),
                        $this->formatter->templateMoney($baseCurrency, $summary['sharedExpenseBase']),
                    ],
                    [
                        $this->tableText(
                            'Personal expense',
                            $context['labels']['metrics']['personalExpense'],
                            $context,
                        ),
                        $this->formatter->templateMoney($baseCurrency, $summary['personalExpenseBase']),
                    ],
                ],
                [
                    $this->tableText('Total', $context['labels']['total'], $context),
                    $this->formatter->templateMoney(
                        $baseCurrency,
                        $summary['sharedExpenseBase'] + $summary['personalExpenseBase'],
                        true,
                    ),
                ],
                '',
                $this->datePrefix($context),
            )
            . $this->tableRenderer->render(
                $this->groupSettlementSummarySection($context),
                $periodText,
                array_map(
                    fn (array $participantSummary): array => [
                        $participantSummary['participant']['name'],
                        $this->formatter->templateMoney($baseCurrency, $participantSummary['paidBase']),
                        $this->formatter->templateMoney($baseCurrency, $participantSummary['shareBase']),
                        $this->formatter->templateMoney($baseCurrency, $participantSummary['balanceBase']),
                    ],
                    $summary['participantSummaries'],
                ),
                [
                    $this->tableText('Total', $context['labels']['total'], $context),
                    $this->formatter->templateMoney($baseCurrency, $summary['paidTotalBase'], true),
                    $this->formatter->templateMoney($baseCurrency, $summary['shareTotalBase'], true),
                    $this->formatter->templateMoney($baseCurrency, 0.0, true),
                ],
                '',
                $this->datePrefix($context),
            )
            . $this->tableRenderer->render(
                $this->settlementInstructionsSection($context),
                $periodText,
                array_map(
                    fn (array $settlement): array => [
                        $this->participantName($settlement['fromParticipantId'], $participants, $context),
                        $this->participantName($settlement['toParticipantId'], $participants, $context),
                        $this->formatter->templateMoney($baseCurrency, $settlement['amountBase']),
                    ],
                    $summary['settlements'],
                ),
                null,
                $this->tableText(
                    'No settlement needed',
                    $context['labels']['emptySettlementInstructions'],
                    $context,
                ),
                $this->datePrefix($context),
            );
    }

    private function groupSplitDetailRows(
        array $budget,
        array $participants,
        string $baseCurrency,
        array $context,
    ): array {
        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];
        $rows = [];

        foreach (is_array($budget['items'] ?? null) ? $budget['items'] : [] as $item) {
            if (!is_array($item)) {
                continue;
            }

            $effective = $this->effectiveItemAmounts($item, $transactions);
            $split = $this->itemSplit($item, $participants);
            $amountBase = (float) $effective['budgetBase'];
            if ($split['splitType'] === 'per_person') {
                $split['perPersonAmountBase'] = $this->perPersonItemBudgetBase(
                    $item,
                    $transactions,
                    $this->includedParticipantCount($split['participants']),
                );
            }
            if ($split['splitType'] === 'individual') {
                $includedParticipants = array_values(array_filter(
                    $split['participants'],
                    static fn (array $participant): bool => ($participant['isIncluded'] ?? true) === true,
                ));
                $individualShares = $this->sharesForSplit($split, $includedParticipants, $amountBase);
                $split['participants'] = array_map(
                    static function (array $participant) use ($individualShares): array {
                        $participantId = (int) $participant['participantId'];
                        if (($participant['shareAmountBase'] ?? null) === null && isset($individualShares[$participantId])) {
                            $participant['shareAmountBase'] = $individualShares[$participantId];
                        }

                        return $participant;
                    },
                    $split['participants'],
                );
            }
            $rows[] = [
                (string) ($item['category'] ?? $item['label'] ?? ''),
                $this->participantName($split['paidByParticipantId'], $participants, $context),
                $this->splitTypeText($split['splitType'], $context),
                $this->splitParticipantText($split, $participants, $baseCurrency, $context),
                $this->formatter->templateMoney($baseCurrency, $effective['budgetBase']),
                (string) ($split['note'] ?? ''),
            ];
        }

        return $rows;
    }

    private function groupSplitDetailsSection(array $context): array
    {
        return $this->localizedTemplateSection([
            'key' => 'group_split_details',
            'title' => 'Group Split Details',
            'columns' => [
                ['key' => 'category', 'label' => 'Category', 'align' => 'left', 'widthPercent' => 24, 'dataType' => 'text'],
                ['key' => 'paid_by', 'label' => 'Paid By', 'align' => 'left', 'widthPercent' => 14, 'dataType' => 'text'],
                ['key' => 'split_type', 'label' => 'Split Type', 'align' => 'left', 'widthPercent' => 16, 'dataType' => 'text'],
                ['key' => 'participants', 'label' => 'Participants', 'align' => 'left', 'widthPercent' => 22, 'dataType' => 'text'],
                ['key' => 'amount', 'label' => 'Amount', 'align' => 'right', 'widthPercent' => 14, 'dataType' => 'money'],
                ['key' => 'remark', 'label' => 'Remark', 'align' => 'left', 'widthPercent' => 10, 'dataType' => 'text'],
            ],
        ], $context);
    }

    private function groupExpenseSummarySection(array $context): array
    {
        return $this->localizedTemplateSection([
            'key' => 'group_expense_summary',
            'title' => 'Group Expense Summary',
            'columns' => [
                ['key' => 'metric', 'label' => 'Metric', 'align' => 'left', 'widthPercent' => 70, 'dataType' => 'text'],
                ['key' => 'amount', 'label' => 'Amount', 'align' => 'right', 'widthPercent' => 30, 'dataType' => 'money'],
            ],
        ], $context);
    }

    private function groupSettlementSummarySection(array $context): array
    {
        return $this->localizedTemplateSection([
            'key' => 'group_settlement_summary',
            'title' => 'Group Settlement Summary',
            'columns' => [
                ['key' => 'participant', 'label' => 'Participant', 'align' => 'left', 'widthPercent' => 34, 'dataType' => 'text'],
                ['key' => 'paid', 'label' => 'Paid', 'align' => 'right', 'widthPercent' => 22, 'dataType' => 'money'],
                ['key' => 'share', 'label' => 'Share', 'align' => 'right', 'widthPercent' => 22, 'dataType' => 'money'],
                ['key' => 'balance', 'label' => 'Balance', 'align' => 'right', 'widthPercent' => 22, 'dataType' => 'money'],
            ],
        ], $context);
    }

    private function settlementInstructionsSection(array $context): array
    {
        return $this->localizedTemplateSection([
            'key' => 'settlement_instructions',
            'title' => 'Settlement Instructions',
            'columns' => [
                ['key' => 'from', 'label' => 'From', 'align' => 'left', 'widthPercent' => 38, 'dataType' => 'text'],
                ['key' => 'to', 'label' => 'To', 'align' => 'left', 'widthPercent' => 38, 'dataType' => 'text'],
                ['key' => 'amount', 'label' => 'Amount', 'align' => 'right', 'widthPercent' => 24, 'dataType' => 'money'],
            ],
        ], $context);
    }

    private function groupBudgetSummary(array $budget, array $participants): array
    {
        $totals = [];
        foreach ($participants as $participant) {
            $totals[(int) $participant['id']] = [
                'paidBase' => 0.0,
                'shareBase' => 0.0,
            ];
        }

        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];
        $sharedExpenseBase = 0.0;
        $personalExpenseBase = 0.0;

        foreach (is_array($budget['items'] ?? null) ? $budget['items'] : [] as $item) {
            if (!is_array($item)) {
                continue;
            }

            $amountBase = $this->effectiveItemAmounts($item, $transactions)['budgetBase'];
            $split = $this->itemSplit($item, $participants);
            $includedParticipants = array_values(array_filter(
                $split['participants'],
                fn (array $participant): bool => ($participant['isIncluded'] ?? true) === true
                    && isset($totals[(int) $participant['participantId']]),
            ));

            if ($split['splitType'] === 'excluded' || $includedParticipants === []) {
                continue;
            }

            if ($split['splitType'] === 'individual') {
                $individualTotalBase = 0.0;
                foreach ($this->sharesForSplit($split, $includedParticipants, $amountBase) as $participantId => $shareAmount) {
                    if (isset($totals[$participantId])) {
                        $totals[$participantId]['paidBase'] = $this->roundMoney(
                            $totals[$participantId]['paidBase'] + $shareAmount,
                        );
                        $totals[$participantId]['shareBase'] = $this->roundMoney(
                            $totals[$participantId]['shareBase'] + $shareAmount,
                        );
                        $individualTotalBase = $this->roundMoney($individualTotalBase + $shareAmount);
                    }
                }
                $personalExpenseBase = $this->roundMoney($personalExpenseBase + $individualTotalBase);

                continue;
            }

            if ($split['splitType'] === 'per_person') {
                $perPersonAmountBase = $this->perPersonItemBudgetBase(
                    $item,
                    $transactions,
                    count($includedParticipants),
                );
                $perPersonTotalBase = 0.0;
                foreach ($includedParticipants as $participant) {
                    $participantId = (int) $participant['participantId'];
                    if (isset($totals[$participantId])) {
                        $totals[$participantId]['paidBase'] = $this->roundMoney(
                            $totals[$participantId]['paidBase'] + $perPersonAmountBase,
                        );
                        $totals[$participantId]['shareBase'] = $this->roundMoney(
                            $totals[$participantId]['shareBase'] + $perPersonAmountBase,
                        );
                        $perPersonTotalBase = $this->roundMoney($perPersonTotalBase + $perPersonAmountBase);
                    }
                }
                $personalExpenseBase = $this->roundMoney($personalExpenseBase + $perPersonTotalBase);

                continue;
            }

            $paidByParticipantId = $split['paidByParticipantId'];
            if (is_int($paidByParticipantId) && isset($totals[$paidByParticipantId])) {
                $totals[$paidByParticipantId]['paidBase'] = $this->roundMoney(
                    $totals[$paidByParticipantId]['paidBase'] + $amountBase,
                );
            }

            foreach ($this->sharesForSplit($split, $includedParticipants, $amountBase) as $participantId => $shareAmount) {
                if (isset($totals[$participantId])) {
                    $totals[$participantId]['shareBase'] = $this->roundMoney(
                        $totals[$participantId]['shareBase'] + $shareAmount,
                    );
                }
            }

            if ($split['splitType'] === 'personal') {
                $personalExpenseBase = $this->roundMoney($personalExpenseBase + $amountBase);
            } else {
                $sharedExpenseBase = $this->roundMoney($sharedExpenseBase + $amountBase);
            }
        }

        $participantSummaries = array_map(
            function (array $participant) use ($totals): array {
                $participantId = (int) $participant['id'];
                $total = $totals[$participantId] ?? ['paidBase' => 0.0, 'shareBase' => 0.0];

                return [
                    'participant' => $participant,
                    'paidBase' => $this->roundMoney($total['paidBase']),
                    'shareBase' => $this->roundMoney($total['shareBase']),
                    'balanceBase' => $this->roundMoney($total['paidBase'] - $total['shareBase']),
                ];
            },
            $participants,
        );

        return [
            'paidTotalBase' => $this->roundMoney(array_reduce(
                $participantSummaries,
                static fn (float $total, array $summary): float => $total + $summary['paidBase'],
                0.0,
            )),
            'participantSummaries' => $participantSummaries,
            'personalExpenseBase' => $personalExpenseBase,
            'settlements' => $this->settlementsFromSummaries($participantSummaries),
            'sharedExpenseBase' => $sharedExpenseBase,
            'shareTotalBase' => $this->roundMoney(array_reduce(
                $participantSummaries,
                static fn (float $total, array $summary): float => $total + $summary['shareBase'],
                0.0,
            )),
        ];
    }

    private function budgetParticipants(array $budget): array
    {
        $participants = is_array($budget['participants'] ?? null) ? $budget['participants'] : [];

        return array_values(array_filter(
            array_map(
                static function (array $participant): ?array {
                    if (!is_numeric($participant['id'] ?? null)) {
                        return null;
                    }

                    $name = trim((string) ($participant['name'] ?? ''));
                    if ($name === '') {
                        return null;
                    }

                    return [
                        'id' => (int) $participant['id'],
                        'name' => $name,
                    ];
                },
                array_filter($participants, 'is_array'),
            ),
        ));
    }

    private function itemSplit(array $item, array $participants): array
    {
        $rawSplit = is_array($item['split'] ?? null) ? $item['split'] : null;
        if ($rawSplit === null) {
            return $this->defaultEqualSplit($participants);
        }

        $splitType = $this->splitType($rawSplit['splitType'] ?? null);
        $paidByParticipantId = $this->participantIdOrNull($rawSplit['paidByParticipantId'] ?? null);
        $participantIds = array_fill_keys(array_map(
            static fn (array $participant): int => (int) $participant['id'],
            $participants,
        ), true);
        $splitParticipants = [];

        if (is_array($rawSplit['participants'] ?? null)) {
            foreach ($rawSplit['participants'] as $participant) {
                if (!is_array($participant)) {
                    continue;
                }

                $participantId = $this->participantIdOrNull($participant['participantId'] ?? null);
                if ($participantId === null || !isset($participantIds[$participantId])) {
                    continue;
                }

                $splitParticipants[$participantId] = [
                    'participantId' => $participantId,
                    'isIncluded' => ($participant['isIncluded'] ?? true) !== false,
                    'shareRatio' => is_numeric($participant['shareRatio'] ?? null)
                        ? (float) $participant['shareRatio']
                        : null,
                    'shareAmountBase' => is_numeric($participant['shareAmountBase'] ?? null)
                        ? (float) $participant['shareAmountBase']
                        : null,
                ];
            }
        }

        if ($splitType === 'personal' && $splitParticipants === [] && $paidByParticipantId !== null) {
            $splitParticipants[$paidByParticipantId] = [
                'participantId' => $paidByParticipantId,
                'isIncluded' => true,
                'shareRatio' => null,
                'shareAmountBase' => null,
            ];
        }
        if ($splitType !== 'excluded' && $splitParticipants === []) {
            return [
                ...$this->defaultEqualSplit($participants),
                'paidByParticipantId' => $paidByParticipantId,
                'splitType' => $splitType,
                'note' => is_string($rawSplit['note'] ?? null) ? trim((string) $rawSplit['note']) : '',
            ];
        }

        return [
            'paidByParticipantId' => $paidByParticipantId,
            'splitType' => $splitType,
            'note' => is_string($rawSplit['note'] ?? null) ? trim((string) $rawSplit['note']) : '',
            'participants' => array_values($splitParticipants),
        ];
    }

    private function defaultEqualSplit(array $participants): array
    {
        return [
            'paidByParticipantId' => isset($participants[0]['id']) ? (int) $participants[0]['id'] : null,
            'splitType' => 'equal',
            'note' => '',
            'participants' => array_map(
                static fn (array $participant): array => [
                    'participantId' => (int) $participant['id'],
                    'isIncluded' => true,
                    'shareRatio' => null,
                    'shareAmountBase' => null,
                ],
                $participants,
            ),
        ];
    }

    private function sharesForSplit(array $split, array $participants, float $amountBase): array
    {
        if ($split['splitType'] === 'custom_amount') {
            $shares = [];
            foreach ($participants as $participant) {
                $shares[(int) $participant['participantId']] = $this->roundMoney(
                    max(0.0, (float) ($participant['shareAmountBase'] ?? 0.0)),
                );
            }

            return $shares;
        }

        if ($split['splitType'] === 'individual') {
            $explicitTotal = 0.0;
            $flexibleCount = 0;
            foreach ($participants as $participant) {
                if (is_numeric($participant['shareAmountBase'] ?? null)) {
                    $explicitTotal = $this->roundMoney(
                        $explicitTotal + max(0.0, (float) $participant['shareAmountBase']),
                    );
                } else {
                    $flexibleCount++;
                }
            }
            $fallbackShare = $flexibleCount === 0
                ? 0.0
                : $this->roundMoney(max(0.0, $amountBase - $explicitTotal) / $flexibleCount);
            $shares = [];
            foreach ($participants as $participant) {
                $shares[(int) $participant['participantId']] = $this->roundMoney(
                    is_numeric($participant['shareAmountBase'] ?? null)
                        ? max(0.0, (float) $participant['shareAmountBase'])
                        : $fallbackShare,
                );
            }

            return $shares;
        }

        if ($split['splitType'] === 'custom_share') {
            $totalRatio = array_reduce(
                $participants,
                static fn (float $total, array $participant): float => $total + max(0.0, (float) ($participant['shareRatio'] ?? 0.0)),
                0.0,
            );
            if ($totalRatio > 0.0) {
                $shares = [];
                foreach ($participants as $participant) {
                    $shares[(int) $participant['participantId']] = $this->roundMoney(
                        $amountBase * max(0.0, (float) ($participant['shareRatio'] ?? 0.0)) / $totalRatio,
                    );
                }

                return $shares;
            }
        }

        $equalShare = $participants === [] ? 0.0 : $this->roundMoney($amountBase / count($participants));
        $shares = [];
        foreach ($participants as $participant) {
            $shares[(int) $participant['participantId']] = $equalShare;
        }

        return $shares;
    }

    private function settlementsFromSummaries(array $summaries): array
    {
        $debtors = array_values(array_map(
            static fn (array $summary): array => [
                'participantId' => (int) $summary['participant']['id'],
                'amount' => round(abs((float) $summary['balanceBase']), 2),
            ],
            array_filter($summaries, static fn (array $summary): bool => (float) $summary['balanceBase'] < -0.004),
        ));
        $creditors = array_values(array_map(
            static fn (array $summary): array => [
                'participantId' => (int) $summary['participant']['id'],
                'amount' => round((float) $summary['balanceBase'], 2),
            ],
            array_filter($summaries, static fn (array $summary): bool => (float) $summary['balanceBase'] > 0.004),
        ));

        $settlements = [];
        $debtorIndex = 0;
        $creditorIndex = 0;
        while ($debtorIndex < count($debtors) && $creditorIndex < count($creditors)) {
            $amount = $this->roundMoney(min(
                (float) $debtors[$debtorIndex]['amount'],
                (float) $creditors[$creditorIndex]['amount'],
            ));
            if ($amount > 0.0) {
                $settlements[] = [
                    'amountBase' => $amount,
                    'fromParticipantId' => (int) $debtors[$debtorIndex]['participantId'],
                    'toParticipantId' => (int) $creditors[$creditorIndex]['participantId'],
                ];
            }

            $debtors[$debtorIndex]['amount'] = $this->roundMoney((float) $debtors[$debtorIndex]['amount'] - $amount);
            $creditors[$creditorIndex]['amount'] = $this->roundMoney((float) $creditors[$creditorIndex]['amount'] - $amount);
            if ((float) $debtors[$debtorIndex]['amount'] <= 0.004) {
                $debtorIndex++;
            }
            if ((float) $creditors[$creditorIndex]['amount'] <= 0.004) {
                $creditorIndex++;
            }
        }

        return $settlements;
    }

    private function splitParticipantText(
        array $split,
        array $participants,
        string $baseCurrency,
        array $context,
    ): string
    {
        if ($split['splitType'] === 'excluded') {
            return '';
        }

        $lines = [];
        foreach ($split['participants'] as $participant) {
            if (($participant['isIncluded'] ?? true) !== true) {
                continue;
            }

            $participantId = (int) $participant['participantId'];
            $line = $this->participantName($participantId, $participants, $context);
            if ($split['splitType'] === 'custom_share' && is_numeric($participant['shareRatio'] ?? null)) {
                $line .= ' (' . rtrim(rtrim(number_format((float) $participant['shareRatio'], 2, '.', ''), '0'), '.') . ')';
            }
            if (
                ($split['splitType'] === 'custom_amount' || $split['splitType'] === 'individual')
                && is_numeric($participant['shareAmountBase'] ?? null)
            ) {
                $line .= ' ' . $this->formatter->templateMoney($baseCurrency, (float) $participant['shareAmountBase']);
            } elseif ($split['splitType'] === 'per_person') {
                $line .= ' ' . $this->formatter->templateMoney($baseCurrency, $split['perPersonAmountBase'] ?? 0.0);
            }
            $lines[] = $line;
        }

        return implode("\n", $lines);
    }

    private function splitTypeText(string $splitType, array $context): string
    {
        $english = [
            'custom_amount' => 'Custom Amount',
            'custom_share' => 'Custom Share',
            'equal' => 'Equal Split',
            'excluded' => 'Excluded',
            'individual' => 'Individual Payments',
            'per_person' => 'Same Amount per Person',
            'personal' => 'Personal Expense',
        ][$splitType] ?? 'Equal Split';

        return $this->tableText(
            $english,
            $context['labels']['splitTypes'][$splitType] ?? $context['labels']['splitTypes']['equal'],
            $context,
        );
    }

    private function participantName(?int $participantId, array $participants, array $context): string
    {
        if ($participantId !== null) {
            foreach ($participants as $participant) {
                if ((int) $participant['id'] === $participantId) {
                    return (string) $participant['name'];
                }
            }
        }

        return $this->tableText('Unspecified', $context['labels']['noParticipant'], $context);
    }

    private function splitType(mixed $value): string
    {
        return in_array($value, ['equal', 'personal', 'individual', 'per_person', 'custom_amount', 'custom_share', 'excluded'], true)
            ? (string) $value
            : 'equal';
    }

    private function participantIdOrNull(mixed $value): ?int
    {
        if (is_int($value) && $value > 0) {
            return $value;
        }

        if (is_float($value) && floor($value) === $value && $value > 0) {
            return (int) $value;
        }

        if (is_string($value) && ctype_digit($value)) {
            $intValue = (int) $value;

            return $intValue > 0 ? $intValue : null;
        }

        return null;
    }

    private function transactionRows(array $transactions, string $baseCurrency): array
    {
        return array_map(
            fn (array $transaction): array => [
                $transaction['details'],
                $transaction['category'] ?? '',
                $this->transactionAmountText($transaction, $baseCurrency),
                $transaction['remark'] ?? '',
            ],
            $transactions,
        );
    }

    private function installmentRows(array $budget, array $context): array
    {
        if (!$this->shouldShowInstallmentCategory($budget)) {
            return $this->overallInstallmentRows($budget, $context);
        }

        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];
        $itemRows = [];
        $periodUnit = $this->installmentPeriodUnit($budget);

        foreach (is_array($budget['items'] ?? null) ? $budget['items'] : [] as $item) {
            if (!is_array($item)) {
                continue;
            }

            $config = is_array($item['installmentConfig'] ?? null) ? $item['installmentConfig'] : [];
            $months = is_int($config['months'] ?? null)
                ? (int) $config['months']
                : $this->budgetDurationMonths($budget);
            $months = max(1.0, (float) ($months ?? 1));
            $target = $this->installmentTargetAmount($item, $config, $transactions);
            $periodCount = max(1, (int) ceil($this->periodCountFromMonths($months, $periodUnit)));
            $periodAmounts = $this->installmentPeriodAmounts($config);
            $periodProgress = $this->installmentPeriodProgress($config);
            $periodRemarks = $this->installmentPeriodRemarks($config);
            $defaultPeriodAmount = $target['original'] / $periodCount;
            $startTime = $this->installmentStartTime($item, $budget);
            $rateToBase = (float) ($item['budget']['rateToBase'] ?? 1);
            $rateToBase = $rateToBase > 0.0 ? $rateToBase : 1.0;
            $assignedAmount = 0.0;
            for ($index = 0; $index < $periodCount; $index++) {
                $periodAmount = (float) ($periodAmounts[$index] ?? $defaultPeriodAmount);
                $assignedAmount = round($assignedAmount + $periodAmount, 2);
                $itemRows[] = [
                    'category' => (string) ($item['category'] ?? $item['label']),
                    'currency' => (string) $item['budget']['currency'],
                    'periodAmount' => $periodAmount,
                    'periodAmountBase' => $periodAmount * $rateToBase,
                    'periodIndex' => $index,
                    'periodLabel' => $this->periodLabel($startTime, $index, $periodUnit),
                    'progress' => ($periodProgress[$index] ?? false) === true,
                    'remark' => (string) ($periodRemarks[$index] ?? ''),
                    'targetOriginal' => $target['original'],
                    'targetText' => $this->targetWithRemaining(
                        (string) $item['budget']['currency'],
                        (float) $target['original'],
                        max(0.0, (float) $target['original'] - $assignedAmount),
                        $context,
                    ),
                ];
            }
        }

        return array_map(
            fn (array $row): array => [
                (string) ($row['periodIndex'] + 1),
                $row['category'],
                $row['periodLabel'],
                $row['targetText'],
                $this->formatter->templateMoney($row['currency'], (float) $row['periodAmount']),
                $row['progress'] ? 'X' : '',
                $row['remark'],
            ],
            $itemRows,
        );
    }

    private function overallInstallmentRows(array $budget, array $context): array
    {
        $targetTotal = $this->effectiveTotal($budget, 'budgetBase');
        if ($targetTotal <= 0.0) {
            return [];
        }

        $periodUnit = $this->installmentPeriodUnit($budget);
        $months = max(1.0, (float) ($this->budgetDurationMonths($budget) ?? 1));
        $periodCount = max(1, (int) ceil($this->periodCountFromMonths($months, $periodUnit)));
        $periodAmounts = $this->overallInstallmentPeriodAmounts($budget, $periodCount, $targetTotal);
        $plan = is_array($budget['overallInstallmentPlan'] ?? null) ? $budget['overallInstallmentPlan'] : [];
        $periodProgress = $this->installmentPeriodProgress($plan);
        $periodRemarks = $this->installmentPeriodRemarks($plan);
        $startTime = strtotime((string) ($budget['startDate'] ?? ''));
        $startTime = $startTime === false ? null : $startTime;
        $rows = [];
        $assignedAmountBase = 0.0;
        for ($index = 0; $index < $periodCount; $index++) {
            $periodAmount = (float) ($periodAmounts[$index] ?? 0.0);
            $assignedAmountBase = round($assignedAmountBase + $periodAmount, 2);
            $rows[] = [
                (string) ($index + 1),
                $this->periodLabel($startTime, $index, $periodUnit),
                $this->targetWithRemaining(
                    (string) $budget['baseCurrency'],
                    $targetTotal,
                    max(0.0, $targetTotal - $assignedAmountBase),
                    $context,
                ),
                $this->formatter->templateMoney((string) $budget['baseCurrency'], $periodAmount),
                ($periodProgress[$index] ?? false) === true ? 'X' : '',
                (string) ($periodRemarks[$index] ?? ''),
            ];
        }

        return $rows;
    }

    private function installmentSummaryRow(array $budget, array $context): array
    {
        $items = is_array($budget['items'] ?? null) ? $budget['items'] : [];
        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];
        $targetTotal = 0.0;
        $periodTotal = 0.0;

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $config = is_array($item['installmentConfig'] ?? null) ? $item['installmentConfig'] : [];
            $target = $this->installmentTargetAmount($item, $config, $transactions);
            $periodAmounts = $this->installmentPeriodAmounts($config);

            $targetTotal += $target['base'];
            $periodTotal += $periodAmounts === []
                ? $target['base']
                : array_sum($periodAmounts) * (float) ($item['budget']['rateToBase'] ?? 1);
        }

        if (!$this->shouldShowInstallmentCategory($budget)) {
            $targetTotal = $this->effectiveTotal($budget, 'budgetBase');
        }

        $row = [
            '',
            $this->tableText('Total', $context['labels']['total'], $context),
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $targetTotal, true),
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $periodTotal, true),
            '',
            '',
        ];

        if ($this->shouldShowInstallmentCategory($budget)) {
            array_splice($row, 2, 0, ['']);
        }

        return $row;
    }

    private function installmentPeriodSection(array $section, array $budget, array $context): array
    {
        $showCategory = $this->shouldShowInstallmentCategory($budget);
        $sequenceWidth = $context['mode'] === 'en' ? 4 : 6;
        $targetWidth = $showCategory
            ? ($context['mode'] === 'en' ? 17 : 17)
            : ($context['mode'] === 'en' ? 20 : 20);
        $amountWidth = $showCategory
            ? ($context['mode'] === 'en' ? 19 : 17)
            : ($context['mode'] === 'en' ? 21 : 20);
        $remarkWidth = $showCategory
            ? ($context['mode'] === 'en' ? 27 : 27)
            : ($context['mode'] === 'en' ? 33 : 30);
        $columns = $showCategory
            ? [
                ['key' => 'sequence', 'label' => 'No.', 'align' => 'center', 'widthPercent' => $sequenceWidth, 'dataType' => 'text'],
                ['key' => 'category', 'label' => 'Category', 'align' => 'left', 'widthPercent' => $context['mode'] === 'en' ? 13 : 14, 'dataType' => 'text'],
                ['key' => 'period', 'label' => 'Period', 'align' => 'left', 'widthPercent' => $context['mode'] === 'en' ? 15 : 14, 'dataType' => 'text'],
                ['key' => 'target_amount', 'label' => 'Target', 'align' => 'right', 'widthPercent' => $targetWidth, 'dataType' => 'money'],
                ['key' => 'period_amount', 'label' => 'Amount', 'align' => 'right', 'widthPercent' => $amountWidth, 'dataType' => 'money'],
                ['key' => 'progress', 'label' => 'Done', 'align' => 'center', 'widthPercent' => 5, 'dataType' => 'text'],
                ['key' => 'remark', 'label' => 'Remark', 'align' => 'left', 'widthPercent' => $remarkWidth, 'dataType' => 'text'],
            ]
            : [
                ['key' => 'sequence', 'label' => 'No.', 'align' => 'center', 'widthPercent' => $sequenceWidth, 'dataType' => 'text'],
                ['key' => 'period', 'label' => 'Period', 'align' => 'left', 'widthPercent' => $context['mode'] === 'en' ? 17 : 19, 'dataType' => 'text'],
                ['key' => 'target_amount', 'label' => 'Target', 'align' => 'right', 'widthPercent' => $targetWidth, 'dataType' => 'money'],
                ['key' => 'period_amount', 'label' => 'Amount', 'align' => 'right', 'widthPercent' => $amountWidth, 'dataType' => 'money'],
                ['key' => 'progress', 'label' => 'Done', 'align' => 'center', 'widthPercent' => 5, 'dataType' => 'text'],
                ['key' => 'remark', 'label' => 'Remark', 'align' => 'left', 'widthPercent' => $remarkWidth, 'dataType' => 'text'],
            ];

        return [
            ...$section,
            'columns' => array_map(
                fn (array $column): array => $this->localizedTemplateColumn($column, $context),
                $columns,
            ),
        ];
    }

    private function shouldShowInstallmentCategory(array $budget): bool
    {
        return ($budget['installmentDisplayMode'] ?? 'item') !== 'overall';
    }

    private function installmentPeriodAmounts(array $config): array
    {
        if (!is_array($config['periodAmounts'] ?? null)) {
            return [];
        }

        $amounts = [];
        foreach ($config['periodAmounts'] as $amount) {
            if (!is_numeric($amount) || (float) $amount < 0.0) {
                continue;
            }

            $amounts[] = (float) $amount;
        }

        return $amounts;
    }

    private function overallInstallmentPeriodAmounts(array $budget, int $periodCount, float $targetTotal): array
    {
        $plan = is_array($budget['overallInstallmentPlan'] ?? null)
            ? $budget['overallInstallmentPlan']
            : [];
        $configuredAmounts = $this->installmentPeriodAmounts($plan);
        $defaultAmounts = $this->splitMoneyAcrossPeriods($targetTotal, $periodCount);

        return array_map(
            static fn (int $index): float => (float) ($configuredAmounts[$index] ?? $defaultAmounts[$index] ?? 0.0),
            range(0, $periodCount - 1),
        );
    }

    private function splitMoneyAcrossPeriods(float $totalAmount, int $periodCount): array
    {
        $averageAmount = round($totalAmount / max(1, $periodCount), 2);
        $assignedTotal = 0.0;
        $amounts = [];
        for ($index = 0; $index < $periodCount; $index++) {
            $isLast = $index === $periodCount - 1;
            $amount = $isLast ? round($totalAmount - $assignedTotal, 2) : $averageAmount;
            $amounts[] = $amount;
            $assignedTotal = round($assignedTotal + $amount, 2);
        }

        return $amounts;
    }

    private function installmentPeriodProgress(array $config): array
    {
        if (!is_array($config['periodProgress'] ?? null)) {
            return [];
        }

        return array_map(static fn (mixed $item): bool => $item === true, $config['periodProgress']);
    }

    private function installmentPeriodRemarks(array $config): array
    {
        if (!is_array($config['periodRemarks'] ?? null)) {
            return [];
        }

        return array_map(static fn (mixed $item): string => is_string($item) ? trim($item) : '', $config['periodRemarks']);
    }

    private function installmentStartTime(array $item, array $budget): ?int
    {
        $config = is_array($item['installmentConfig'] ?? null) ? $item['installmentConfig'] : [];
        $startMonth = $config['startMonth'] ?? null;
        if (is_string($startMonth) && preg_match('/^\d{4}-\d{2}$/', $startMonth) === 1) {
            $time = strtotime($startMonth . '-01');

            return $time === false ? null : $time;
        }

        $time = strtotime((string) ($budget['startDate'] ?? ''));

        return $time === false ? null : $time;
    }

    private function periodLabel(?int $startTime, int $periodIndex, string $periodUnit): string
    {
        if ($startTime === null) {
            return '#' . ($periodIndex + 1);
        }

        $modifier = match ($periodUnit) {
            'day' => '+' . $periodIndex . ' day',
            'week' => '+' . $periodIndex . ' week',
            'year' => '+' . $periodIndex . ' year',
            default => '+' . $periodIndex . ' month',
        };
        $time = strtotime($modifier, $startTime);
        if ($time === false) {
            return '#' . ($periodIndex + 1);
        }

        return match ($periodUnit) {
            'day', 'week' => date('j M Y', $time),
            'year' => date('Y', $time),
            default => date('M Y', $time),
        };
    }

    private function transactionAmountText(array $transaction, string $baseCurrency): string
    {
        $currency = (string) ($transaction['currency'] ?? $baseCurrency);
        $amountOriginal = (float) ($transaction['amountOriginal'] ?? 0);
        $amountBase = (float) ($transaction['amountBase'] ?? 0);
        $primary = $this->formatter->templateMoney($currency, $amountOriginal);
        if ($currency === $baseCurrency) {
            return $this->amountWithReference($primary, $transaction);
        }

        return $this->amountWithReference(
            $primary . "\n" . $this->formatter->templateMoney($baseCurrency, $amountBase),
            $transaction,
        );
    }

    /**
     * @return array{base: float, original: float}
     */
    private function installmentTargetAmount(array $item, array $config, array $transactions): array
    {
        $periodAmounts = $this->installmentPeriodAmounts($config);
        $configuredTotal = is_numeric($config['totalAmount'] ?? null)
            ? (float) $config['totalAmount']
            : ($periodAmounts === [] ? null : array_sum($periodAmounts));

        if (($config['enabled'] ?? false) === true && $configuredTotal !== null && $configuredTotal > 0.0) {
            $original = $configuredTotal;
            $rateToBase = is_numeric($item['budget']['rateToBase'] ?? null)
                ? (float) $item['budget']['rateToBase']
                : 1.0;

            return [
                'original' => $original,
                'base' => $original * ($rateToBase > 0.0 ? $rateToBase : 1.0),
            ];
        }

        $effective = $this->effectiveItemAmounts($item, $transactions);

        return [
            'original' => $effective['budgetOriginal'],
            'base' => $effective['budgetBase'],
        ];
    }

    private function amountWithReference(string $primary, array $transaction): string
    {
        $referenceCurrency = $transaction['referenceCurrency'] ?? null;
        $referenceAmount = $transaction['referenceAmountOriginal'] ?? null;
        if (!is_string($referenceCurrency) || !is_numeric($referenceAmount)) {
            return $primary;
        }

        return $primary . "\nRef " . $this->formatter->templateMoney($referenceCurrency, (float) $referenceAmount);
    }

    private function summaryRow(array $budget, array $context): array
    {
        return [
            $this->tableText('Total', $context['labels']['total'], $context),
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $this->effectiveTotal($budget, 'budgetBase'), true),
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $this->effectiveTotal($budget, 'estimatedBase'), true),
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $this->effectiveTotal($budget, 'varianceBase'), true),
        ];
    }

    private function itemLabelWithInstallment(array $item, array $context): string
    {
        return (string) ($item['category'] ?? $item['label']);
    }

    private function targetWithRemaining(string $currency, float $targetAmount, float $remainingAmount, array $context): string
    {
        return $this->formatter->templateMoney($currency, $targetAmount)
            . "\n"
            . $this->tableText('Remaining', $context['labels']['remainingLabel'], $context)
            . ' '
            . $this->formatter->templateMoney($currency, $remainingAmount);
    }

    private function moneyWithSecondary(string $baseCurrency, float $baseAmount, array $leg): string
    {
        $currency = (string) ($leg['currency'] ?? $baseCurrency);
        $rate = (float) ($leg['rateToBase'] ?? 0);
        $primary = $this->formatter->templateMoney($baseCurrency, $baseAmount);
        if ($currency === $baseCurrency || $rate <= 0.0) {
            return $primary;
        }

        return $primary . "\n" . $this->formatter->templateMoney($currency, $baseAmount / $rate);
    }

    private function installmentPeriodUnit(array $budget): string
    {
        $unit = $budget['installmentPeriodUnit'] ?? 'month';

        return in_array($unit, ['day', 'week', 'month', 'year'], true) ? (string) $unit : 'month';
    }

    private function budgetDurationMonths(array $budget): ?float
    {
        $start = strtotime((string) ($budget['startDate'] ?? ''));
        $end = strtotime((string) ($budget['endDate'] ?? ''));
        if ($start === false || $end === false || $end < $start) {
            return null;
        }

        return max(1.0, (($end - $start) / 86400 + 1) / 30.4375);
    }

    private function periodCountFromMonths(float $months, string $periodUnit): float
    {
        return match ($periodUnit) {
            'day' => $months * (365 / 12),
            'week' => $months * (52 / 12),
            'year' => $months / 12,
            default => $months,
        };
    }

    private function durationText(float $months): string
    {
        $rounded = round($months, 1);

        return (floor($rounded) === $rounded ? (string) (int) $rounded : (string) $rounded) . ' months';
    }

    private function effectiveItemAmounts(array $item, array $transactions): array
    {
        $transactionTotals = $this->transactionCurrencyTotalsForItem($item, $transactions);
        $estimatedBase = round(
            array_reduce($transactionTotals, static fn (float $total, array $transaction): float => $total + $transaction['amountBase'], 0.0),
            2,
        );
        $budgetOriginal = (float) ($item['budget']['amountOriginal'] ?? 0);
        $storedBudgetBase = (float) ($item['budget']['amountBase'] ?? 0);
        $hasTransactionActuals = $transactionTotals !== [];
        $budgetMultiplier = $hasTransactionActuals && $budgetOriginal === 0.0 && $storedBudgetBase === 0.0
            ? 1
            : $this->budgetItemAmountMultiplier($item);
        $budgetBase = $budgetOriginal === 0.0 && $storedBudgetBase === 0.0 && $hasTransactionActuals
            ? $estimatedBase
            : round($storedBudgetBase * $budgetMultiplier, 2);
        $budgetRate = (float) ($item['budget']['rateToBase'] ?? 0);

        return [
            'budgetOriginal' => $this->originalAmountFromBase($budgetBase, $budgetRate),
            'budgetBase' => $budgetBase,
            'estimatedBase' => $estimatedBase,
            'estimatedTransactionTotals' => $transactionTotals,
            'varianceBase' => round($budgetBase - $estimatedBase, 2),
        ];
    }

    private function perPersonItemBudgetBase(
        array $item,
        array $transactions,
        ?int $participantCount = null,
    ): float {
        $transactionTotals = $this->transactionCurrencyTotalsForItem($item, $transactions);
        $estimatedBase = round(
            array_reduce($transactionTotals, static fn (float $total, array $transaction): float => $total + $transaction['amountBase'], 0.0),
            2,
        );
        $budgetOriginal = (float) ($item['budget']['amountOriginal'] ?? 0);
        $storedBudgetBase = (float) ($item['budget']['amountBase'] ?? 0);

        if ($budgetOriginal === 0.0 && $storedBudgetBase === 0.0 && $transactionTotals !== []) {
            return $this->roundMoney($estimatedBase / max(1, $participantCount ?? $this->budgetItemAmountMultiplier($item)));
        }

        return $this->roundMoney($storedBudgetBase);
    }

    private function includedParticipantCount(array $participants): int
    {
        return count(array_filter(
            $participants,
            static fn (mixed $participant): bool => is_array($participant)
                && ($participant['isIncluded'] ?? true) !== false,
        ));
    }

    private function budgetItemAmountMultiplier(array $item): int
    {
        if (!is_array($item['split'] ?? null) || ($item['split']['splitType'] ?? null) !== 'per_person') {
            return 1;
        }

        $participants = is_array($item['split']['participants'] ?? null) ? $item['split']['participants'] : [];
        $includedCount = $this->includedParticipantCount($participants);

        return max(1, $includedCount);
    }

    private function transactionCurrencyTotalsForItem(array $item, array $transactions): array
    {
        $categoryId = $item['categoryId'] ?? null;
        $label = (string) ($item['label'] ?? '');
        $totals = [];

        foreach ($transactions as $transaction) {
            $transactionCategoryId = $transaction['categoryId'] ?? null;
            $matches = $categoryId === null
                ? $transactionCategoryId === null && (string) ($transaction['category'] ?? '') === $label
                : $transactionCategoryId === $categoryId;
            if (!$matches) {
                continue;
            }

            $currency = (string) ($transaction['currency'] ?? '');
            if ($currency === '') {
                continue;
            }

            $current = $totals[$currency] ?? [
                'currency' => $currency,
                'amountOriginal' => 0.0,
                'amountBase' => 0.0,
            ];
            $current['amountOriginal'] += (float) ($transaction['amountOriginal'] ?? 0);
            $current['amountBase'] += (float) ($transaction['amountBase'] ?? 0);
            $totals[$currency] = $current;
        }

        ksort($totals);

        return array_map(
            static fn (array $total): array => [
                'currency' => $total['currency'],
                'amountOriginal' => round((float) $total['amountOriginal'], 2),
                'amountBase' => round((float) $total['amountBase'], 2),
            ],
            array_values($totals),
        );
    }

    private function moneyWithTransactionBreakdown(string $baseCurrency, float $baseAmount, array $transactionTotals): string
    {
        $primary = $this->formatter->templateMoney($baseCurrency, $baseAmount);
        if ($transactionTotals === []) {
            return $primary;
        }

        if (count($transactionTotals) === 1 && (string) $transactionTotals[0]['currency'] === $baseCurrency) {
            return $primary;
        }

        $breakdown = array_map(
            fn (array $total): string => $this->formatter->templateMoney((string) $total['currency'], (float) $total['amountOriginal']),
            $transactionTotals,
        );

        return $primary . "\n" . implode("\n", $breakdown);
    }

    private function originalAmountFromBase(float $amountBase, float $rateToBase): float
    {
        if ($rateToBase <= 0.0) {
            return round($amountBase, 2);
        }

        return round($amountBase / $rateToBase, 2);
    }

    private function roundMoney(float $value): float
    {
        if (abs($value) < 0.005) {
            return 0.0;
        }

        return round($value, 2);
    }

    private function effectiveTotal(array $budget, string $key): float
    {
        $items = is_array($budget['items'] ?? null) ? $budget['items'] : [];
        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];

        $total = array_reduce(
            $items,
            fn (float $total, array $item): float => $total + $this->effectiveItemAmounts($item, $transactions)[$key],
            0.0,
        );

        return round($total, 2);
    }

    private function sectionsByKey(array $template): array
    {
        $sections = [];
        foreach (($template['sections'] ?? []) as $section) {
            if (isset($section['key']) && is_string($section['key'])) {
                $sections[$section['key']] = $section;
            }
        }

        return $sections;
    }

    private function defaultBudgetSection(): array
    {
        return [
            'key' => 'budget_highlights',
            'title' => 'Budget Highlights',
            'columns' => [
                ['key' => 'category', 'label' => 'Category', 'align' => 'left', 'dataType' => 'text'],
                ['key' => 'budget', 'label' => 'Budget', 'align' => 'right', 'dataType' => 'money'],
                ['key' => 'estimated_actuals', 'label' => 'Estimated Actuals', 'align' => 'right', 'dataType' => 'money'],
                ['key' => 'variance', 'label' => 'Variance', 'align' => 'right', 'dataType' => 'money'],
            ],
        ];
    }

    private function defaultTransactionSection(): array
    {
        return [
            'key' => 'transaction_breakdown',
            'title' => 'Transaction Breakdown',
            'columns' => [
                ['key' => 'transaction_details', 'label' => 'Transaction Details', 'align' => 'left', 'dataType' => 'text'],
                ['key' => 'category', 'label' => 'Category', 'align' => 'right', 'dataType' => 'text'],
                ['key' => 'amount', 'label' => 'Amount', 'align' => 'right', 'dataType' => 'money'],
                ['key' => 'remark', 'label' => 'Remark', 'align' => 'right', 'dataType' => 'text'],
            ],
        ];
    }

    private function defaultInstallmentSection(): array
    {
        return [
            'key' => 'installments',
            'title' => 'Installments',
            'columns' => [
                ['key' => 'sequence', 'label' => 'No.', 'align' => 'center', 'dataType' => 'text'],
                ['key' => 'category', 'label' => 'Category', 'align' => 'left', 'dataType' => 'text'],
                ['key' => 'period', 'label' => 'Period', 'align' => 'left', 'dataType' => 'text'],
                ['key' => 'target_amount', 'label' => 'Target', 'align' => 'right', 'dataType' => 'money'],
                ['key' => 'period_amount', 'label' => 'Amount', 'align' => 'right', 'dataType' => 'money'],
                ['key' => 'progress', 'label' => 'Progress', 'align' => 'center', 'dataType' => 'text'],
                ['key' => 'remark', 'label' => 'Remark', 'align' => 'right', 'dataType' => 'text'],
            ],
        ];
    }
}
