<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class UserSsoBindingRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function findByUserId(int $userId): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              user_id,
              provider,
              provider_subject,
              provider_username,
              provider_email,
              linked_at,
              updated_at
            FROM user_sso_bindings
            WHERE user_id = :user_id
              AND provider = 'casdoor'
            LIMIT 1
            SQL
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function findByProviderSubject(string $providerSubject): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              user_id,
              provider,
              provider_subject,
              provider_username,
              provider_email,
              linked_at,
              updated_at
            FROM user_sso_bindings
            WHERE provider = 'casdoor'
              AND provider_subject = :provider_subject
            LIMIT 1
            SQL
        );
        $statement->execute(['provider_subject' => $providerSubject]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function upsert(
        int $userId,
        string $providerSubject,
        ?string $providerUsername,
        ?string $providerEmail,
        array $rawUserinfo,
    ): array {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO user_sso_bindings (
              user_id,
              provider,
              provider_subject,
              provider_username,
              provider_email,
              raw_userinfo_json
            ) VALUES (
              :user_id,
              'casdoor',
              :provider_subject,
              :provider_username,
              :provider_email,
              :raw_userinfo_json
            )
            ON DUPLICATE KEY UPDATE
              provider_subject = VALUES(provider_subject),
              provider_username = VALUES(provider_username),
              provider_email = VALUES(provider_email),
              raw_userinfo_json = VALUES(raw_userinfo_json),
              updated_at = CURRENT_TIMESTAMP
            SQL
        );
        $statement->execute([
            'user_id' => $userId,
            'provider_subject' => $providerSubject,
            'provider_username' => $providerUsername,
            'provider_email' => $providerEmail,
            'raw_userinfo_json' => json_encode(
                $rawUserinfo,
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
            ),
        ]);

        return $this->findByUserId($userId) ?? [];
    }

    public function deleteByUserId(int $userId): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            DELETE FROM user_sso_bindings
            WHERE user_id = :user_id
              AND provider = 'casdoor'
            SQL
        );
        $statement->execute(['user_id' => $userId]);
    }
}
