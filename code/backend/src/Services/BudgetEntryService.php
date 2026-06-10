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

    public function updateOverallInstallmentPlan(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = $this->budgetIdFromInput($input);
        $this->requireBudgetWrite($budgetId, (int) $session['user_id']);

        $periodAmounts = $this->periodAmountsFromInput($input['periodAmounts'] ?? $input['period_amounts'] ?? null);
        $periodLocked = $this->periodProgressFromInput($input['periodLocked'] ?? $input['period_locked'] ?? null);
        $periodProgress = $this->periodProgressFromInput($input['periodProgress'] ?? $input['period_progress'] ?? null);
        $periodRemarks = $this->periodRemarksFromInput($input['periodRemarks'] ?? $input['period_remarks'] ?? null);

        $maxPeriodCount = 20000;
        if (
            count($periodAmounts) > $maxPeriodCount
            || count($periodLocked) > $maxPeriodCount
            || count($periodProgress) > $maxPeriodCount
            || count($periodRemarks) > $maxPeriodCount
        ) {
            throw new AuthException('VALIDATION_ERROR', 'Installment periods exceed the supported range.', 422);
        }

        (new BudgetEntryRepository($this->pdo))->updateOverallInstallmentPlan(
            $budgetId,
            $this->jsonFromArray($periodAmounts),
            $this->jsonFromArray($periodLocked),
            $this->jsonFromArray($periodProgress),
            $this->jsonFromArray($periodRemarks),
        );

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
        $specifiedAmount = $this->number($input['currencyAmount'] ?? $input['currency_amount'] ?? null);
        $bankFeeMultiplier = 1 + (($this->number($input['bankFee'] ?? $input['bank_fee'] ?? null) ?? 0.0) / 100);
        $usesUnifiedCurrencyPayload = array_key_exists('currency', $input) || array_key_exists('currency_amount', $input) || array_key_exists('currencyAmount', $input);

        if ($label === null || strlen($label) > 160) {
            throw new AuthException('VALIDATION_ERROR', 'Category name is required and must be 160 characters or less.', 422);
        }

        $currencyInput = $input['currency'] ?? $input['budgetCurrency'] ?? $input['budget_currency'] ?? null;
        $budgetCurrencyId = $this->currencyId($currencyInput);
        $estimatedCurrencyId = $this->currencyId(
            $input['currency'] ?? $input['estimatedCurrency'] ?? $input['estimated_currency'] ?? $currencyInput,
        );
        $categoryId = $this->budgetItemCategoryId($workspaceId, $userId, $input, $label);
        $transactionTotalBase = (new BudgetEntryRepository($this->pdo))
            ->transactionTotalBaseForCategory($budgetId, $categoryId);
        $rateDate = Input::date($input['rateDate'] ?? $input['rate_date'] ?? null);
        $budgetRate = $this->rateToBase(
            $workspaceId,
            $budgetCurrencyId,
            $budget,
            $rateDate,
            $this->rateInput($input, ['rate', 'budgetRate', 'budget_rate'], 'Budget rate'),
        );
        $estimatedRate = $this->rateToBase(
            $workspaceId,
            $estimatedCurrencyId,
            $budget,
            $rateDate,
            $this->rateInput($input, ['rate', 'estimatedRate', 'estimated_rate'], 'Estimated rate'),
        );
        if ($specifiedAmount !== null) {
            $budgetAmount = $specifiedAmount;
            $budgetBase = $budgetAmount * $budgetRate * $bankFeeMultiplier;
            $estimatedBase = $transactionTotalBase;
            $estimatedAmount = $this->originalAmountFromBase($estimatedBase, $estimatedRate);
        } elseif ($usesUnifiedCurrencyPayload && $budgetAmount !== null) {
            $budgetBase = $budgetAmount;
            $budgetAmount = $this->originalAmountFromBase($budgetBase, $budgetRate);
            $estimatedBase = $transactionTotalBase;
            $estimatedAmount = $this->originalAmountFromBase($estimatedBase, $estimatedRate);
        } elseif ($budgetAmount === null) {
            $budgetBase = $transactionTotalBase;
            $estimatedBase = $transactionTotalBase;
            $budgetAmount = $this->originalAmountFromBase($budgetBase, $budgetRate);
            $estimatedAmount = $this->originalAmountFromBase($estimatedBase, $estimatedRate);
        } else {
            $budgetBase = $budgetAmount * $budgetRate;
            $estimatedBase = $transactionTotalBase;
            $estimatedAmount = $this->originalAmountFromBase($estimatedBase, $estimatedRate);
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
            'installment_config' => $this->installmentConfigJsonFromInput(
                $input,
                $budget['installmentPeriodUnit'] ?? 'month',
            ),
            'sort_order' => Input::positiveInt($input['sortOrder'] ?? $input['sort_order'] ?? null) ?? 0,
        ];
    }

    private function transactionPayload(array $input, int $budgetId, int $workspaceId, array $budget): array
    {
        $details = Input::string($input['details'] ?? null);
        $amount = $this->number($input['amount'] ?? null);
        $referenceAmount = $this->number($input['referenceAmount'] ?? $input['reference_amount'] ?? null);

        if ($details === null || strlen($details) > 500) {
            throw new AuthException('VALIDATION_ERROR', 'Transaction details are required and must be 500 characters or less.', 422);
        }

        if ($amount === null) {
            throw new AuthException('VALIDATION_ERROR', 'Transaction amount is required.', 422);
        }

        if ($referenceAmount !== null && $referenceAmount < 0.0) {
            throw new AuthException('VALIDATION_ERROR', 'Reference amount cannot be less than 0.', 422);
        }

        $currencyId = $this->currencyId($input['currency'] ?? null);
        $referenceCurrencyInput = $input['referenceCurrency'] ?? $input['reference_currency'] ?? null;
        if ($referenceAmount !== null && Input::string($referenceCurrencyInput) === null) {
            throw new AuthException('VALIDATION_ERROR', 'Reference currency is required when reference amount is filled.', 422);
        }

        $referenceCurrencyId = $referenceAmount === null
            ? null
            : $this->currencyId($referenceCurrencyInput);
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
            'reference_currency_id' => $referenceCurrencyId,
            'reference_amount_original' => $referenceAmount,
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

        return $categories->findOrCreateForBudgetItemName($workspaceId, $userId, $label);
    }

    private function rateToBase(
        int $workspaceId,
        int $currencyId,
        array $budget,
        ?string $rateDate,
        ?float $explicitRate,
    ): float {
        if ($currencyId === (int) $budget['baseCurrencyId']) {
            return 1.0;
        }

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

    private function installmentConfigJsonFromInput(
        array $input,
        string $fallbackPeriodUnit,
    ): ?string
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

        $config = $this->installmentConfigFromArray($raw, $fallbackPeriodUnit);
        $json = json_encode($config, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new AuthException('VALIDATION_ERROR', 'Installment settings could not be encoded.', 422);
        }

        return $json;
    }

    private function installmentConfigFromArray(
        array $input,
        string $fallbackPeriodUnit,
    ): array
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
        $periodAmounts = $this->periodAmountsFromInput($input['periodAmounts'] ?? $input['period_amounts'] ?? null);
        $periodLocked = $this->periodProgressFromInput($input['periodLocked'] ?? $input['period_locked'] ?? null);
        $periodProgress = $this->periodProgressFromInput($input['periodProgress'] ?? $input['period_progress'] ?? null);
        $periodRemarks = $this->periodRemarksFromInput($input['periodRemarks'] ?? $input['period_remarks'] ?? null);
        $versions = $this->installmentVersionsFromInput($input['versions'] ?? null);
        $startMonth = $this->monthFromInput($input['startMonth'] ?? $input['start_month'] ?? null);
        $periodUnit = $this->installmentPeriodUnit($fallbackPeriodUnit);
        $remark = Input::string($input['remark'] ?? null);

        if (!$enabled) {
            return [
                'enabled' => false,
                'months' => null,
                'paidMonths' => 0,
                'monthlyAmount' => null,
                'totalAmount' => null,
                'periodAmounts' => [],
                'periodLocked' => [],
                'periodProgress' => [],
                'periodRemarks' => [],
                'versions' => [],
                'startMonth' => null,
                'periodUnit' => 'month',
                'remark' => null,
            ];
        }

        if ($months === null || $months > self::INSTALLMENT_MAX_MONTHS) {
            throw new AuthException('VALIDATION_ERROR', 'Installment months must be between 1 and 600.', 422);
        }

        $periodCount = $this->installmentPeriodCountFromMonths($months, $periodUnit);
        if (count($periodAmounts) > $periodCount) {
            throw new AuthException('VALIDATION_ERROR', 'Installment period amounts cannot exceed the saving period count.', 422);
        }
        if (count($periodLocked) > $periodCount) {
            throw new AuthException('VALIDATION_ERROR', 'Installment locked periods cannot exceed the saving period count.', 422);
        }
        if (count($periodProgress) > $periodCount) {
            throw new AuthException('VALIDATION_ERROR', 'Installment progress cannot exceed the saving period count.', 422);
        }
        if (count($periodRemarks) > $periodCount) {
            throw new AuthException('VALIDATION_ERROR', 'Installment remarks cannot exceed the saving period count.', 422);
        }

        if ($periodAmounts !== []) {
            $periodTotal = array_sum($periodAmounts);
            if ($totalAmount === null || $totalAmount <= 0.0) {
                $totalAmount = $periodTotal;
            }
            $monthlyAmount ??= $periodTotal / count($periodAmounts);
        }

        $monthlyAmount ??= $totalAmount === null ? null : $totalAmount / $months;
        $totalAmount ??= $monthlyAmount * $months;

        if ($paidMonths > $months) {
            throw new AuthException('VALIDATION_ERROR', 'Saved months cannot exceed total saving months.', 422);
        }

        if ($monthlyAmount <= 0.0) {
            throw new AuthException('VALIDATION_ERROR', 'Monthly saving amount must be greater than 0.', 422);
        }

        if ($totalAmount < 0.0) {
            throw new AuthException('VALIDATION_ERROR', 'Saving target amount cannot be less than 0.', 422);
        }

        if ($remark !== null && strlen($remark) > 500) {
            throw new AuthException('VALIDATION_ERROR', 'Saving plan remark must be 500 characters or less.', 422);
        }

        return [
            'enabled' => true,
            'months' => $months,
            'paidMonths' => $paidMonths,
            'monthlyAmount' => $monthlyAmount,
            'totalAmount' => $totalAmount,
            'periodAmounts' => $periodAmounts,
            'periodLocked' => $periodLocked,
            'periodProgress' => $periodProgress,
            'periodRemarks' => $periodRemarks,
            'versions' => $versions,
            'startMonth' => $startMonth,
            'periodUnit' => $periodUnit,
            'remark' => $remark,
        ];
    }

    private function installmentPeriodUnit(mixed $value): string
    {
        return in_array($value, ['day', 'week', 'month', 'year'], true) ? (string) $value : 'month';
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

    /**
     * @return list<float>
     */
    private function periodAmountsFromInput(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $amounts = [];
        foreach ($value as $amount) {
            $number = $this->number($amount);
            if ($number === null || $number < 0.0) {
                throw new AuthException('VALIDATION_ERROR', 'Installment period amounts must be zero or greater.', 422);
            }

            $amounts[] = $number;
        }

        return $amounts;
    }

    /**
     * @return list<bool>
     */
    private function periodProgressFromInput(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        return array_map(static fn (mixed $item): bool => $item === true, $value);
    }

    /**
     * @return list<string>
     */
    private function periodRemarksFromInput(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $remarks = [];
        foreach ($value as $remark) {
            $text = Input::string($remark);
            if ($text !== null && strlen($text) > 500) {
                throw new AuthException('VALIDATION_ERROR', 'Installment period remarks must be 500 characters or less.', 422);
            }

            $remarks[] = $text ?? '';
        }

        return $remarks;
    }

    /**
     * @return list<array{id: string, createdAt: string, label: string, periodAmounts: list<float>, periodProgress: list<bool>, periodRemarks: list<string>, totalAmount: ?float}>
     */
    private function installmentVersionsFromInput(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $versions = [];
        foreach (array_slice($value, 0, 25) as $item) {
            if (!is_array($item)) {
                continue;
            }

            $id = Input::string($item['id'] ?? null);
            $createdAt = Input::string($item['createdAt'] ?? null);
            $label = Input::string($item['label'] ?? null) ?? '';
            if ($id === null || $createdAt === null) {
                continue;
            }

            $versions[] = [
                'id' => $id,
                'createdAt' => $createdAt,
                'label' => substr($label, 0, 120),
                'periodAmounts' => $this->periodAmountsFromInput($item['periodAmounts'] ?? null),
                'periodProgress' => $this->periodProgressFromInput($item['periodProgress'] ?? null),
                'periodRemarks' => $this->periodRemarksFromInput($item['periodRemarks'] ?? null),
                'totalAmount' => $this->number($item['totalAmount'] ?? null),
            ];
        }

        return $versions;
    }

    private function installmentPeriodCountFromMonths(int $months, string $periodUnit): int
    {
        return max(1, (int) ceil(match ($periodUnit) {
            'day' => $months * (365 / 12),
            'week' => $months * (52 / 12),
            'year' => $months / 12,
            default => $months,
        }));
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

    private function jsonFromArray(array $value): string
    {
        $json = json_encode(array_values($value), JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            throw new AuthException('VALIDATION_ERROR', 'Installment settings could not be encoded.', 422);
        }

        return $json;
    }
}
