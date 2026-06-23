<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BudgetShareRepository;
use BudgetCentre\Repositories\UserRepository;
use BudgetCentre\Repositories\WorkgroupRepository;
use BudgetCentre\Repositories\WorkspaceMemberRepository;
use BudgetCentre\Support\Input;
use DateTimeImmutable;
use PDO;

final readonly class BudgetShareService
{
    private const PRINCIPAL_TYPES = ['user', 'workgroup', 'workspace'];
    private const ASSIGNABLE_ROLES = ['editor', 'viewer', 'auditor'];

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function shares(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($request->query['budgetId'] ?? $request->query['budget_id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'budgetId query parameter is required.', 422);
        }

        $this->requireShareManage($budgetId, (int) $session['user_id']);

        return (new BudgetShareRepository($this->pdo))->listForBudget($budgetId);
    }

    public function createShare(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($input['budgetId'] ?? $input['budget_id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'budgetId is required.', 422);
        }

        $workspaceId = $this->requireShareManage($budgetId, (int) $session['user_id']);
        $payload = $this->sharePayload($input, $workspaceId);

        $repository = new BudgetShareRepository($this->pdo);
        $repository->save(
            $budgetId,
            $payload['principalType'],
            $payload['principalId'],
            $payload['role'],
            $payload['canExport'],
            $payload['canReshare'],
            $payload['expiresAt'],
            (int) $session['user_id'],
        );

        return ['shares' => $repository->listForBudget($budgetId)];
    }

    public function updateShare(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($input['id'] ?? null);
        if ($id === null) {
            throw new AuthException('VALIDATION_ERROR', 'Share id is required.', 422);
        }

        $repository = new BudgetShareRepository($this->pdo);
        $share = $repository->find($id)
            ?? throw new AuthException('BUDGET_SHARE_NOT_FOUND', 'Budget share was not found.', 404);
        $this->requireShareManage((int) $share['budgetId'], (int) $session['user_id']);

        $role = Input::string($input['role'] ?? null) ?? (string) $share['role'];
        $this->validateRole($role);

        $repository->save(
            (int) $share['budgetId'],
            (string) $share['principalType'],
            (int) $share['principalId'],
            $role,
            $this->boolean($input['canExport'] ?? $share['canExport']),
            $this->boolean($input['canReshare'] ?? $share['canReshare']),
            $this->expiresAt($input['expiresAt'] ?? $input['expires_at'] ?? $share['expiresAt']),
            (int) $session['user_id'],
        );

        return ['shares' => $repository->listForBudget((int) $share['budgetId'])];
    }

    public function deleteShare(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($input['id'] ?? null);
        if ($id === null) {
            throw new AuthException('VALIDATION_ERROR', 'Share id is required.', 422);
        }

        $repository = new BudgetShareRepository($this->pdo);
        $share = $repository->find($id)
            ?? throw new AuthException('BUDGET_SHARE_NOT_FOUND', 'Budget share was not found.', 404);
        $this->requireShareManage((int) $share['budgetId'], (int) $session['user_id']);
        $repository->delete($id);

        return ['shares' => $repository->listForBudget((int) $share['budgetId'])];
    }

    private function sharePayload(array $input, int $workspaceId): array
    {
        $principalType = Input::string($input['principalType'] ?? $input['principal_type'] ?? null);
        $principalId = Input::positiveInt($input['principalId'] ?? $input['principal_id'] ?? null);
        $principalIdentifier = Input::string(
            $input['principalIdentifier'] ?? $input['principal_identifier'] ?? $input['identifier'] ?? null,
        );
        $role = Input::string($input['role'] ?? null) ?? 'viewer';

        if ($principalType === null || !in_array($principalType, self::PRINCIPAL_TYPES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Principal type must be user, workgroup, or workspace.', 422);
        }

        $this->validateRole($role);
        $principalId = $this->validatedPrincipalId(
            $principalType,
            $principalId,
            $workspaceId,
            $principalIdentifier,
        );

        return [
            'principalType' => $principalType,
            'principalId' => $principalId,
            'role' => $role,
            'canExport' => $this->boolean($input['canExport'] ?? $input['can_export'] ?? false),
            'canReshare' => $this->boolean($input['canReshare'] ?? $input['can_reshare'] ?? false),
            'expiresAt' => $this->expiresAt($input['expiresAt'] ?? $input['expires_at'] ?? null),
        ];
    }

    private function validatedPrincipalId(
        string $principalType,
        ?int $principalId,
        int $workspaceId,
        ?string $principalIdentifier,
    ): int
    {
        if ($principalType === 'workspace') {
            if ($principalId !== null && $principalId !== $workspaceId) {
                throw new AuthException('VALIDATION_ERROR', 'Workspace share must target the current workspace.', 422);
            }

            return $workspaceId;
        }

        if ($principalType === 'user') {
            if ($principalId !== null) {
                if ((new WorkspaceMemberRepository($this->pdo))->find($workspaceId, $principalId) === null) {
                    throw new AuthException('PRINCIPAL_NOT_FOUND', 'User is not an active workspace member.', 404);
                }

                return $principalId;
            }

            if ($principalIdentifier === null) {
                throw new AuthException('VALIDATION_ERROR', 'User id, username, or email is required.', 422);
            }

            $user = (new UserRepository($this->pdo))->findByIdentifier($principalIdentifier);
            if ($user === null || $user['status'] !== 'active') {
                throw new AuthException('PRINCIPAL_NOT_FOUND', 'User was not found or is not active.', 404);
            }

            return (int) $user['id'];
        }

        if ($principalId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Principal id is required.', 422);
        }

        $groupWorkspaceId = (new WorkgroupRepository($this->pdo))->workspaceIdForWorkgroup($principalId);
        if ($groupWorkspaceId !== $workspaceId) {
            throw new AuthException('PRINCIPAL_NOT_FOUND', 'Workgroup was not found in this workspace.', 404);
        }

        return $principalId;
    }

    private function requireShareManage(int $budgetId, int $userId): int
    {
        $permissions = new PermissionGuard($this->pdo, $this->authenticator);
        $workspaceId = $permissions->workspaceIdForBudget($budgetId);
        $permissions->requireBudgetRole($budgetId, $userId, ['owner', 'admin']);

        return $workspaceId;
    }

    private function validateRole(string $role): void
    {
        if (!in_array($role, self::ASSIGNABLE_ROLES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Budget share role must be editor, viewer, or auditor.', 422);
        }
    }

    private function boolean(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value)) {
            return $value === 1;
        }

        if (is_string($value)) {
            return in_array(strtolower($value), ['1', 'true', 'yes'], true);
        }

        return false;
    }

    private function expiresAt(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        $date = Input::date($trimmed);
        if ($date !== null) {
            return "{$date} 23:59:59";
        }

        $dateTime = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $trimmed);
        if ($dateTime !== false && $dateTime->format('Y-m-d H:i:s') === $trimmed) {
            return $trimmed;
        }

        throw new AuthException('VALIDATION_ERROR', 'expiresAt must use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.', 422);
    }
}
