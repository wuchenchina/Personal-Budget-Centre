<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\AuthService;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Auth\SessionManager;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\AdminUserRepository;
use BudgetCentre\Repositories\UserRepository;
use BudgetCentre\Support\Input;
use PDO;

final readonly class AdminUserService
{
    private const STATUSES = ['active', 'pending', 'disabled'];

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
        private SessionManager $sessionManager,
    ) {
    }

    public function users(Request $request): array
    {
        $this->requireAdmin($request);

        $search = Input::string($request->query['search'] ?? null) ?? '';
        $status = Input::string($request->query['status'] ?? null);
        if ($status !== null && !in_array($status, self::STATUSES, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Invalid user status.', 422);
        }

        $page = max(1, (int) ($request->query['page'] ?? 1));
        $pageSize = min(100, max(10, (int) ($request->query['pageSize'] ?? 30)));
        $offset = ($page - 1) * $pageSize;
        $repository = new AdminUserRepository($this->pdo);

        return [
            'users' => array_map(
                fn (array $user): array => $this->publicUser($user),
                $repository->users($search, $status, $pageSize, $offset),
            ),
            'total' => $repository->count($search, $status),
            'page' => $page,
            'pageSize' => $pageSize,
        ];
    }

    public function updateUser(array $input, Request $request): array
    {
        $adminSession = $this->requireAdmin($request);
        $userId = Input::positiveInt($input['id'] ?? null);
        if ($userId === null) {
            throw new AuthException('VALIDATION_ERROR', 'User id is required.', 422);
        }

        $repository = new AdminUserRepository($this->pdo);
        $currentUser = $repository->findById($userId);
        if ($currentUser === null) {
            throw new AuthException('USER_NOT_FOUND', 'User was not found.', 404);
        }

        $fields = [];
        if (array_key_exists('displayName', $input)) {
            $displayName = Input::string($input['displayName']);
            if ($displayName === null || strlen($displayName) > 120) {
                throw new AuthException('VALIDATION_ERROR', 'Display name is invalid.', 422);
            }
            $fields['display_name'] = $displayName;
        }

        if (array_key_exists('username', $input)) {
            $fields['username'] = $this->validatedUsername($input['username'] ?? null, $userId);
        }

        if (array_key_exists('status', $input)) {
            $status = Input::string($input['status']);
            if ($status === null || !in_array($status, self::STATUSES, true)) {
                throw new AuthException('VALIDATION_ERROR', 'Invalid user status.', 422);
            }

            if ((int) $adminSession['user_id'] === $userId && $status !== 'active') {
                throw new AuthException('VALIDATION_ERROR', 'You cannot disable your own account.', 422);
            }
            $fields['status'] = $status;
        }

        if (array_key_exists('isAdmin', $input)) {
            $isAdmin = $this->bool($input['isAdmin']);
            if ($isAdmin === null) {
                throw new AuthException('VALIDATION_ERROR', 'Admin flag is invalid.', 422);
            }

            if ((int) $adminSession['user_id'] === $userId && !$isAdmin) {
                throw new AuthException('VALIDATION_ERROR', 'You cannot revoke your own admin access.', 422);
            }
            $fields['is_admin'] = $isAdmin ? 1 : 0;
        }

        if (array_key_exists('emailVerified', $input)) {
            $emailVerified = $this->bool($input['emailVerified']);
            if ($emailVerified === null) {
                throw new AuthException('VALIDATION_ERROR', 'Email verification flag is invalid.', 422);
            }

            $fields['email_verified_at'] = $emailVerified ? 'now' : null;
            if ($emailVerified && !array_key_exists('status', $fields) && $currentUser['status'] === 'pending') {
                $fields['status'] = 'active';
            }
        }

        $updatedUser = $repository->update($userId, $fields);
        if ($updatedUser === null) {
            throw new AuthException('USER_NOT_FOUND', 'User was not found.', 404);
        }

        return ['user' => $this->publicUser($updatedUser)];
    }

    public function resendVerification(array $input, Request $request): array
    {
        $this->requireAdmin($request);
        $userId = Input::positiveInt($input['id'] ?? null);
        if ($userId === null) {
            throw new AuthException('VALIDATION_ERROR', 'User id is required.', 422);
        }

        $auth = new AuthService($this->pdo, $this->sessionManager, $this->authenticator);

        return $auth->resendEmailVerificationForUserId($userId);
    }

    private function requireAdmin(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        if (!isset($session['is_admin']) || !(bool) $session['is_admin']) {
            throw new AuthException('FORBIDDEN', 'Admin access is required.', 403);
        }

        return $session;
    }

    private function validatedUsername(mixed $value, int $userId): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $username = Input::username($value);
        if ($username === null) {
            throw new AuthException('VALIDATION_ERROR', 'Username is invalid.', 422);
        }

        $existing = (new UserRepository($this->pdo))->findByUsername($username);
        if ($existing !== null && (int) $existing['id'] !== $userId) {
            throw new AuthException('USERNAME_ALREADY_EXISTS', 'Username is already registered.', 409);
        }

        return $username;
    }

    private function bool(mixed $value): ?bool
    {
        return is_bool($value) ? $value : null;
    }

    private function publicUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'username' => $user['username'],
            'displayName' => $user['display_name'],
            'status' => $user['status'],
            'isAdmin' => (bool) $user['is_admin'],
            'emailVerifiedAt' => $user['email_verified_at'],
            'emailVerificationSentAt' => $user['email_verification_sent_at'] ?? null,
            'defaultCurrency' => $user['default_currency_code'] ?? null,
            'createdAt' => $user['created_at'],
            'updatedAt' => $user['updated_at'],
        ];
    }
}
