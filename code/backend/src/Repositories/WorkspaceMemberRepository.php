<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class WorkspaceMemberRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function listForWorkspace(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              wm.id,
              wm.workspace_id,
              wm.user_id,
              wm.status,
              wm.joined_at,
              u.email,
              u.display_name,
              r.role_key AS role
            FROM workspace_members wm
            INNER JOIN users u ON u.id = wm.user_id
            INNER JOIN roles r ON r.id = wm.role_id
            WHERE wm.workspace_id = :workspace_id
              AND wm.status = 'active'
            ORDER BY
              FIELD(r.role_key, 'owner', 'admin', 'editor', 'auditor', 'viewer'),
              u.display_name ASC
            SQL
        );
        $statement->execute(['workspace_id' => $workspaceId]);

        return array_map(
            fn (array $row): array => $this->memberFromRow($row),
            $statement->fetchAll(),
        );
    }

    public function find(int $workspaceId, int $userId): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              wm.id,
              wm.workspace_id,
              wm.user_id,
              wm.status,
              wm.joined_at,
              u.email,
              u.display_name,
              r.role_key AS role
            FROM workspace_members wm
            INNER JOIN users u ON u.id = wm.user_id
            INNER JOIN roles r ON r.id = wm.role_id
            WHERE wm.workspace_id = :workspace_id
              AND wm.user_id = :user_id
              AND wm.status = 'active'
            LIMIT 1
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
        ]);
        $row = $statement->fetch();

        return $row === false ? null : $this->memberFromRow($row);
    }

    public function add(int $workspaceId, int $userId, string $roleKey): void
    {
        $roleId = $this->workspaceRoleId($roleKey);
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO workspace_members (
              workspace_id,
              user_id,
              role_id,
              status,
              joined_at
            ) VALUES (
              :workspace_id,
              :user_id,
              :role_id,
              'active',
              UTC_TIMESTAMP()
            )
            ON DUPLICATE KEY UPDATE
              role_id = VALUES(role_id),
              status = 'active',
              joined_at = COALESCE(workspace_members.joined_at, UTC_TIMESTAMP())
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'role_id' => $roleId,
        ]);
    }

    public function updateRole(int $workspaceId, int $userId, string $roleKey): void
    {
        $roleId = $this->workspaceRoleId($roleKey);
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE workspace_members
            SET role_id = :role_id
            WHERE workspace_id = :workspace_id
              AND user_id = :user_id
              AND status = 'active'
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'role_id' => $roleId,
        ]);
    }

    public function remove(int $workspaceId, int $userId): void
    {
        $workgroupStatement = $this->pdo->prepare(
            <<<'SQL'
            DELETE wgm
            FROM workgroup_members wgm
            INNER JOIN workgroups wg ON wg.id = wgm.workgroup_id
            WHERE wg.workspace_id = :workspace_id
              AND wgm.user_id = :user_id
            SQL
        );
        $workgroupStatement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
        ]);

        $statement = $this->pdo->prepare(
            <<<'SQL'
            DELETE FROM workspace_members
            WHERE workspace_id = :workspace_id
              AND user_id = :user_id
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
        ]);
    }

    private function workspaceRoleId(string $roleKey): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT id
            FROM roles
            WHERE role_key = :role_key
              AND scope = 'workspace'
            LIMIT 1
            SQL
        );
        $statement->execute(['role_key' => $roleKey]);
        $roleId = $statement->fetchColumn();

        if ($roleId === false) {
            throw new MissingSeedDataException('Missing workspace role. Run database/002_seed_currencies.sql.');
        }

        return (int) $roleId;
    }

    private function memberFromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'workspaceId' => (int) $row['workspace_id'],
            'userId' => (int) $row['user_id'],
            'email' => $row['email'],
            'displayName' => $row['display_name'],
            'role' => $row['role'],
            'status' => $row['status'],
            'joinedAt' => $row['joined_at'],
        ];
    }
}
