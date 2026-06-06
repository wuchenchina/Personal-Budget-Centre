<?php

declare(strict_types=1);

namespace BudgetCentre\Auth;

use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\SessionRepository;
use BudgetCentre\Repositories\WorkspaceRepository;
use PDO;

final readonly class SessionAuthenticator
{
    public function __construct(
        private PDO $pdo,
        private SessionManager $sessionManager,
    ) {
    }

    public function activeSession(Request $request): ?array
    {
        $token = $this->sessionTokenFromRequest($request);
        if ($token === null) {
            return null;
        }

        return (new SessionRepository($this->pdo))->findActiveByTokenHash(
            $this->sessionManager->hashToken($token),
        );
    }

    public function authenticatedSession(Request $request): array
    {
        $session = $this->activeSession($request);
        if ($session === null) {
            throw new AuthException('UNAUTHENTICATED', 'Authentication is required.', 401);
        }

        return $session;
    }

    public function currentWorkspaceForSession(array $session): ?array
    {
        $workspaces = new WorkspaceRepository($this->pdo);
        $workspaceId = isset($session['current_workspace_id'])
            ? (int) $session['current_workspace_id']
            : 0;

        if ($workspaceId > 0) {
            $workspace = $workspaces->findForUser($workspaceId, (int) $session['user_id']);
            if ($workspace !== null) {
                return $workspace;
            }
        }

        return $workspaces->firstForUser((int) $session['user_id']);
    }

    public function requireWorkspaceRole(
        int $workspaceId,
        int $userId,
        array $allowedRoles = [],
    ): string {
        $role = (new WorkspaceRepository($this->pdo))->roleForUser($workspaceId, $userId);
        if ($role === null) {
            throw new AuthException('FORBIDDEN', 'Workspace access is required.', 403);
        }

        if ($allowedRoles !== [] && !in_array($role, $allowedRoles, true)) {
            throw new AuthException('FORBIDDEN', 'You do not have permission for this workspace.', 403);
        }

        return $role;
    }

    public function sessionTokenFromRequest(Request $request): ?string
    {
        $token = $request->cookies[$this->sessionManager->cookieName()] ?? null;

        return is_string($token) && $token !== '' ? $token : null;
    }

    public function tokenHash(string $token): string
    {
        return $this->sessionManager->hashToken($token);
    }
}
