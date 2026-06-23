<?php

declare(strict_types=1);

namespace BudgetCentre\Support;

final readonly class PdfLanguages
{
    public const DEFAULT = ['en'];

    public const SUPPORTED = ['en', 'sc', 'tc', 'ja', 'fr', 'ru', 'de'];

    public static function normalizeList(mixed $value, array $fallback = self::DEFAULT): array
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : preg_split('/[\s,]+/', $value);
        }

        if (!is_array($value)) {
            return $fallback === [] ? [] : self::normalizeFallback($fallback);
        }

        $languages = [];
        foreach ($value as $language) {
            if (!is_string($language) || !in_array($language, self::SUPPORTED, true)) {
                continue;
            }

            if (!in_array($language, $languages, true)) {
                $languages[] = $language;
            }
        }

        return $languages === []
            ? ($fallback === [] ? [] : self::normalizeFallback($fallback))
            : $languages;
    }

    public static function normalizeSingle(mixed $value, string $fallback = 'en'): string
    {
        return is_string($value) && in_array($value, self::SUPPORTED, true) ? $value : $fallback;
    }

    public static function documentLanguage(string $language): string
    {
        return [
            'en' => 'en',
            'sc' => 'zh-Hans',
            'tc' => 'zh-Hant',
            'ja' => 'ja',
            'fr' => 'fr',
            'ru' => 'ru',
            'de' => 'de',
        ][$language] ?? 'en';
    }

    public static function fromLegacyTableOptions(string $mode, string $chineseLanguage): array
    {
        $chineseLanguage = in_array($chineseLanguage, ['sc', 'tc'], true) ? $chineseLanguage : 'tc';

        return match ($mode) {
            'zh' => [$chineseLanguage],
            'bilingual' => ['en', $chineseLanguage],
            default => ['en'],
        };
    }

    private static function normalizeFallback(array $fallback): array
    {
        $normalized = array_values(array_unique(array_filter(
            $fallback,
            static fn (mixed $language): bool => is_string($language) && in_array($language, self::SUPPORTED, true),
        )));

        return $normalized === [] ? self::DEFAULT : $normalized;
    }
}
