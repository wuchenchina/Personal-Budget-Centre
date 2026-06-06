<?php

declare(strict_types=1);

namespace BudgetCentre\Database;

use BudgetCentre\Support\Env;
use PDO;

final class ConnectionFactory
{
    public static function make(): PDO
    {
        $host = Env::string('DB_HOST', '127.0.0.1');
        $port = Env::int('DB_PORT', 3306);
        $database = Env::string('DB_NAME');
        $user = Env::string('DB_USER', 'root');
        $password = Env::string('DB_PASSWORD', '');

        if ($database === null) {
            throw new DatabaseConfigurationException('DB_NAME is not configured.');
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $host,
            $port,
            $database,
        );

        return new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}
