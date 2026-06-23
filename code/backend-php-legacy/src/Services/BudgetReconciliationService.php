<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BudgetReconciliationRepository;
use BudgetCentre\Support\Input;
use PDO;

final readonly class BudgetReconciliationService
{
    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function reconciliation(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($request->query['budgetId'] ?? $request->query['budget_id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'budgetId query parameter is required.', 422);
        }

        (new PermissionGuard($this->pdo, $this->authenticator))->requireBudgetRole(
            $budgetId,
            (int) $session['user_id'],
        );

        return (new BudgetReconciliationRepository($this->pdo))->listForBudget($budgetId);
    }
}
