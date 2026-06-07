<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BudgetRepository;
use BudgetCentre\Repositories\BudgetTemplateRepository;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Support\Input;
use PDO;
use Throwable;

final readonly class BudgetService
{
    private const VISIBILITIES = ['private', 'workspace', 'custom'];
    private const STATUSES = ['draft', 'active', 'closed', 'archived'];

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function budgets(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($request->query['workspaceId'] ?? null);
        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId query parameter is required.', 422);
        }

        $permissions = $this->permissions();
        $role = $permissions->requireWorkspaceRole($workspaceId, (int) $session['user_id']);
        $includePrivate = $permissions->canReadPrivateBudgets($role);

        return (new BudgetRepository($this->pdo))->listForWorkspace(
            $workspaceId,
            (int) $session['user_id'],
            $includePrivate,
        );
    }

    public function createBudget(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $title = Input::string($input['title'] ?? null);
        $ownerName = $this->ownerNameFromInput($input, (string) $session['display_name']);
        $startDate = $this->optionalDateFromInput($input, 'startDate', 'start_date');
        $endDate = $this->optionalDateFromInput($input, 'endDate', 'end_date');
        $baseCurrencyCode = strtoupper(
            Input::string($input['baseCurrency'] ?? $input['base_currency'] ?? null) ?? 'CNY',
        );
        $displayCurrencyCode = strtoupper(
            Input::string($input['displayCurrency'] ?? $input['display_currency'] ?? null)
                ?? $baseCurrencyCode,
        );
        $visibility = Input::string($input['visibility'] ?? null) ?? 'private';
        $status = Input::string($input['status'] ?? null) ?? 'draft';
        $note = Input::string($input['note'] ?? null);

        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId is required.', 422);
        }

        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );
        $this->validateBudgetInput($title, $ownerName, $startDate, $endDate, $visibility, $status, $note);

        $currencies = new CurrencyRepository($this->pdo);
        $baseCurrencyId = $currencies->findIdByCode($baseCurrencyCode);
        $displayCurrencyId = $currencies->findIdByCode($displayCurrencyCode);
        if ($baseCurrencyId === null || $displayCurrencyId === null) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Budget currency is not available.', 422);
        }

        $templateId = (new BudgetTemplateRepository($this->pdo))->findGlobalIdByKey(
            'personal_living_budget',
        );

        $repository = new BudgetRepository($this->pdo);
        $this->pdo->beginTransaction();
        try {
            $budgetId = $repository->create(
                $workspaceId,
                (int) $session['user_id'],
                (int) $session['user_id'],
                (int) $session['user_id'],
                $templateId,
                $title,
                $ownerName,
                $startDate,
                $endDate,
                $baseCurrencyId,
                $displayCurrencyId,
                $visibility,
                $status,
                $note,
            );
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return $repository->findForUser($budgetId, (int) $session['user_id'], true) ?? [
            'id' => $budgetId,
            'workspaceId' => $workspaceId,
            'title' => $title,
            'ownerName' => $ownerName,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'baseCurrency' => $baseCurrencyCode,
            'displayCurrency' => $displayCurrencyCode,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
            'items' => [],
            'transactions' => [],
        ];
    }

    public function budget(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($request->query['id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Budget id query parameter is required.', 422);
        }

        $repository = new BudgetRepository($this->pdo);

        $permissions = $this->permissions();
        $role = $permissions->requireBudgetRole($budgetId, (int) $session['user_id']);
        $includePrivate = $permissions->canReadPrivateBudgets($role);
        $budget = $repository->findForUser($budgetId, (int) $session['user_id'], $includePrivate);
        if ($budget === null) {
            throw new AuthException('BUDGET_NOT_FOUND', 'Budget was not found.', 404);
        }

        return $budget;
    }

    public function updateBudget(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($input['id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Budget id is required.', 422);
        }

        $repository = new BudgetRepository($this->pdo);
        $this->permissions()->requireBudgetRole(
            $budgetId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );

        $payload = $this->validatedBudgetPayload($input, (string) $session['display_name']);
        $currencies = new CurrencyRepository($this->pdo);
        $baseCurrencyId = $currencies->findIdByCode($payload['baseCurrency']);
        $displayCurrencyId = $currencies->findIdByCode($payload['displayCurrency']);
        if ($baseCurrencyId === null || $displayCurrencyId === null) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Budget currency is not available.', 422);
        }

        $repository->update(
            $budgetId,
            $payload['title'],
            $payload['ownerName'],
            $payload['startDate'],
            $payload['endDate'],
            $baseCurrencyId,
            $displayCurrencyId,
            $payload['visibility'],
            $payload['status'],
            $payload['note'],
        );

        return $repository->findForUser($budgetId, (int) $session['user_id'], true)
            ?? throw new AuthException('BUDGET_NOT_FOUND', 'Budget was not found.', 404);
    }

    public function deleteBudget(array $input, Request $request): void
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($input['id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Budget id is required.', 422);
        }

        $repository = new BudgetRepository($this->pdo);
        $this->permissions()->requireBudgetRole(
            $budgetId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );
        $repository->delete($budgetId);
    }

    private function permissions(): PermissionGuard
    {
        return new PermissionGuard($this->pdo, $this->authenticator);
    }

    private function validatedBudgetPayload(array $input, string $defaultOwnerName): array
    {
        $title = Input::string($input['title'] ?? null);
        $ownerName = $this->ownerNameFromInput($input, $defaultOwnerName);
        $startDate = $this->optionalDateFromInput($input, 'startDate', 'start_date');
        $endDate = $this->optionalDateFromInput($input, 'endDate', 'end_date');
        $baseCurrencyCode = strtoupper(
            Input::string($input['baseCurrency'] ?? $input['base_currency'] ?? null) ?? 'CNY',
        );
        $displayCurrencyCode = strtoupper(
            Input::string($input['displayCurrency'] ?? $input['display_currency'] ?? null)
                ?? $baseCurrencyCode,
        );
        $visibility = Input::string($input['visibility'] ?? null) ?? 'private';
        $status = Input::string($input['status'] ?? null) ?? 'draft';
        $note = Input::string($input['note'] ?? null);

        $this->validateBudgetInput($title, $ownerName, $startDate, $endDate, $visibility, $status, $note);

        return [
            'title' => $title,
            'ownerName' => $ownerName,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'baseCurrency' => $baseCurrencyCode,
            'displayCurrency' => $displayCurrencyCode,
            'visibility' => $visibility,
            'status' => $status,
            'note' => $note,
        ];
    }

    private function validateBudgetInput(
        ?string $title,
        string $ownerName,
        ?string $startDate,
        ?string $endDate,
        string $visibility,
        string $status,
        ?string $note,
    ): void {
        if ($title === null || strlen($title) > 255) {
            throw new AuthException('VALIDATION_ERROR', 'Budget title is required and must be 255 characters or less.', 422);
        }

        if (strlen($ownerName) > 160) {
            throw new AuthException('VALIDATION_ERROR', 'Owner name must be 160 characters or less.', 422);
        }

        if (($startDate === null) !== ($endDate === null)) {
            throw new AuthException('VALIDATION_ERROR', 'Budget period must include both start date and end date.', 422);
        }

        if ($startDate !== null && $endDate !== null && $startDate > $endDate) {
            throw new AuthException('VALIDATION_ERROR', 'Start date must be before or equal to end date.', 422);
        }

        if (!in_array($visibility, self::VISIBILITIES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Budget visibility must be private, workspace, or custom.', 422);
        }

        if (!in_array($status, self::STATUSES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Budget status must be draft, active, closed, or archived.', 422);
        }

        if ($note !== null && strlen($note) > 20000) {
            throw new AuthException('VALIDATION_ERROR', 'Budget note must be 20000 characters or less.', 422);
        }
    }

    private function ownerNameFromInput(array $input, string $defaultOwnerName): string
    {
        foreach (['ownerName', 'owner_name'] as $key) {
            if (!array_key_exists($key, $input)) {
                continue;
            }

            return is_string($input[$key]) ? trim($input[$key]) : '';
        }

        return $defaultOwnerName;
    }

    private function optionalDateFromInput(array $input, string $camelKey, string $snakeKey): ?string
    {
        foreach ([$camelKey, $snakeKey] as $key) {
            if (!array_key_exists($key, $input)) {
                continue;
            }

            if ($input[$key] === null || $input[$key] === '') {
                return null;
            }

            $date = Input::date($input[$key]);
            if ($date === null) {
                throw new AuthException('VALIDATION_ERROR', 'Budget period dates must use YYYY-MM-DD.', 422);
            }

            return $date;
        }

        return null;
    }
}
