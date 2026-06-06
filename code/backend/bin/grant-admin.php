#!/usr/bin/env php
<?php

declare(strict_types=1);

use BudgetCentre\Database\ConnectionFactory;
use BudgetCentre\Support\Input;

require dirname(__DIR__) . '/src/bootstrap.php';

$options = options($argv);
if (isset($options['help'])) {
    help();
    exit(0);
}

if (!isset($options['yes'])) {
    fwrite(STDERR, "Refusing to change admin access without --yes.\n");
    exit(2);
}

$email = isset($options['email']) ? Input::normalizedEmail($options['email']) : null;
$username = isset($options['username']) ? Input::username($options['username']) : null;
if (($email === null && $username === null) || ($email !== null && $username !== null)) {
    fwrite(STDERR, "Provide exactly one of --email or --username.\n");
    exit(2);
}

$isAdmin = isset($options['revoke']) ? 0 : 1;
$pdo = ConnectionFactory::make();
$sql = $email !== null
    ? 'UPDATE users SET is_admin = :is_admin WHERE email = :identifier'
    : 'UPDATE users SET is_admin = :is_admin WHERE username = :identifier';
$statement = $pdo->prepare($sql);
$statement->execute([
    'is_admin' => $isAdmin,
    'identifier' => $email ?? $username,
]);

if ($statement->rowCount() === 0) {
    fwrite(STDERR, "No matching user was updated.\n");
    exit(4);
}

echo $isAdmin === 1 ? "Admin access granted.\n" : "Admin access revoked.\n";

function options(array $argv): array
{
    $options = [];
    foreach (array_slice($argv, 1) as $argument) {
        if ($argument === '--yes' || $argument === '-y') {
            $options['yes'] = true;
            continue;
        }

        if ($argument === '--revoke') {
            $options['revoke'] = true;
            continue;
        }

        if ($argument === '--help' || $argument === '-h') {
            $options['help'] = true;
            continue;
        }

        if (str_starts_with($argument, '--email=')) {
            $options['email'] = substr($argument, strlen('--email='));
            continue;
        }

        if (str_starts_with($argument, '--username=')) {
            $options['username'] = substr($argument, strlen('--username='));
            continue;
        }

        throw new RuntimeException("Unknown option: {$argument}");
    }

    return $options;
}

function help(): void
{
    echo <<<'TEXT'
Usage:
  php bin/grant-admin.php --email=user@example.com --yes
  php bin/grant-admin.php --username=admin --yes
  php bin/grant-admin.php --email=user@example.com --revoke --yes

This script updates users.is_admin in the configured database.
It does not create the database or create users.

TEXT;
}
