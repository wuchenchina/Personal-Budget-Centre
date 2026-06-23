<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class CurrencyRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function findIdByCode(string $code): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT id FROM currencies WHERE code = :code AND is_enabled = 1 LIMIT 1'
        );
        $statement->execute(['code' => strtoupper($code)]);
        $id = $statement->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    public function findCodeById(int $id): ?string
    {
        $statement = $this->pdo->prepare(
            'SELECT code FROM currencies WHERE id = :id AND is_enabled = 1 LIMIT 1'
        );
        $statement->execute(['id' => $id]);
        $code = $statement->fetchColumn();

        return $code === false ? null : (string) $code;
    }

    public function listEnabled(): array
    {
        $statement = $this->pdo->query(
            <<<'SQL'
            SELECT
              id,
              code,
              name,
              symbol,
              decimal_places,
              is_enabled
            FROM currencies
            WHERE is_enabled = 1
            ORDER BY code ASC
            SQL
        );

        return array_map(
            static fn (array $row): array => [
                'id' => (int) $row['id'],
                'code' => $row['code'],
                'name' => $row['name'],
                'symbol' => $row['symbol'],
                'decimalPlaces' => (int) $row['decimal_places'],
                'isEnabled' => (bool) $row['is_enabled'],
            ],
            $statement->fetchAll(),
        );
    }
}
