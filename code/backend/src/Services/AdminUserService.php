<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\AuthService;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Auth\SessionManager;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\AdminUserRepository;
use BudgetCentre\Repositories\BudgetExportRepository;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Repositories\UserRepository;
use BudgetCentre\Repositories\WorkspaceRepository;
use BudgetCentre\Support\Env;
use BudgetCentre\Support\Input;
use FilesystemIterator;
use PDO;
use Throwable;

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

    public function createUser(array $input, Request $request): array
    {
        $this->requireAdmin($request);

        $email = Input::normalizedEmail($input['email'] ?? null);
        $username = Input::username($input['username'] ?? null);
        $password = Input::string($input['password'] ?? null);
        $displayName = Input::string($input['displayName'] ?? $input['display_name'] ?? null);
        $currencyCode = strtoupper(
            Input::string($input['defaultCurrency'] ?? $input['default_currency'] ?? null) ?? 'CNY',
        );
        $emailVerified = array_key_exists('emailVerified', $input)
            ? $this->bool($input['emailVerified'])
            : true;
        $isAdmin = array_key_exists('isAdmin', $input)
            ? $this->bool($input['isAdmin'])
            : false;

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

        if ($displayName === null || strlen($displayName) > 120) {
            throw new AuthException('VALIDATION_ERROR', 'Display name is required and must be 120 characters or less.', 422);
        }

        if ($emailVerified === null || $isAdmin === null) {
            throw new AuthException('VALIDATION_ERROR', 'Account flags are invalid.', 422);
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
            (new WorkspaceRepository($this->pdo))->createPersonalWorkspace(
                $userId,
                "{$displayName} Personal",
                $currencyId,
            );

            $fields = [
                'status' => $emailVerified ? 'active' : 'pending',
                'is_admin' => $isAdmin ? 1 : 0,
            ];
            if ($emailVerified) {
                $fields['email_verified_at'] = 'now';
            }

            $createdUser = (new AdminUserRepository($this->pdo))->update($userId, $fields)
                ?? throw new AuthException('USER_NOT_FOUND', 'User was not found.', 404);
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return ['user' => $this->publicUser($createdUser)];
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

    public function environment(Request $request): array
    {
        $this->requireAdmin($request);

        return (new SystemCheckService())->environment();
    }

    public function cleanupExportCache(Request $request): array
    {
        $this->requireAdmin($request);

        $exportCleanup = $this->deleteExportFiles();
        $tempCleanup = $this->cleanupTempDirectory($this->mpdfTempRoot());

        return [
            'exportPath' => $this->exportStorageRoot(),
            'tempPath' => $this->mpdfTempRoot(),
            'deletedExports' => $exportCleanup['deletedExports'],
            'deletedExportFiles' => $exportCleanup['deletedFiles'],
            'deletedExportBytes' => $exportCleanup['deletedBytes'],
            'deletedTempFiles' => $tempCleanup['deletedFiles'],
            'deletedTempDirectories' => $tempCleanup['deletedDirectories'],
            'deletedTempBytes' => $tempCleanup['deletedBytes'],
        ];
    }

    private function deleteExportFiles(): array
    {
        $repository = new BudgetExportRepository($this->pdo);
        $exports = $repository->all();
        $deletedExports = 0;
        $deletedFiles = 0;
        $deletedBytes = 0;
        $root = $this->exportStorageRoot();

        $this->pdo->beginTransaction();
        try {
            foreach ($exports as $export) {
                $path = $this->absoluteExportPath((string) ($export['filePath'] ?? ''));
                if ($path !== null && is_file($path)) {
                    $deletedBytes += filesize($path) ?: 0;
                    if (!@unlink($path)) {
                        throw new AuthException(
                            'EXPORT_CLEANUP_FAILED',
                            'Export PDF could not be removed.',
                            500,
                            ['file' => $path],
                        );
                    }
                    $deletedFiles++;
                }

                $repository->delete((int) $export['id']);
                $deletedExports++;
            }

            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return [
            'path' => $root,
            'deletedExports' => $deletedExports,
            'deletedFiles' => $deletedFiles,
            'deletedBytes' => $deletedBytes,
        ];
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

    private function mpdfTempRoot(): string
    {
        return rtrim(
            Env::string('MPDF_TEMP_DIR', dirname(__DIR__, 2) . '/storage/tmp/mpdf')
                ?? dirname(__DIR__, 2) . '/storage/tmp/mpdf',
            '/',
        );
    }

    private function exportStorageRoot(): string
    {
        return rtrim(
            Env::string('EXPORT_STORAGE_DIR', dirname(__DIR__, 2) . '/storage/exports')
                ?? dirname(__DIR__, 2) . '/storage/exports',
            '/',
        );
    }

    private function cleanupTempDirectory(string $path): array
    {
        if (!is_dir($path)) {
            return [
                'path' => $path,
                'deletedFiles' => 0,
                'deletedDirectories' => 0,
                'deletedBytes' => 0,
            ];
        }

        if (!is_writable($path)) {
            throw new AuthException(
                'EXPORT_CACHE_UNWRITABLE',
                'Export cache directory is not writable.',
                500,
                ['directory' => $path],
            );
        }

        return [
            'path' => $path,
            ...$this->deleteDirectoryContents($path),
        ];
    }

    private function absoluteExportPath(string $path): ?string
    {
        if ($path === '') {
            return null;
        }

        $absolutePath = str_starts_with($path, '/') ? $path : dirname(__DIR__, 2) . '/' . $path;
        $root = $this->exportStorageRoot();

        return str_starts_with($absolutePath, $root . '/') || $absolutePath === $root
            ? $absolutePath
            : null;
    }

    private function deleteDirectoryContents(string $directory): array
    {
        $deletedFiles = 0;
        $deletedDirectories = 0;
        $deletedBytes = 0;
        $iterator = new FilesystemIterator($directory, FilesystemIterator::SKIP_DOTS);

        foreach ($iterator as $item) {
            $path = $item->getPathname();

            if ($item->isDir() && !$item->isLink()) {
                $result = $this->deleteDirectoryContents($path);
                $deletedFiles += $result['deletedFiles'];
                $deletedDirectories += $result['deletedDirectories'];
                $deletedBytes += $result['deletedBytes'];

                if (!@rmdir($path)) {
                    throw new AuthException(
                        'EXPORT_CACHE_CLEANUP_FAILED',
                        'Export cache directory could not be removed.',
                        500,
                        ['directory' => $path],
                    );
                }
                $deletedDirectories++;

                continue;
            }

            $deletedBytes += $item->isFile() ? $item->getSize() : 0;
            if (!@unlink($path)) {
                throw new AuthException(
                    'EXPORT_CACHE_CLEANUP_FAILED',
                    'Export cache file could not be removed.',
                    500,
                    ['file' => $path],
                );
            }
            $deletedFiles++;
        }

        return [
            'deletedFiles' => $deletedFiles,
            'deletedDirectories' => $deletedDirectories,
            'deletedBytes' => $deletedBytes,
        ];
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
