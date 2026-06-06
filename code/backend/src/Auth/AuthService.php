<?php

declare(strict_types=1);

namespace BudgetCentre\Auth;

use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Repositories\SessionRepository;
use BudgetCentre\Repositories\UserRepository;
use BudgetCentre\Repositories\WorkspaceRepository;
use BudgetCentre\Support\Input;
use PDO;
use Throwable;

final readonly class AuthService
{
    public function __construct(
        private PDO $pdo,
        private SessionManager $sessionManager,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function register(array $input, Request $request): array
    {
        $email = Input::normalizedEmail($input['email'] ?? null);
        $password = Input::string($input['password'] ?? null);
        $displayName = Input::string($input['displayName'] ?? $input['display_name'] ?? null);
        $currencyCode = strtoupper(
            Input::string($input['defaultCurrency'] ?? $input['default_currency'] ?? null) ?? 'CNY',
        );

        if ($email === null) {
            throw new AuthException('VALIDATION_ERROR', 'A valid email is required.', 422);
        }

        if ($password === null || strlen($password) < 10) {
            throw new AuthException('VALIDATION_ERROR', 'Password must be at least 10 characters.', 422);
        }

        if ($displayName === null) {
            throw new AuthException('VALIDATION_ERROR', 'Display name is required.', 422);
        }

        $users = new UserRepository($this->pdo);
        if ($users->findByEmail($email) !== null) {
            throw new AuthException('EMAIL_ALREADY_EXISTS', 'Email is already registered.', 409);
        }

        $currencyId = (new CurrencyRepository($this->pdo))->findIdByCode($currencyCode);
        if ($currencyId === null) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Default currency is not available.', 422);
        }

        $this->pdo->beginTransaction();
        try {
            $userId = $users->create(
                $email,
                password_hash($password, PASSWORD_DEFAULT),
                $displayName,
                $currencyId,
            );
            $workspaceId = (new WorkspaceRepository($this->pdo))->createPersonalWorkspace(
                $userId,
                "{$displayName} Personal",
                $currencyId,
            );
            $session = $this->createSession($userId, $request, $workspaceId);
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        $this->sessionManager->issueCookie($session['token']);

        return [
            'user' => $this->publicUser($users->findById($userId) ?? []),
            'workspace' => [
                'id' => $workspaceId,
                'name' => "{$displayName} Personal",
                'type' => 'personal',
                'role' => 'owner',
                'status' => 'active',
                'defaultCurrency' => $currencyCode,
            ],
        ];
    }

    public function login(array $input, Request $request): array
    {
        $email = Input::normalizedEmail($input['email'] ?? null);
        $password = Input::string($input['password'] ?? null);

        if ($email === null || $password === null) {
            throw new AuthException('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
        }

        $users = new UserRepository($this->pdo);
        $user = $users->findByEmail($email);
        if (
            $user === null
            || $user['status'] !== 'active'
            || !is_string($user['password_hash'])
            || !password_verify($password, $user['password_hash'])
        ) {
            throw new AuthException('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
        }

        $userId = (int) $user['id'];
        $workspace = (new WorkspaceRepository($this->pdo))->firstForUser($userId);
        $session = $this->createSession(
            $userId,
            $request,
            $workspace === null ? null : (int) $workspace['id'],
        );
        $this->sessionManager->issueCookie($session['token']);

        return [
            'user' => $this->publicUser($user),
            'workspace' => $workspace,
        ];
    }

    public function logout(Request $request): void
    {
        $token = $this->authenticator->sessionTokenFromRequest($request);
        if ($token !== null) {
            (new SessionRepository($this->pdo))->deleteByTokenHash(
                $this->authenticator->tokenHash($token),
            );
        }

        $this->sessionManager->clearCookie();
    }

    public function me(Request $request): array
    {
        $session = $this->authenticator->activeSession($request);
        if ($session === null) {
            throw new AuthException('UNAUTHENTICATED', 'Authentication is required.', 401);
        }

        return [
            'user' => $this->publicUser([
                'id' => $session['user_id'],
                'email' => $session['email'],
                'display_name' => $session['display_name'],
                'timezone' => $session['timezone'],
                'locale' => $session['locale'],
                'status' => $session['status'],
            ]),
            'workspace' => $this->authenticator->currentWorkspaceForSession($session),
        ];
    }

    private function createSession(int $userId, Request $request, ?int $currentWorkspaceId = null): array
    {
        $token = $this->sessionManager->newToken();
        (new SessionRepository($this->pdo))->create(
            $userId,
            $this->sessionManager->hashToken($token),
            $request->ipAddress,
            $request->userAgent,
            $this->sessionManager->expiresAt(),
            $currentWorkspaceId,
        );

        return ['token' => $token];
    }

    private function publicUser(array $user): array
    {
        return [
            'id' => isset($user['id']) ? (int) $user['id'] : null,
            'email' => $user['email'] ?? null,
            'displayName' => $user['display_name'] ?? null,
            'timezone' => $user['timezone'] ?? null,
            'locale' => $user['locale'] ?? null,
            'status' => $user['status'] ?? null,
        ];
    }
}
