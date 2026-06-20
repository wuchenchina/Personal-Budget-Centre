<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

final readonly class BudgetPdfTheme
{
    public const CLASSIC = 'classic';
    public const STATEMENT_RED = 'statement_red';
    public const DEFAULT = self::CLASSIC;

    public const THEMES = [
        self::CLASSIC,
        self::STATEMENT_RED,
    ];

    public static function normalize(mixed $theme): string
    {
        return is_string($theme) && in_array($theme, self::THEMES, true)
            ? $theme
            : self::DEFAULT;
    }

    public static function isStatementRed(string $theme): bool
    {
        return $theme === self::STATEMENT_RED;
    }
}
