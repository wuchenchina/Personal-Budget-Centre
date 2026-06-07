<?php

declare(strict_types=1);

namespace BudgetCentre\Auth;

use BudgetCentre\Repositories\EmailVerificationRepository;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Repositories\SessionRepository;
use BudgetCentre\Repositories\UserRepository;
use BudgetCentre\Repositories\WorkspaceRepository;
use BudgetCentre\Services\SmtpMailer;
use BudgetCentre\Support\Env;
use BudgetCentre\Support\Input;
use DateTimeImmutable;
use PDO;
use RuntimeException;
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
        $username = Input::username($input['username'] ?? null);
        $password = Input::string($input['password'] ?? null);
        $displayName = Input::string($input['displayName'] ?? $input['display_name'] ?? null);
        $currencyCode = strtoupper(
            Input::string($input['defaultCurrency'] ?? $input['default_currency'] ?? null) ?? 'CNY',
        );

        if ($email === null) {
            throw new AuthException('VALIDATION_ERROR', 'A valid email is required.', 422);
        }

        if ($username === null) {
            throw new AuthException(
                'VALIDATION_ERROR',
                'Username must be 3-32 characters and only use letters, numbers, dots, dashes, or underscores.',
                422,
            );
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

        if ($users->findByUsername($username) !== null) {
            throw new AuthException('USERNAME_ALREADY_EXISTS', 'Username is already registered.', 409);
        }

        $currencyId = (new CurrencyRepository($this->pdo))->findIdByCode($currencyCode);
        if ($currencyId === null) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Default currency is not available.', 422);
        }

        $this->pdo->beginTransaction();
        try {
            $userId = $users->create(
                $email,
                $username,
                password_hash($password, PASSWORD_DEFAULT),
                $displayName,
                $currencyId,
            );
            $workspaceId = (new WorkspaceRepository($this->pdo))->createPersonalWorkspace(
                $userId,
                "{$displayName} Personal",
                $currencyId,
            );
            $token = $this->createEmailVerificationToken($userId);
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        $this->sendVerificationEmail($email, $displayName, $token);

        return [
            'requiresEmailVerification' => true,
            'email' => $email,
        ];
    }

    public function login(array $input, Request $request): array
    {
        $identifier = Input::string($input['identifier'] ?? $input['email'] ?? null);
        $password = Input::string($input['password'] ?? null);

        if ($identifier === null || $password === null) {
            throw new AuthException('INVALID_CREDENTIALS', 'Invalid username/email or password.', 401);
        }

        $users = new UserRepository($this->pdo);
        $user = $users->findByIdentifier($identifier);
        if (
            $user === null
            || $user['status'] === 'disabled'
            || !is_string($user['password_hash'])
            || !password_verify($password, $user['password_hash'])
        ) {
            throw new AuthException('INVALID_CREDENTIALS', 'Invalid username/email or password.', 401);
        }

        if (($user['email_verified_at'] ?? null) === null) {
            $token = $this->createEmailVerificationToken((int) $user['id']);
            $this->sendVerificationEmail(
                (string) $user['email'],
                (string) $user['display_name'],
                $token,
            );
            throw new AuthException(
                'EMAIL_NOT_VERIFIED',
                'Email verification is required before login. A new verification email has been sent.',
                403,
                ['email' => $user['email']],
            );
        }

        if ($user['status'] !== 'active') {
            throw new AuthException('INVALID_CREDENTIALS', 'Invalid username/email or password.', 401);
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
            'csrfToken' => $this->sessionManager->csrfToken($session['token']),
        ];
    }

    public function verifyEmail(string $token): array
    {
        if ($token === '') {
            throw new AuthException('VALIDATION_ERROR', 'Verification token is required.', 422);
        }

        $tokens = new EmailVerificationRepository($this->pdo);
        $tokenHash = $this->tokenHash($token);
        $record = $tokens->activeByTokenHash($tokenHash);
        if ($record === null) {
            $usedRecord = $tokens->byTokenHash($tokenHash);
            if ($usedRecord !== null && ($usedRecord['email_verified_at'] ?? null) !== null) {
                return [
                    'verified' => true,
                    'alreadyVerified' => true,
                    'email' => $usedRecord['email'],
                    'username' => $usedRecord['username'],
                ];
            }

            throw new AuthException('INVALID_EMAIL_TOKEN', 'Verification link is invalid or expired.', 422);
        }

        $this->pdo->beginTransaction();
        try {
            (new UserRepository($this->pdo))->markEmailVerified((int) $record['user_id']);
            $tokens->markUsed((int) $record['id']);
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return [
            'verified' => true,
            'alreadyVerified' => false,
            'email' => $record['email'],
            'username' => $record['username'],
        ];
    }

    public function resendEmailVerification(array $input): array
    {
        $email = Input::normalizedEmail($input['email'] ?? null);
        if ($email === null) {
            throw new AuthException('VALIDATION_ERROR', 'A valid email is required.', 422);
        }

        $users = new UserRepository($this->pdo);
        $user = $users->findByEmail($email);
        if ($user !== null && ($user['email_verified_at'] ?? null) === null) {
            $token = $this->createEmailVerificationToken((int) $user['id']);
            $this->sendVerificationEmail($email, (string) $user['display_name'], $token);
        }

        return [
            'sent' => true,
            'email' => $email,
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

    public function me(Request $request): ?array
    {
        $token = $this->authenticator->sessionTokenFromRequest($request);
        if ($token === null) {
            return null;
        }

        $session = $this->authenticator->activeSession($request);
        if ($session === null) {
            $this->sessionManager->clearCookie();

            return null;
        }

        return [
            'user' => $this->publicUser([
                'id' => $session['user_id'],
                'email' => $session['email'],
                'username' => $session['username'] ?? null,
                'display_name' => $session['display_name'],
                'timezone' => $session['timezone'],
                'locale' => $session['locale'],
                'status' => $session['status'],
                'is_admin' => $session['is_admin'] ?? 0,
                'email_verified_at' => $session['email_verified_at'] ?? null,
            ]),
            'workspace' => $this->authenticator->currentWorkspaceForSession($session),
            'csrfToken' => $this->sessionManager->csrfToken($token),
        ];
    }

    public function updateProfile(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $userId = (int) $session['user_id'];
        $email = Input::normalizedEmail($input['email'] ?? null);
        $displayName = Input::string($input['displayName'] ?? $input['display_name'] ?? null);

        if ($email === null) {
            throw new AuthException('VALIDATION_ERROR', 'A valid email is required.', 422);
        }

        if ($displayName === null || strlen($displayName) > 120) {
            throw new AuthException(
                'VALIDATION_ERROR',
                'Display name is required and must be 120 characters or less.',
                422,
            );
        }

        $users = new UserRepository($this->pdo);
        $currentUser = $users->findWithPasswordById($userId)
            ?? throw new AuthException('USER_NOT_FOUND', 'User was not found.', 404);
        $existingUser = $users->findByEmail($email);
        if ($existingUser !== null && (int) $existingUser['id'] !== $userId) {
            throw new AuthException('EMAIL_ALREADY_EXISTS', 'Email is already registered.', 409);
        }

        $emailChanged = strtolower((string) $currentUser['email']) !== $email;
        $verificationToken = null;

        $this->pdo->beginTransaction();
        try {
            $users->updateProfile($userId, $email, $displayName, $emailChanged);
            if ($emailChanged) {
                $verificationToken = $this->createEmailVerificationToken($userId);
            }
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        if ($verificationToken !== null) {
            $this->sendVerificationEmail($email, $displayName, $verificationToken);
        }

        return [
            'session' => $this->me($request),
            'emailVerificationSent' => $emailChanged,
        ];
    }

    public function updatePassword(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $currentPassword = Input::string($input['currentPassword'] ?? $input['current_password'] ?? null);
        $newPassword = Input::string($input['password'] ?? $input['newPassword'] ?? $input['new_password'] ?? null);

        if ($currentPassword === null || $newPassword === null) {
            throw new AuthException('VALIDATION_ERROR', 'Current password and new password are required.', 422);
        }

        if (strlen($newPassword) < 10) {
            throw new AuthException('VALIDATION_ERROR', 'Password must be at least 10 characters.', 422);
        }

        $users = new UserRepository($this->pdo);
        $user = $users->findWithPasswordById((int) $session['user_id'])
            ?? throw new AuthException('USER_NOT_FOUND', 'User was not found.', 404);
        if (!is_string($user['password_hash']) || !password_verify($currentPassword, $user['password_hash'])) {
            throw new AuthException('INVALID_CREDENTIALS', 'Current password is incorrect.', 401);
        }

        $users->updatePasswordHash((int) $session['user_id'], password_hash($newPassword, PASSWORD_DEFAULT));

        return [
            'changed' => true,
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
            'username' => $user['username'] ?? null,
            'displayName' => $user['display_name'] ?? null,
            'timezone' => $user['timezone'] ?? null,
            'locale' => $user['locale'] ?? null,
            'status' => $user['status'] ?? null,
            'isAdmin' => isset($user['is_admin']) && (bool) $user['is_admin'],
            'emailVerifiedAt' => $user['email_verified_at'] ?? null,
        ];
    }

    public function resendEmailVerificationForUserId(int $userId): array
    {
        $user = (new UserRepository($this->pdo))->findAdminMailTargetById($userId);
        if ($user === null) {
            throw new AuthException('USER_NOT_FOUND', 'User was not found.', 404);
        }

        if (($user['email_verified_at'] ?? null) !== null) {
            return [
                'sent' => false,
                'email' => $user['email'],
                'alreadyVerified' => true,
            ];
        }

        $token = $this->createEmailVerificationToken((int) $user['id']);
        $this->sendVerificationEmail(
            (string) $user['email'],
            (string) $user['display_name'],
            $token,
        );

        return [
            'sent' => true,
            'email' => $user['email'],
            'alreadyVerified' => false,
        ];
    }

    private function createEmailVerificationToken(int $userId): string
    {
        $token = bin2hex(random_bytes(32));
        (new EmailVerificationRepository($this->pdo))->create(
            $userId,
            $this->tokenHash($token),
            new DateTimeImmutable('+24 hours'),
        );
        (new UserRepository($this->pdo))->markEmailVerificationSent($userId);

        return $token;
    }

    private function sendVerificationEmail(string $email, string $displayName, string $token): void
    {
        $appUrl = rtrim(Env::string('APP_URL', 'http://localhost:5173') ?? 'http://localhost:5173', '/');
        $link = "{$appUrl}/email/verify?token={$token}";
        $body = <<<TEXT
{$displayName}，你好：

请打开下面的链接验证你的 BudgetCentre 邮箱：

{$link}

此链接 24 小时内有效。如果不是你本人操作，可以忽略这封邮件。

BudgetCentre
TEXT;

        try {
            (new SmtpMailer())->send($email, '验证你的 BudgetCentre 邮箱', $body);
        } catch (RuntimeException $exception) {
            throw new AuthException(
                'MAIL_DELIVERY_FAILED',
                'Email delivery failed. Please try again later.',
                503,
                ['detail' => Env::string('APP_ENV') === 'local' ? $exception->getMessage() : null],
            );
        }
    }

    private function tokenHash(string $token): string
    {
        return hash('sha256', $token);
    }
}
