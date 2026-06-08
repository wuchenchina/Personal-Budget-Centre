<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class BudgetEntryRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function createItem(array $item): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_items (
              budget_id,
              category_id,
              label,
              budget_currency_id,
              budget_amount_original,
              budget_rate_to_base,
              budget_amount_base,
              estimated_currency_id,
              estimated_amount_original,
              estimated_rate_to_base,
              estimated_amount_base,
              variance_amount_base,
              installment_config,
              sort_order
            ) VALUES (
              :budget_id,
              :category_id,
              :label,
              :budget_currency_id,
              :budget_amount_original,
              :budget_rate_to_base,
              :budget_amount_base,
              :estimated_currency_id,
              :estimated_amount_original,
              :estimated_rate_to_base,
              :estimated_amount_base,
              :variance_amount_base,
              :installment_config,
              :sort_order
            )
            SQL
        );
        $statement->execute($item);

        return (int) $this->pdo->lastInsertId();
    }

    public function updateItem(int $id, array $item): void
    {
        unset($item['budget_id']);
        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE budget_items
            SET
              category_id = :category_id,
              label = :label,
              budget_currency_id = :budget_currency_id,
              budget_amount_original = :budget_amount_original,
              budget_rate_to_base = :budget_rate_to_base,
              budget_amount_base = :budget_amount_base,
              estimated_currency_id = :estimated_currency_id,
              estimated_amount_original = :estimated_amount_original,
              estimated_rate_to_base = :estimated_rate_to_base,
              estimated_amount_base = :estimated_amount_base,
              variance_amount_base = :variance_amount_base,
              installment_config = :installment_config,
              sort_order = :sort_order
            WHERE id = :id
            SQL
        );
        $statement->execute(['id' => $id, ...$item]);
    }

    public function deleteItem(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM budget_items WHERE id = :id');
        $statement->execute(['id' => $id]);
    }

    public function budgetIdForItem(int $id): ?int
    {
        return $this->budgetIdForTable('budget_items', $id);
    }

    public function createTransaction(array $transaction): int
    {
        if (!$this->hasTransactionReferenceColumns()) {
            unset($transaction['reference_currency_id'], $transaction['reference_amount_original']);
            $statement = $this->pdo->prepare(
                <<<'SQL'
                INSERT INTO budget_transactions (
                  budget_id,
                  category_id,
                  transaction_date,
                  details,
                  currency_id,
                  amount_original,
                  rate_to_base,
                  amount_base,
                  remark,
                  sort_order
                ) VALUES (
                  :budget_id,
                  :category_id,
                  :transaction_date,
                  :details,
                  :currency_id,
                  :amount_original,
                  :rate_to_base,
                  :amount_base,
                  :remark,
                  :sort_order
                )
                SQL
            );
            $statement->execute($transaction);

            return (int) $this->pdo->lastInsertId();
        }

        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_transactions (
              budget_id,
              category_id,
              transaction_date,
              details,
              currency_id,
              amount_original,
              rate_to_base,
              amount_base,
              reference_currency_id,
              reference_amount_original,
              remark,
              sort_order
            ) VALUES (
              :budget_id,
              :category_id,
              :transaction_date,
              :details,
              :currency_id,
              :amount_original,
              :rate_to_base,
              :amount_base,
              :reference_currency_id,
              :reference_amount_original,
              :remark,
              :sort_order
            )
            SQL
        );
        $statement->execute($transaction);

        return (int) $this->pdo->lastInsertId();
    }

    public function updateTransaction(int $id, array $transaction): void
    {
        unset($transaction['budget_id']);
        if (!$this->hasTransactionReferenceColumns()) {
            unset($transaction['reference_currency_id'], $transaction['reference_amount_original']);
            $statement = $this->pdo->prepare(
                <<<'SQL'
                UPDATE budget_transactions
                SET
                  category_id = :category_id,
                  transaction_date = :transaction_date,
                  details = :details,
                  currency_id = :currency_id,
                  amount_original = :amount_original,
                  rate_to_base = :rate_to_base,
                  amount_base = :amount_base,
                  remark = :remark,
                  sort_order = :sort_order
                WHERE id = :id
                SQL
            );
            $statement->execute(['id' => $id, ...$transaction]);

            return;
        }

        $statement = $this->pdo->prepare(
            <<<'SQL'
            UPDATE budget_transactions
            SET
              category_id = :category_id,
              transaction_date = :transaction_date,
              details = :details,
              currency_id = :currency_id,
              amount_original = :amount_original,
              rate_to_base = :rate_to_base,
              amount_base = :amount_base,
              reference_currency_id = :reference_currency_id,
              reference_amount_original = :reference_amount_original,
              remark = :remark,
              sort_order = :sort_order
            WHERE id = :id
            SQL
        );
        $statement->execute(['id' => $id, ...$transaction]);
    }

    public function deleteTransaction(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM budget_transactions WHERE id = :id');
        $statement->execute(['id' => $id]);
    }

    public function budgetIdForTransaction(int $id): ?int
    {
        return $this->budgetIdForTable('budget_transactions', $id);
    }

    public function transactionTotalBaseForCategory(int $budgetId, ?int $categoryId): float
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT COALESCE(SUM(amount_base), 0)
            FROM budget_transactions
            WHERE budget_id = :budget_id
              AND category_id <=> :category_id
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'category_id' => $categoryId,
        ]);
        $amount = $statement->fetchColumn();

        return $amount === false ? 0.0 : (float) $amount;
    }

    public function budgetHasItemCategory(int $budgetId, int $categoryId): bool
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT 1
            FROM budget_items
            WHERE budget_id = :budget_id
              AND category_id = :category_id
            LIMIT 1
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'category_id' => $categoryId,
        ]);

        return $statement->fetchColumn() !== false;
    }

    private function budgetIdForTable(string $table, int $id): ?int
    {
        $statement = $this->pdo->prepare(
            "SELECT budget_id FROM {$table} WHERE id = :id LIMIT 1"
        );
        $statement->execute(['id' => $id]);
        $budgetId = $statement->fetchColumn();

        return $budgetId === false ? null : (int) $budgetId;
    }

    private function hasTransactionReferenceColumns(): bool
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'budget_transactions'
              AND column_name IN ('reference_currency_id', 'reference_amount_original')
            SQL
        );
        $statement->execute();

        return (int) $statement->fetchColumn() === 2;
    }
}
