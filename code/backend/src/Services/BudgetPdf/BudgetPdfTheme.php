<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf;

final readonly class BudgetPdfTheme
{
    public const CLASSIC = 'classic';
    public const HSBC = 'hsbc';
    public const LEGACY_STATEMENT_RED = 'statement_red';
    public const DEFAULT = self::CLASSIC;

    public const THEMES = [
        self::CLASSIC,
        self::HSBC,
    ];

    public static function normalize(mixed $theme): string
    {
        if ($theme === self::LEGACY_STATEMENT_RED) {
            return self::HSBC;
        }

        return is_string($theme) && in_array($theme, self::THEMES, true)
            ? $theme
            : self::DEFAULT;
    }

    public static function isHsbc(string $theme): bool
    {
        return $theme === self::HSBC;
    }
}
