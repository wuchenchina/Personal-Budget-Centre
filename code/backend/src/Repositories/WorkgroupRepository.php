<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class WorkgroupRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function listForWorkspace(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              wg.id,
              wg.workspace_id,
              wg.name,
              wg.description,
              COUNT(wgm.id) AS member_count
            FROM workgroups wg
            LEFT JOIN workgroup_members wgm ON wgm.workgroup_id = wg.id
            WHERE wg.workspace_id = :workspace_id
            GROUP BY wg.id, wg.workspace_id, wg.name, wg.description
            ORDER BY wg.name ASC
            SQL
        );
        $statement->execute(['workspace_id' => $workspaceId]);

        return array_map(
            fn (array $row): array => $this->workgroupFromRow($row),
            $statement->fetchAll(),
        );
    }

    public function create(int $workspaceId, int $userId, string $name, ?string $description): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO workgroups (
              workspace_id,
              name,
              description,
              created_by_user_id
            ) VALUES (
              :workspace_id,
              :name,
              :description,
              :created_by_user_id
            )
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'name' => $name,
            'description' => $description,
            'created_by_user_id' => $userId,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function update(int $id, string $name, ?string $description): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE workgroups
            SET
              name = :name,
              description = :description
            WHERE id = :id
            SQL
        );
        $statement->execute([
            'id' => $id,
            'name' => $name,
            'description' => $description,
        ]);
    }

    public function delete(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM workgroups WHERE id = :id');
        $statement->execute(['id' => $id]);
    }

    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              wg.id,
              wg.workspace_id,
              wg.name,
              wg.description,
              COUNT(wgm.id) AS member_count
            FROM workgroups wg
            LEFT JOIN workgroup_members wgm ON wgm.workgroup_id = wg.id
            WHERE wg.id = :id
            GROUP BY wg.id, wg.workspace_id, wg.name, wg.description
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $this->workgroupFromRow($row);
    }

    public function workspaceIdForWorkgroup(int $id): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT workspace_id FROM workgroups WHERE id = :id LIMIT 1'
        );
        $statement->execute(['id' => $id]);
        $workspaceId = $statement->fetchColumn();

        return $workspaceId === false ? null : (int) $workspaceId;
    }

    private function workgroupFromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'workspaceId' => (int) $row['workspace_id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'memberCount' => (int) $row['member_count'],
        ];
    }
}
