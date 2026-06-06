<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class BudgetShareRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function listForBudget(int $budgetId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              bs.id,
              bs.budget_id,
              bs.principal_type,
              bs.principal_id,
              bs.can_export,
              bs.can_reshare,
              bs.expires_at,
              bs.created_by_user_id,
              bs.created_at,
              bs.updated_at,
              r.role_key AS role,
              u.email AS principal_email,
              u.display_name AS user_name,
              wg.name AS workgroup_name,
              w.name AS workspace_name,
              creator.display_name AS created_by_name
            FROM budget_shares bs
            INNER JOIN roles r ON r.id = bs.role_id
            LEFT JOIN users u
              ON bs.principal_type = 'user'
              AND u.id = bs.principal_id
            LEFT JOIN workgroups wg
              ON bs.principal_type = 'workgroup'
              AND wg.id = bs.principal_id
            LEFT JOIN workspaces w
              ON bs.principal_type = 'workspace'
              AND w.id = bs.principal_id
            LEFT JOIN users creator ON creator.id = bs.created_by_user_id
            WHERE bs.budget_id = :budget_id
            ORDER BY
              FIELD(bs.principal_type, 'workspace', 'workgroup', 'user'),
              COALESCE(w.name, wg.name, u.display_name, u.email) ASC,
              bs.id ASC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        return array_map(
            fn (array $row): array => $this->shareFromRow($row),
            $statement->fetchAll(),
        );
    }

    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              bs.id,
              bs.budget_id,
              bs.principal_type,
              bs.principal_id,
              bs.can_export,
              bs.can_reshare,
              bs.expires_at,
              bs.created_by_user_id,
              bs.created_at,
              bs.updated_at,
              r.role_key AS role,
              u.email AS principal_email,
              u.display_name AS user_name,
              wg.name AS workgroup_name,
              w.name AS workspace_name,
              creator.display_name AS created_by_name
            FROM budget_shares bs
            INNER JOIN roles r ON r.id = bs.role_id
            LEFT JOIN users u
              ON bs.principal_type = 'user'
              AND u.id = bs.principal_id
            LEFT JOIN workgroups wg
              ON bs.principal_type = 'workgroup'
              AND wg.id = bs.principal_id
            LEFT JOIN workspaces w
              ON bs.principal_type = 'workspace'
              AND w.id = bs.principal_id
            LEFT JOIN users creator ON creator.id = bs.created_by_user_id
            WHERE bs.id = :id
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $this->shareFromRow($row);
    }

    public function save(
        int $budgetId,
        string $principalType,
        int $principalId,
        string $role,
        bool $canExport,
        bool $canReshare,
        ?string $expiresAt,
        int $createdByUserId,
    ): void {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_shares (
              budget_id,
              principal_type,
              principal_id,
              role_id,
              can_export,
              can_reshare,
              expires_at,
              created_by_user_id
            ) VALUES (
              :budget_id,
              :principal_type,
              :principal_id,
              :role_id,
              :can_export,
              :can_reshare,
              :expires_at,
              :created_by_user_id
            )
            ON DUPLICATE KEY UPDATE
              role_id = VALUES(role_id),
              can_export = VALUES(can_export),
              can_reshare = VALUES(can_reshare),
              expires_at = VALUES(expires_at),
              updated_at = UTC_TIMESTAMP()
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'principal_type' => $principalType,
            'principal_id' => $principalId,
            'role_id' => $this->budgetRoleId($role),
            'can_export' => $canExport ? 1 : 0,
            'can_reshare' => $canReshare ? 1 : 0,
            'expires_at' => $expiresAt,
            'created_by_user_id' => $createdByUserId,
        ]);
    }

    public function delete(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM budget_shares WHERE id = :id');
        $statement->execute(['id' => $id]);
    }

    public function effectiveForUser(int $budgetId, int $workspaceId, int $userId): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              r.role_key AS role,
              bs.can_export,
              bs.can_reshare
            FROM budget_shares bs
            INNER JOIN roles r ON r.id = bs.role_id
            LEFT JOIN workgroups wg
              ON bs.principal_type = 'workgroup'
              AND wg.id = bs.principal_id
            LEFT JOIN workgroup_members wgm
              ON wgm.workgroup_id = wg.id
              AND wgm.user_id = :user_id
            WHERE bs.budget_id = :budget_id
              AND (bs.expires_at IS NULL OR bs.expires_at > UTC_TIMESTAMP())
              AND (
                (bs.principal_type = 'workspace' AND bs.principal_id = :workspace_id)
                OR (bs.principal_type = 'user' AND bs.principal_id = :user_id_direct)
                OR (
                  bs.principal_type = 'workgroup'
                  AND wg.workspace_id = :workspace_id_for_group
                  AND wgm.user_id IS NOT NULL
                )
              )
            ORDER BY
              FIELD(r.role_key, 'owner', 'editor', 'viewer', 'auditor'),
              bs.can_reshare DESC,
              bs.can_export DESC
            LIMIT 1
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'workspace_id' => $workspaceId,
            'workspace_id_for_group' => $workspaceId,
            'user_id' => $userId,
            'user_id_direct' => $userId,
        ]);
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        return [
            'role' => $row['role'],
            'canExport' => (bool) $row['can_export'],
            'canReshare' => (bool) $row['can_reshare'],
        ];
    }

    private function budgetRoleId(string $role): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT id
            FROM roles
            WHERE role_key = :role_key
              AND scope = 'budget'
            LIMIT 1
            SQL
        );
        $statement->execute(['role_key' => $role]);
        $roleId = $statement->fetchColumn();

        if ($roleId === false) {
            throw new MissingSeedDataException('Missing budget role. Run database/002_seed_currencies.sql.');
        }

        return (int) $roleId;
    }

    private function shareFromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'budgetId' => (int) $row['budget_id'],
            'principalType' => $row['principal_type'],
            'principalId' => (int) $row['principal_id'],
            'principalName' => $this->principalName($row),
            'principalEmail' => $row['principal_email'],
            'role' => $row['role'],
            'canExport' => (bool) $row['can_export'],
            'canReshare' => (bool) $row['can_reshare'],
            'expiresAt' => $row['expires_at'],
            'createdByUserId' => (int) $row['created_by_user_id'],
            'createdByName' => $row['created_by_name'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }

    private function principalName(array $row): string
    {
        return match ($row['principal_type']) {
            'workspace' => (string) ($row['workspace_name'] ?? 'Workspace'),
            'workgroup' => (string) ($row['workgroup_name'] ?? 'Workgroup'),
            'user' => (string) ($row['user_name'] ?? $row['principal_email'] ?? 'User'),
            default => 'Principal',
        };
    }
}
