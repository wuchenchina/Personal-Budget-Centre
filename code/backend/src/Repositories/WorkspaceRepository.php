<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class WorkspaceRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function createPersonalWorkspace(int $userId, string $name, ?int $currencyId): int
    {
        return $this->createWorkspace($userId, $name, 'personal', $currencyId);
    }

    public function createWorkspace(int $userId, string $name, string $type, ?int $currencyId): int
    {
        $roleId = $this->workspaceOwnerRoleId();

        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO workspaces (
              owner_user_id,
              name,
              type,
              default_currency_id
            ) VALUES (
              :owner_user_id,
              :name,
              :type,
              :default_currency_id
            )
            SQL
        );
        $statement->execute([
            'owner_user_id' => $userId,
            'name' => $name,
            'type' => $type,
            'default_currency_id' => $currencyId,
        ]);

        $workspaceId = (int) $this->pdo->lastInsertId();
        $memberStatement = $this->pdo->prepare(
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
            SQL
        );
        $memberStatement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'role_id' => $roleId,
        ]);

        return $workspaceId;
    }

    public function firstForUser(int $userId): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              w.id,
              w.name,
              w.type,
              wm.status,
              r.role_key AS role,
              c.code AS default_currency
            FROM workspace_members wm
            INNER JOIN workspaces w ON w.id = wm.workspace_id
            INNER JOIN roles r ON r.id = wm.role_id
            LEFT JOIN currencies c ON c.id = w.default_currency_id
            WHERE wm.user_id = :user_id
              AND wm.status = 'active'
            ORDER BY w.created_at ASC
            LIMIT 1
            SQL
        );
        $statement->execute(['user_id' => $userId]);
        $row = $statement->fetch();

        return $row === false ? null : $this->workspaceFromRow($row);
    }

    public function findForUser(int $workspaceId, int $userId): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              w.id,
              w.name,
              w.type,
              wm.status,
              r.role_key AS role,
              c.code AS default_currency
            FROM workspace_members wm
            INNER JOIN workspaces w ON w.id = wm.workspace_id
            INNER JOIN roles r ON r.id = wm.role_id
            LEFT JOIN currencies c ON c.id = w.default_currency_id
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

        return $row === false ? null : $this->workspaceFromRow($row);
    }

    public function listForUser(int $userId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              w.id,
              w.name,
              w.type,
              wm.status,
              r.role_key AS role,
              c.code AS default_currency
            FROM workspace_members wm
            INNER JOIN workspaces w ON w.id = wm.workspace_id
            INNER JOIN roles r ON r.id = wm.role_id
            LEFT JOIN currencies c ON c.id = w.default_currency_id
            WHERE wm.user_id = :user_id
              AND wm.status = 'active'
            ORDER BY w.created_at ASC
            SQL
        );
        $statement->execute(['user_id' => $userId]);

        return array_map(
            fn (array $row): array => $this->workspaceFromRow($row),
            $statement->fetchAll(),
        );
    }

    public function roleForUser(int $workspaceId, int $userId): ?string
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT r.role_key
            FROM workspace_members wm
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
        $role = $statement->fetchColumn();

        return $role === false ? null : (string) $role;
    }

    private function workspaceOwnerRoleId(): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT id
            FROM roles
            WHERE role_key = 'owner'
              AND scope = 'workspace'
            LIMIT 1
            SQL
        );
        $statement->execute();
        $roleId = $statement->fetchColumn();

        if ($roleId === false) {
            throw new MissingSeedDataException('Missing workspace owner role. Run database/002_seed_currencies.sql.');
        }

        return (int) $roleId;
    }

    private function workspaceFromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'type' => $row['type'],
            'role' => $row['role'],
            'status' => $row['status'],
            'defaultCurrency' => $row['default_currency'],
        ];
    }
}
