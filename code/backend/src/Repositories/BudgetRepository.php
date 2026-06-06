<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class BudgetRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function listForWorkspace(int $workspaceId, int $userId, bool $includePrivate): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              b.id,
              b.workspace_id,
              b.title,
              b.owner_name,
              b.start_date,
              b.end_date,
              b.visibility,
              b.status,
              b.note,
              b.created_at,
              b.updated_at,
              base.code AS base_currency,
              display.code AS display_currency,
              bt.template_key,
              bt.name AS template_name,
              COALESCE(bit.total_budget_base, 0) AS total_budget_base,
              COALESCE(bit.total_estimated_base, 0) AS total_estimated_base,
              COALESCE(bit.total_variance_base, 0) AS total_variance_base,
              COALESCE(tx.transaction_count, 0) AS transaction_count,
              COALESCE(tx.transaction_total_base, 0) AS transaction_total_base
            FROM budgets b
            INNER JOIN currencies base ON base.id = b.base_currency_id
            INNER JOIN currencies display ON display.id = b.display_currency_id
            LEFT JOIN budget_templates bt ON bt.id = b.template_id
            LEFT JOIN v_budget_item_totals bit ON bit.budget_id = b.id
            LEFT JOIN (
              SELECT
                budget_id,
                COUNT(*) AS transaction_count,
                SUM(amount_base) AS transaction_total_base
              FROM budget_transactions
              GROUP BY budget_id
            ) tx ON tx.budget_id = b.id
            WHERE b.workspace_id = :workspace_id
              AND (
                :include_private = 1
                OR b.visibility <> 'private'
                OR b.user_id = :user_id
                OR b.owner_user_id = :owner_user_id
                OR b.created_by_user_id = :creator_user_id
              )
            ORDER BY b.start_date DESC, b.updated_at DESC, b.id DESC
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'owner_user_id' => $userId,
            'creator_user_id' => $userId,
            'include_private' => $includePrivate ? 1 : 0,
        ]);

        return array_map(
            fn (array $row): array => $this->budgetFromRow($row),
            $statement->fetchAll(),
        );
    }

    public function create(
        int $workspaceId,
        int $userId,
        int $ownerUserId,
        int $createdByUserId,
        ?int $templateId,
        string $title,
        string $ownerName,
        string $startDate,
        string $endDate,
        int $baseCurrencyId,
        int $displayCurrencyId,
        string $visibility,
        string $status,
        ?string $note,
    ): int {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budgets (
              workspace_id,
              user_id,
              owner_user_id,
              created_by_user_id,
              template_id,
              title,
              owner_name,
              start_date,
              end_date,
              base_currency_id,
              display_currency_id,
              visibility,
              status,
              note
            ) VALUES (
              :workspace_id,
              :user_id,
              :owner_user_id,
              :created_by_user_id,
              :template_id,
              :title,
              :owner_name,
              :start_date,
              :end_date,
              :base_currency_id,
              :display_currency_id,
              :visibility,
              :status,
              :note
            )
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'owner_user_id' => $ownerUserId,
            'created_by_user_id' => $createdByUserId,
            'template_id' => $templateId,
            'title' => $title,
            'owner_name' => $ownerName,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'base_currency_id' => $baseCurrencyId,
            'display_currency_id' => $displayCurrencyId,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function findForUser(int $budgetId, int $userId, bool $includePrivate): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              b.id,
              b.workspace_id,
              b.title,
              b.owner_name,
              b.start_date,
              b.end_date,
              b.visibility,
              b.status,
              b.note,
              b.created_at,
              b.updated_at,
              base.code AS base_currency,
              display.code AS display_currency,
              bt.template_key,
              bt.name AS template_name,
              COALESCE(bit.total_budget_base, 0) AS total_budget_base,
              COALESCE(bit.total_estimated_base, 0) AS total_estimated_base,
              COALESCE(bit.total_variance_base, 0) AS total_variance_base,
              COALESCE(tx.transaction_count, 0) AS transaction_count,
              COALESCE(tx.transaction_total_base, 0) AS transaction_total_base
            FROM budgets b
            INNER JOIN currencies base ON base.id = b.base_currency_id
            INNER JOIN currencies display ON display.id = b.display_currency_id
            LEFT JOIN budget_templates bt ON bt.id = b.template_id
            LEFT JOIN v_budget_item_totals bit ON bit.budget_id = b.id
            LEFT JOIN (
              SELECT
                budget_id,
                COUNT(*) AS transaction_count,
                SUM(amount_base) AS transaction_total_base
              FROM budget_transactions
              GROUP BY budget_id
            ) tx ON tx.budget_id = b.id
            WHERE b.id = :budget_id
              AND (
                :include_private = 1
                OR b.visibility <> 'private'
                OR b.user_id = :user_id
                OR b.owner_user_id = :owner_user_id
                OR b.created_by_user_id = :creator_user_id
              )
            LIMIT 1
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'user_id' => $userId,
            'owner_user_id' => $userId,
            'creator_user_id' => $userId,
            'include_private' => $includePrivate ? 1 : 0,
        ]);
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        return [
            ...$this->budgetFromRow($row),
            'items' => $this->itemsForBudget($budgetId),
            'transactions' => $this->transactionsForBudget($budgetId),
        ];
    }

    public function workspaceIdForBudget(int $budgetId): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT workspace_id FROM budgets WHERE id = :budget_id LIMIT 1'
        );
        $statement->execute(['budget_id' => $budgetId]);
        $workspaceId = $statement->fetchColumn();

        return $workspaceId === false ? null : (int) $workspaceId;
    }

    public function update(
        int $budgetId,
        string $title,
        string $ownerName,
        string $startDate,
        string $endDate,
        int $baseCurrencyId,
        int $displayCurrencyId,
        string $visibility,
        string $status,
        ?string $note,
    ): void {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE budgets
            SET
              title = :title,
              owner_name = :owner_name,
              start_date = :start_date,
              end_date = :end_date,
              base_currency_id = :base_currency_id,
              display_currency_id = :display_currency_id,
              visibility = :visibility,
              status = :status,
              note = :note
            WHERE id = :budget_id
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'title' => $title,
            'owner_name' => $ownerName,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'base_currency_id' => $baseCurrencyId,
            'display_currency_id' => $displayCurrencyId,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
        ]);
    }

    public function delete(int $budgetId): void
    {
        $statement = $this->pdo->prepare('DELETE FROM budgets WHERE id = :budget_id');
        $statement->execute(['budget_id' => $budgetId]);
    }

    private function itemsForBudget(int $budgetId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              bi.id,
              bi.category_id,
              bi.label,
              bc.name AS category_name,
              budget_currency.code AS budget_currency,
              bi.budget_amount_original,
              bi.budget_rate_to_base,
              bi.budget_amount_base,
              estimated_currency.code AS estimated_currency,
              bi.estimated_amount_original,
              bi.estimated_rate_to_base,
              bi.estimated_amount_base,
              bi.variance_amount_base,
              bi.sort_order
            FROM budget_items bi
            LEFT JOIN budget_categories bc ON bc.id = bi.category_id
            INNER JOIN currencies budget_currency ON budget_currency.id = bi.budget_currency_id
            INNER JOIN currencies estimated_currency ON estimated_currency.id = bi.estimated_currency_id
            WHERE bi.budget_id = :budget_id
            ORDER BY bi.sort_order ASC, bi.id ASC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        return array_map(
            fn (array $row): array => [
                'id' => (int) $row['id'],
                'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
                'category' => $row['category_name'],
                'label' => $row['label'],
                'budget' => [
                    'currency' => $row['budget_currency'],
                    'amountOriginal' => $this->decimal($row['budget_amount_original']),
                    'rateToBase' => $this->decimal($row['budget_rate_to_base']),
                    'amountBase' => $this->decimal($row['budget_amount_base']),
                ],
                'estimatedActuals' => [
                    'currency' => $row['estimated_currency'],
                    'amountOriginal' => $this->decimal($row['estimated_amount_original']),
                    'rateToBase' => $this->decimal($row['estimated_rate_to_base']),
                    'amountBase' => $this->decimal($row['estimated_amount_base']),
                ],
                'varianceBase' => $this->decimal($row['variance_amount_base']),
                'sortOrder' => (int) $row['sort_order'],
            ],
            $statement->fetchAll(),
        );
    }

    private function transactionsForBudget(int $budgetId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              bt.id,
              bt.category_id,
              bt.transaction_date,
              bt.details,
              bc.name AS category_name,
              currency.code AS currency,
              bt.amount_original,
              bt.rate_to_base,
              bt.amount_base,
              bt.remark,
              bt.sort_order
            FROM budget_transactions bt
            LEFT JOIN budget_categories bc ON bc.id = bt.category_id
            INNER JOIN currencies currency ON currency.id = bt.currency_id
            WHERE bt.budget_id = :budget_id
            ORDER BY bt.sort_order ASC, bt.id ASC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        return array_map(
            fn (array $row): array => [
                'id' => (int) $row['id'],
                'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
                'category' => $row['category_name'],
                'transactionDate' => $row['transaction_date'],
                'details' => $row['details'],
                'currency' => $row['currency'],
                'amountOriginal' => $this->decimal($row['amount_original']),
                'rateToBase' => $this->decimal($row['rate_to_base']),
                'amountBase' => $this->decimal($row['amount_base']),
                'remark' => $row['remark'],
                'sortOrder' => (int) $row['sort_order'],
            ],
            $statement->fetchAll(),
        );
    }

    private function budgetFromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'workspaceId' => (int) $row['workspace_id'],
            'title' => $row['title'],
            'ownerName' => $row['owner_name'],
            'startDate' => $row['start_date'],
            'endDate' => $row['end_date'],
            'baseCurrency' => $row['base_currency'],
            'displayCurrency' => $row['display_currency'],
            'visibility' => $row['visibility'],
            'status' => $row['status'],
            'note' => $row['note'],
            'template' => [
                'key' => $row['template_key'],
                'name' => $row['template_name'],
            ],
            'totals' => [
                'totalBudgetBase' => $this->decimal($row['total_budget_base']),
                'totalEstimatedBase' => $this->decimal($row['total_estimated_base']),
                'totalVarianceBase' => $this->decimal($row['total_variance_base']),
                'totalTransactionBase' => $this->decimal($row['transaction_total_base']),
                'transactionCount' => (int) $row['transaction_count'],
            ],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }

    private function decimal(mixed $value): float
    {
        return $value === null ? 0.0 : (float) $value;
    }
}
