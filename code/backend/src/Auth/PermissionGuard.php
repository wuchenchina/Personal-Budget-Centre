<?php

declare(strict_types=1);

namespace BudgetCentre\Auth;

use BudgetCentre\Repositories\BudgetRepository;
use BudgetCentre\Repositories\WorkgroupRepository;
use PDO;

final readonly class PermissionGuard
{
    public const WRITE_ROLES = ['owner', 'admin', 'editor'];
    public const MEMBER_MANAGE_ROLES = ['owner', 'admin'];
    public const PRIVATE_READ_ROLES = ['owner', 'admin'];

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function requireWorkspaceRole(
        int $workspaceId,
        int $userId,
        array $allowedRoles = [],
    ): string {
        return $this->authenticator->requireWorkspaceRole($workspaceId, $userId, $allowedRoles);
    }

    public function requireBudgetRole(
        int $budgetId,
        int $userId,
        array $allowedRoles = [],
    ): string {
        return $this->requireWorkspaceRole(
            $this->workspaceIdForBudget($budgetId),
            $userId,
            $allowedRoles,
        );
    }

    public function requireWorkgroupRole(
        int $workgroupId,
        int $userId,
        array $allowedRoles = [],
    ): int {
        $workspaceId = (new WorkgroupRepository($this->pdo))->workspaceIdForWorkgroup($workgroupId);
        if ($workspaceId === null) {
            throw new AuthException('WORKGROUP_NOT_FOUND', 'Workgroup was not found.', 404);
        }

        $this->requireWorkspaceRole($workspaceId, $userId, $allowedRoles);

        return $workspaceId;
    }

    public function workspaceIdForBudget(int $budgetId): int
    {
        $workspaceId = (new BudgetRepository($this->pdo))->workspaceIdForBudget($budgetId);
        if ($workspaceId === null) {
            throw new AuthException('BUDGET_NOT_FOUND', 'Budget was not found.', 404);
        }

        return $workspaceId;
    }

    public function canReadPrivateBudgets(string $role): bool
    {
        return in_array($role, self::PRIVATE_READ_ROLES, true);
    }
}
