<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\CurrencyRepository;
use PDO;

final readonly class ReferenceDataService
{
    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function currencies(Request $request): array
    {
        $this->authenticator->authenticatedSession($request);

        return (new CurrencyRepository($this->pdo))->listEnabled();
    }
}
