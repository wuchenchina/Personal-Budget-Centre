#!/usr/bin/env php
<?php

declare(strict_types=1);

use BudgetCentre\Database\ConnectionFactory;
use BudgetCentre\Database\DatabaseConfigurationException;
use BudgetCentre\Support\Env;

require dirname(__DIR__) . '/src/bootstrap.php';

$codeRoot = dirname(__DIR__, 2);
$defaultSqlFiles = defaultSqlFiles($codeRoot);
$options = options($argv);

if (isset($options['help'])) {
    help();
    exit(0);
}

$migrationsOnly = isset($options['migrations-only']);
$sqlFiles = selectedFiles($options, $defaultSqlFiles, $migrationsOnly);
$dryRun = isset($options['dry-run']);
$confirmed = isset($options['yes']) || $dryRun;

if (!$confirmed) {
    fwrite(STDERR, "Refusing to write database without --yes. Use --dry-run to preview.\n");
    exit(2);
}

try {
    $plan = preparePlan($sqlFiles, $migrationsOnly);
    printPlan($plan, $dryRun, $migrationsOnly);

    if ($dryRun) {
        exit(0);
    }

    Env::load(dirname(__DIR__) . '/.env');
    $pdo = ConnectionFactory::make();
    foreach ($plan as $file => $statements) {
        foreach ($statements as $statement) {
            $pdo->exec($statement);
        }
        printf("[ok] %s (%d statements)\n", basename($file), count($statements));
    }

    echo "Database initialization completed.\n";
} catch (DatabaseConfigurationException $exception) {
    fwrite(STDERR, "[config] {$exception->getMessage()}\n");
    exit(3);
} catch (PDOException $exception) {
    fwrite(STDERR, "[db] {$exception->getMessage()}\n");
    exit(4);
} catch (RuntimeException $exception) {
    fwrite(STDERR, "[error] {$exception->getMessage()}\n");
    exit(5);
}

function options(array $argv): array
{
    $options = [];
    foreach (array_slice($argv, 1) as $argument) {
        if ($argument === '--yes' || $argument === '-y') {
            $options['yes'] = true;
            continue;
        }

        if ($argument === '--dry-run') {
            $options['dry-run'] = true;
            continue;
        }

        if ($argument === '--help' || $argument === '-h') {
            $options['help'] = true;
            continue;
        }

        if ($argument === '--migrations-only') {
            $options['migrations-only'] = true;
            continue;
        }

        if (str_starts_with($argument, '--file=')) {
            $options['files'][] = substr($argument, strlen('--file='));
            continue;
        }

        throw new RuntimeException("Unknown option: {$argument}");
    }

    return $options;
}

function defaultSqlFiles(string $codeRoot): array
{
    $files = glob($codeRoot . '/database/*.sql');
    if ($files === false || $files === []) {
        throw new RuntimeException('No SQL files found in code/database.');
    }

    sort($files, SORT_NATURAL);

    return $files;
}

function selectedFiles(array $options, array $defaultSqlFiles, bool $migrationsOnly): array
{
    if (isset($options['files'])) {
        return array_map(
            static fn (string $file): string => realpath($file) ?: $file,
            $options['files'],
        );
    }

    if (!$migrationsOnly) {
        return $defaultSqlFiles;
    }

    return array_values(array_filter(
        $defaultSqlFiles,
        static fn (string $file): bool => !in_array(basename($file), [
            '001_schema.sql',
            '002_seed_currencies.sql',
            '003_seed_template.sql',
        ], true),
    ));
}

function preparePlan(array $sqlFiles, bool $migrationsOnly): array
{
    $plan = [];
    foreach ($sqlFiles as $file) {
        if (!is_file($file)) {
            throw new RuntimeException("SQL file not found: {$file}");
        }

        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new RuntimeException("Could not read SQL file: {$file}");
        }

        assertNoDatabaseLifecycleSql($sql, $file);
        if ($migrationsOnly) {
            assertNonDestructiveMigrationSql($sql, $file);
        }
        $plan[$file] = splitSqlStatements($sql);
    }

    return $plan;
}

function assertNoDatabaseLifecycleSql(string $sql, string $file): void
{
    if (preg_match('/\b(CREATE|DROP)\s+DATABASE\b|\bUSE\s+[`"\']?[a-z0-9_]/i', $sql) === 1) {
        throw new RuntimeException("Database lifecycle statement is not allowed in {$file}");
    }
}

function assertNonDestructiveMigrationSql(string $sql, string $file): void
{
    if (preg_match('/\bTRUNCATE\s+(TABLE\s+)?[`"\']?[a-z0-9_]/i', $sql) === 1
        || preg_match('/\bDELETE\s+FROM\s+[`"\']?[a-z0-9_]/i', $sql) === 1
    ) {
        throw new RuntimeException("Data destructive statement is not allowed in migrations-only mode: {$file}");
    }

    if (preg_match('/\bDROP\s+(TABLE|VIEW|DATABASE)\b/i', $sql) === 1) {
        throw new RuntimeException("Object destructive statement is not allowed in migrations-only mode: {$file}");
    }

    if (preg_match('/\bALTER\s+TABLE\b[^;]*\bDROP\s+(COLUMN|INDEX|KEY|CONSTRAINT)\b/is', $sql) === 1) {
        throw new RuntimeException("Destructive ALTER TABLE is not allowed in migrations-only mode: {$file}");
    }
}

function splitSqlStatements(string $sql): array
{
    $sql = preg_replace('/^\xEF\xBB\xBF/', '', $sql) ?? $sql;
    $statements = [];
    $buffer = '';
    $quote = null;
    $length = strlen($sql);

    for ($index = 0; $index < $length; $index++) {
        $char = $sql[$index];
        $next = $sql[$index + 1] ?? '';

        if ($quote === null) {
            if ($char === '\'' || $char === '"' || $char === '`') {
                $quote = $char;
                $buffer .= $char;
                continue;
            }

            if ($char === ';') {
                appendStatement($statements, $buffer);
                $buffer = '';
                continue;
            }

            $buffer .= $char;
            continue;
        }

        $buffer .= $char;
        if (($quote === '\'' || $quote === '"') && $char === '\\') {
            $index++;
            $buffer .= $sql[$index] ?? '';
            continue;
        }

        if ($char === $quote) {
            if ($next === $quote) {
                $index++;
                $buffer .= $next;
                continue;
            }

            $quote = null;
        }
    }

    appendStatement($statements, $buffer);

    return $statements;
}

function appendStatement(array &$statements, string $statement): void
{
    $trimmed = trim($statement);
    if ($trimmed !== '') {
        $statements[] = $trimmed;
    }
}

function printPlan(array $plan, bool $dryRun, bool $migrationsOnly): void
{
    $mode = $migrationsOnly ? 'migration' : 'initialization';
    echo $dryRun ? "Database {$mode} dry run:\n" : "Database {$mode}:\n";
    foreach ($plan as $file => $statements) {
        printf("- %s: %d statements\n", basename($file), count($statements));
    }
}

function help(): void
{
    echo <<<'TEXT'
Usage:
  php bin/init-database.php --yes
  php bin/init-database.php --dry-run
  php bin/init-database.php --yes --migrations-only
  php bin/init-database.php --dry-run --migrations-only
  php bin/init-database.php --yes --file=/path/to/file.sql

This script initializes tables, seed data, and views in the existing DB_NAME.
It never creates or selects a database and refuses CREATE/DROP DATABASE or USE statements.
Use --migrations-only for deploy-time, non-destructive updates to an existing database.

TEXT;
}
