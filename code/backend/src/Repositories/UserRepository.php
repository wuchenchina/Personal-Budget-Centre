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
              username,
              password_hash,
              display_name,
              timezone,
              locale,
              status,
              is_admin,
              email_verified_at
            FROM users
            WHERE email = :email
            LIMIT 1
            SQL
        );
        $statement->execute(['email' => $email]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function findByUsername(string $username): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              username,
              password_hash,
              display_name,
              timezone,
              locale,
              status,
              is_admin,
              email_verified_at
            FROM users
            WHERE username = :username
            LIMIT 1
            SQL
        );
        $statement->execute(['username' => $username]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function findByIdentifier(string $identifier): ?array
    {
        return str_contains($identifier, '@')
            ? $this->findByEmail(strtolower($identifier))
            : $this->findByUsername(strtolower($identifier));
    }

    public function findById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              username,
              display_name,
              timezone,
              locale,
              status,
              is_admin,
              email_verified_at
            FROM users
            WHERE id = :id
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function create(
        string $email,
        string $username,
        string $passwordHash,
        string $displayName,
        ?int $currencyId,
    ): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO users (
              email,
              username,
              password_hash,
              display_name,
              default_currency_id,
              status
            ) VALUES (
              :email,
              :username,
              :password_hash,
              :display_name,
              :default_currency_id,
              'pending'
            )
            SQL
        );
        $statement->execute([
            'email' => $email,
            'username' => $username,
            'password_hash' => $passwordHash,
            'display_name' => $displayName,
            'default_currency_id' => $currencyId,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function markEmailVerificationSent(int $userId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE users SET email_verification_sent_at = CURRENT_TIMESTAMP WHERE id = :id'
        );
        $statement->execute(['id' => $userId]);
    }

    public function markEmailVerified(int $userId): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE users
            SET email_verified_at = CURRENT_TIMESTAMP,
                status = 'active'
            WHERE id = :id
            SQL
        );
        $statement->execute(['id' => $userId]);
    }

    public function findAdminMailTargetById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              username,
              display_name,
              status,
              email_verified_at
            FROM users
            WHERE id = :id
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }
}
