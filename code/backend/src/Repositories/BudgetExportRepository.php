<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class BudgetExportRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function create(
        int $budgetId,
        int $userId,
        string $format,
        string $fileName,
        string $filePath,
        string $status = 'completed',
        ?string $errorMessage = null,
    ): int {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO budget_exports (
              budget_id,
              user_id,
              format,
              file_name,
              file_path,
              status,
              error_message
            ) VALUES (
              :budget_id,
              :user_id,
              :format,
              :file_name,
              :file_path,
              :status,
              :error_message
            )
            SQL
        );
        $statement->execute([
            'budget_id' => $budgetId,
            'user_id' => $userId,
            'format' => $format,
            'file_name' => $fileName,
            'file_path' => $filePath,
            'status' => $status,
            'error_message' => $errorMessage,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function listForBudget(int $budgetId): array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              budget_id,
              user_id,
              format,
              file_name,
              file_path,
              status,
              error_message,
              created_at
            FROM budget_exports
            WHERE budget_id = :budget_id
            ORDER BY created_at DESC, id DESC
            SQL
        );
        $statement->execute(['budget_id' => $budgetId]);

        return array_map(
            fn (array $row): array => $this->fromRow($row),
            $statement->fetchAll(),
        );
    }

    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              budget_id,
              user_id,
              format,
              file_name,
              file_path,
              status,
              error_message,
              created_at
            FROM budget_exports
            WHERE id = :id
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $this->fromRow($row);
    }

    private function fromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'budgetId' => (int) $row['budget_id'],
            'userId' => (int) $row['user_id'],
            'format' => $row['format'],
            'fileName' => $row['file_name'],
            'filePath' => $row['file_path'],
            'status' => $row['status'],
            'errorMessage' => $row['error_message'],
            'createdAt' => $row['created_at'],
            'downloadUrl' => "/api/exports/download?id={$row['id']}",
        ];
    }
}
