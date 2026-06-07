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
    private const INSTALLMENT_MAX_MONTHS = 600;

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
        $budget = $this->budgetCurrencyBasics($budgetId);

        (new BudgetEntryRepository($this->pdo))->createItem(
            $this->itemPayload($input, $budgetId, $workspaceId, (int) $session['user_id'], $budget),
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
        $repository->updateItem($id, $this->itemPayload(
            $input,
            $budgetId,
            $workspaceId,
            (int) $session['user_id'],
            $this->budgetCurrencyBasics($budgetId),
        ));

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
        $budget = $this->budgetCurrencyBasics($budgetId);

        (new BudgetEntryRepository($this->pdo))->createTransaction(
            $this->transactionPayload($input, $budgetId, $workspaceId, $budget),
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
        $repository->updateTransaction($id, $this->transactionPayload(
            $input,
            $budgetId,
            $workspaceId,
            $this->budgetCurrencyBasics($budgetId),
        ));

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

    private function itemPayload(
        array $input,
        int $budgetId,
        int $workspaceId,
        int $userId,
        array $budget,
    ): array
    {
        $label = Input::string($input['label'] ?? null);
        $budgetAmount = $this->number($input['budgetAmount'] ?? $input['budget_amount'] ?? null);
        $estimatedAmount = $this->number($input['estimatedAmount'] ?? $input['estimated_amount'] ?? null);

        if ($label === null || strlen($label) > 160) {
            throw new AuthException('VALIDATION_ERROR', 'Category name is required and must be 160 characters or less.', 422);
        }

        $budgetCurrencyId = $this->currencyId($input['budgetCurrency'] ?? $input['budget_currency'] ?? null);
        $estimatedCurrencyId = $this->currencyId($input['estimatedCurrency'] ?? $input['estimated_currency'] ?? null);
        $categoryId = $this->budgetItemCategoryId($workspaceId, $userId, $input, $label);
        $rateDate = Input::date($input['rateDate'] ?? $input['rate_date'] ?? null);
        $budgetRate = $this->rateToBase(
            $workspaceId,
            $budgetCurrencyId,
            $budget,
            $rateDate,
            $this->rateInput($input, ['budgetRate', 'budget_rate'], 'Budget rate'),
        );
        $estimatedRate = $this->rateToBase(
            $workspaceId,
            $estimatedCurrencyId,
            $budget,
            $rateDate,
            $this->rateInput($input, ['estimatedRate', 'estimated_rate'], 'Estimated rate'),
        );

        if ($budgetAmount === null) {
            $transactionTotalBase = (new BudgetEntryRepository($this->pdo))
                ->transactionTotalBaseForCategory($budgetId, $categoryId);
            $budgetBase = $transactionTotalBase;
            $estimatedBase = $transactionTotalBase;
            $budgetAmount = $this->originalAmountFromBase($budgetBase, $budgetRate);
            $estimatedAmount = $this->originalAmountFromBase($estimatedBase, $estimatedRate);
        } else {
            $budgetBase = $budgetAmount * $budgetRate;
            if ($estimatedAmount === null) {
                $estimatedBase = $budgetBase;
                $estimatedAmount = $this->originalAmountFromBase($estimatedBase, $estimatedRate);
            } else {
                $estimatedBase = $estimatedAmount * $estimatedRate;
            }
        }

        return [
            'budget_id' => $budgetId,
            'category_id' => $categoryId,
            'label' => $label,
            'budget_currency_id' => $budgetCurrencyId,
            'budget_amount_original' => $budgetAmount,
            'budget_rate_to_base' => $budgetRate,
            'budget_amount_base' => $budgetBase,
            'estimated_currency_id' => $estimatedCurrencyId,
            'estimated_amount_original' => $estimatedAmount,
            'estimated_rate_to_base' => $estimatedRate,
            'estimated_amount_base' => $estimatedBase,
            'variance_amount_base' => $budgetBase - $estimatedBase,
            'installment_config' => $this->installmentConfigJsonFromInput($input, $budgetAmount),
            'sort_order' => Input::positiveInt($input['sortOrder'] ?? $input['sort_order'] ?? null) ?? 0,
        ];
    }

    private function transactionPayload(array $input, int $budgetId, int $workspaceId, array $budget): array
    {
        $details = Input::string($input['details'] ?? null);
        $amount = $this->number($input['amount'] ?? null);

        if ($details === null || strlen($details) > 500) {
            throw new AuthException('VALIDATION_ERROR', 'Transaction details are required and must be 500 characters or less.', 422);
        }

        if ($amount === null) {
            throw new AuthException('VALIDATION_ERROR', 'Transaction amount is required.', 422);
        }

        $currencyId = $this->currencyId($input['currency'] ?? null);
        $transactionDate = Input::date($input['transactionDate'] ?? $input['transaction_date'] ?? null);
        $rateDate = Input::date($input['rateDate'] ?? $input['rate_date'] ?? null) ?? $transactionDate;
        $rate = $this->rateToBase(
            $workspaceId,
            $currencyId,
            $budget,
            $rateDate,
            $this->rateInput($input, ['rate'], 'Transaction rate'),
        );

        return [
            'budget_id' => $budgetId,
            'category_id' => $this->transactionCategoryId($budgetId, $workspaceId, $input),
            'transaction_date' => $transactionDate,
            'details' => $details,
            'currency_id' => $currencyId,
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
        $permissions->requireBudgetRole($budgetId, $userId, PermissionGuard::WRITE_ROLES);

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

    private function budgetCurrencyBasics(int $budgetId): array
    {
        return (new BudgetRepository($this->pdo))->currencyBasics($budgetId)
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

    private function transactionCategoryId(int $budgetId, int $workspaceId, array $input): int
    {
        $categoryId = Input::positiveInt($input['categoryId'] ?? $input['category_id'] ?? null)
            ?? throw new AuthException('VALIDATION_ERROR', 'Transaction category must be selected from Budget Highlights.', 422);

        $categories = new BudgetCategoryRepository($this->pdo);
        if ($categories->workspaceIdForCategory($categoryId) !== $workspaceId) {
            throw new AuthException('CATEGORY_NOT_FOUND', 'Category was not found.', 404);
        }

        if (!(new BudgetEntryRepository($this->pdo))->budgetHasItemCategory($budgetId, $categoryId)) {
            throw new AuthException('VALIDATION_ERROR', 'Transaction category must exist in Budget Highlights.', 422);
        }

        return $categoryId;
    }

    private function budgetItemCategoryId(
        int $workspaceId,
        int $userId,
        array $input,
        string $label,
    ): int {
        $categoryId = Input::positiveInt($input['categoryId'] ?? $input['category_id'] ?? null);
        $categories = new BudgetCategoryRepository($this->pdo);
        if ($categoryId !== null && $categories->workspaceIdForCategory($categoryId) === $workspaceId) {
            return $categoryId;
        }

        return $categories->findOrCreateForName($workspaceId, $userId, $label);
    }

    private function rateToBase(
        int $workspaceId,
        int $currencyId,
        array $budget,
        ?string $rateDate,
        ?float $explicitRate,
    ): float {
        if ($explicitRate !== null) {
            return $explicitRate;
        }

        $conversion = (new ExchangeRateService($this->pdo, $this->authenticator))->resolveRate(
            $workspaceId,
            $currencyId,
            (int) $budget['baseCurrencyId'],
            $rateDate,
        );

        return (float) $conversion['rate'];
    }

    private function rateInput(array $input, array $keys, string $label): ?float
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $input) || $input[$key] === null || $input[$key] === '') {
                continue;
            }

            $rate = $this->number($input[$key]);
            if ($rate === null || $rate <= 0.0) {
                throw new AuthException('VALIDATION_ERROR', "{$label} must be greater than 0.", 422);
            }

            return $rate;
        }

        return null;
    }

    private function originalAmountFromBase(float $amountBase, float $rateToBase): float
    {
        if ($rateToBase <= 0.0) {
            return 0.0;
        }

        return $amountBase / $rateToBase;
    }

    private function installmentConfigJsonFromInput(array $input, float $fallbackMonthlyAmount): ?string
    {
        $raw = $input['installmentConfig'] ?? $input['installment_config'] ?? null;
        if ($raw === null) {
            return null;
        }

        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                throw new AuthException('VALIDATION_ERROR', 'Installment settings must be valid JSON.', 422);
            }
            $raw = $decoded;
        }

        if (!is_array($raw)) {
            throw new AuthException('VALIDATION_ERROR', 'Installment settings must be an object.', 422);
        }

        $config = $this->installmentConfigFromArray($raw, $fallbackMonthlyAmount);
        $json = json_encode($config, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new AuthException('VALIDATION_ERROR', 'Installment settings could not be encoded.', 422);
        }

        return $json;
    }

    private function installmentConfigFromArray(array $input, float $fallbackMonthlyAmount): array
    {
        $enabled = ($input['enabled'] ?? false) === true;
        $months = Input::positiveInt($input['months'] ?? $input['totalMonths'] ?? $input['total_months'] ?? null);
        $paidMonths = $this->nonNegativeInt($input['paidMonths'] ?? $input['paid_months'] ?? null) ?? 0;
        $totalAmount = $this->number(
            $input['totalAmount'] ?? $input['total_amount'] ?? null,
        );
        $monthlyAmount = $this->number(
            $input['monthlyAmount'] ?? $input['monthly_amount'] ?? null,
        );
        $startMonth = $this->monthFromInput($input['startMonth'] ?? $input['start_month'] ?? null);
        $remark = Input::string($input['remark'] ?? null);

        if (!$enabled) {
            return [
                'enabled' => false,
                'months' => null,
                'paidMonths' => 0,
                'monthlyAmount' => null,
                'totalAmount' => null,
                'startMonth' => null,
                'remark' => null,
            ];
        }

        if ($months === null || $months > self::INSTALLMENT_MAX_MONTHS) {
            throw new AuthException('VALIDATION_ERROR', 'Installment months must be between 1 and 600.', 422);
        }

        $monthlyAmount ??= $totalAmount === null ? $fallbackMonthlyAmount : $totalAmount / $months;

        if ($paidMonths > $months) {
            throw new AuthException('VALIDATION_ERROR', 'Paid installment months cannot exceed total months.', 422);
        }

        if ($monthlyAmount <= 0.0) {
            throw new AuthException('VALIDATION_ERROR', 'Monthly installment amount must be greater than 0.', 422);
        }

        if ($totalAmount !== null && $totalAmount < 0.0) {
            throw new AuthException('VALIDATION_ERROR', 'Installment total amount cannot be less than 0.', 422);
        }

        if ($remark !== null && strlen($remark) > 500) {
            throw new AuthException('VALIDATION_ERROR', 'Installment remark must be 500 characters or less.', 422);
        }

        return [
            'enabled' => true,
            'months' => $months,
            'paidMonths' => $paidMonths,
            'monthlyAmount' => $monthlyAmount,
            'totalAmount' => $totalAmount ?? $monthlyAmount * $months,
            'startMonth' => $startMonth,
            'remark' => $remark,
        ];
    }

    private function monthFromInput(mixed $value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }

        $trimmed = trim($value);
        if (preg_match('/^\d{4}-\d{2}$/', $trimmed) !== 1) {
            throw new AuthException('VALIDATION_ERROR', 'Installment start month must use YYYY-MM.', 422);
        }

        $date = Input::date($trimmed . '-01');
        if ($date === null) {
            throw new AuthException('VALIDATION_ERROR', 'Installment start month must be a valid month.', 422);
        }

        return substr($date, 0, 7);
    }

    private function nonNegativeInt(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value >= 0 ? $value : null;
        }

        if (!is_string($value) || !ctype_digit($value)) {
            return null;
        }

        return (int) $value;
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
