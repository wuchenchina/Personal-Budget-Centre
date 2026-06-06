<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Repositories\SessionRepository;
use BudgetCentre\Repositories\UserRepository;
use BudgetCentre\Repositories\WorkspaceMemberRepository;
use BudgetCentre\Repositories\WorkspaceRepository;
use BudgetCentre\Support\Input;
use PDO;
use Throwable;

final readonly class WorkspaceService
{
    private const WORKSPACE_TYPES = ['family', 'team', 'custom'];
    private const ASSIGNABLE_ROLES = ['admin', 'editor', 'viewer', 'auditor'];

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function workspaces(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);

        return (new WorkspaceRepository($this->pdo))->listForUser((int) $session['user_id']);
    }

    public function createWorkspace(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $name = Input::string($input['name'] ?? null);
        $type = Input::string($input['type'] ?? null) ?? 'team';
        $currencyCode = strtoupper(
            Input::string($input['defaultCurrency'] ?? $input['default_currency'] ?? null) ?? 'CNY',
        );

        if ($name === null || strlen($name) > 160) {
            throw new AuthException('VALIDATION_ERROR', 'Workspace name is required and must be 160 characters or less.', 422);
        }

        if (!in_array($type, self::WORKSPACE_TYPES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Workspace type must be family, team, or custom.', 422);
        }

        $currencyId = (new CurrencyRepository($this->pdo))->findIdByCode($currencyCode);
        if ($currencyId === null) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Default currency is not available.', 422);
        }

        $this->pdo->beginTransaction();
        try {
            $workspaceId = (new WorkspaceRepository($this->pdo))->createWorkspace(
                (int) $session['user_id'],
                $name,
                $type,
                $currencyId,
            );
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return [
            'id' => $workspaceId,
            'name' => $name,
            'type' => $type,
            'role' => 'owner',
            'status' => 'active',
            'defaultCurrency' => $currencyCode,
        ];
    }

    public function switchWorkspace(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId is required.', 422);
        }

        $this->permissions()->requireWorkspaceRole($workspaceId, (int) $session['user_id']);

        $workspace = (new WorkspaceRepository($this->pdo))->findForUser(
            $workspaceId,
            (int) $session['user_id'],
        );
        if ($workspace === null) {
            throw new AuthException('FORBIDDEN', 'Workspace access is required.', 403);
        }

        $token = $this->authenticator->sessionTokenFromRequest($request);
        if ($token === null) {
            throw new AuthException('UNAUTHENTICATED', 'Authentication is required.', 401);
        }

        (new SessionRepository($this->pdo))->updateCurrentWorkspaceByTokenHash(
            $this->authenticator->tokenHash($token),
            $workspaceId,
        );

        return $workspace;
    }

    public function workspaceMembers(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($request->query['workspaceId'] ?? null);
        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId query parameter is required.', 422);
        }

        $this->permissions()->requireWorkspaceRole($workspaceId, (int) $session['user_id']);

        return (new WorkspaceMemberRepository($this->pdo))->listForWorkspace($workspaceId);
    }

    public function addWorkspaceMember(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $email = Input::normalizedEmail($input['email'] ?? null);
        $role = Input::string($input['role'] ?? null) ?? 'viewer';

        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId is required.', 422);
        }

        if ($email === null) {
            throw new AuthException('VALIDATION_ERROR', 'A valid email is required.', 422);
        }

        $this->validateAssignableWorkspaceRole($role);
        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::MEMBER_MANAGE_ROLES,
        );

        $user = (new UserRepository($this->pdo))->findByEmail($email);
        if ($user === null || $user['status'] !== 'active') {
            throw new AuthException('USER_NOT_FOUND', 'Active user was not found.', 404);
        }

        $targetUserId = (int) $user['id'];
        $this->assertCanMutateWorkspaceMember($workspaceId, (int) $session['user_id'], $targetUserId);

        $repository = new WorkspaceMemberRepository($this->pdo);
        $this->pdo->beginTransaction();
        try {
            $repository->add($workspaceId, $targetUserId, $role);
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return $repository->find($workspaceId, $targetUserId) ?? [
            'workspaceId' => $workspaceId,
            'userId' => $targetUserId,
            'email' => $user['email'],
            'displayName' => $user['display_name'],
            'role' => $role,
            'status' => 'active',
        ];
    }

    public function updateWorkspaceMember(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $userId = Input::positiveInt($input['userId'] ?? $input['user_id'] ?? null);
        $role = Input::string($input['role'] ?? null);

        if ($workspaceId === null || $userId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId and userId are required.', 422);
        }

        if ($role === null) {
            throw new AuthException('VALIDATION_ERROR', 'Workspace role is required.', 422);
        }

        $this->validateAssignableWorkspaceRole($role);
        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::MEMBER_MANAGE_ROLES,
        );
        $this->assertCanMutateWorkspaceMember($workspaceId, (int) $session['user_id'], $userId);

        $repository = new WorkspaceMemberRepository($this->pdo);
        if ($repository->find($workspaceId, $userId) === null) {
            throw new AuthException('MEMBER_NOT_FOUND', 'Workspace member was not found.', 404);
        }

        $repository->updateRole($workspaceId, $userId, $role);

        return $repository->find($workspaceId, $userId) ?? [
            'workspaceId' => $workspaceId,
            'userId' => $userId,
            'role' => $role,
            'status' => 'active',
        ];
    }

    public function deleteWorkspaceMember(array $input, Request $request): void
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $userId = Input::positiveInt($input['userId'] ?? $input['user_id'] ?? null);

        if ($workspaceId === null || $userId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId and userId are required.', 422);
        }

        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::MEMBER_MANAGE_ROLES,
        );
        $this->assertCanMutateWorkspaceMember($workspaceId, (int) $session['user_id'], $userId);

        $repository = new WorkspaceMemberRepository($this->pdo);
        if ($repository->find($workspaceId, $userId) === null) {
            throw new AuthException('MEMBER_NOT_FOUND', 'Workspace member was not found.', 404);
        }

        $repository->remove($workspaceId, $userId);
    }

    private function permissions(): PermissionGuard
    {
        return new PermissionGuard($this->pdo, $this->authenticator);
    }

    private function validateAssignableWorkspaceRole(string $role): void
    {
        if (!in_array($role, self::ASSIGNABLE_ROLES, true)) {
            throw new AuthException(
                'VALIDATION_ERROR',
                'Workspace role must be admin, editor, viewer, or auditor.',
                422,
            );
        }
    }

    private function assertCanMutateWorkspaceMember(
        int $workspaceId,
        int $actorUserId,
        int $targetUserId,
    ): void {
        if ($actorUserId === $targetUserId) {
            throw new AuthException('VALIDATION_ERROR', 'You cannot change your own workspace membership.', 422);
        }

        $targetRole = (new WorkspaceRepository($this->pdo))->roleForUser($workspaceId, $targetUserId);
        if ($targetRole === 'owner') {
            throw new AuthException('FORBIDDEN', 'Workspace owner membership cannot be changed here.', 403);
        }
    }
}
