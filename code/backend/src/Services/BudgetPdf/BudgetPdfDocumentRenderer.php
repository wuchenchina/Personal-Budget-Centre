<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

final readonly class BudgetPdfDocumentRenderer
{
    public function __construct(
        private BudgetPdfFormatter $formatter = new BudgetPdfFormatter(),
        private BudgetPdfTableRenderer $tableRenderer = new BudgetPdfTableRenderer(),
        private BudgetPdfSignatureRenderer $signatureRenderer = new BudgetPdfSignatureRenderer(),
    ) {
    }

    public function render(array $budget, array $template): string
    {
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
        $budgetSection = $sections['budget_highlights'] ?? $this->defaultBudgetSection();
        $transactionSection = $sections['transaction_breakdown'] ?? $this->defaultTransactionSection();
        $installmentSection = $sections['installments'] ?? $this->defaultInstallmentSection();
        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];

        return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
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
                $this->budgetRows($budget, $transactions),
                $this->summaryRow($budget),
                'No budget items',
            )
            . $this->tableRenderer->render(
                $transactionSection,
                $periodText,
                $this->transactionRows($transactions, (string) $budget['baseCurrency']),
                null,
                'No transactions',
            )
            . (
                ($budget['budgetType'] ?? 'regular') === 'installment'
                    ? $this->tableRenderer->render(
                        $this->installmentPeriodSection($installmentSection),
                        $periodText,
                        $this->installmentRows($budget),
                        $this->installmentSummaryRow($budget),
                        'No installment targets',
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

    private function budgetRows(array $budget, array $transactions): array
    {
        return array_map(
            function (array $item) use ($budget, $transactions): array {
                $effective = $this->effectiveItemAmounts($item, $transactions);

                return [
                    $this->itemLabelWithInstallment($item),
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

    private function installmentRows(array $budget): array
    {
        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];
        $rows = [];

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
            $periodUnit = $this->installmentPeriodUnit($budget);
            $periodCount = max(1, (int) ceil($this->periodCountFromMonths($months, $periodUnit)));
            $periodAmounts = $this->installmentPeriodAmounts($config);
            $periodProgress = $this->installmentPeriodProgress($config);
            $defaultPeriodAmount = $target['original'] / $periodCount;
            $startTime = $this->installmentStartTime($item, $budget);

            for ($index = 0; $index < $periodCount; $index++) {
                $rows[] = [
                    (string) ($index + 1),
                    (string) ($item['category'] ?? $item['label']),
                    $this->periodLabel($startTime, $index, $periodUnit),
                    $this->formatter->templateMoney((string) $item['budget']['currency'], $target['original']),
                    $this->formatter->templateMoney(
                        (string) $item['budget']['currency'],
                        (float) ($periodAmounts[$index] ?? $defaultPeriodAmount),
                    ) . ' / ' . $this->periodUnitText($periodUnit),
                    ($periodProgress[$index] ?? false) ? 'X' : '',
                    '',
                ];
            }
        }

        return $rows;
    }

    private function installmentSummaryRow(array $budget): array
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

        return [
            'Total',
            '',
            '',
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $targetTotal, true),
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $periodTotal, true),
            '',
            '',
        ];
    }

    private function installmentPeriodSection(array $section): array
    {
        return [
            ...$section,
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
            default => date('F Y', $time),
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

    private function summaryRow(array $budget): array
    {
        return [
            'Total',
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $this->effectiveTotal($budget, 'budgetBase'), true),
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $this->effectiveTotal($budget, 'estimatedBase'), true),
            $this->formatter->templateMoney((string) $budget['baseCurrency'], $this->effectiveTotal($budget, 'varianceBase'), true),
        ];
    }

    private function itemLabelWithInstallment(array $item): string
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

        return $label
            . "\nSaving plan: "
            . $this->formatter->templateMoney((string) $item['budget']['currency'], $monthlyAmount)
            . ' / month, '
            . max(0, min($paidMonths, $months))
            . '/'
            . $months
            . ' saved, '
            . $remaining
            . ' remaining';
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

    private function periodUnitText(string $periodUnit): string
    {
        return match ($periodUnit) {
            'day' => 'daily',
            'week' => 'weekly',
            'year' => 'yearly',
            default => 'monthly',
        };
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
