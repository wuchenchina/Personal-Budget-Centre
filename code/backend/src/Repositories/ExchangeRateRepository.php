<?php

declare(strict_types=1);

namespace BudgetCentre\Repositories;

use PDO;

final readonly class ExchangeRateRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function create(array $rate): int
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO exchange_rates (
              user_id,
              workspace_id,
              from_currency_id,
              to_currency_id,
              rate,
              rate_date,
              source,
              source_name,
              source_url,
              provider_rate_type,
              provider_sell_rate,
              provider_buy_rate,
              provider_updated_at,
              fetched_at,
              note
            ) VALUES (
              :user_id,
              :workspace_id,
              :from_currency_id,
              :to_currency_id,
              :rate,
              :rate_date,
              :source,
              :source_name,
              :source_url,
              :provider_rate_type,
              :provider_sell_rate,
              :provider_buy_rate,
              :provider_updated_at,
              :fetched_at,
              :note
            )
            SQL
        );
        $statement->execute($this->rateBindings($rate));

        return (int) $this->pdo->lastInsertId();
    }

    public function deleteProviderRates(int $workspaceId, string $source, string $rateDate): void
    {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            DELETE FROM exchange_rates
            WHERE workspace_id = :workspace_id
              AND source = :source
              AND rate_date = :rate_date
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'source' => $source,
            'rate_date' => $rateDate,
        ]);
    }

    public function deleteProviderRatesForTarget(
        int $workspaceId,
        string $source,
        string $rateDate,
        int $toCurrencyId,
    ): void {
        $statement = $this->pdo->prepare(
            <<<'SQL'
            DELETE FROM exchange_rates
            WHERE workspace_id = :workspace_id
              AND source = :source
              AND rate_date = :rate_date
              AND to_currency_id = :to_currency_id
            SQL
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'source' => $source,
            'rate_date' => $rateDate,
            'to_currency_id' => $toCurrencyId,
        ]);
    }

    public function findById(int $id): ?array
    {
        $statement = $this->baseListStatement('er.id = :id');
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $this->rateFromRow($row);
    }

    public function listForWorkspace(
        int $workspaceId,
        ?string $fromCode = null,
        ?string $toCode = null,
        ?string $rateDate = null,
        ?string $source = null,
    ): array {
        $where = ['er.workspace_id = :workspace_id'];
        $bindings = ['workspace_id' => $workspaceId];

        if ($fromCode !== null) {
            $where[] = 'from_currency.code = :from_code';
            $bindings['from_code'] = strtoupper($fromCode);
        }

        if ($toCode !== null) {
            $where[] = 'to_currency.code = :to_code';
            $bindings['to_code'] = strtoupper($toCode);
        }

        if ($rateDate !== null) {
            $where[] = 'er.rate_date = :rate_date';
            $bindings['rate_date'] = $rateDate;
        }

        if ($source !== null) {
            $where[] = 'er.source = :source';
            $bindings['source'] = $source;
        }

        $statement = $this->baseListStatement(implode(' AND ', $where));
        $statement->execute($bindings);

        return array_map(
            fn (array $row): array => $this->rateFromRow($row),
            $statement->fetchAll(),
        );
    }

    public function resolveRate(
        int $workspaceId,
        int $fromCurrencyId,
        int $toCurrencyId,
        int $hkdCurrencyId,
        ?string $onDate,
    ): ?array {
        if ($fromCurrencyId === $toCurrencyId) {
            return [
                'rate' => 1.0,
                'rateDate' => $onDate,
                'source' => 'identity',
                'conversionPath' => 'identity',
            ];
        }

        $direct = $this->latestRate($workspaceId, $fromCurrencyId, $toCurrencyId, $onDate);
        if ($direct !== null) {
            return ['conversionPath' => 'direct', ...$direct];
        }

        $inverse = $this->latestRate($workspaceId, $toCurrencyId, $fromCurrencyId, $onDate);
        if ($inverse !== null && (float) $inverse['rate'] > 0.0) {
            return [
                ...$inverse,
                'rate' => 1 / (float) $inverse['rate'],
                'conversionPath' => 'inverse',
            ];
        }

        $fromHkd = $this->rateAgainstHkd($workspaceId, $fromCurrencyId, $hkdCurrencyId, $onDate);
        $toHkd = $this->rateAgainstHkd($workspaceId, $toCurrencyId, $hkdCurrencyId, $onDate);
        if ($fromHkd === null || $toHkd === null || (float) $toHkd['rate'] <= 0.0) {
            return null;
        }

        return [
            'rate' => (float) $fromHkd['rate'] / (float) $toHkd['rate'],
            'rateDate' => max((string) $fromHkd['rateDate'], (string) $toHkd['rateDate']),
            'source' => "{$fromHkd['source']}+{$toHkd['source']}",
            'conversionPath' => 'hkd_cross',
        ];
    }

    private function rateAgainstHkd(
        int $workspaceId,
        int $currencyId,
        int $hkdCurrencyId,
        ?string $onDate,
    ): ?array {
        if ($currencyId === $hkdCurrencyId) {
            return [
                'rate' => 1.0,
                'rateDate' => $onDate,
                'source' => 'identity',
            ];
        }

        $direct = $this->latestRate($workspaceId, $currencyId, $hkdCurrencyId, $onDate);
        if ($direct !== null) {
            return $direct;
        }

        $inverse = $this->latestRate($workspaceId, $hkdCurrencyId, $currencyId, $onDate);
        if ($inverse === null || (float) $inverse['rate'] <= 0.0) {
            return null;
        }

        return [
            ...$inverse,
            'rate' => 1 / (float) $inverse['rate'],
        ];
    }

    private function latestRate(
        int $workspaceId,
        int $fromCurrencyId,
        int $toCurrencyId,
        ?string $onDate,
    ): ?array {
        $dateFilter = $onDate === null ? '' : 'AND er.rate_date <= :on_date';
        $statement = $this->pdo->prepare(
            <<<SQL
            SELECT
              er.rate,
              er.rate_date,
              er.source
            FROM exchange_rates er
            WHERE (er.workspace_id = :workspace_id OR er.workspace_id IS NULL)
              AND er.from_currency_id = :from_currency_id
              AND er.to_currency_id = :to_currency_id
              {$dateFilter}
            ORDER BY
              CASE WHEN er.workspace_id = :workspace_scope THEN 0 ELSE 1 END,
              er.rate_date DESC,
              CASE er.source
                WHEN 'manual' THEN 0
                WHEN 'bochk' THEN 1
                WHEN 'mastercard' THEN 2
                WHEN 'budget_default' THEN 3
                ELSE 4
              END,
              er.id DESC
            LIMIT 1
            SQL
        );

        $bindings = [
            'workspace_id' => $workspaceId,
            'workspace_scope' => $workspaceId,
            'from_currency_id' => $fromCurrencyId,
            'to_currency_id' => $toCurrencyId,
        ];
        if ($onDate !== null) {
            $bindings['on_date'] = $onDate;
        }

        $statement->execute($bindings);
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        return [
            'rate' => (float) $row['rate'],
            'rateDate' => $row['rate_date'],
            'source' => $row['source'],
        ];
    }

    private function baseListStatement(string $where): \PDOStatement
    {
        return $this->pdo->prepare(
            <<<SQL
            SELECT
              er.id,
              er.user_id,
              er.workspace_id,
              from_currency.code AS from_currency,
              to_currency.code AS to_currency,
              er.rate,
              er.rate_date,
              er.source,
              er.source_name,
              er.source_url,
              er.provider_rate_type,
              er.provider_sell_rate,
              er.provider_buy_rate,
              er.provider_updated_at,
              er.fetched_at,
              er.note,
              er.created_at
            FROM exchange_rates er
            INNER JOIN currencies from_currency ON from_currency.id = er.from_currency_id
            INNER JOIN currencies to_currency ON to_currency.id = er.to_currency_id
            WHERE {$where}
            ORDER BY er.rate_date DESC, er.created_at DESC, er.id DESC
            SQL
        );
    }

    private function rateBindings(array $rate): array
    {
        return [
            'user_id' => $rate['user_id'] ?? null,
            'workspace_id' => $rate['workspace_id'] ?? null,
            'from_currency_id' => $rate['from_currency_id'],
            'to_currency_id' => $rate['to_currency_id'],
            'rate' => $rate['rate'],
            'rate_date' => $rate['rate_date'],
            'source' => $rate['source'],
            'source_name' => $rate['source_name'] ?? null,
            'source_url' => $rate['source_url'] ?? null,
            'provider_rate_type' => $rate['provider_rate_type'] ?? 'manual',
            'provider_sell_rate' => $rate['provider_sell_rate'] ?? null,
            'provider_buy_rate' => $rate['provider_buy_rate'] ?? null,
            'provider_updated_at' => $rate['provider_updated_at'] ?? null,
            'fetched_at' => $rate['fetched_at'] ?? null,
            'note' => $rate['note'] ?? null,
        ];
    }

    private function rateFromRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'userId' => $row['user_id'] === null ? null : (int) $row['user_id'],
            'workspaceId' => $row['workspace_id'] === null ? null : (int) $row['workspace_id'],
            'from' => $row['from_currency'],
            'to' => $row['to_currency'],
            'rate' => (float) $row['rate'],
            'rateDate' => $row['rate_date'],
            'source' => $row['source'],
            'sourceName' => $row['source_name'],
            'sourceUrl' => $row['source_url'],
            'providerRateType' => $row['provider_rate_type'],
            'providerSellRate' => $row['provider_sell_rate'] === null ? null : (float) $row['provider_sell_rate'],
            'providerBuyRate' => $row['provider_buy_rate'] === null ? null : (float) $row['provider_buy_rate'],
            'providerUpdatedAt' => $row['provider_updated_at'],
            'fetchedAt' => $row['fetched_at'],
            'note' => $row['note'],
            'createdAt' => $row['created_at'],
        ];
    }
}
