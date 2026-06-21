<?php

declare(strict_types=1);

namespace BudgetCentre\Auth;

use BudgetCentre\Repositories\EmailVerificationRepository;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Repositories\SessionRepository;
use BudgetCentre\Repositories\UserSsoBindingRepository;
use BudgetCentre\Repositories\UserRepository;
use BudgetCentre\Repositories\WorkspaceRepository;
use BudgetCentre\Services\BudgetPdf\BudgetPdfTheme;
use BudgetCentre\Services\SmtpMailer;
use BudgetCentre\Support\Env;
use BudgetCentre\Support\Input;
use BudgetCentre\Support\PdfLanguages;
use DateTimeImmutable;
use PDO;
use RuntimeException;
use Throwable;

final readonly class AuthService
{
    private const CASDOOR_PKCE_COOKIE = 'budgetcentre_casdoor_pkce';

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
                'password_hash' => $session['password_hash'] ?? null,
                'display_name' => $session['display_name'],
                'avatar_url' => $session['avatar_url'] ?? null,
                'timezone' => $session['timezone'],
                'locale' => $session['locale'],
                'default_pdf_theme' => $session['default_pdf_theme'] ?? BudgetPdfTheme::DEFAULT,
                'pdf_export_settings' => $session['pdf_export_settings'] ?? null,
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
        if (!is_string($currentUser['password_hash'] ?? null) && strtolower((string) $currentUser['email']) !== $email) {
            throw new AuthException(
                'SSO_ONLY_EMAIL_LOCKED',
                'SSO-only accounts cannot change email directly. Bind an existing account to merge data.',
                409,
            );
        }
        $existingUser = $users->findByEmail($email);
        if ($existingUser !== null && (int) $existingUser['id'] !== $userId) {
            throw new AuthException('EMAIL_ALREADY_EXISTS', 'Email is already registered.', 409);
        }

        $emailChanged = strtolower((string) $currentUser['email']) !== $email;
        $defaultPdfTheme = BudgetPdfTheme::normalize(
            $input['defaultPdfTheme']
            ?? $input['default_pdf_theme']
            ?? $currentUser['default_pdf_theme']
            ?? BudgetPdfTheme::DEFAULT,
        );
        $pdfExportSettings = $this->pdfExportSettingsJsonFromInput($input, $currentUser['pdf_export_settings'] ?? null);
        $verificationToken = null;

        $this->pdo->beginTransaction();
        try {
            $users->updateProfile(
                $userId,
                $email,
                $displayName,
                $defaultPdfTheme,
                $pdfExportSettings,
                $emailChanged,
            );
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
        if (!is_string($user['password_hash'] ?? null)) {
            throw new AuthException(
                'SSO_ONLY_PASSWORD_DISABLED',
                'SSO-only accounts cannot create a password. Bind an existing account to merge data.',
                409,
            );
        }
        if (!is_string($user['password_hash']) || !password_verify($currentPassword, $user['password_hash'])) {
            throw new AuthException('INVALID_CREDENTIALS', 'Current password is incorrect.', 401);
        }

        $users->updatePasswordHash((int) $session['user_id'], password_hash($newPassword, PASSWORD_DEFAULT));

        return [
            'changed' => true,
        ];
    }

    public function ssoBinding(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $binding = (new UserSsoBindingRepository($this->pdo))->findByUserId((int) $session['user_id']);

        return [
            'binding' => $binding === null ? null : $this->publicSsoBinding($binding),
        ];
    }

    public function unlinkSso(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $user = (new UserRepository($this->pdo))->findWithPasswordById((int) $session['user_id'])
            ?? throw new AuthException('USER_NOT_FOUND', 'User was not found.', 404);
        if (!is_string($user['password_hash'] ?? null)) {
            throw new AuthException(
                'SSO_ONLY_UNLINK_DISABLED',
                'SSO-only accounts cannot unlink SSO before binding an existing account.',
                409,
            );
        }

        (new UserSsoBindingRepository($this->pdo))->deleteByUserId((int) $session['user_id']);

        return [
            'binding' => null,
        ];
    }

    public function mergeSsoAccount(array $input, Request $request): array
    {
        $action = Input::string($input['action'] ?? null);

        return match ($action) {
            'begin' => $this->beginSsoAccountMerge($request),
            'complete' => $this->completeSsoAccountMerge($input, $request),
            default => throw new AuthException('VALIDATION_ERROR', 'SSO merge action is required.', 422),
        };
    }

    private function beginSsoAccountMerge(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $sourceUserId = (int) $session['user_id'];
        $users = new UserRepository($this->pdo);
        $sourceUser = $users->findWithPasswordById($sourceUserId)
            ?? throw new AuthException('USER_NOT_FOUND', 'Current SSO account was not found.', 404);
        if (is_string($sourceUser['password_hash'] ?? null)) {
            throw new AuthException(
                'SSO_MERGE_SOURCE_NOT_SSO_ONLY',
                'Only SSO-only accounts can be merged into an existing account.',
                409,
            );
        }

        $bindingRepository = new UserSsoBindingRepository($this->pdo);
        $binding = $bindingRepository->findByUserId($sourceUserId);
        if ($binding === null) {
            throw new AuthException('SSO_MERGE_BINDING_REQUIRED', 'Current account is not linked to SSO.', 409);
        }

        return [
            'mergeToken' => $this->issueSsoMergeToken($sourceUserId, (string) $binding['provider_subject']),
        ];
    }

    private function completeSsoAccountMerge(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $targetUserId = (int) $session['user_id'];
        $merge = $this->ssoMergePayload($input);
        $sourceUserId = (int) $merge['sourceUserId'];
        $providerSubject = Input::string($merge['providerSubject'] ?? null);
        if ($sourceUserId === $targetUserId || $providerSubject === null) {
            throw new AuthException('SSO_MERGE_TOKEN_INVALID', 'SSO account merge token is invalid.', 422);
        }

        $users = new UserRepository($this->pdo);
        $sourceUser = $users->findWithPasswordById($sourceUserId)
            ?? throw new AuthException('USER_NOT_FOUND', 'SSO account was not found.', 404);
        if (is_string($sourceUser['password_hash'] ?? null)) {
            throw new AuthException(
                'SSO_MERGE_SOURCE_NOT_SSO_ONLY',
                'Only SSO-only accounts can be merged into an existing account.',
                409,
            );
        }

        $targetUser = $users->findWithPasswordById($targetUserId)
            ?? throw new AuthException('USER_NOT_FOUND', 'Existing account was not found.', 404);
        if (!is_string($targetUser['password_hash'] ?? null)) {
            throw new AuthException(
                'SSO_MERGE_TARGET_PASSWORD_REQUIRED',
                'Target account must be a password account.',
                409,
            );
        }

        $bindingRepository = new UserSsoBindingRepository($this->pdo);
        $binding = $bindingRepository->findByUserId($sourceUserId);
        if ($binding === null || !hash_equals($providerSubject, (string) $binding['provider_subject'])) {
            throw new AuthException('SSO_MERGE_TOKEN_INVALID', 'SSO account merge token is invalid.', 422);
        }
        $existingTargetBinding = $bindingRepository->findByUserId($targetUserId);
        if ($existingTargetBinding !== null) {
            throw new AuthException(
                'SSO_TARGET_ALREADY_BOUND',
                'The existing account is already linked to an SSO account.',
                409,
            );
        }

        $this->pdo->beginTransaction();
        try {
            $users->mergeUserData($sourceUserId, $targetUserId);
            $sessions = new SessionRepository($this->pdo);
            $sessions->deleteForUser($sourceUserId);
            $sessions->deleteForUser($targetUserId);
            $users->delete($sourceUserId);
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        $workspace = (new WorkspaceRepository($this->pdo))->firstForUser($targetUserId);
        $nextSession = $this->createSession(
            $targetUserId,
            $request,
            $workspace === null ? null : (int) $workspace['id'],
        );
        $this->sessionManager->issueCookie($nextSession['token']);
        $freshTargetUser = $users->findById($targetUserId)
            ?? throw new AuthException('USER_NOT_FOUND', 'Merged account was not found.', 500);

        return [
            'session' => [
                'user' => $this->publicUser($freshTargetUser),
                'workspace' => $workspace,
                'csrfToken' => $this->sessionManager->csrfToken($nextSession['token']),
            ],
            'binding' => $this->publicSsoBinding(
                $bindingRepository->findByUserId($targetUserId) ?? $binding,
            ),
        ];
    }

    public function casdoorAuthorize(Request $request): string
    {
        $mode = Input::string($request->query['mode'] ?? null) === 'bind' ? 'bind' : 'login';
        if ($mode === 'bind') {
            $this->authenticator->authenticatedSession($request);
        }

        $state = $this->urlSafeRandom(32);
        $codeVerifier = $this->urlSafeRandom(64);
        $this->issueCasdoorPkceCookie($state, $codeVerifier, $mode);

        $serverUrl = $this->casdoorServerUrl();
        $clientId = Env::string('CASDOOR_CLIENT_ID', '3e4912a22fdbce3dd6ca') ?? '3e4912a22fdbce3dd6ca';
        $query = http_build_query([
            'client_id' => $clientId,
            'response_type' => 'code',
            'redirect_uri' => $this->casdoorRedirectUri(),
            'scope' => Env::string('CASDOOR_SCOPE', 'profile') ?? 'profile',
            'state' => $state,
            'code_challenge' => $this->codeChallenge($codeVerifier),
            'code_challenge_method' => 'S256',
        ]);

        return "{$serverUrl}/login/oauth/authorize?{$query}";
    }

    public function casdoorCallback(array $input, Request $request): array
    {
        $code = Input::string($input['code'] ?? null);
        $accessToken = Input::string($input['accessToken'] ?? $input['access_token'] ?? null);
        $idToken = Input::string($input['idToken'] ?? $input['id_token'] ?? null);
        $state = Input::string($input['state'] ?? null);
        $pkce = $this->consumeCasdoorPkceCookie($request, $state);
        $mode = $pkce['mode'] ?? (Input::string($input['mode'] ?? null) ?? 'login');
        $action = Input::string($input['action'] ?? null);

        if ($action === 'create' && $code === null && $accessToken === null) {
            $userinfo = $this->userinfoFromSsoCreateToken($request);
            $subject = Input::string($userinfo['sub'] ?? null);
            if ($subject === null) {
                throw new AuthException('CASDOOR_USERINFO_INVALID', 'Casdoor user info is missing subject.', 502);
            }

            return $this->createAndLoginWithCasdoorAccount($subject, $userinfo, $request);
        }

        if ($code === null && $accessToken === null) {
            throw new AuthException('VALIDATION_ERROR', 'Casdoor authorization data is required.', 422);
        }

        $userinfo = $accessToken === null
            ? $this->casdoorUserinfoFromCode($code, $pkce['codeVerifier'] ?? null)
            : $this->casdoorUserinfoFromToken($accessToken, $idToken);
        $subject = Input::string($userinfo['sub'] ?? null);
        if ($subject === null) {
            throw new AuthException('CASDOOR_USERINFO_INVALID', 'Casdoor user info is missing subject.', 502);
        }

        return match ($mode) {
            'bind' => $this->bindCasdoorAccount($subject, $userinfo, $request),
            default => $this->loginWithCasdoorAccount($subject, $userinfo, $request),
        };
    }

    private function bindCasdoorAccount(string $subject, array $userinfo, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $userId = (int) $session['user_id'];
        $bindings = new UserSsoBindingRepository($this->pdo);
        $existing = $bindings->findByProviderSubject($subject);

        if ($existing !== null && (int) $existing['user_id'] !== $userId) {
            throw new AuthException(
                'SSO_ACCOUNT_ALREADY_BOUND',
                'This Casdoor account is already linked to another user.',
                409,
            );
        }

        $binding = $bindings->upsert(
            $userId,
            $subject,
            Input::string($userinfo['preferred_username'] ?? $userinfo['name'] ?? null),
            Input::normalizedEmail($userinfo['email'] ?? null),
            $userinfo,
        );

        $avatarUrl = $this->casdoorAvatarUrl($userinfo);
        if ($avatarUrl !== null) {
            (new UserRepository($this->pdo))->updateAvatarUrl($userId, $avatarUrl);
        }

        return [
            'binding' => $this->publicSsoBinding($binding),
        ];
    }

    private function loginWithCasdoorAccount(string $subject, array $userinfo, Request $request): array
    {
        $binding = (new UserSsoBindingRepository($this->pdo))->findByProviderSubject($subject);
        if ($binding === null) {
            return [
                'requiresSsoAccountAction' => true,
                'ssoAccount' => $this->publicCasdoorAccount($subject, $userinfo),
                'ssoCreateToken' => $this->issueSsoCreateToken($subject, $userinfo),
            ];
        }

        $users = new UserRepository($this->pdo);
        $user = $users->findById((int) $binding['user_id']);
        if ($user === null || $user['status'] !== 'active') {
            throw new AuthException('INVALID_CREDENTIALS', 'Invalid SSO account.', 401);
        }

        $avatarUrl = $this->casdoorAvatarUrl($userinfo);
        if ($avatarUrl !== null && ($user['avatar_url'] ?? null) !== $avatarUrl) {
            $users->updateAvatarUrl((int) $user['id'], $avatarUrl);
            $user['avatar_url'] = $avatarUrl;
        }

        $workspace = (new WorkspaceRepository($this->pdo))->firstForUser((int) $user['id']);
        $session = $this->createSession(
            (int) $user['id'],
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

    private function createAndLoginWithCasdoorAccount(string $subject, array $userinfo, Request $request): array
    {
        $users = new UserRepository($this->pdo);
        $providerEmail = Input::normalizedEmail($userinfo['email'] ?? null);
        if ($providerEmail === null) {
            throw new AuthException(
                'SSO_EMAIL_REQUIRED',
                'Casdoor account must provide an email before a BudgetCentre account can be created.',
                422,
            );
        }

        if ((new UserSsoBindingRepository($this->pdo))->findByProviderSubject($subject) !== null) {
            return $this->loginWithCasdoorAccount($subject, $userinfo, $request);
        }

        $displayName = $this->casdoorDisplayName($userinfo);
        $accountEmail = $this->availableSsoAccountEmail($users, $providerEmail, $subject);
        $username = $this->availableSsoUsername($users, $userinfo, $providerEmail, $subject);
        $currencyId = (new CurrencyRepository($this->pdo))->findIdByCode('CNY');
        $avatarUrl = $this->casdoorAvatarUrl($userinfo);

        $this->pdo->beginTransaction();
        try {
            $userId = $users->createSsoOnly($accountEmail, $username, $displayName, $currencyId, $avatarUrl);
            (new WorkspaceRepository($this->pdo))->createPersonalWorkspace(
                $userId,
                "{$displayName} Personal",
                $currencyId,
            );
            (new UserSsoBindingRepository($this->pdo))->upsert(
                $userId,
                $subject,
                Input::string($userinfo['preferred_username'] ?? $userinfo['name'] ?? null),
                $providerEmail,
                $userinfo,
            );
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        $user = $users->findById($userId);
        if ($user === null) {
            throw new AuthException('USER_NOT_FOUND', 'Created user was not found.', 500);
        }

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

    private function casdoorUserinfoFromToken(string $accessToken, ?string $idToken = null): array
    {
        $serverUrl = $this->casdoorServerUrl();
        $userinfo = $this->casdoorGetJson(
            "{$serverUrl}/api/userinfo",
            ['Authorization: Bearer ' . $accessToken],
            'CASDOOR_USERINFO_FAILED',
            'Casdoor userinfo endpoint is unavailable.',
        );

        if (isset($userinfo['status']) && $userinfo['status'] !== 'ok') {
            throw new AuthException(
                'CASDOOR_USERINFO_REJECTED',
                Input::string($userinfo['msg'] ?? null) ?? 'Casdoor userinfo request was rejected.',
                502,
                ['responseKeys' => array_keys($userinfo)],
            );
        }

        $claims = $this->jwtPayload($idToken);
        $normalized = $this->normalizeCasdoorUserinfo($userinfo);
        if ($claims !== null) {
            $normalized += $claims;
        }

        return $normalized;
    }

    private function casdoorUserinfoFromCode(string $code, ?string $codeVerifier = null): array
    {
        $serverUrl = $this->casdoorServerUrl();
        $clientId = Env::string('CASDOOR_CLIENT_ID', '3e4912a22fdbce3dd6ca') ?? '3e4912a22fdbce3dd6ca';
        $tokenPayload = [
            'grant_type' => 'authorization_code',
            'client_id' => $clientId,
            'code' => $code,
            'redirect_uri' => $this->casdoorRedirectUri(),
        ];
        if ($codeVerifier !== null) {
            $tokenPayload['code_verifier'] = $codeVerifier;
        }
        $clientSecret = Env::string('CASDOOR_CLIENT_SECRET');
        if ($clientSecret !== null) {
            $tokenPayload['client_secret'] = $clientSecret;
        }

        $tokenResponse = $this->casdoorPostForm(
            "{$serverUrl}/api/login/oauth/access_token",
            $tokenPayload,
            'CASDOOR_TOKEN_FAILED',
            'Casdoor token endpoint is unavailable.',
        );
        if (isset($tokenResponse['error'])) {
            throw new AuthException(
                'CASDOOR_TOKEN_REJECTED',
                Input::string($tokenResponse['error_description'] ?? $tokenResponse['error'] ?? null)
                    ?? 'Casdoor token exchange was rejected.',
                502,
                ['responseKeys' => array_keys($tokenResponse)],
            );
        }

        $accessToken = Input::string($tokenResponse['access_token'] ?? null);
        if ($accessToken === null) {
            throw new AuthException(
                'CASDOOR_TOKEN_INVALID',
                'Casdoor token response is missing access token.',
                502,
                ['responseKeys' => array_keys($tokenResponse)],
            );
        }

        return $this->casdoorUserinfoFromToken($accessToken, Input::string($tokenResponse['id_token'] ?? null));
    }

    private function casdoorServerUrl(): string
    {
        return rtrim(
            Env::string('CASDOOR_SERVER_URL', 'https://sso.axchen.top') ?? 'https://sso.axchen.top',
            '/',
        );
    }

    private function casdoorRedirectUri(): string
    {
        $appUrl = rtrim(Env::string('APP_URL', 'http://localhost:5173') ?? 'http://localhost:5173', '/');

        return Env::string('CASDOOR_REDIRECT_URI', "{$appUrl}/api/callback") ?? "{$appUrl}/api/callback";
    }

    private function issueCasdoorPkceCookie(string $state, string $codeVerifier, string $mode): void
    {
        setcookie(self::CASDOOR_PKCE_COOKIE, json_encode([
            'state' => $state,
            'codeVerifier' => $codeVerifier,
            'mode' => $mode,
        ], JSON_THROW_ON_ERROR), [
            'expires' => time() + 600,
            'path' => '/',
            'secure' => $this->isSecureCasdoorCookie(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private function consumeCasdoorPkceCookie(Request $request, ?string $state): array
    {
        $raw = $request->cookies[self::CASDOOR_PKCE_COOKIE] ?? null;
        setcookie(self::CASDOOR_PKCE_COOKIE, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'secure' => $this->isSecureCasdoorCookie(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        if (!is_string($raw) || $raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $expectedState = Input::string($decoded['state'] ?? null);
        if ($expectedState === null || $state === null || !hash_equals($expectedState, $state)) {
            throw new AuthException('CASDOOR_STATE_INVALID', 'Casdoor callback state is invalid.', 401);
        }

        return [
            'codeVerifier' => Input::string($decoded['codeVerifier'] ?? null),
            'mode' => Input::string($decoded['mode'] ?? null),
        ];
    }

    private function urlSafeRandom(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    private function codeChallenge(string $codeVerifier): string
    {
        return rtrim(strtr(base64_encode(hash('sha256', $codeVerifier, true)), '+/', '-_'), '=');
    }

    private function isSecureCasdoorCookie(): bool
    {
        $apiUrl = Env::string('API_URL', '');
        $appUrl = Env::string('APP_URL', '');

        return str_starts_with((string) $apiUrl, 'https://')
            || str_starts_with((string) $appUrl, 'https://');
    }

    private function casdoorPostForm(
        string $url,
        array $payload,
        string $failureCode,
        string $failureMessage,
    ): array {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'timeout' => 12,
                'header' => "Content-Type: application/x-www-form-urlencoded\r\nAccept: application/json\r\n",
                'content' => http_build_query($payload),
                'ignore_errors' => true,
            ],
        ]);

        return $this->casdoorJsonRequest($url, $context, $failureCode, $failureMessage);
    }

    private function casdoorGetJson(
        string $url,
        array $headers,
        string $failureCode,
        string $failureMessage,
    ): array {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 12,
                'header' => implode("\r\n", [...$headers, 'Accept: application/json']) . "\r\n",
                'ignore_errors' => true,
            ],
        ]);

        return $this->casdoorJsonRequest($url, $context, $failureCode, $failureMessage);
    }

    private function casdoorJsonRequest(
        string $url,
        mixed $context,
        string $failureCode,
        string $failureMessage,
    ): array {
        $response = @file_get_contents($url, false, $context);

        if (!is_string($response) || trim($response) === '') {
            throw new AuthException($failureCode, $failureMessage, 502);
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded)) {
            throw new AuthException('CASDOOR_RESPONSE_INVALID', 'Casdoor returned invalid JSON.', 502);
        }

        return $decoded;
    }

    private function normalizeCasdoorUserinfo(array $decoded): array
    {
        if (isset($decoded['status']) && $decoded['status'] !== 'ok') {
            throw new AuthException(
                'CASDOOR_CALLBACK_REJECTED',
                Input::string($decoded['msg'] ?? null) ?? 'Casdoor callback was rejected.',
                502,
                ['responseKeys' => array_keys($decoded)],
            );
        }

        foreach ([$decoded, $decoded['data'] ?? null, $decoded['user'] ?? null, $decoded['userinfo'] ?? null] as $candidate) {
            if (is_array($candidate) && Input::string($candidate['sub'] ?? null) !== null) {
                return $candidate;
            }
        }

        foreach (['id_token', 'access_token', 'token'] as $tokenKey) {
            $claims = $this->jwtPayload($decoded[$tokenKey] ?? null);
            if ($claims !== null && Input::string($claims['sub'] ?? null) !== null) {
                return $claims + $decoded;
            }
        }

        throw new AuthException(
            'CASDOOR_USERINFO_INVALID',
            'Casdoor user info is missing subject.',
            502,
            ['responseKeys' => array_keys($decoded)],
        );
    }

    private function jwtPayload(mixed $token): ?array
    {
        if (!is_string($token)) {
            return null;
        }

        $segments = explode('.', $token);
        if (count($segments) < 2) {
            return null;
        }

        $payload = strtr($segments[1], '-_', '+/');
        $padding = strlen($payload) % 4;
        if ($padding > 0) {
            $payload .= str_repeat('=', 4 - $padding);
        }

        $json = base64_decode($payload, true);
        if (!is_string($json)) {
            return null;
        }

        $decoded = json_decode($json, true);

        return is_array($decoded) ? $decoded : null;
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
            'avatarUrl' => $user['avatar_url'] ?? null,
            'timezone' => $user['timezone'] ?? null,
            'locale' => $user['locale'] ?? null,
            'defaultPdfTheme' => BudgetPdfTheme::normalize($user['default_pdf_theme'] ?? null),
            'pdfExportSettings' => $this->publicPdfExportSettings($user['pdf_export_settings'] ?? null),
            'status' => $user['status'] ?? null,
            'isAdmin' => isset($user['is_admin']) && (bool) $user['is_admin'],
            'emailVerifiedAt' => $user['email_verified_at'] ?? null,
            'hasPassword' => is_string($user['password_hash'] ?? null),
        ];
    }

    private function pdfExportSettingsJsonFromInput(array $input, mixed $currentRaw): string
    {
        $raw = $input['pdfExportSettings'] ?? $input['pdf_export_settings'] ?? null;
        $current = $this->publicPdfExportSettings($currentRaw);
        if ($raw === null) {
            return $this->encodePdfExportSettings($current);
        }

        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [];
        }

        if (!is_array($raw)) {
            $raw = [];
        }

        return $this->encodePdfExportSettings([
            'showWorkspace' => (bool) ($raw['showWorkspace'] ?? $raw['show_workspace'] ?? $current['showWorkspace']),
            'pdfLanguages' => PdfLanguages::normalizeList(
                $raw['pdfLanguages'] ?? $raw['pdf_languages'] ?? null,
                $current['pdfLanguages'] ?? PdfLanguages::DEFAULT,
            ),
        ]);
    }

    private function publicPdfExportSettings(mixed $raw): array
    {
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [];
        }

        if (!is_array($raw)) {
            $raw = [];
        }

        return [
            'showWorkspace' => (bool) ($raw['showWorkspace'] ?? $raw['show_workspace'] ?? false),
            'pdfLanguages' => PdfLanguages::normalizeList($raw['pdfLanguages'] ?? $raw['pdf_languages'] ?? null),
        ];
    }

    private function encodePdfExportSettings(array $settings): string
    {
        $encoded = json_encode([
            'showWorkspace' => (bool) ($settings['showWorkspace'] ?? false),
            'pdfLanguages' => PdfLanguages::normalizeList($settings['pdfLanguages'] ?? $settings['pdf_languages'] ?? null),
        ], JSON_THROW_ON_ERROR);

        return $encoded;
    }

    private function casdoorAvatarUrl(array $userinfo): ?string
    {
        foreach (['picture', 'avatar', 'avatarUrl', 'avatar_url'] as $key) {
            $value = Input::string($userinfo[$key] ?? null);
            if ($value !== null && (str_starts_with($value, 'http://') || str_starts_with($value, 'https://'))) {
                return mb_strlen($value) > 512 ? null : $value;
            }
        }

        return null;
    }

    private function publicCasdoorAccount(string $subject, array $userinfo): array
    {
        return [
            'subject' => $subject,
            'username' => Input::string($userinfo['preferred_username'] ?? $userinfo['name'] ?? null),
            'email' => Input::normalizedEmail($userinfo['email'] ?? null),
            'displayName' => $this->casdoorDisplayName($userinfo),
            'avatarUrl' => $this->casdoorAvatarUrl($userinfo),
        ];
    }

    private function casdoorDisplayName(array $userinfo): string
    {
        return Input::string(
            $userinfo['displayName']
                ?? $userinfo['display_name']
                ?? $userinfo['name']
                ?? $userinfo['preferred_username']
                ?? $userinfo['email']
                ?? null,
        ) ?? 'SSO User';
    }

    private function availableSsoUsername(
        UserRepository $users,
        array $userinfo,
        string $email,
        string $subject,
    ): ?string {
        $candidates = [
            Input::username($userinfo['preferred_username'] ?? null),
            Input::username($userinfo['name'] ?? null),
            Input::username(strstr($email, '@', true) ?: null),
            Input::username('sso-' . substr(preg_replace('/[^a-zA-Z0-9]/', '', $subject), 0, 24)),
        ];

        foreach ($candidates as $candidate) {
            if ($candidate !== null && $users->findByUsername($candidate) === null) {
                return $candidate;
            }
        }

        for ($index = 0; $index < 5; $index++) {
            $candidate = Input::username('sso-' . strtolower(bin2hex(random_bytes(4))));
            if ($candidate !== null && $users->findByUsername($candidate) === null) {
                return $candidate;
            }
        }

        return null;
    }

    private function availableSsoAccountEmail(UserRepository $users, string $providerEmail, string $subject): string
    {
        if ($users->findByEmail($providerEmail) === null) {
            return $providerEmail;
        }

        $localPart = strstr($providerEmail, '@', true);
        $normalizedLocal = preg_replace('/[^a-z0-9._+-]/', '', strtolower((string) $localPart));
        $normalizedLocal = trim((string) $normalizedLocal, '.');
        if ($normalizedLocal === '') {
            $normalizedLocal = 'sso';
        }

        $subjectPart = strtolower(substr(preg_replace('/[^a-zA-Z0-9]/', '', $subject), 0, 20));
        $base = substr($normalizedLocal, 0, 32) . '+sso-' . ($subjectPart !== '' ? $subjectPart : bin2hex(random_bytes(4)));

        for ($index = 0; $index < 20; $index++) {
            $suffix = $index === 0 ? '' : '-' . strtolower(bin2hex(random_bytes(3)));
            $candidate = "{$base}{$suffix}@sso.local";
            if ($users->findByEmail($candidate) === null) {
                return $candidate;
            }
        }

        return 'sso-' . strtolower(bin2hex(random_bytes(12))) . '@sso.local';
    }

    private function issueSsoCreateToken(string $subject, array $userinfo): string
    {
        $payload = [
            'sub' => $subject,
            'exp' => time() + 600,
            'userinfo' => $userinfo,
        ];
        $encodedPayload = $this->base64UrlEncode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        $signature = hash_hmac('sha256', $encodedPayload, $this->ssoCreateTokenSecret(), true);

        return $encodedPayload . '.' . $this->base64UrlEncode($signature);
    }

    private function userinfoFromSsoCreateToken(Request $request): array
    {
        $input = $request->json();
        $token = Input::string($input['ssoCreateToken'] ?? $input['sso_create_token'] ?? null);
        if ($token === null) {
            throw new AuthException('SSO_CREATE_TOKEN_INVALID', 'SSO account creation token is required.', 422);
        }

        [$encodedPayload, $encodedSignature] = array_pad(explode('.', $token, 2), 2, '');
        if ($encodedPayload === '' || $encodedSignature === '') {
            throw new AuthException('SSO_CREATE_TOKEN_INVALID', 'SSO account creation token is invalid.', 422);
        }

        $expectedSignature = hash_hmac('sha256', $encodedPayload, $this->ssoCreateTokenSecret(), true);
        $actualSignature = $this->base64UrlDecode($encodedSignature);
        if ($actualSignature === null || !hash_equals($expectedSignature, $actualSignature)) {
            throw new AuthException('SSO_CREATE_TOKEN_INVALID', 'SSO account creation token is invalid.', 422);
        }

        $payloadJson = $this->base64UrlDecode($encodedPayload);
        $payload = is_string($payloadJson) ? json_decode($payloadJson, true) : null;
        if (!is_array($payload) || (int) ($payload['exp'] ?? 0) < time() || !is_array($payload['userinfo'] ?? null)) {
            throw new AuthException('SSO_CREATE_TOKEN_INVALID', 'SSO account creation token is invalid or expired.', 422);
        }

        return $payload['userinfo'];
    }

    private function issueSsoMergeToken(int $sourceUserId, string $providerSubject): string
    {
        $payload = [
            'sourceUserId' => $sourceUserId,
            'providerSubject' => $providerSubject,
            'exp' => time() + 600,
        ];
        $encodedPayload = $this->base64UrlEncode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        $signature = hash_hmac('sha256', $encodedPayload, $this->ssoCreateTokenSecret(), true);

        return $encodedPayload . '.' . $this->base64UrlEncode($signature);
    }

    private function ssoMergePayload(array $input): array
    {
        $token = Input::string($input['mergeToken'] ?? $input['merge_token'] ?? null);
        if ($token === null) {
            throw new AuthException('SSO_MERGE_TOKEN_INVALID', 'SSO account merge token is required.', 422);
        }

        [$encodedPayload, $encodedSignature] = array_pad(explode('.', $token, 2), 2, '');
        if ($encodedPayload === '' || $encodedSignature === '') {
            throw new AuthException('SSO_MERGE_TOKEN_INVALID', 'SSO account merge token is invalid.', 422);
        }

        $expectedSignature = hash_hmac('sha256', $encodedPayload, $this->ssoCreateTokenSecret(), true);
        $actualSignature = $this->base64UrlDecode($encodedSignature);
        if ($actualSignature === null || !hash_equals($expectedSignature, $actualSignature)) {
            throw new AuthException('SSO_MERGE_TOKEN_INVALID', 'SSO account merge token is invalid.', 422);
        }

        $payloadJson = $this->base64UrlDecode($encodedPayload);
        $payload = is_string($payloadJson) ? json_decode($payloadJson, true) : null;
        if (!is_array($payload) || (int) ($payload['exp'] ?? 0) < time()) {
            throw new AuthException('SSO_MERGE_TOKEN_INVALID', 'SSO account merge token is invalid or expired.', 422);
        }

        return $payload;
    }

    private function ssoCreateTokenSecret(): string
    {
        $secret = Env::string('APP_KEY') ?? Env::string('CASDOOR_CLIENT_SECRET');
        if ($secret === null) {
            throw new AuthException(
                'SERVER_ERROR',
                'APP_KEY or CASDOOR_CLIENT_SECRET is required for SSO account creation.',
                503,
            );
        }

        return $secret;
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): ?string
    {
        $payload = strtr($value, '-_', '+/');
        $padding = strlen($payload) % 4;
        if ($padding > 0) {
            $payload .= str_repeat('=', 4 - $padding);
        }

        $decoded = base64_decode($payload, true);

        return is_string($decoded) ? $decoded : null;
    }

    private function publicSsoBinding(array $binding): array
    {
        return [
            'provider' => $binding['provider'] ?? 'casdoor',
            'subject' => $binding['provider_subject'] ?? null,
            'username' => $binding['provider_username'] ?? null,
            'email' => $binding['provider_email'] ?? null,
            'linkedAt' => $binding['linked_at'] ?? null,
            'updatedAt' => $binding['updated_at'] ?? null,
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
