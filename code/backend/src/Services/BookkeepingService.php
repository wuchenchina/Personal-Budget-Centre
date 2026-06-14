<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BookkeepingRepository;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Support\Input;
use PDO;

final readonly class BookkeepingService
{
    private const TRANSACTION_TYPES = [
        'expense',
        'income',
        'sof',
        'transfer',
        'fx_exchange',
        'cross_border_remittance',
    ];

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function records(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($request->query['budgetId'] ?? $request->query['budget_id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Budget id is required.', 422);
        }

        $this->permissions()->requireBudgetRole($budgetId, (int) $session['user_id']);

        return (new BookkeepingRepository($this->pdo))->recordsForBudget($budgetId);
    }

    public function create(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($input['budgetId'] ?? $input['budget_id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Budget id is required.', 422);
        }

        $this->permissions()->requireBudgetRole($budgetId, (int) $session['user_id'], PermissionGuard::WRITE_ROLES);
        $repository = new BookkeepingRepository($this->pdo);
        $repository->create($this->recordPayload($input, $budgetId));

        return $repository->recordsForBudget($budgetId);
    }

    public function update(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($input['id'] ?? null);
        if ($id === null) {
            throw new AuthException('VALIDATION_ERROR', 'Record id is required.', 422);
        }

        $repository = new BookkeepingRepository($this->pdo);
        $budgetId = $repository->budgetIdForRecord($id);
        if ($budgetId === null) {
            throw new AuthException('BOOKKEEPING_RECORD_NOT_FOUND', 'Bookkeeping record was not found.', 404);
        }

        $this->permissions()->requireBudgetRole($budgetId, (int) $session['user_id'], PermissionGuard::WRITE_ROLES);
        $repository->update($id, $this->recordPayload($input, $budgetId));

        return $repository->recordsForBudget($budgetId);
    }

    public function delete(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($input['id'] ?? null);
        if ($id === null) {
            throw new AuthException('VALIDATION_ERROR', 'Record id is required.', 422);
        }

        $repository = new BookkeepingRepository($this->pdo);
        $budgetId = $repository->budgetIdForRecord($id);
        if ($budgetId === null) {
            throw new AuthException('BOOKKEEPING_RECORD_NOT_FOUND', 'Bookkeeping record was not found.', 404);
        }

        $this->permissions()->requireBudgetRole($budgetId, (int) $session['user_id'], PermissionGuard::WRITE_ROLES);
        $repository->delete($id);

        return $repository->recordsForBudget($budgetId);
    }

    private function recordPayload(array $input, int $budgetId): array
    {
        $details = $this->limitedString($input['details'] ?? null, 500, 'Details');
        if ($details === null) {
            throw new AuthException('VALIDATION_ERROR', 'Details are required.', 422);
        }

        $amount = $this->number($input['amount'] ?? null);
        if ($amount === null || $amount < 0.0) {
            throw new AuthException('VALIDATION_ERROR', 'Amount is required and cannot be less than 0.', 422);
        }

        $rate = $this->number($input['rate'] ?? null) ?? 1.0;
        if ($rate <= 0.0) {
            throw new AuthException('VALIDATION_ERROR', 'Rate must be greater than 0.', 422);
        }

        $destinationAmount = $this->number($input['destinationAmount'] ?? $input['destination_amount'] ?? null);
        if ($destinationAmount !== null && $destinationAmount < 0.0) {
            throw new AuthException('VALIDATION_ERROR', 'Destination amount cannot be less than 0.', 422);
        }

        $destinationCurrencyInput = $input['destinationCurrency'] ?? $input['destination_currency'] ?? null;
        if ($destinationAmount !== null && Input::string($destinationCurrencyInput) === null) {
            throw new AuthException('VALIDATION_ERROR', 'Destination currency is required when destination amount is filled.', 422);
        }

        return [
            'budget_id' => $budgetId,
            'transaction_type' => $this->transactionType($input),
            'record_date' => Input::date($input['recordDate'] ?? $input['record_date'] ?? null),
            'order_reference' => $this->limitedString($input['orderReference'] ?? $input['order_reference'] ?? null, 120, 'Order reference'),
            'details' => $details,
            'category_label' => $this->limitedString($input['categoryLabel'] ?? $input['category_label'] ?? null, 160, 'Category label'),
            'source_account_name' => $this->limitedString($input['sourceAccountName'] ?? $input['source_account_name'] ?? null, 160, 'Source account'),
            'destination_account_name' => $this->limitedString($input['destinationAccountName'] ?? $input['destination_account_name'] ?? null, 160, 'Destination account'),
            'currency_id' => $this->currencyId($input['currency'] ?? null),
            'amount_original' => $amount,
            'rate_to_base' => $rate,
            'amount_base' => $amount * $rate,
            'destination_currency_id' => $destinationAmount === null ? null : $this->currencyId($destinationCurrencyInput),
            'destination_amount_original' => $destinationAmount,
            'destination_rate' => $this->number($input['destinationRate'] ?? $input['destination_rate'] ?? null),
            'remark' => $this->limitedString($input['remark'] ?? null, 500, 'Remark'),
            'sort_order' => Input::positiveInt($input['sortOrder'] ?? $input['sort_order'] ?? null) ?? 0,
        ];
    }

    private function transactionType(array $input): string
    {
        $type = Input::string($input['transactionType'] ?? $input['transaction_type'] ?? null) ?? 'expense';
        if (!in_array($type, self::TRANSACTION_TYPES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Transaction type is not supported.', 422);
        }

        return $type;
    }

    private function limitedString(mixed $value, int $maxLength, string $label): ?string
    {
        $text = Input::string($value);
        if ($text === null) {
            return null;
        }

        if (strlen($text) > $maxLength) {
            throw new AuthException('VALIDATION_ERROR', "{$label} must be {$maxLength} characters or less.", 422);
        }

        return $text;
    }

    private function number(mixed $value): ?float
    {
        if (is_int($value) || is_float($value)) {
            return is_finite((float) $value) ? (float) $value : null;
        }

        if (!is_string($value) || trim($value) === '' || !is_numeric($value)) {
            return null;
        }

        return (float) $value;
    }

    private function currencyId(mixed $currency): int
    {
        $code = Input::string($currency);
        if ($code === null) {
            throw new AuthException('VALIDATION_ERROR', 'Currency is required.', 422);
        }

        $currencyId = (new CurrencyRepository($this->pdo))->findIdByCode($code);
        if ($currencyId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Unsupported currency.', 422);
        }

        return $currencyId;
    }

    private function permissions(): PermissionGuard
    {
        return new PermissionGuard($this->pdo, $this->authenticator);
    }
}
