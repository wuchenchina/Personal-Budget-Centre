<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;
use PDOException;
use BudgetCentre\Support\Input;

final readonly class BudgetCategoryRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function listForWorkspace(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              bc.id,
              bc.workspace_id,
              bc.name,
              bc.parent_id,
              bc.sort_order,
              bc.is_preset,
              bc.is_active,
              c.code AS default_currency
            FROM budget_categories bc
            LEFT JOIN currencies c ON c.id = bc.default_currency_id
            WHERE bc.workspace_id = :workspace_id
              AND bc.is_preset = 1
            ORDER BY bc.sort_order ASC, bc.name ASC, bc.id ASC
            SQL
        );
        $statement->execute(['workspace_id' => $workspaceId]);

        $categories = array_map(
            fn (array $row): array => [
                'id' => (int) $row['id'],
                'workspaceId' => (int) $row['workspace_id'],
                'name' => $row['name'],
                'parentId' => $row['parent_id'] === null ? null : (int) $row['parent_id'],
                'defaultCurrency' => $row['default_currency'],
                'sortOrder' => (int) $row['sort_order'],
                'isPreset' => (bool) $row['is_preset'],
                'isActive' => (bool) $row['is_active'],
                'aliases' => [],
            ],
            $statement->fetchAll(),
        );

        $aliases = $this->aliasesForWorkspace($workspaceId);
        foreach ($categories as $index => $category) {
            $categories[$index]['aliases'] = $aliases[$category['id']] ?? [];
        }

        return $categories;
    }

    public function create(
        int $workspaceId,
        int $userId,
        string $name,
        ?int $defaultCurrencyId,
        int $sortOrder,
        bool $isPreset = true,
    ): int {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_categories (
              workspace_id,
              user_id,
              name,
              default_currency_id,
              sort_order,
              is_preset
            ) VALUES (
              :workspace_id,
              :user_id,
              :name,
              :default_currency_id,
              :sort_order,
              :is_preset
            )
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'name' => $name,
            'default_currency_id' => $defaultCurrencyId,
            'sort_order' => $sortOrder,
            'is_preset' => $isPreset ? 1 : 0,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function createPreset(
        int $workspaceId,
        int $userId,
        string $name,
        ?int $defaultCurrencyId,
        int $sortOrder,
    ): int {
        $normalizedName = trim($name);
        $existingId = $this->findIdByName($workspaceId, $normalizedName);
        if ($existingId !== null) {
            $this->promoteToPreset($existingId, $normalizedName, $defaultCurrencyId, $sortOrder);

            return $existingId;
        }

        try {
            return $this->create($workspaceId, $userId, $normalizedName, $defaultCurrencyId, $sortOrder);
        } catch (PDOException $exception) {
            $existingId = $this->findIdByName($workspaceId, $normalizedName);
            if ($existingId !== null) {
                $this->promoteToPreset($existingId, $normalizedName, $defaultCurrencyId, $sortOrder);

                return $existingId;
            }

            throw $exception;
        }
    }

    public function update(int $id, string $name, ?int $defaultCurrencyId, int $sortOrder, bool $isActive): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE budget_categories
            SET
              name = :name,
              default_currency_id = :default_currency_id,
              sort_order = :sort_order,
              is_active = :is_active
            WHERE id = :id
            SQL
        );
        $statement->execute([
            'id' => $id,
            'name' => $name,
            'default_currency_id' => $defaultCurrencyId,
            'sort_order' => $sortOrder,
            'is_active' => $isActive ? 1 : 0,
        ]);
    }

    public function delete(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM budget_categories WHERE id = :id');
        $statement->execute(['id' => $id]);
    }

    /**
     * @param list<int> $ids
     */
    public function deleteMany(array $ids): void
    {
        if ($ids === []) {
            return;
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $this->pdo->prepare("DELETE FROM budget_categories WHERE id IN ({$placeholders})");
        $statement->execute($ids);
    }

    public function createAlias(int $workspaceId, int $userId, int $categoryId, string $alias): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_category_aliases (
              workspace_id,
              user_id,
              category_id,
              alias
            ) VALUES (
              :workspace_id,
              :user_id,
              :category_id,
              :alias
            )
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'category_id' => $categoryId,
            'alias' => $alias,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function deleteAlias(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM budget_category_aliases WHERE id = :id');
        $statement->execute(['id' => $id]);
    }

    public function workspaceIdForCategory(int $id): ?int
    {
        return $this->workspaceIdForTable('budget_categories', $id);
    }

    public function workspaceIdForAlias(int $id): ?int
    {
        return $this->workspaceIdForTable('budget_category_aliases', $id);
    }

    public function resolveCategoryId(int $workspaceId, ?int $categoryId, string $text): ?int
    {
        if ($categoryId !== null) {
            return $this->workspaceIdForCategory($categoryId) === $workspaceId ? $categoryId : null;
        }

        $normalized = Input::lowercase($text);
        if ($normalized === '') {
            return null;
        }

        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT id
            FROM budget_categories
            WHERE workspace_id = :workspace_id
              AND is_active = 1
              AND LOWER(name) = :text
            LIMIT 1
            SQL
        );
        $statement->execute(['workspace_id' => $workspaceId, 'text' => $normalized]);
        $id = $statement->fetchColumn();
        if ($id !== false) {
            return (int) $id;
        }

        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT category_id
            FROM budget_category_aliases
            WHERE workspace_id = :workspace_id
              AND LOWER(alias) = :text
            LIMIT 1
            SQL
        );
        $statement->execute(['workspace_id' => $workspaceId, 'text' => $normalized]);
        $aliasId = $statement->fetchColumn();

        return $aliasId === false ? null : (int) $aliasId;
    }

    public function findOrCreateForBudgetItemName(int $workspaceId, int $userId, string $name): int
    {
        $normalizedName = trim($name);
        $existingId = $this->findIdByName($workspaceId, $normalizedName);
        if ($existingId !== null) {
            return $existingId;
        }

        try {
            return $this->create($workspaceId, $userId, $normalizedName, null, 0, false);
        } catch (PDOException $exception) {
            $existingId = $this->findIdByName($workspaceId, $normalizedName);
            if ($existingId !== null) {
                return $existingId;
            }

            throw $exception;
        }
    }

    private function findIdByName(int $workspaceId, string $name): ?int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT id
            FROM budget_categories
            WHERE workspace_id = :workspace_id
              AND LOWER(name) = :name
            LIMIT 1
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'name' => Input::lowercase($name),
        ]);
        $id = $statement->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    private function promoteToPreset(int $id, string $name, ?int $defaultCurrencyId, int $sortOrder): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE budget_categories
            SET
              name = :name,
              default_currency_id = :default_currency_id,
              sort_order = :sort_order,
              is_preset = 1,
              is_active = 1
            WHERE id = :id
            SQL
        );
        $statement->execute([
            'id' => $id,
            'name' => $name,
            'default_currency_id' => $defaultCurrencyId,
            'sort_order' => $sortOrder,
        ]);
    }

    private function aliasesForWorkspace(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT id, category_id, alias, created_at
            FROM budget_category_aliases
            WHERE workspace_id = :workspace_id
            ORDER BY alias ASC, id ASC
            SQL
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        $aliases = [];
        foreach ($statement->fetchAll() as $row) {
            $categoryId = (int) $row['category_id'];
            $aliases[$categoryId][] = [
                'id' => (int) $row['id'],
                'categoryId' => $categoryId,
                'alias' => $row['alias'],
                'createdAt' => $row['created_at'],
            ];
        }

        return $aliases;
    }

    private function workspaceIdForTable(string $table, int $id): ?int
    {
        $statement = $this->pdo->prepare(
            "SELECT workspace_id FROM {$table} WHERE id = :id LIMIT 1"
        );
        $statement->execute(['id' => $id]);
        $workspaceId = $statement->fetchColumn();

        return $workspaceId === false ? null : (int) $workspaceId;
    }
}
