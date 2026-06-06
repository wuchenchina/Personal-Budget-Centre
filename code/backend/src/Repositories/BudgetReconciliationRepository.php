<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class BudgetReconciliationRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function listForBudget(int $budgetId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              vr.budget_id,
              vr.category_id,
              vr.label,
              bc.name AS category_name,
              vr.estimated_amount_base,
              vr.transaction_total_base,
              vr.difference_base
            FROM v_budget_reconciliation vr
            LEFT JOIN budget_categories bc ON bc.id = vr.category_id
            WHERE vr.budget_id = :budget_id
            ORDER BY ABS(vr.difference_base) DESC, vr.label ASC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        return array_map(
            static fn (array $row): array => [
                'budgetId' => (int) $row['budget_id'],
                'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
                'category' => $row['category_name'],
                'label' => $row['label'],
                'estimatedAmountBase' => (float) $row['estimated_amount_base'],
                'transactionTotalBase' => (float) $row['transaction_total_base'],
                'differenceBase' => (float) $row['difference_base'],
            ],
            $statement->fetchAll(),
        );
    }
}
