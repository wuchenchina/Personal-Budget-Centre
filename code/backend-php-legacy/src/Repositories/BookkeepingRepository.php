<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class BookkeepingRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function recordsForBudget(int $budgetId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              br.id,
              br.budget_id,
              br.transaction_type,
              br.record_date,
              br.order_reference,
              br.details,
              br.category_label,
              br.source_account_name,
              br.destination_account_name,
              currency.code AS currency,
              br.amount_original,
              br.rate_to_base,
              br.amount_base,
              destination_currency.code AS destination_currency,
              br.destination_amount_original,
              br.destination_rate,
              br.remark,
              br.sort_order,
              br.created_at,
              br.updated_at
            FROM budget_bookkeeping_records br
            INNER JOIN currencies currency ON currency.id = br.currency_id
            LEFT JOIN currencies destination_currency ON destination_currency.id = br.destination_currency_id
            WHERE br.budget_id = :budget_id
            ORDER BY br.sort_order ASC, br.id ASC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        return array_map(fn (array $row): array => $this->recordFromRow($row), $statement->fetchAll());
    }

    public function create(array $record): int
    {
        $columns = [
            'budget_id',
            'transaction_type',
            'record_date',
            'order_reference',
            'details',
            'category_label',
            'source_account_name',
            'destination_account_name',
            'currency_id',
            'amount_original',
            'rate_to_base',
            'amount_base',
            'destination_currency_id',
            'destination_amount_original',
            'destination_rate',
            'remark',
            'sort_order',
        ];
        $statement = $this->pdo->prepare(
            'INSERT INTO budget_bookkeeping_records ('
            . implode(', ', $columns)
            . ') VALUES ('
            . implode(', ', array_map(static fn (string $column): string => ':' . $column, $columns))
            . ')'
        );
        $statement->execute(array_intersect_key($record, array_fill_keys($columns, true)));

        return (int) $this->pdo->lastInsertId();
    }

    public function update(int $id, array $record): void
    {
        unset($record['budget_id']);
        $columns = [
            'transaction_type',
            'record_date',
            'order_reference',
            'details',
            'category_label',
            'source_account_name',
            'destination_account_name',
            'currency_id',
            'amount_original',
            'rate_to_base',
            'amount_base',
            'destination_currency_id',
            'destination_amount_original',
            'destination_rate',
            'remark',
            'sort_order',
        ];
        $assignments = implode(
            ', ',
            array_map(static fn (string $column): string => "{$column} = :{$column}", $columns),
        );
        $statement = $this->pdo->prepare(
            "UPDATE budget_bookkeeping_records SET {$assignments} WHERE id = :id"
        );
        $statement->execute([
            'id' => $id,
            ...array_intersect_key($record, array_fill_keys($columns, true)),
        ]);
    }

    public function delete(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM budget_bookkeeping_records WHERE id = :id');
        $statement->execute(['id' => $id]);
    }

    public function budgetIdForRecord(int $id): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT budget_id FROM budget_bookkeeping_records WHERE id = :id LIMIT 1'
        );
        $statement->execute(['id' => $id]);
        $budgetId = $statement->fetchColumn();

        return $budgetId === false ? null : (int) $budgetId;
    }

    private function recordFromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'budgetId' => (int) $row['budget_id'],
            'transactionType' => $row['transaction_type'],
            'recordDate' => $row['record_date'],
            'orderReference' => $row['order_reference'],
            'details' => $row['details'],
            'categoryLabel' => $row['category_label'],
            'sourceAccountName' => $row['source_account_name'],
            'destinationAccountName' => $row['destination_account_name'],
            'currency' => $row['currency'],
            'amountOriginal' => (float) $row['amount_original'],
            'rateToBase' => (float) $row['rate_to_base'],
            'amountBase' => (float) $row['amount_base'],
            'destinationCurrency' => $row['destination_currency'],
            'destinationAmountOriginal' => $row['destination_amount_original'] === null
                ? null
                : (float) $row['destination_amount_original'],
            'destinationRate' => $row['destination_rate'] === null
                ? null
                : (float) $row['destination_rate'],
            'remark' => $row['remark'],
            'sortOrder' => (int) $row['sort_order'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }
}
