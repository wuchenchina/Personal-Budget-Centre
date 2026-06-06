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
}
