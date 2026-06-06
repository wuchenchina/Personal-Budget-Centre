#!/usr/bin/env php
<?php

declare(strict_types=1);

use BudgetCentre\Database\ConnectionFactory;
use BudgetCentre\Database\DatabaseConfigurationException;
use BudgetCentre\Support\Env;

require dirname(__DIR__) . '/src/bootstrap.php';

$codeRoot = dirname(__DIR__, 2);
$defaultSqlFiles = [
    $codeRoot . '/database/001_schema.sql',
    $codeRoot . '/database/002_seed_currencies.sql',
    $codeRoot . '/database/003_seed_template.sql',
    $codeRoot . '/database/004_views.sql',
];
$options = options($argv);

if (isset($options['help'])) {
    help();
    exit(0);
}

$sqlFiles = selectedFiles($options, $defaultSqlFiles);
$dryRun = isset($options['dry-run']);
$confirmed = isset($options['yes']) || $dryRun;

if (!$confirmed) {
    fwrite(STDERR, "Refusing to write database without --yes. Use --dry-run to preview.\n");
    exit(2);
}

try {
    $plan = preparePlan($sqlFiles);
    printPlan($plan, $dryRun);

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

        if (str_starts_with($argument, '--file=')) {
            $options['files'][] = substr($argument, strlen('--file='));
            continue;
        }

        throw new RuntimeException("Unknown option: {$argument}");
    }

    return $options;
}

function selectedFiles(array $options, array $defaultSqlFiles): array
{
    if (!isset($options['files'])) {
        return $defaultSqlFiles;
    }

    return array_map(
        static fn (string $file): string => realpath($file) ?: $file,
        $options['files'],
    );
}

function preparePlan(array $sqlFiles): array
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

function printPlan(array $plan, bool $dryRun): void
{
    echo $dryRun ? "Database initialization dry run:\n" : "Database initialization:\n";
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
  php bin/init-database.php --yes --file=/path/to/file.sql

This script initializes tables, seed data, and views in the existing DB_NAME.
It never creates or selects a database and refuses CREATE/DROP DATABASE or USE statements.

TEXT;
}
