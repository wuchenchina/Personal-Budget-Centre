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
use BudgetCentre\Services\ExchangeRates\MastercardExchangeRateProvider;
use BudgetCentre\Support\Input;
use DateTimeImmutable;
use PDO;
use Throwable;

final readonly class ExchangeRateService
{
    private const SOURCES = ['manual', 'budget_default', 'bochk', 'mastercard'];

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
                    'rate' => $rate['midRate'],
                    'rate_date' => $feed['rateDate'],
                    'source' => BochkExchangeRateProvider::SOURCE,
                    'source_name' => $feed['sourceName'],
                    'source_url' => $feed['sourceUrl'],
                    'provider_rate_type' => 'mid',
                    'provider_sell_rate' => $rate['customerSell'],
                    'provider_buy_rate' => $rate['customerBuy'],
                    'provider_updated_at' => $feed['providerUpdatedAt'],
                    'fetched_at' => $feed['fetchedAt'],
                    'note' => "BOCHK TT mid rate for {$rate['label']} to HKD.",
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
                'HKD',
                $feed['rateDate'],
                BochkExchangeRateProvider::SOURCE,
            ),
        ];
    }

    public function refreshMastercard(array $input, Request $request): array
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

        $currencies = new CurrencyRepository($this->pdo);
        $toCode = strtoupper(Input::string($input['toCurrency'] ?? $input['to_currency'] ?? null) ?? 'HKD');
        $toCurrencyId = $currencies->findIdByCode($toCode)
            ?? throw new AuthException('CURRENCY_NOT_FOUND', 'Target currency is not available.', 422);
        $bankFee = $this->nonNegativeNumber($input['bankFee'] ?? $input['bank_fee'] ?? null) ?? 0.0;
        $startDate = $this->mastercardStartDate(Input::date($input['rateDate'] ?? $input['rate_date'] ?? null));
        $provider = new MastercardExchangeRateProvider();
        $supportedCodes = $provider->supportedCurrencies();

        if (!in_array($toCode, $supportedCodes, true)) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Target currency is not supported by Mastercard.', 422);
        }

        $requestedCodes = $this->requestedCurrencyCodes($input['currencies'] ?? null, $currencies->listEnabled());
        $quotes = [];
        $skipped = [];

        foreach ($requestedCodes as $fromCode) {
            if ($fromCode === $toCode) {
                continue;
            }

            if (!in_array($fromCode, $supportedCodes, true)) {
                $skipped[] = $fromCode;
                continue;
            }

            $quote = $this->mastercardQuoteWithFallback($provider, $fromCode, $toCode, $startDate, $bankFee);
            if ($quote === null) {
                $skipped[] = $fromCode;
                continue;
            }

            $quotes[] = $quote;
        }

        if ($quotes === []) {
            throw new AuthException(
                'EXCHANGE_RATE_PROVIDER_EMPTY',
                'No Mastercard exchange rates could be fetched for this request.',
                502,
                ['skipped' => array_values(array_unique($skipped))],
            );
        }

        $rateDate = $quotes[0]['rateDate'];
        $repository = new ExchangeRateRepository($this->pdo);
        $saved = 0;
        $this->pdo->beginTransaction();
        try {
            $repository->deleteProviderRatesForTarget(
                $workspaceId,
                MastercardExchangeRateProvider::SOURCE,
                $rateDate,
                $toCurrencyId,
            );

            foreach ($quotes as $quote) {
                $fromCurrencyId = $currencies->findIdByCode($quote['fromCurrency']);
                if ($fromCurrencyId === null) {
                    $skipped[] = $quote['fromCurrency'];
                    continue;
                }

                $repository->create([
                    'user_id' => (int) $session['user_id'],
                    'workspace_id' => $workspaceId,
                    'from_currency_id' => $fromCurrencyId,
                    'to_currency_id' => $toCurrencyId,
                    'rate' => $quote['rate'],
                    'rate_date' => $quote['rateDate'],
                    'source' => MastercardExchangeRateProvider::SOURCE,
                    'source_name' => $quote['sourceName'],
                    'source_url' => $quote['sourceUrl'],
                    'provider_rate_type' => 'card',
                    'fetched_at' => $quote['fetchedAt'],
                    'note' => "Mastercard card conversion rate with {$bankFee}% bank fee.",
                ]);
                $saved++;
            }

            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return [
            'source' => MastercardExchangeRateProvider::SOURCE,
            'sourceName' => MastercardExchangeRateProvider::SOURCE_NAME,
            'sourceUrl' => MastercardExchangeRateProvider::CONVERTER_URL,
            'toCurrency' => $toCode,
            'requestedRateDate' => Input::date($input['rateDate'] ?? $input['rate_date'] ?? null),
            'rateDate' => $rateDate,
            'bankFee' => $bankFee,
            'saved' => $saved,
            'skipped' => array_values(array_unique($skipped)),
            'rates' => $repository->listForWorkspace(
                $workspaceId,
                null,
                $toCode,
                $rateDate,
                MastercardExchangeRateProvider::SOURCE,
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

    private function nonNegativeNumber(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        $number = $this->number($value);
        if ($number === null || $number < 0.0) {
            throw new AuthException('VALIDATION_ERROR', 'Bank fee must be 0 or greater.', 422);
        }

        return $number;
    }

    private function requestedCurrencyCodes(mixed $value, array $enabledCurrencies): array
    {
        if (!is_array($value)) {
            return array_values(array_unique(array_map(
                static fn (array $currency): string => strtoupper((string) $currency['code']),
                $enabledCurrencies,
            )));
        }

        $codes = [];
        foreach ($value as $code) {
            if (is_string($code) && trim($code) !== '') {
                $codes[] = strtoupper(trim($code));
            }
        }

        return array_values(array_unique($codes));
    }

    private function mastercardStartDate(?string $requestedDate): string
    {
        $maxDate = (new DateTimeImmutable('today -2 days'))->format('Y-m-d');
        if ($requestedDate === null || $requestedDate > $maxDate) {
            return $maxDate;
        }

        return $requestedDate;
    }

    private function mastercardQuoteWithFallback(
        MastercardExchangeRateProvider $provider,
        string $fromCode,
        string $toCode,
        string $startDate,
        float $bankFee,
    ): ?array {
        $date = new DateTimeImmutable($startDate);
        for ($attempt = 0; $attempt < 8; $attempt++) {
            $quote = $provider->quote($fromCode, $toCode, $date->format('Y-m-d'), $bankFee);
            if ($quote !== null) {
                return $quote;
            }

            $date = $date->modify('-1 day');
        }

        return null;
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
