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
        $columns = [
            'budget_id',
            'category_id',
            'label',
            'budget_currency_id',
            'budget_amount_original',
            'budget_rate_to_base',
            'budget_amount_base',
            'estimated_currency_id',
            'estimated_amount_original',
            'estimated_rate_to_base',
            'estimated_amount_base',
            'variance_amount_base',
            'installment_config',
            'sort_order',
        ];
        if ($this->hasBudgetItemPricingConfigColumn()) {
            array_splice($columns, -1, 0, ['pricing_config']);
        } else {
            unset($item['pricing_config']);
        }

        $columnSql = implode(",\n              ", $columns);
        $placeholderSql = implode(",\n              ", array_map(
            static fn (string $column): string => ':' . $column,
            $columns,
        ));
        $statement = $this->pdo->prepare(
            <<<SQL
            INSERT INTO budget_items (
              {$columnSql}
            ) VALUES (
              {$placeholderSql}
            )
            SQL
        );
        $statement->execute(array_intersect_key($item, array_fill_keys($columns, true)));

        return (int) $this->pdo->lastInsertId();
    }

    public function updateItem(int $id, array $item): void
    {
        unset($item['budget_id']);
        $columns = [
            'category_id',
            'label',
            'budget_currency_id',
            'budget_amount_original',
            'budget_rate_to_base',
            'budget_amount_base',
            'estimated_currency_id',
            'estimated_amount_original',
            'estimated_rate_to_base',
            'estimated_amount_base',
            'variance_amount_base',
            'installment_config',
            'sort_order',
        ];
        if ($this->hasBudgetItemPricingConfigColumn()) {
            array_splice($columns, -1, 0, ['pricing_config']);
        } else {
            unset($item['pricing_config']);
        }

        $assignmentSql = implode(",\n              ", array_map(
            static fn (string $column): string => "{$column} = :{$column}",
            $columns,
        ));
        $statement = $this->pdo->prepare(
            <<<SQL
            UPDATE budget_items
            SET
              {$assignmentSql}
            WHERE id = :id
            SQL
        );
        $statement->execute([
            'id' => $id,
            ...array_intersect_key($item, array_fill_keys($columns, true)),
        ]);
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

    public function replaceItemSplit(int $itemId, ?array $split): void
    {
        if (!$this->hasGroupBudgetTables()) {
            return;
        }

        $deleteStatement = $this->pdo->prepare(
            'DELETE FROM budget_item_splits WHERE budget_item_id = :budget_item_id'
        );
        $deleteStatement->execute(['budget_item_id' => $itemId]);

        if ($split === null) {
            return;
        }

        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_item_splits (
              budget_item_id,
              paid_by_participant_id,
              split_type,
              note
            ) VALUES (
              :budget_item_id,
              :paid_by_participant_id,
              :split_type,
              :note
            )
            SQL
        );
        $statement->execute([
            'budget_item_id' => $itemId,
            'paid_by_participant_id' => $split['paidByParticipantId'] ?? null,
            'split_type' => $split['splitType'],
            'note' => $split['note'] ?? null,
        ]);
        $splitId = (int) $this->pdo->lastInsertId();

        $participantStatement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_item_split_participants (
              split_id,
              participant_id,
              is_included,
              share_ratio,
              share_amount_base
            ) VALUES (
              :split_id,
              :participant_id,
              :is_included,
              :share_ratio,
              :share_amount_base
            )
            SQL
        );
        foreach ($split['participants'] ?? [] as $participant) {
            $participantStatement->execute([
                'split_id' => $splitId,
                'participant_id' => $participant['participantId'],
                'is_included' => ($participant['isIncluded'] ?? true) ? 1 : 0,
                'share_ratio' => $participant['shareRatio'] ?? null,
                'share_amount_base' => $participant['shareAmountBase'] ?? null,
            ]);
        }
    }

    public function createTransaction(array $transaction): int
    {
        $columns = [
            'budget_id',
            'category_id',
            'transaction_date',
            'details',
            'currency_id',
            'amount_original',
            'rate_to_base',
            'amount_base',
            'remark',
            'sort_order',
        ];
        if ($this->hasTransactionPaidByColumn()) {
            array_splice($columns, 2, 0, ['paid_by_participant_id']);
        } else {
            unset($transaction['paid_by_participant_id']);
        }
        if ($this->hasTransactionReferenceColumns()) {
            array_splice($columns, -2, 0, ['reference_currency_id', 'reference_amount_original']);
        } else {
            unset($transaction['reference_currency_id'], $transaction['reference_amount_original']);
        }
        if ($this->hasTransactionPricingConfigColumn()) {
            array_splice($columns, -2, 0, ['pricing_config']);
        } else {
            unset($transaction['pricing_config']);
        }

        $columnSql = implode(",\n              ", $columns);
        $placeholderSql = implode(",\n              ", array_map(
            static fn (string $column): string => ':' . $column,
            $columns,
        ));
        $statement = $this->pdo->prepare(
            <<<SQL
            INSERT INTO budget_transactions (
              {$columnSql}
            ) VALUES (
              {$placeholderSql}
            )
            SQL
        );
        $statement->execute(array_intersect_key($transaction, array_fill_keys($columns, true)));

        return (int) $this->pdo->lastInsertId();
    }

    public function updateTransaction(int $id, array $transaction): void
    {
        unset($transaction['budget_id']);
        $columns = [
            'category_id',
            'transaction_date',
            'details',
            'currency_id',
            'amount_original',
            'rate_to_base',
            'amount_base',
            'remark',
            'sort_order',
        ];
        if ($this->hasTransactionPaidByColumn()) {
            array_splice($columns, 1, 0, ['paid_by_participant_id']);
        } else {
            unset($transaction['paid_by_participant_id']);
        }
        if ($this->hasTransactionReferenceColumns()) {
            array_splice($columns, -2, 0, ['reference_currency_id', 'reference_amount_original']);
        } else {
            unset($transaction['reference_currency_id'], $transaction['reference_amount_original']);
        }
        if ($this->hasTransactionPricingConfigColumn()) {
            array_splice($columns, -2, 0, ['pricing_config']);
        } else {
            unset($transaction['pricing_config']);
        }

        $assignmentSql = implode(",\n              ", array_map(
            static fn (string $column): string => "{$column} = :{$column}",
            $columns,
        ));
        $statement = $this->pdo->prepare(
            <<<SQL
            UPDATE budget_transactions
            SET
              {$assignmentSql}
            WHERE id = :id
            SQL
        );
        $statement->execute([
            'id' => $id,
            ...array_intersect_key($transaction, array_fill_keys($columns, true)),
        ]);
    }

    public function replaceTransactionPayments(int $transactionId, array $payments): void
    {
        if (!$this->hasTransactionPaymentsTable()) {
            return;
        }

        $deleteStatement = $this->pdo->prepare(
            'DELETE FROM budget_transaction_payments WHERE transaction_id = :transaction_id'
        );
        $deleteStatement->execute(['transaction_id' => $transactionId]);

        if ($payments === []) {
            return;
        }

        $insertStatement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_transaction_payments (
              transaction_id,
              participant_id,
              amount_original,
              amount_base
            ) VALUES (
              :transaction_id,
              :participant_id,
              :amount_original,
              :amount_base
            )
            SQL
        );
        foreach ($payments as $payment) {
            $insertStatement->execute([
                'transaction_id' => $transactionId,
                'participant_id' => $payment['participantId'],
                'amount_original' => $payment['amountOriginal'],
                'amount_base' => $payment['amountBase'],
            ]);
        }
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

    public function updateOverallInstallmentPlan(
        int $budgetId,
        string $periodAmounts,
        string $periodLocked,
        string $periodProgress,
        string $periodRemarks,
    ): void {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_installment_plans (
              budget_id,
              scope,
              period_amounts,
              period_locked,
              period_progress,
              period_remarks
            ) VALUES (
              :budget_id,
              'overall',
              :period_amounts,
              :period_locked,
              :period_progress,
              :period_remarks
            )
            ON DUPLICATE KEY UPDATE
              period_amounts = VALUES(period_amounts),
              period_locked = VALUES(period_locked),
              period_progress = VALUES(period_progress),
              period_remarks = VALUES(period_remarks),
              updated_at = CURRENT_TIMESTAMP
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'period_amounts' => $periodAmounts,
            'period_locked' => $periodLocked,
            'period_progress' => $periodProgress,
            'period_remarks' => $periodRemarks,
        ]);
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

    private function hasBudgetItemPricingConfigColumn(): bool
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'budget_items'
              AND column_name = 'pricing_config'
            SQL
        );
        $statement->execute();

        return (int) $statement->fetchColumn() === 1;
    }

    private function hasTransactionPricingConfigColumn(): bool
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'budget_transactions'
              AND column_name = 'pricing_config'
            SQL
        );
        $statement->execute();

        return (int) $statement->fetchColumn() === 1;
    }

    private function hasTransactionPaidByColumn(): bool
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'budget_transactions'
              AND column_name = 'paid_by_participant_id'
            SQL
        );
        $statement->execute();

        return (int) $statement->fetchColumn() === 1;
    }

    private function hasTransactionPaymentsTable(): bool
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'budget_transaction_payments'
            SQL
        );
        $statement->execute();

        return (int) $statement->fetchColumn() === 1;
    }

    private function hasGroupBudgetTables(): bool
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name IN (
                'budget_participants',
                'budget_item_splits',
                'budget_item_split_participants'
              )
            SQL
        );
        $statement->execute();

        return (int) $statement->fetchColumn() === 3;
    }
}
