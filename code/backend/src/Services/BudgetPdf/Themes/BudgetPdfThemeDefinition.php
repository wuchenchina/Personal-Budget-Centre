<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf\Themes;

use BudgetCentre\Services\BudgetPdf\BudgetPdfFormatter;

interface BudgetPdfThemeDefinition
{
    public function key(): string;

    public function budgetDocumentCss(): string;

    public function budgetTableCss(): string;

    public function bookkeepingDocumentCss(): string;

    public function bookkeepingTableCss(): string;

    public function signatureCss(): string;

    public function signatureFullWidthMm(): float;

    public function footerHtml(string $scope): string;

    public function headerHtml(
        array $budget,
        string $titleHtml,
        string $subtitleHtml,
        BudgetPdfFormatter $formatter,
        string $scope,
        array $options = [],
    ): string;
}
