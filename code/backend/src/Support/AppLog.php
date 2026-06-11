<?php

declare(strict_types=1);

namespace BudgetCentre\Support;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Database\DatabaseConfigurationException;
use BudgetCentre\Http\InvalidJsonRequestException;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\MissingSeedDataException;
use DateTimeImmutable;
use PDOException;
use RuntimeException;
use Throwable;

final class AppLog
{
    private const MAX_READ_LINES = 2000;

    public static function error(Throwable $exception, ?Request $request = null): void
    {
        try {
            self::append([
                'id' => bin2hex(random_bytes(8)),
                'timestamp' => (new DateTimeImmutable())->format(DATE_ATOM),
                'level' => 'error',
                'code' => self::code($exception),
                'status' => self::status($exception),
                'message' => $exception->getMessage(),
                'exception' => $exception::class,
                'file' => $exception->getFile(),
                'line' => $exception->getLine(),
                'method' => $request?->method,
                'path' => $request?->path,
                'query' => self::redactedQuery($request?->query ?? []),
                'ipAddress' => $request?->ipAddress,
                'userAgent' => $request?->userAgent,
                'trace' => explode("\n", $exception->getTraceAsString()),
            ]);
        } catch (Throwable) {
            return;
        }
    }

    public static function recent(int $limit = 100): array
    {
        $path = self::path();
        if (!is_file($path)) {
            return [
                'path' => $path,
                'entries' => [],
            ];
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return [
                'path' => $path,
                'entries' => [],
            ];
        }

        $entries = [];
        foreach (array_reverse(array_slice($lines, -self::MAX_READ_LINES)) as $line) {
            $decoded = json_decode($line, true);
            if (!is_array($decoded)) {
                continue;
            }

            $entries[] = [
                'id' => (string) ($decoded['id'] ?? sha1($line)),
                'timestamp' => (string) ($decoded['timestamp'] ?? ''),
                'level' => (string) ($decoded['level'] ?? 'error'),
                'code' => (string) ($decoded['code'] ?? 'SERVER_ERROR'),
                'status' => is_numeric($decoded['status'] ?? null) ? (int) $decoded['status'] : 500,
                'message' => (string) ($decoded['message'] ?? ''),
                'exception' => (string) ($decoded['exception'] ?? ''),
                'file' => (string) ($decoded['file'] ?? ''),
                'line' => is_numeric($decoded['line'] ?? null) ? (int) $decoded['line'] : null,
                'method' => self::nullableString($decoded['method'] ?? null),
                'path' => self::nullableString($decoded['path'] ?? null),
                'query' => is_array($decoded['query'] ?? null) ? $decoded['query'] : [],
                'ipAddress' => self::nullableString($decoded['ipAddress'] ?? null),
                'userAgent' => self::nullableString($decoded['userAgent'] ?? null),
                'trace' => is_array($decoded['trace'] ?? null) ? $decoded['trace'] : [],
            ];

            if (count($entries) >= $limit) {
                break;
            }
        }

        return [
            'path' => $path,
            'entries' => $entries,
        ];
    }

    public static function path(): string
    {
        return rtrim(
            Env::string('APP_LOG_FILE', dirname(__DIR__, 2) . '/storage/logs/app.log')
                ?? dirname(__DIR__, 2) . '/storage/logs/app.log',
            '/',
        );
    }

    private static function append(array $entry): void
    {
        $path = self::path();
        $directory = dirname($path);
        if (!is_dir($directory) && !@mkdir($directory, 0775, true) && !is_dir($directory)) {
            return;
        }

        $json = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return;
        }

        @file_put_contents($path, $json . PHP_EOL, FILE_APPEND | LOCK_EX);
    }

    private static function code(Throwable $exception): string
    {
        if ($exception instanceof InvalidJsonRequestException) {
            return 'INVALID_JSON';
        }

        if ($exception instanceof AuthException) {
            return $exception->errorCode();
        }

        if ($exception instanceof MissingSeedDataException) {
            return 'MISSING_SEED_DATA';
        }

        if ($exception instanceof DatabaseConfigurationException) {
            return 'DATABASE_NOT_CONFIGURED';
        }

        if ($exception instanceof PDOException) {
            return 'DATABASE_UNAVAILABLE';
        }

        if ($exception instanceof RuntimeException) {
            return 'SERVER_ERROR';
        }

        return 'INTERNAL_SERVER_ERROR';
    }

    private static function status(Throwable $exception): int
    {
        if ($exception instanceof InvalidJsonRequestException) {
            return 400;
        }

        if ($exception instanceof AuthException) {
            return $exception->status();
        }

        if ($exception instanceof DatabaseConfigurationException) {
            return 503;
        }

        if ($exception instanceof PDOException || $exception instanceof RuntimeException) {
            return 503;
        }

        return 500;
    }

    private static function redactedQuery(array $query): array
    {
        $redacted = [];
        foreach ($query as $key => $value) {
            $normalizedKey = strtolower((string) $key);
            if (str_contains($normalizedKey, 'token')
                || str_contains($normalizedKey, 'password')
                || str_contains($normalizedKey, 'secret')
            ) {
                $redacted[$key] = '[redacted]';
                continue;
            }

            $redacted[$key] = is_scalar($value) || $value === null ? $value : '[complex]';
        }

        return $redacted;
    }

    private static function nullableString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
