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
            'emptyInstallments' => '暂无分期目标',
            'emptyTransactions' => '暂无交易',
            'installmentsTitle' => '分期明细',
            'total' => '总计',
            'transactionBreakdownTitle' => '交易明细',
            'columnLabels' => [
                'amount' => '金额',
                'budget' => '预算',
                'category' => '类别',
                'estimated_actuals' => '预估实际',
                'period' => '期间',
                'period_amount' => '金额',
                'progress' => '进度',
                'remark' => '备注',
                'sequence' => '序号',
                'target_amount' => '目标',
                'transaction_details' => '交易详情',
                'variance' => '差额',
            ],
            'periodUnits' => [
                'day' => '日',
                'month' => '月',
                'week' => '周',
                'year' => '年',
            ],
        ],
        'tc' => [
            'budgetHighlightsTitle' => '預算摘要',
            'datePrefix' => '日期：',
            'emptyBudgetItems' => '暫無預算項',
            'emptyInstallments' => '暫無分期目標',
            'emptyTransactions' => '暫無交易',
            'installmentsTitle' => '分期明細',
            'total' => '總計',
            'transactionBreakdownTitle' => '交易明細',
            'columnLabels' => [
                'amount' => '金額',
                'budget' => '預算',
                'category' => '類別',
                'estimated_actuals' => '預估實際',
                'period' => '期間',
                'period_amount' => '金額',
                'progress' => '進度',
                'remark' => '備註',
                'sequence' => '序號',
                'target_amount' => '目標',
                'transaction_details' => '交易詳情',
                'variance' => '差額',
            ],
            'periodUnits' => [
                'day' => '日',
                'month' => '月',
                'week' => '週',
                'year' => '年',
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
        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];
        $itemRows = [];
        $periodUnit = $this->installmentPeriodUnit($budget);
        $targetTotalBase = $this->effectiveTotal($budget, 'budgetBase');

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
            for ($index = 0; $index < $periodCount; $index++) {
                $periodAmount = (float) ($periodAmounts[$index] ?? $defaultPeriodAmount);
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
                ];
            }
        }

        if ($this->shouldShowInstallmentCategory($budget)) {
            return array_map(
                fn (array $row): array => [
                    (string) ($row['periodIndex'] + 1),
                    $row['category'],
                    $row['periodLabel'],
                    $this->formatter->templateMoney($row['currency'], (float) $row['targetOriginal']),
                    $this->formatter->templateMoney($row['currency'], (float) $row['periodAmount']),
                    $row['progress'] ? 'X' : '',
                    $row['remark'],
                ],
                $itemRows,
            );
        }

        $periodRows = [];
        foreach ($itemRows as $row) {
            $periodIndex = (int) $row['periodIndex'];
            if (!isset($periodRows[$periodIndex])) {
                $periodRows[$periodIndex] = [
                    'periodAmountBase' => 0.0,
                    'periodLabel' => $row['periodLabel'],
                    'remarks' => [],
                    'sourceCount' => 0,
                    'checkedCount' => 0,
                ];
            }
            $periodRows[$periodIndex]['periodAmountBase'] += (float) $row['periodAmountBase'];
            $periodRows[$periodIndex]['sourceCount'] += 1;
            $periodRows[$periodIndex]['checkedCount'] += $row['progress'] ? 1 : 0;
            $remark = trim((string) $row['remark']);
            if ($remark !== '') {
                $periodRows[$periodIndex]['remarks'][$remark] = true;
            }
        }
        ksort($periodRows);

        $rows = [];
        foreach ($periodRows as $periodIndex => $row) {
            $remarks = array_keys($row['remarks']);
            $rows[] = [
                (string) ($periodIndex + 1),
                (string) $row['periodLabel'],
                $this->formatter->templateMoney((string) $budget['baseCurrency'], $targetTotalBase),
                $this->formatter->templateMoney((string) $budget['baseCurrency'], (float) $row['periodAmountBase']),
                $row['sourceCount'] > 0 && $row['checkedCount'] === $row['sourceCount'] ? 'X' : '',
                count($remarks) === 1 ? $remarks[0] : '',
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
        $configuredTotal = $periodAmounts === []
            ? (is_numeric($config['totalAmount'] ?? null) ? (float) $config['totalAmount'] : null)
            : array_sum($periodAmounts);

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
        $label = (string) ($item['category'] ?? $item['label']);
        $config = $item['installmentConfig'] ?? null;
        if (!is_array($config) || ($config['enabled'] ?? false) !== true) {
            return $label;
        }

        $months = is_int($config['months'] ?? null) ? $config['months'] : null;
        $paidMonths = is_int($config['paidMonths'] ?? null) ? $config['paidMonths'] : 0;
        $monthlyAmount = is_numeric($config['monthlyAmount'] ?? null)
            ? (float) $config['monthlyAmount']
            : null;

        if ($months === null || $monthlyAmount === null) {
            return $label;
        }

        $remaining = max(0, $months - max(0, min($paidMonths, $months)));
        $paid = max(0, min($paidMonths, $months));

        $english = 'Saving plan: '
            . $this->formatter->templateMoney((string) $item['budget']['currency'], $monthlyAmount)
            . ' per month, '
            . $paid
            . ' of '
            . $months
            . ' saved, '
            . $remaining
            . ' remaining';
        $chinesePrefix = $context['chineseLanguage'] === 'sc' ? '储蓄计划：' : '儲蓄計畫：';
        $savedLabel = $context['chineseLanguage'] === 'sc' ? '已存' : '已存';
        $remainingLabel = $context['chineseLanguage'] === 'sc' ? '剩余' : '剩餘';
        $periodsLabel = $context['chineseLanguage'] === 'sc' ? '期，共' : '期，共';
        $chinese = $chinesePrefix
            . $this->formatter->templateMoney((string) $item['budget']['currency'], $monthlyAmount)
            . ' '
            . $context['labels']['periodUnits']['month']
            . '，'
            . $savedLabel
            . ' '
            . $paid
            . ' '
            . $periodsLabel
            . ' '
            . $months
            . ' 期'
            . '，'
            . $remainingLabel
            . ' '
            . $remaining;

        return $label . "\n" . $this->tableText($english, $chinese, $context);
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
        $budgetBase = $budgetOriginal === 0.0 && $storedBudgetBase === 0.0 && $hasTransactionActuals
            ? $estimatedBase
            : round($storedBudgetBase, 2);
        $budgetRate = (float) ($item['budget']['rateToBase'] ?? 0);

        return [
            'budgetOriginal' => $this->originalAmountFromBase($budgetBase, $budgetRate),
            'budgetBase' => $budgetBase,
            'estimatedBase' => $estimatedBase,
            'estimatedTransactionTotals' => $transactionTotals,
            'varianceBase' => round($budgetBase - $estimatedBase, 2),
        ];
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
