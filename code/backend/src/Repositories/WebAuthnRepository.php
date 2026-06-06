<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class WebAuthnRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function createChallenge(?int $userId, string $challenge, string $type, string $expiresAt): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO webauthn_challenges (
              user_id,
              challenge,
              type,
              expires_at
            ) VALUES (
              :user_id,
              :challenge,
              :type,
              :expires_at
            )
            SQL
        );
        $statement->execute([
            'user_id' => $userId,
            'challenge' => $challenge,
            'type' => $type,
            'expires_at' => $expiresAt,
        ]);
    }

    public function consumeChallenge(string $challenge, string $type, ?int $userId = null): ?array
    {
        $userFilter = $userId === null ? '' : ' AND user_id = :user_id';
        $statement = $this->pdo->prepare(
            <<<SQL
            SELECT id, user_id, challenge, type
            FROM webauthn_challenges
            WHERE challenge = :challenge
              AND type = :type
              AND used_at IS NULL
              AND expires_at > UTC_TIMESTAMP()
              {$userFilter}
            LIMIT 1
            SQL
        );
        $parameters = [
            'challenge' => $challenge,
            'type' => $type,
        ];
        if ($userId !== null) {
            $parameters['user_id'] = $userId;
        }
        $statement->execute($parameters);
        $row = $statement->fetch();
        if ($row === false) {
            return null;
        }

        $this->pdo->prepare(
            'UPDATE webauthn_challenges SET used_at = UTC_TIMESTAMP() WHERE id = :id'
        )->execute(['id' => (int) $row['id']]);

        return [
            'id' => (int) $row['id'],
            'userId' => $row['user_id'] === null ? null : (int) $row['user_id'],
            'challenge' => $row['challenge'],
            'type' => $row['type'],
        ];
    }

    public function createCredential(
        int $userId,
        string $credentialId,
        string $credentialJson,
        int $signCount,
        array $transports,
        string $attestationType,
        array $trustPath,
        bool $backupEligible,
        bool $backupState,
        ?string $deviceName,
    ): int {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO webauthn_credentials (
              user_id,
              credential_id,
              public_key,
              sign_count,
              transports_json,
              attestation_type,
              trust_path_json,
              backup_eligible,
              backup_state,
              device_name
            ) VALUES (
              :user_id,
              :credential_id,
              :public_key,
              :sign_count,
              :transports_json,
              :attestation_type,
              :trust_path_json,
              :backup_eligible,
              :backup_state,
              :device_name
            )
            SQL
        );
        $statement->execute([
            'user_id' => $userId,
            'credential_id' => $credentialId,
            'public_key' => $credentialJson,
            'sign_count' => $signCount,
            'transports_json' => json_encode($transports, JSON_THROW_ON_ERROR),
            'attestation_type' => $attestationType,
            'trust_path_json' => json_encode($trustPath, JSON_THROW_ON_ERROR),
            'backup_eligible' => $backupEligible ? 1 : 0,
            'backup_state' => $backupState ? 1 : 0,
            'device_name' => $deviceName,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function listForUser(int $userId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              user_id,
              credential_id,
              sign_count,
              transports_json,
              backup_eligible,
              backup_state,
              device_name,
              last_used_at,
              created_at
            FROM webauthn_credentials
            WHERE user_id = :user_id
            ORDER BY created_at DESC, id DESC
            SQL
        );
        $statement->execute(['user_id' => $userId]);

        return array_map(
            fn (array $row): array => $this->publicCredential($row),
            $statement->fetchAll(),
        );
    }

    public function findByCredentialId(string $credentialId): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT *
            FROM webauthn_credentials
            WHERE credential_id = :credential_id
            LIMIT 1
            SQL
        );
        $statement->execute(['credential_id' => $credentialId]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function rowsForUser(int $userId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT *
            FROM webauthn_credentials
            WHERE user_id = :user_id
            ORDER BY created_at DESC, id DESC
            SQL
        );
        $statement->execute(['user_id' => $userId]);

        return $statement->fetchAll();
    }

    public function credentialIdExists(string $credentialId): bool
    {
        return $this->findByCredentialId($credentialId) !== null;
    }

    public function updateCredentialAfterLogin(
        int $id,
        string $credentialJson,
        int $signCount,
        bool $backupEligible,
        bool $backupState,
    ): void {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE webauthn_credentials
            SET
              public_key = :public_key,
              sign_count = :sign_count,
              backup_eligible = :backup_eligible,
              backup_state = :backup_state,
              last_used_at = UTC_TIMESTAMP()
            WHERE id = :id
            SQL
        );
        $statement->execute([
            'id' => $id,
            'public_key' => $credentialJson,
            'sign_count' => $signCount,
            'backup_eligible' => $backupEligible ? 1 : 0,
            'backup_state' => $backupState ? 1 : 0,
        ]);
    }

    public function updateDeviceName(int $id, int $userId, ?string $deviceName): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE webauthn_credentials SET device_name = :device_name WHERE id = :id AND user_id = :user_id'
        );
        $statement->execute([
            'id' => $id,
            'user_id' => $userId,
            'device_name' => $deviceName,
        ]);
    }

    public function deleteCredential(int $id, int $userId): void
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM webauthn_credentials WHERE id = :id AND user_id = :user_id'
        );
        $statement->execute(['id' => $id, 'user_id' => $userId]);
    }

    private function publicCredential(array $row): array
    {
        $transports = json_decode((string) ($row['transports_json'] ?? '[]'), true);

        return [
            'id' => (int) $row['id'],
            'userId' => (int) $row['user_id'],
            'credentialId' => rtrim(strtr(base64_encode($row['credential_id']), '+/', '-_'), '='),
            'signCount' => (int) $row['sign_count'],
            'transports' => is_array($transports) ? $transports : [],
            'backupEligible' => (bool) $row['backup_eligible'],
            'backupState' => (bool) $row['backup_state'],
            'deviceName' => $row['device_name'],
            'lastUsedAt' => $row['last_used_at'],
            'createdAt' => $row['created_at'],
        ];
    }
}
