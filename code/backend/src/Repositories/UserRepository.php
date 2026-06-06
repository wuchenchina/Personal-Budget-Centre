<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class UserRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function findByEmail(string $email): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              password_hash,
              display_name,
              timezone,
              locale,
              status
            FROM users
            WHERE email = :email
            LIMIT 1
            SQL
        );
        $statement->execute(['email' => $email]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function findById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              display_name,
              timezone,
              locale,
              status
            FROM users
            WHERE id = :id
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function create(string $email, string $passwordHash, string $displayName, ?int $currencyId): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO users (
              email,
              password_hash,
              display_name,
              default_currency_id
            ) VALUES (
              :email,
              :password_hash,
              :display_name,
              :default_currency_id
            )
            SQL
        );
        $statement->execute([
            'email' => $email,
            'password_hash' => $passwordHash,
            'display_name' => $displayName,
            'default_currency_id' => $currencyId,
        ]);

        return (int) $this->pdo->lastInsertId();
    }
}
