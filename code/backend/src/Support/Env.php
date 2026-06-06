<?php

declare(strict_types=1);

namespace BudgetCentre\Support;

final class Env
{
    public static function load(string $path): void
    {
        if (!is_file($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                continue;
            }

            [$key, $value] = array_pad(explode('=', $trimmed, 2), 2, '');
            $key = trim($key);
            $value = trim($value);
            $value = trim($value, "\"'");

            if ($key === '' || self::raw($key) !== null) {
                continue;
            }

            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }

    public static function string(string $key, ?string $default = null): ?string
    {
        $value = self::raw($key);
        if ($value === null || $value === '') {
            return $default;
        }

        return (string) $value;
    }

    public static function int(string $key, int $default): int
    {
        $value = self::raw($key);
        if ($value === null || $value === '') {
            return $default;
        }

        return (int) $value;
    }

    private static function raw(string $key): mixed
    {
        if (array_key_exists($key, $_ENV)) {
            return $_ENV[$key];
        }

        if (array_key_exists($key, $_SERVER)) {
            return $_SERVER[$key];
        }

        if (function_exists('getenv')) {
            $value = getenv($key);
            if ($value !== false) {
                return $value;
            }
        }

        return null;
    }
}
