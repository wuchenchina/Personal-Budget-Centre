<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class SessionRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function create(
        int $userId,
        string $tokenHash,
        ?string $ipAddress,
        ?string $userAgent,
        string $expiresAt,
        ?int $currentWorkspaceId = null,
    ): void {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO user_sessions (
              user_id,
              current_workspace_id,
              session_token_hash,
              ip_address,
              user_agent,
              expires_at
            ) VALUES (
              :user_id,
              :current_workspace_id,
              :session_token_hash,
              :ip_address,
              :user_agent,
              :expires_at
            )
            SQL
        );
        $statement->bindValue('user_id', $userId, PDO::PARAM_INT);
        $statement->bindValue(
            'current_workspace_id',
            $currentWorkspaceId,
            $currentWorkspaceId === null ? PDO::PARAM_NULL : PDO::PARAM_INT,
        );
        $statement->bindValue('session_token_hash', $tokenHash);
        $statement->bindValue('ip_address', $this->packedIp($ipAddress), PDO::PARAM_LOB);
        $statement->bindValue('user_agent', $userAgent);
        $statement->bindValue('expires_at', $expiresAt);
        $statement->execute();
    }

    public function findActiveByTokenHash(string $tokenHash): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              us.id,
              us.user_id,
              us.current_workspace_id,
              us.expires_at,
              u.email,
              u.username,
              u.display_name,
              u.avatar_url,
              u.timezone,
              u.locale,
              u.status,
              u.is_admin,
              u.email_verified_at
            FROM user_sessions us
            INNER JOIN users u ON u.id = us.user_id
            WHERE us.session_token_hash = :session_token_hash
              AND us.expires_at > UTC_TIMESTAMP()
              AND u.status = 'active'
            LIMIT 1
            SQL
        );
        $statement->execute(['session_token_hash' => $tokenHash]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function updateCurrentWorkspaceByTokenHash(string $tokenHash, ?int $workspaceId): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE user_sessions
            SET current_workspace_id = :workspace_id
            WHERE session_token_hash = :session_token_hash
            SQL
        );
        $statement->bindValue(
            'workspace_id',
            $workspaceId,
            $workspaceId === null ? PDO::PARAM_NULL : PDO::PARAM_INT,
        );
        $statement->bindValue('session_token_hash', $tokenHash);
        $statement->execute();
    }

    public function deleteByTokenHash(string $tokenHash): void
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM user_sessions WHERE session_token_hash = :session_token_hash'
        );
        $statement->execute(['session_token_hash' => $tokenHash]);
    }

    private function packedIp(?string $ipAddress): ?string
    {
        if ($ipAddress === null || $ipAddress === '') {
            return null;
        }

        $packed = inet_pton($ipAddress);
        return $packed === false ? null : $packed;
    }
}
