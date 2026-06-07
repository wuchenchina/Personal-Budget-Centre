<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BudgetCategoryRepository;
use BudgetCentre\Repositories\CurrencyRepository;
use BudgetCentre\Support\Input;
use PDO;
use Throwable;

final readonly class BudgetCategoryService
{
    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function categories(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($request->query['workspaceId'] ?? null);
        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId query parameter is required.', 422);
        }

        $this->permissions()->requireWorkspaceRole($workspaceId, (int) $session['user_id']);

        $repository = new BudgetCategoryRepository($this->pdo);

        return $repository->listForWorkspace($workspaceId);
    }

    public function createCategory(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $name = Input::string($input['name'] ?? null);
        $sortOrder = Input::positiveInt($input['sortOrder'] ?? $input['sort_order'] ?? null) ?? 0;
        $currencyCode = Input::string($input['defaultCurrency'] ?? $input['default_currency'] ?? null);

        if ($workspaceId === null || $name === null || strlen($name) > 160) {
            throw new AuthException('VALIDATION_ERROR', 'Workspace and category name are required.', 422);
        }

        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );

        $currencyId = $this->currencyId($currencyCode);
        $repository = new BudgetCategoryRepository($this->pdo);
        $this->pdo->beginTransaction();
        try {
            $repository->create($workspaceId, (int) $session['user_id'], $name, $currencyId, $sortOrder);
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return $repository->listForWorkspace($workspaceId);
    }

    public function updateCategory(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($input['id'] ?? null);
        $name = Input::string($input['name'] ?? null);
        $sortOrder = Input::positiveInt($input['sortOrder'] ?? $input['sort_order'] ?? null) ?? 0;
        $currencyCode = Input::string($input['defaultCurrency'] ?? $input['default_currency'] ?? null);
        $isActive = (bool) ($input['isActive'] ?? $input['is_active'] ?? true);

        if ($id === null || $name === null || strlen($name) > 160) {
            throw new AuthException('VALIDATION_ERROR', 'Category id and name are required.', 422);
        }

        $repository = new BudgetCategoryRepository($this->pdo);
        $workspaceId = $repository->workspaceIdForCategory($id)
            ?? throw new AuthException('CATEGORY_NOT_FOUND', 'Category was not found.', 404);
        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );

        $repository->update($id, $name, $this->currencyId($currencyCode), $sortOrder, $isActive);

        return $repository->listForWorkspace($workspaceId);
    }

    public function deleteCategory(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($input['id'] ?? null);
        $ids = $this->categoryIds($input['ids'] ?? null);
        if ($id !== null) {
            $ids[] = $id;
        }
        $ids = array_values(array_unique($ids));
        if ($ids === []) {
            throw new AuthException('VALIDATION_ERROR', 'Category id is required.', 422);
        }

        $repository = new BudgetCategoryRepository($this->pdo);
        $workspaceId = $repository->workspaceIdForCategory($ids[0])
            ?? throw new AuthException('CATEGORY_NOT_FOUND', 'Category was not found.', 404);
        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );
        foreach ($ids as $categoryId) {
            if ($repository->workspaceIdForCategory($categoryId) !== $workspaceId) {
                throw new AuthException('CATEGORY_NOT_FOUND', 'Category was not found.', 404);
            }
        }
        $repository->deleteMany($ids);

        return $repository->listForWorkspace($workspaceId);
    }

    public function createAlias(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $categoryId = Input::positiveInt($input['categoryId'] ?? $input['category_id'] ?? null);
        $alias = Input::string($input['alias'] ?? null);

        if ($workspaceId === null || $categoryId === null || $alias === null || strlen($alias) > 160) {
            throw new AuthException('VALIDATION_ERROR', 'Workspace, category, and alias are required.', 422);
        }

        $repository = new BudgetCategoryRepository($this->pdo);
        if ($repository->workspaceIdForCategory($categoryId) !== $workspaceId) {
            throw new AuthException('CATEGORY_NOT_FOUND', 'Category was not found.', 404);
        }

        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );
        $repository->createAlias($workspaceId, (int) $session['user_id'], $categoryId, $alias);

        return $repository->listForWorkspace($workspaceId);
    }

    public function deleteAlias(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($input['id'] ?? null);
        if ($id === null) {
            throw new AuthException('VALIDATION_ERROR', 'Alias id is required.', 422);
        }

        $repository = new BudgetCategoryRepository($this->pdo);
        $workspaceId = $repository->workspaceIdForAlias($id)
            ?? throw new AuthException('ALIAS_NOT_FOUND', 'Category alias was not found.', 404);
        $this->permissions()->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            PermissionGuard::WRITE_ROLES,
        );
        $repository->deleteAlias($id);

        return $repository->listForWorkspace($workspaceId);
    }

    private function currencyId(?string $currencyCode): ?int
    {
        if ($currencyCode === null) {
            return null;
        }

        $currencyId = (new CurrencyRepository($this->pdo))->findIdByCode(strtoupper($currencyCode));
        if ($currencyId === null) {
            throw new AuthException('CURRENCY_NOT_FOUND', 'Currency is not available.', 422);
        }

        return $currencyId;
    }

    /**
     * @return list<int>
     */
    private function categoryIds(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $ids = [];
        foreach ($value as $item) {
            $id = Input::positiveInt($item);
            if ($id !== null) {
                $ids[] = $id;
            }
        }

        return $ids;
    }

    private function permissions(): PermissionGuard
    {
        return new PermissionGuard($this->pdo, $this->authenticator);
    }
}
