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
                $this->transactionRows($transactions),
                null,
                'No transactions',
            )
            . $this->signatureRenderer->render($budget)
            . '</body></html>';
    }

    private function baseCss(): string
    {
        return '@page{margin:29mm 29mm 22mm;}'
            . 'body{font-family:"SF-Mono",TCSongti,monospace;color:#000;font-size:7.5pt;}'
            . '.title{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 4mm;}'
            . '.title sup{font-size:7pt;line-height:0;vertical-align:super;}'
            . '.subtitle{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 7mm;}';
    }

    private function budgetRows(array $budget, array $transactions): array
    {
        return array_map(
            function (array $item) use ($budget, $transactions): array {
                $effective = $this->effectiveItemAmounts($item, $transactions);

                return [
                    $this->itemLabelWithInstallment($item),
                    $this->moneyWithSecondary((string) $budget['baseCurrency'], $effective['budgetBase'], $item),
                    $this->moneyWithSecondary((string) $budget['baseCurrency'], $effective['estimatedBase'], $item),
                    $this->formatter->templateMoney((string) $budget['baseCurrency'], $effective['varianceBase']),
                ];
            },
            is_array($budget['items'] ?? null) ? $budget['items'] : [],
        );
    }

    private function transactionRows(array $transactions): array
    {
        return array_map(
            fn (array $transaction): array => [
                $transaction['details'],
                $transaction['category'] ?? '',
                $this->formatter->templateMoney((string) $transaction['currency'], (float) $transaction['amountOriginal']),
                $transaction['remark'] ?? '',
            ],
            $transactions,
        );
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

    private function moneyWithSecondary(string $baseCurrency, float $baseAmount, array $item): string
    {
        $currency = (string) ($item['budget']['currency'] ?? $baseCurrency);
        $rate = (float) ($item['budget']['rateToBase'] ?? 0);
        $primary = $this->formatter->templateMoney($baseCurrency, $baseAmount);
        if ($currency === $baseCurrency || $rate <= 0.0) {
            return $primary;
        }

        return $primary . "\n" . $this->formatter->templateMoney($currency, $baseAmount / $rate);
    }

    private function effectiveItemAmounts(array $item, array $transactions): array
    {
        $budgetOriginal = (float) ($item['budget']['amountOriginal'] ?? 0);
        $budgetBase = (float) ($item['budget']['amountBase'] ?? 0);
        if ($budgetOriginal !== 0.0 || $budgetBase !== 0.0) {
            return [
                'budgetOriginal' => $budgetBase,
                'budgetBase' => $budgetBase,
                'estimatedOriginal' => (float) ($item['estimatedActuals']['amountBase'] ?? 0),
                'estimatedBase' => (float) ($item['estimatedActuals']['amountBase'] ?? 0),
                'varianceBase' => (float) ($item['varianceBase'] ?? 0),
            ];
        }

        $categoryId = $item['categoryId'] ?? null;
        $matches = array_values(array_filter($transactions, static function (array $transaction) use ($categoryId): bool {
            return ($transaction['categoryId'] ?? null) === $categoryId;
        }));
        if ($matches === []) {
            return [
                'budgetOriginal' => $budgetBase,
                'budgetBase' => $budgetBase,
                'estimatedOriginal' => (float) ($item['estimatedActuals']['amountBase'] ?? 0),
                'estimatedBase' => (float) ($item['estimatedActuals']['amountBase'] ?? 0),
                'varianceBase' => (float) ($item['varianceBase'] ?? 0),
            ];
        }

        $baseTotal = array_reduce($matches, static fn (float $total, array $transaction): float => $total + (float) ($transaction['amountBase'] ?? 0), 0.0);

        return [
            'budgetOriginal' => round($baseTotal, 2),
            'budgetBase' => round($baseTotal, 2),
            'estimatedOriginal' => round($baseTotal, 2),
            'estimatedBase' => round($baseTotal, 2),
            'varianceBase' => 0.0,
        ];
    }

    private function effectiveTotal(array $budget, string $key): float
    {
        $items = is_array($budget['items'] ?? null) ? $budget['items'] : [];
        $transactions = is_array($budget['transactions'] ?? null) ? $budget['transactions'] : [];

        return array_reduce(
            $items,
            fn (float $total, array $item): float => $total + $this->effectiveItemAmounts($item, $transactions)[$key],
            0.0,
        );
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
