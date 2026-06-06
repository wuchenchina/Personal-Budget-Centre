<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BudgetCategoryRepository;
use BudgetCentre\Repositories\BudgetEntryRepository;
use BudgetCentre\Repositories\BudgetRepository;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Support\Input;
use PDO;

final readonly class BudgetEntryService
{
    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function createItem(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = $this->budgetIdFromInput($input);
        $workspaceId = $this->requireBudgetWrite($budgetId, (int) $session['user_id']);

        (new BudgetEntryRepository($this->pdo))->createItem(
            $this->itemPayload($input, $budgetId, $workspaceId),
        );

        return $this->budgetDetail($budgetId, (int) $session['user_id']);
    }

    public function updateItem(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = $this->idFromInput($input);
        $repository = new BudgetEntryRepository($this->pdo);
        $budgetId = $repository->budgetIdForItem($id);
        if ($budgetId === null) {
            throw new AuthException('BUDGET_ITEM_NOT_FOUND', 'Budget item was not found.', 404);
        }

        $workspaceId = $this->requireBudgetWrite($budgetId, (int) $session['user_id']);
        $repository->updateItem($id, $this->itemPayload($input, $budgetId, $workspaceId));

        return $this->budgetDetail($budgetId, (int) $session['user_id']);
    }

    public function deleteItem(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = $this->idFromInput($input);
        $repository = new BudgetEntryRepository($this->pdo);
        $budgetId = $repository->budgetIdForItem($id);
        if ($budgetId === null) {
            throw new AuthException('BUDGET_ITEM_NOT_FOUND', 'Budget item was not found.', 404);
        }

        $this->requireBudgetWrite($budgetId, (int) $session['user_id']);
        $repository->deleteItem($id);

        return $this->budgetDetail($budgetId, (int) $session['user_id']);
    }

    public function createTransaction(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = $this->budgetIdFromInput($input);
        $workspaceId = $this->requireBudgetWrite($budgetId, (int) $session['user_id']);

        (new BudgetEntryRepository($this->pdo))->createTransaction(
            $this->transactionPayload($input, $budgetId, $workspaceId),
        );

        return $this->budgetDetail($budgetId, (int) $session['user_id']);
    }

    public function updateTransaction(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = $this->idFromInput($input);
        $repository = new BudgetEntryRepository($this->pdo);
        $budgetId = $repository->budgetIdForTransaction($id);
        if ($budgetId === null) {
            throw new AuthException('TRANSACTION_NOT_FOUND', 'Transaction was not found.', 404);
        }

        $workspaceId = $this->requireBudgetWrite($budgetId, (int) $session['user_id']);
        $repository->updateTransaction($id, $this->transactionPayload($input, $budgetId, $workspaceId));

        return $this->budgetDetail($budgetId, (int) $session['user_id']);
    }

    public function deleteTransaction(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = $this->idFromInput($input);
        $repository = new BudgetEntryRepository($this->pdo);
        $budgetId = $repository->budgetIdForTransaction($id);
        if ($budgetId === null) {
            throw new AuthException('TRANSACTION_NOT_FOUND', 'Transaction was not found.', 404);
        }

        $this->requireBudgetWrite($budgetId, (int) $session['user_id']);
        $repository->deleteTransaction($id);

        return $this->budgetDetail($budgetId, (int) $session['user_id']);
    }

    private function itemPayload(array $input, int $budgetId, int $workspaceId): array
    {
        $label = Input::string($input['label'] ?? null);
        $budgetAmount = $this->number($input['budgetAmount'] ?? $input['budget_amount'] ?? null);
        $budgetRate = $this->number($input['budgetRate'] ?? $input['budget_rate'] ?? null) ?? 1.0;
        $estimatedAmount = $this->number($input['estimatedAmount'] ?? $input['estimated_amount'] ?? null);
        $estimatedRate = $this->number($input['estimatedRate'] ?? $input['estimated_rate'] ?? null) ?? 1.0;

        if ($label === null || strlen($label) > 180) {
            throw new AuthException('VALIDATION_ERROR', 'Item label is required and must be 180 characters or less.', 422);
        }

        if ($budgetAmount === null || $estimatedAmount === null) {
            throw new AuthException('VALIDATION_ERROR', 'Budget and estimated amounts are required.', 422);
        }

        $budgetBase = $budgetAmount * $budgetRate;
        $estimatedBase = $estimatedAmount * $estimatedRate;

        return [
            'budget_id' => $budgetId,
            'category_id' => $this->categoryId($workspaceId, $input, $label),
            'label' => $label,
            'budget_currency_id' => $this->currencyId($input['budgetCurrency'] ?? $input['budget_currency'] ?? null),
            'budget_amount_original' => $budgetAmount,
            'budget_rate_to_base' => $budgetRate,
            'budget_amount_base' => $budgetBase,
            'estimated_currency_id' => $this->currencyId($input['estimatedCurrency'] ?? $input['estimated_currency'] ?? null),
            'estimated_amount_original' => $estimatedAmount,
            'estimated_rate_to_base' => $estimatedRate,
            'estimated_amount_base' => $estimatedBase,
            'variance_amount_base' => $budgetBase - $estimatedBase,
            'sort_order' => Input::positiveInt($input['sortOrder'] ?? $input['sort_order'] ?? null) ?? 0,
        ];
    }

    private function transactionPayload(array $input, int $budgetId, int $workspaceId): array
    {
        $details = Input::string($input['details'] ?? null);
        $amount = $this->number($input['amount'] ?? null);
        $rate = $this->number($input['rate'] ?? null) ?? 1.0;

        if ($details === null || strlen($details) > 500) {
            throw new AuthException('VALIDATION_ERROR', 'Transaction details are required and must be 500 characters or less.', 422);
        }

        if ($amount === null) {
            throw new AuthException('VALIDATION_ERROR', 'Transaction amount is required.', 422);
        }

        return [
            'budget_id' => $budgetId,
            'category_id' => $this->categoryId($workspaceId, $input, $details),
            'transaction_date' => Input::date($input['transactionDate'] ?? $input['transaction_date'] ?? null),
            'details' => $details,
            'currency_id' => $this->currencyId($input['currency'] ?? null),
            'amount_original' => $amount,
            'rate_to_base' => $rate,
            'amount_base' => $amount * $rate,
            'remark' => Input::string($input['remark'] ?? null),
            'sort_order' => Input::positiveInt($input['sortOrder'] ?? $input['sort_order'] ?? null) ?? 0,
        ];
    }

    private function requireBudgetWrite(int $budgetId, int $userId): int
    {
        $permissions = $this->permissions();
        $workspaceId = $permissions->workspaceIdForBudget($budgetId);
        $permissions->requireWorkspaceRole($workspaceId, $userId, PermissionGuard::WRITE_ROLES);

        return $workspaceId;
    }

    private function permissions(): PermissionGuard
    {
        return new PermissionGuard($this->pdo, $this->authenticator);
    }

    private function budgetDetail(int $budgetId, int $userId): array
    {
        return (new BudgetRepository($this->pdo))->findForUser($budgetId, $userId, true)
            ?? throw new AuthException('BUDGET_NOT_FOUND', 'Budget was not found.', 404);
    }

    private function budgetIdFromInput(array $input): int
    {
        return Input::positiveInt($input['budgetId'] ?? $input['budget_id'] ?? null)
            ?? throw new AuthException('VALIDATION_ERROR', 'budgetId is required.', 422);
    }

    private function idFromInput(array $input): int
    {
        return Input::positiveInt($input['id'] ?? null)
            ?? throw new AuthException('VALIDATION_ERROR', 'id is required.', 422);
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

    private function categoryId(int $workspaceId, array $input, string $text): ?int
    {
        $categoryId = Input::positiveInt($input['categoryId'] ?? $input['category_id'] ?? null);

        return (new BudgetCategoryRepository($this->pdo))->resolveCategoryId(
            $workspaceId,
            $categoryId,
            $text,
        );
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
