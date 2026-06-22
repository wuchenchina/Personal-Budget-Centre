<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

use BudgetCentre\Services\BudgetPdf\Themes\BudgetPdfThemeDefinition;
use BudgetCentre\Services\BudgetPdf\Themes\ClassicPdfTheme;
use BudgetCentre\Services\BudgetPdf\Themes\HsbcPdfTheme;
use BudgetCentre\Services\BudgetPdf\Themes\UswdsPdfTheme;

final readonly class BudgetPdfThemeRegistry
{
    public function theme(mixed $theme): BudgetPdfThemeDefinition
    {
        return match (BudgetPdfTheme::normalize($theme)) {
            BudgetPdfTheme::HSBC => new HsbcPdfTheme(),
            BudgetPdfTheme::USWDS => new UswdsPdfTheme(),
            default => new ClassicPdfTheme(),
        };
    }
}
