<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class AdminUserRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function users(string $search, ?string $status, int $limit, int $offset): array
    {
        [$whereSql, $params] = $this->filters($search, $status);
        $statement = $this->pdo->prepare(
            <<<SQL
            SELECT
              u.id,
              u.email,
              u.username,
              u.display_name,
              u.status,
              u.is_admin,
              u.email_verified_at,
              u.email_verification_sent_at,
              u.created_at,
              u.updated_at,
              c.code AS default_currency_code
            FROM users u
            LEFT JOIN currencies c ON c.id = u.default_currency_id
            {$whereSql}
            ORDER BY u.created_at DESC, u.id DESC
            LIMIT :limit OFFSET :offset
            SQL
        );
        $this->bindFilters($statement, $params);
        $statement->bindValue('limit', $limit, PDO::PARAM_INT);
        $statement->bindValue('offset', $offset, PDO::PARAM_INT);
        $statement->execute();

        return $statement->fetchAll();
    }

    public function count(string $search, ?string $status): int
    {
        [$whereSql, $params] = $this->filters($search, $status);
        $statement = $this->pdo->prepare(
            <<<SQL
            SELECT COUNT(*) AS total
            FROM users u
            {$whereSql}
            SQL
        );
        $this->bindFilters($statement, $params);
        $statement->execute();

        return (int) $statement->fetchColumn();
    }

    public function findById(int $id): ?array
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            SELECT
              id,
              email,
              username,
              display_name,
              status,
              is_admin,
              email_verified_at,
              email_verification_sent_at,
              created_at,
              updated_at
            FROM users
            WHERE id = :id
            LIMIT 1
            SQL
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function update(int $id, array $fields): ?array
    {
        if ($fields === []) {
            return $this->findById($id);
        }

        $assignments = [];
        $params = ['id' => $id];
        foreach ($fields as $field => $value) {
            if ($field === 'email_verified_at') {
                $assignments[] = $value === null
                    ? 'email_verified_at = NULL'
                    : 'email_verified_at = CURRENT_TIMESTAMP';
                continue;
            }

            $assignments[] = "{$field} = :{$field}";
            $params[$field] = $value;
        }

        $statement = $this->pdo->prepare(
            'UPDATE users SET ' . implode(', ', $assignments) . ' WHERE id = :id'
        );
        $statement->execute($params);

        return $this->findById($id);
    }

    private function filters(string $search, ?string $status): array
    {
        $where = [];
        $params = [];

        if ($search !== '') {
            $where[] = '(u.email LIKE :search OR u.username LIKE :search OR u.display_name LIKE :search)';
            $params['search'] = "%{$search}%";
        }

        if ($status !== null) {
            $where[] = 'u.status = :status';
            $params['status'] = $status;
        }

        return [
            $where === [] ? '' : 'WHERE ' . implode(' AND ', $where),
            $params,
        ];
    }

    private function bindFilters(\PDOStatement $statement, array $params): void
    {
        foreach ($params as $key => $value) {
            $statement->bindValue($key, $value);
        }
    }
}
