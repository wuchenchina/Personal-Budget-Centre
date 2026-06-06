<?php

declare(strict_types=1);

namespace BudgetCentre\Auth;

use BudgetCentre\Repositories\BudgetRepository;
use BudgetCentre\Repositories\BudgetShareRepository;
use BudgetCentre\Repositories\WorkgroupRepository;
use BudgetCentre\Repositories\WorkspaceRepository;
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
        $access = $this->budgetAccess($budgetId, $userId);
        $role = $access['role'];
        if ($role === null) {
            throw new AuthException('FORBIDDEN', 'Budget access is required.', 403);
        }

        if ($allowedRoles !== [] && !in_array($role, $allowedRoles, true)) {
            throw new AuthException('FORBIDDEN', 'You do not have permission for this budget.', 403);
        }

        return $role;
    }

    public function requireBudgetExport(int $budgetId, int $userId): void
    {
        $access = $this->budgetAccess($budgetId, $userId);
        $role = $access['role'];
        if ($role === null) {
            throw new AuthException('FORBIDDEN', 'Budget access is required.', 403);
        }

        if (in_array($role, self::WRITE_ROLES, true)) {
            return;
        }

        $share = $access['share'];
        if ($share !== null && (bool) $share['canExport']) {
            return;
        }

        throw new AuthException('FORBIDDEN', 'You do not have permission to export this budget.', 403);
    }

    private function budgetAccess(int $budgetId, int $userId): array
    {
        $budget = (new BudgetRepository($this->pdo))->accessBasics($budgetId);
        if ($budget === null) {
            throw new AuthException('BUDGET_NOT_FOUND', 'Budget was not found.', 404);
        }

        $workspaceId = (int) $budget['workspaceId'];
        $workspaceRole = (new WorkspaceRepository($this->pdo))->roleForUser($workspaceId, $userId);
        $share = (new BudgetShareRepository($this->pdo))->effectiveForUser(
            $budgetId,
            $workspaceId,
            $userId,
        );

        return [
            'budget' => $budget,
            'role' => $this->effectiveBudgetRole($budget, $userId, $workspaceRole, $share),
            'share' => $share,
            'workspaceRole' => $workspaceRole,
        ];
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

    private function effectiveBudgetRole(
        array $budget,
        int $userId,
        ?string $workspaceRole,
        ?array $share,
    ): ?string {
        if ($workspaceRole === 'owner' || $workspaceRole === 'admin') {
            return $workspaceRole;
        }

        if (
            (int) $budget['userId'] === $userId
            || (int) $budget['ownerUserId'] === $userId
            || (int) $budget['createdByUserId'] === $userId
        ) {
            return 'owner';
        }

        if (
            $budget['visibility'] === 'workspace'
            && $workspaceRole !== null
            && in_array($workspaceRole, self::WRITE_ROLES, true)
        ) {
            return $workspaceRole;
        }

        if ($share !== null) {
            return (string) $share['role'];
        }

        if ($budget['visibility'] === 'workspace' && $workspaceRole !== null) {
            return $workspaceRole;
        }

        return null;
    }
}
