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
        $title = $this->formatter->escapeHtml((string) $budget['title']);
        $subtitle = trim((string) $budget['ownerName']);
        $subtitleHtml = $subtitle === ''
            ? ''
            : '<div class="subtitle">' . $this->formatter->escapeHtml($subtitle) . '</div>';
        $periodText = $this->formatter->periodText($budget);
        $sections = $this->sectionsByKey($template);
        $budgetSection = $sections['budget_highlights'] ?? $this->defaultBudgetSection();
        $transactionSection = $sections['transaction_breakdown'] ?? $this->defaultTransactionSection();
        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];

        return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
            . '<style>'
            . $this->baseCss()
            . $this->tableRenderer->css()
            . $this->signatureRenderer->css()
            . '</style></head><body>'
            . '<htmlpagefooter name="budgetPageFooter"><div class="page-footer">Page {PAGENO} of {nbpg}</div></htmlpagefooter>'
            . '<div class="title">' . $title . '</div>'
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
            . $this->signatureRenderer->render($budget)
            . '</body></html>';
    }

    private function baseCss(): string
    {
        return '@page{margin:29mm 29mm 22mm;footer:html_budgetPageFooter;}'
            . 'body{font-family:"SF-Mono",TCSongti,monospace;color:#000;font-size:7.5pt;}'
            . '.title{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 4mm;}'
            . '.title sup{font-size:7pt;line-height:0;vertical-align:super;}'
            . '.subtitle{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 7mm;}'
            . '.page-footer{font-family:"SF-Mono",TCSongti,monospace;font-size:7pt;color:#666;text-align:center;}';
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

    private function transactionAmountText(array $transaction, string $baseCurrency): string
    {
        $currency = (string) ($transaction['currency'] ?? $baseCurrency);
        $amountOriginal = (float) ($transaction['amountOriginal'] ?? 0);
        $amountBase = (float) ($transaction['amountBase'] ?? 0);
        $primary = $this->formatter->templateMoney($currency, $amountOriginal);
        if ($currency === $baseCurrency) {
            return $primary;
        }

        return $primary . "\n" . $this->formatter->templateMoney($baseCurrency, $amountBase);
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
            . "\nInstallment: "
            . $this->formatter->templateMoney((string) $item['budget']['currency'], $monthlyAmount)
            . ' / month, '
            . max(0, min($paidMonths, $months))
            . '/'
            . $months
            . ' paid, '
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
}
