<?php

declare(strict_types=1);

use BudgetCentre\Database\ConnectionFactory;
use BudgetCentre\Support\Env;

require dirname(__DIR__) . '/src/bootstrap.php';

$dryRun = in_array('--dry-run', $argv, true);
$confirmed = in_array('--yes', $argv, true);

if (!$dryRun && !$confirmed) {
    fwrite(STDERR, "Refusing to reset database without --yes.\n");
    exit(1);
}

$database = Env::string('DB_NAME');
if ($database === null || $database === '') {
    fwrite(STDERR, "DB_NAME is not configured.\n");
    exit(1);
}

$pdo = ConnectionFactory::make();
$statement = $pdo->prepare(
    "SELECT TABLE_NAME, TABLE_TYPE
     FROM information_schema.tables
     WHERE TABLE_SCHEMA = :database
     ORDER BY TABLE_TYPE = 'VIEW' DESC, TABLE_NAME"
);
$statement->execute(['database' => $database]);
$objects = $statement->fetchAll();

if ($objects === []) {
    echo "Database {$database} is already empty.\n";
    exit(0);
}

echo ($dryRun ? 'Database reset dry run' : 'Resetting database') . " for {$database}:\n";
foreach ($objects as $object) {
    $type = strtoupper((string) $object['TABLE_TYPE']) === 'VIEW' ? 'VIEW' : 'TABLE';
    echo "- {$type} {$object['TABLE_NAME']}\n";
}

if ($dryRun) {
    exit(0);
}

$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

foreach ($objects as $object) {
    $type = strtoupper((string) $object['TABLE_TYPE']) === 'VIEW' ? 'VIEW' : 'TABLE';
    $name = str_replace('`', '``', (string) $object['TABLE_NAME']);
    $pdo->exec("DROP {$type} IF EXISTS `{$name}`");
}

$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

echo "Database {$database} has been cleared.\n";
