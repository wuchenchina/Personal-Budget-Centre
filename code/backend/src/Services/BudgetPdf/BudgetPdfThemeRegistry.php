<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

use BudgetCentre\Services\BudgetPdf\Themes\BudgetPdfThemeDefinition;
use BudgetCentre\Services\BudgetPdf\Themes\ClassicPdfTheme;
use BudgetCentre\Services\BudgetPdf\Themes\StatementRedPdfTheme;

final readonly class BudgetPdfThemeRegistry
{
    public function theme(mixed $theme): BudgetPdfThemeDefinition
    {
        return match (BudgetPdfTheme::normalize($theme)) {
            BudgetPdfTheme::STATEMENT_RED => new StatementRedPdfTheme(),
            default => new ClassicPdfTheme(),
        };
    }
}
