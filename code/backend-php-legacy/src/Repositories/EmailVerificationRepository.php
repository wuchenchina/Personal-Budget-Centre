<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use DateTimeImmutable;
use PDO;

final readonly class EmailVerificationRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function create(int $userId, string $tokenHash, DateTimeImmutable $expiresAt): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO email_verification_tokens (
              user_id,
              token_hash,
              expires_at
            ) VALUES (
              :user_id,
              :token_hash,
              :expires_at
            )
            SQL
        );
        $statement->execute([
            'user_id' => $userId,
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);
    }

    public function activeByTokenHash(string $tokenHash): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              evt.id,
              evt.user_id,
              u.email,
              u.username,
              u.display_name,
              u.email_verified_at
            FROM email_verification_tokens evt
            INNER JOIN users u ON u.id = evt.user_id
            WHERE evt.token_hash = :token_hash
              AND evt.used_at IS NULL
              AND evt.expires_at > CURRENT_TIMESTAMP
            LIMIT 1
            SQL
        );
        $statement->execute(['token_hash' => $tokenHash]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function byTokenHash(string $tokenHash): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              evt.id,
              evt.user_id,
              evt.used_at,
              evt.expires_at,
              u.email,
              u.username,
              u.display_name,
              u.email_verified_at
            FROM email_verification_tokens evt
            INNER JOIN users u ON u.id = evt.user_id
            WHERE evt.token_hash = :token_hash
            LIMIT 1
            SQL
        );
        $statement->execute(['token_hash' => $tokenHash]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function markUsed(int $id): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = :id'
        );
        $statement->execute(['id' => $id]);
    }
}
