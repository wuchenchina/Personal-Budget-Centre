<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

use BudgetCentre\Services\BudgetPdf\Themes\BudgetPdfThemeDefinition;
use BudgetCentre\Services\BudgetPdf\Themes\ClassicPdfTheme;
use BudgetCentre\Services\BudgetPdf\Themes\HsbcPdfTheme;

final readonly class BudgetPdfThemeRegistry
{
    public function theme(mixed $theme): BudgetPdfThemeDefinition
    {
        return match (BudgetPdfTheme::normalize($theme)) {
            BudgetPdfTheme::HSBC => new HsbcPdfTheme(),
            default => new ClassicPdfTheme(),
        };
    }
}
