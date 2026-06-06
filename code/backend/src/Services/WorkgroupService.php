<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\WorkgroupRepository;
use BudgetCentre\Support\Input;
use PDO;
use Throwable;

final readonly class WorkgroupService
{
    private const WRITE_ROLES = ['owner', 'admin', 'editor'];

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function workgroups(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($request->query['workspaceId'] ?? null);
        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId query parameter is required.', 422);
        }

        $this->authenticator->requireWorkspaceRole($workspaceId, (int) $session['user_id']);

        return (new WorkgroupRepository($this->pdo))->listForWorkspace($workspaceId);
    }

    public function createWorkgroup(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workspaceId = Input::positiveInt($input['workspaceId'] ?? $input['workspace_id'] ?? null);
        $name = Input::string($input['name'] ?? null);
        $description = Input::string($input['description'] ?? null);

        if ($workspaceId === null) {
            throw new AuthException('VALIDATION_ERROR', 'workspaceId is required.', 422);
        }

        $this->authenticator->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            self::WRITE_ROLES,
        );
        $this->validateWorkgroupInput($name, $description);

        $repository = new WorkgroupRepository($this->pdo);
        $this->pdo->beginTransaction();
        try {
            $workgroupId = $repository->create(
                $workspaceId,
                (int) $session['user_id'],
                $name,
                $description,
            );
            $this->pdo->commit();
        } catch (Throwable $exception) {
            $this->pdo->rollBack();
            throw $exception;
        }

        return $repository->find($workgroupId) ?? [
            'id' => $workgroupId,
            'workspaceId' => $workspaceId,
            'name' => $name,
            'description' => $description,
            'memberCount' => 0,
        ];
    }

    public function updateWorkgroup(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workgroupId = Input::positiveInt($input['id'] ?? null);
        $name = Input::string($input['name'] ?? null);
        $description = Input::string($input['description'] ?? null);

        if ($workgroupId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Workgroup id is required.', 422);
        }

        $repository = new WorkgroupRepository($this->pdo);
        $workspaceId = $repository->workspaceIdForWorkgroup($workgroupId);
        if ($workspaceId === null) {
            throw new AuthException('WORKGROUP_NOT_FOUND', 'Workgroup was not found.', 404);
        }

        $this->authenticator->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            self::WRITE_ROLES,
        );
        $this->validateWorkgroupInput($name, $description);

        $repository->update($workgroupId, $name, $description);

        return $repository->find($workgroupId) ?? [
            'id' => $workgroupId,
            'workspaceId' => $workspaceId,
            'name' => $name,
            'description' => $description,
            'memberCount' => 0,
        ];
    }

    public function deleteWorkgroup(array $input, Request $request): void
    {
        $session = $this->authenticator->authenticatedSession($request);
        $workgroupId = Input::positiveInt($input['id'] ?? null);

        if ($workgroupId === null) {
            throw new AuthException('VALIDATION_ERROR', 'Workgroup id is required.', 422);
        }

        $repository = new WorkgroupRepository($this->pdo);
        $workspaceId = $repository->workspaceIdForWorkgroup($workgroupId);
        if ($workspaceId === null) {
            throw new AuthException('WORKGROUP_NOT_FOUND', 'Workgroup was not found.', 404);
        }

        $this->authenticator->requireWorkspaceRole(
            $workspaceId,
            (int) $session['user_id'],
            self::WRITE_ROLES,
        );
        $repository->delete($workgroupId);
    }

    private function validateWorkgroupInput(?string $name, ?string $description): void
    {
        if ($name === null || strlen($name) > 160) {
            throw new AuthException('VALIDATION_ERROR', 'Workgroup name is required and must be 160 characters or less.', 422);
        }

        if ($description !== null && strlen($description) > 500) {
            throw new AuthException('VALIDATION_ERROR', 'Workgroup description must be 500 characters or less.', 422);
        }
    }
}
