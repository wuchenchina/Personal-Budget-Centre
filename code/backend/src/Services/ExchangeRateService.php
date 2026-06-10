<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Repositories\ExchangeRateRepository;
use BudgetCentre\Services\ExchangeRates\BochkExchangeRateProvider;
use BudgetCentre\Support\Input;
use DateTimeImmutable;
use PDO;
use Throwable;

final readonly class ExchangeRateService
{
    private const SOURCES = ['manual', 'budget_default', 'bochk'];

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function rates(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = $this->workspaceId($request->query['workspaceId'] ?? null);
        $this->permissions()->requireWorkspaceRole($workspaceId, (int) $session['user_id']);

        $source = Input::string($request->query['source'] ?? null);
        if ($source !== null && !in_array($source, self::SOURCES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Exchange rate source is invalid.', 422);
        }

        return (new ExchangeRateRepository($this->pdo))->listForWorkspace(
            $workspaceId,
            Input::string($request->query['fromCurrency'] ?? $request->query['from'] ?? null),
            Input::string($request->query['toCurrency'] ?? $request->query['to'] ?? null),
            Input::date($request->query['rateDate'] ?? null),
            $source,
        );
    }

    public function createManualRate(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = $this->workspaceId($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );

        $fromCurrencyId = $this->currencyId($input['fromCurrency'] ?? $input['from_currency'] ?? null);
        $toCurrencyId = $this->currencyId($input['toCurrency'] ?? $input['to_currency'] ?? null);
        $rate = $this->positiveNumber($input['rate'] ?? null, 'Exchange rate is required.');
        $rateDate = Input::date($input['rateDate'] ?? $input['rate_date'] ?? null)
            ?? (new DateTimeImmutable('today'))->format('Y-m-d');
        $note = Input::string($input['note'] ?? null);

        if ($fromCurrencyId === $toCurrencyId) {
            throw new AuthException('VALIDATION_ERROR', 'Manual exchange rate currencies must differ.', 422);
        }

        if ($note !== null && strlen($note) > 500) {
            throw new AuthException('VALIDATION_ERROR', 'Exchange rate note must be 500 characters or less.', 422);
        }

        $repository = new ExchangeRateRepository($this->pdo);
        $id = $repository->create([
            'user_id' => (int) $session['user_id'],
            'workspace_id' => $workspaceId,
            'from_currency_id' => $fromCurrencyId,
            'to_currency_id' => $toCurrencyId,
            'rate' => $rate,
            'rate_date' => $rateDate,
            'source' => 'manual',
            'provider_rate_type' => 'manual',
            'note' => $note,
        ]);

        return $repository->findById($id)
            ?? throw new AuthException('EXCHANGE_RATE_NOT_FOUND', 'Exchange rate was not saved.', 500);
    }

    public function refreshBochk(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = $this->workspaceId(
            $input['workspaceId'] ?? $input['workspace_id'] ?? $request->query['workspaceId'] ?? null,
        );
        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );

        $feed = (new BochkExchangeRateProvider())->fetch();
        $currencies = new CurrencyRepository($this->pdo);
        $hkdCurrencyId = $currencies->findIdByCode('HKD')
            ?? throw new AuthException('CURRENCY_NOT_FOUND', 'HKD currency seed is missing.', 500);
        $repository = new ExchangeRateRepository($this->pdo);
        $saved = 0;
        $skipped = [];

        $this->pdo->beginTransaction();
        try {
            $repository->deleteProviderRates($workspaceId, BochkExchangeRateProvider::SOURCE, $feed['rateDate']);

            foreach ($feed['rates'] as $rate) {
                $fromCurrencyId = $currencies->findIdByCode($rate['currencyCode']);
                if ($fromCurrencyId === null || $fromCurrencyId === $hkdCurrencyId) {
                    $skipped[] = $rate['currencyCode'];
                    continue;
                }

                $repository->create([
                    'user_id' => (int) $session['user_id'],
                    'workspace_id' => $workspaceId,
                    'from_currency_id' => $fromCurrencyId,
                    'to_currency_id' => $hkdCurrencyId,
                    'rate' => $rate['customerBuy'],
                    'rate_date' => $feed['rateDate'],
                    'source' => BochkExchangeRateProvider::SOURCE,
                    'source_name' => $feed['sourceName'],
                    'source_url' => $feed['sourceUrl'],
                    'provider_rate_type' => 'customer_buy',
                    'provider_sell_rate' => $rate['customerSell'],
                    'provider_buy_rate' => $rate['customerBuy'],
                    'provider_updated_at' => $feed['providerUpdatedAt'],
                    'fetched_at' => $feed['fetchedAt'],
                    'note' => "BOCHK customer buy rate for {$rate['label']} to HKD.",
                ]);
                $saved++;

                $repository->create([
                    'user_id' => (int) $session['user_id'],
                    'workspace_id' => $workspaceId,
                    'from_currency_id' => $hkdCurrencyId,
                    'to_currency_id' => $fromCurrencyId,
                    'rate' => 1 / $rate['customerSell'],
                    'rate_date' => $feed['rateDate'],
                    'source' => BochkExchangeRateProvider::SOURCE,
                    'source_name' => $feed['sourceName'],
                    'source_url' => $feed['sourceUrl'],
                    'provider_rate_type' => 'customer_sell',
                    'provider_sell_rate' => $rate['customerSell'],
                    'provider_buy_rate' => $rate['customerBuy'],
                    'provider_updated_at' => $feed['providerUpdatedAt'],
                    'fetched_at' => $feed['fetchedAt'],
                    'note' => "BOCHK customer sell rate for HKD to {$rate['label']}.",
                ]);
                $saved++;
            }

            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return [
            'source' => $feed['source'],
            'sourceName' => $feed['sourceName'],
            'sourceUrl' => $feed['sourceUrl'],
            'baseCurrency' => $feed['baseCurrency'],
            'rateDate' => $feed['rateDate'],
            'providerUpdatedAt' => $feed['providerUpdatedAt'],
            'fetchedAt' => $feed['fetchedAt'],
            'saved' => $saved,
            'skipped' => array_values(array_unique($skipped)),
            'rates' => $repository->listForWorkspace(
                $workspaceId,
                null,
                null,
                $feed['rateDate'],
                BochkExchangeRateProvider::SOURCE,
            ),
        ];
    }

    public function convert(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = $this->workspaceId($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $this->permissions()->requireWorkspaceRole($workspaceId, (int) $session['user_id']);

        $fromCurrencyId = $this->currencyId($input['fromCurrency'] ?? $input['from_currency'] ?? null);
        $toCurrencyId = $this->currencyId($input['toCurrency'] ?? $input['to_currency'] ?? null);
        $amount = $this->number($input['amount'] ?? null)
            ?? throw new AuthException('VALIDATION_ERROR', 'Amount is required.', 422);
        $rateDate = Input::date($input['rateDate'] ?? $input['rate_date'] ?? null);
        $conversion = $this->resolveRate($workspaceId, $fromCurrencyId, $toCurrencyId, $rateDate);
        $currencies = new CurrencyRepository($this->pdo);

        return [
            'from' => $currencies->findCodeById($fromCurrencyId),
            'to' => $currencies->findCodeById($toCurrencyId),
            'amount' => $amount,
            'rate' => $conversion['rate'],
            'convertedAmount' => $amount * (float) $conversion['rate'],
            'rateDate' => $conversion['rateDate'],
            'source' => $conversion['source'],
            'conversionPath' => $conversion['conversionPath'],
        ];
    }

    public function resolveRate(int $workspaceId, int $fromCurrencyId, int $toCurrencyId, ?string $rateDate): array
    {
        $hkdCurrencyId = (new CurrencyRepository($this->pdo))->findIdByCode('HKD')
            ?? throw new AuthException('CURRENCY_NOT_FOUND', 'HKD currency seed is missing.', 500);
        $conversion = (new ExchangeRateRepository($this->pdo))->resolveRate(
            $workspaceId,
            $fromCurrencyId,
            $toCurrencyId,
            $hkdCurrencyId,
            $rateDate,
        );

        if ($conversion === null) {
            $currencies = new CurrencyRepository($this->pdo);
            throw new AuthException(
                'EXCHANGE_RATE_NOT_FOUND',
                'Exchange rate is missing. Refresh BOCHK rates or add a manual rate.',
                422,
                [
                    'fromCurrency' => $currencies->findCodeById($fromCurrencyId),
                    'toCurrency' => $currencies->findCodeById($toCurrencyId),
                    'rateDate' => $rateDate,
                ],
            );
        }

        return $conversion;
    }

    private function permissions(): PermissionGuard
    {
        return new PermissionGuard($this->pdo, $this->authenticator);
    }

    private function workspaceId(mixed $value): int
    {
        return Input::positiveInt($value)
            ?? throw new AuthException('VALIDATION_ERROR', 'workspaceId is required.', 422);
    }

    private function currencyId(mixed $value): int
    {
        $code = strtoupper(Input::string($value) ?? '');
        $currencyId = (new CurrencyRepository($this->pdo))->findIdByCode($code);
        if ($currencyId === null) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Currency is not available.', 422);
        }

        return $currencyId;
    }

    private function positiveNumber(mixed $value, string $message): float
    {
        $number = $this->number($value);
        if ($number === null || $number <= 0.0) {
            throw new AuthException('VALIDATION_ERROR', $message, 422);
        }

        return $number;
    }

    private function number(mixed $value): ?float
    {
        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }

        if (is_string($value) && is_numeric($value)) {
            return (float) $value;
        }

        return null;
    }
}
