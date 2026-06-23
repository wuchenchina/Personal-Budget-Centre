<?php

declare(strict_types=1);

namespace BudgetCentre\Support;

use DateTimeImmutable;

final class Input
{
    public static function normalizedEmail(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $email = strtolower(trim($value));

        return filter_var($email, FILTER_VALIDATE_EMAIL) === false ? null : $email;
    }

    public static function string(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    public static function lowercase(string $value): string
    {
        $trimmed = trim($value);

        return function_exists('mb_strtolower')
            ? mb_strtolower($trimmed, 'UTF-8')
            : strtolower($trimmed);
    }

    public static function username(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $username = strtolower(trim($value));
        if (preg_match('/^[a-z0-9_][a-z0-9_.-]{2,31}$/', $username) !== 1) {
            return null;
        }

        return $username;
    }

    public static function positiveInt(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value > 0 ? $value : null;
        }

        if (!is_string($value) || !ctype_digit($value)) {
            return null;
        }

        $intValue = (int) $value;

        return $intValue > 0 ? $intValue : null;
    }

    public static function date(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $trimmed);
        if ($date === false || $date->format('Y-m-d') !== $trimmed) {
            return null;
        }

        return $trimmed;
    }
}
