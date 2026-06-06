<?php

declare(strict_types=1);

namespace BudgetCentre;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\AuthService;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Auth\SessionManager;
use BudgetCentre\Database\ConnectionFactory;
use BudgetCentre\Database\DatabaseConfigurationException;
use BudgetCentre\Http\InvalidJsonRequestException;
use BudgetCentre\Http\JsonResponse;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BudgetTemplateRepository;
use BudgetCentre\Repositories\MissingSeedDataException;
use BudgetCentre\Services\BudgetEntryService;
use BudgetCentre\Services\BudgetService;
use BudgetCentre\Services\WorkspaceService;
use BudgetCentre\Services\WorkgroupService;
use JsonException;
use PDO;
use PDOException;

final class App
{
    public function handle(Request $request): JsonResponse
    {
        $this->applyCorsHeaders();

        if ($request->method === 'OPTIONS') {
            return JsonResponse::ok();
        }

        return match ([$request->method, $request->path]) {
            ['GET', '/api/health'] => JsonResponse::ok([
                'service' => 'budget-centre-api',
                'status' => 'ok',
            ]),
            ['POST', '/api/auth/register'] => $this->authRegister($request),
            ['POST', '/api/auth/login'] => $this->authLogin($request),
            ['POST', '/api/auth/logout'] => $this->authLogout($request),
            ['GET', '/api/auth/me'] => $this->authMe($request),
            ['GET', '/api/workspaces'] => $this->workspaceList($request),
            ['POST', '/api/workspaces'] => $this->workspaceCreate($request),
            ['POST', '/api/workspaces/switch'] => $this->workspaceSwitch($request),
            ['GET', '/api/workspace-members'] => $this->workspaceMemberList($request),
            ['POST', '/api/workspace-members'] => $this->workspaceMemberCreate($request),
            ['PATCH', '/api/workspace-members'] => $this->workspaceMemberUpdate($request),
            ['DELETE', '/api/workspace-members'] => $this->workspaceMemberDelete($request),
            ['GET', '/api/workgroups'] => $this->workgroupList($request),
            ['POST', '/api/workgroups'] => $this->workgroupCreate($request),
            ['PATCH', '/api/workgroups'] => $this->workgroupUpdate($request),
            ['DELETE', '/api/workgroups'] => $this->workgroupDelete($request),
            ['GET', '/api/budgets'] => $this->budgetList($request),
            ['POST', '/api/budgets'] => $this->budgetCreate($request),
            ['PATCH', '/api/budgets'] => $this->budgetUpdate($request),
            ['DELETE', '/api/budgets'] => $this->budgetDelete($request),
            ['GET', '/api/budget'] => $this->budgetDetail($request),
            ['POST', '/api/budget-items'] => $this->budgetItemCreate($request),
            ['PATCH', '/api/budget-items'] => $this->budgetItemUpdate($request),
            ['DELETE', '/api/budget-items'] => $this->budgetItemDelete($request),
            ['POST', '/api/budget-transactions'] => $this->budgetTransactionCreate($request),
            ['PATCH', '/api/budget-transactions'] => $this->budgetTransactionUpdate($request),
            ['DELETE', '/api/budget-transactions'] => $this->budgetTransactionDelete($request),
            ['GET', '/api/templates/personal-living-budget'] => $this->templateResponse('personal_living_budget'),
            ['GET', '/api/auth/passkey/register/options'] => JsonResponse::error(
                'NOT_IMPLEMENTED',
                'Passkey registration options are part of Phase 2.',
                501,
            ),
            ['POST', '/api/auth/passkey/register/verify'] => JsonResponse::error(
                'NOT_IMPLEMENTED',
                'Passkey registration verification is part of Phase 2.',
                501,
            ),
            ['GET', '/api/auth/passkey/login/options'] => JsonResponse::error(
                'NOT_IMPLEMENTED',
                'Passkey login options are part of Phase 2.',
                501,
            ),
            ['POST', '/api/auth/passkey/login/verify'] => JsonResponse::error(
                'NOT_IMPLEMENTED',
                'Passkey login verification is part of Phase 2.',
                501,
            ),
            default => JsonResponse::error('NOT_FOUND', 'API route not found.', 404),
        };
    }

    private function applyCorsHeaders(): void
    {
        $origin = getenv('APP_URL') ?: 'http://localhost:5173';

        header("Access-Control-Allow-Origin: {$origin}");
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }

    private function authRegister(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok(
                $auth->register($request->json(), $request),
                201,
            ),
        );
    }

    private function authLogin(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok(
                $auth->login($request->json(), $request),
            ),
        );
    }

    private function authLogout(Request $request): JsonResponse
    {
        return $this->authResponse(
            function (AuthService $auth) use ($request): JsonResponse {
                $auth->logout($request);

                return JsonResponse::ok();
            },
        );
    }

    private function authMe(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok($auth->me($request)),
        );
    }

    private function workspaceList(Request $request): JsonResponse
    {
        return $this->workspaceResponse(
            fn (WorkspaceService $workspace): JsonResponse => JsonResponse::ok([
                'workspaces' => $workspace->workspaces($request),
            ]),
        );
    }

    private function workspaceCreate(Request $request): JsonResponse
    {
        return $this->workspaceResponse(
            fn (WorkspaceService $workspace): JsonResponse => JsonResponse::ok([
                'workspace' => $workspace->createWorkspace($request->json(), $request),
            ], 201),
        );
    }

    private function workspaceSwitch(Request $request): JsonResponse
    {
        return $this->workspaceResponse(
            fn (WorkspaceService $workspace): JsonResponse => JsonResponse::ok([
                'workspace' => $workspace->switchWorkspace($request->json(), $request),
            ]),
        );
    }

    private function workspaceMemberList(Request $request): JsonResponse
    {
        return $this->workspaceResponse(
            fn (WorkspaceService $workspace): JsonResponse => JsonResponse::ok([
                'members' => $workspace->workspaceMembers($request),
            ]),
        );
    }

    private function workspaceMemberCreate(Request $request): JsonResponse
    {
        return $this->workspaceResponse(
            fn (WorkspaceService $workspace): JsonResponse => JsonResponse::ok([
                'member' => $workspace->addWorkspaceMember($request->json(), $request),
            ], 201),
        );
    }

    private function workspaceMemberUpdate(Request $request): JsonResponse
    {
        return $this->workspaceResponse(
            fn (WorkspaceService $workspace): JsonResponse => JsonResponse::ok([
                'member' => $workspace->updateWorkspaceMember($request->json(), $request),
            ]),
        );
    }

    private function workspaceMemberDelete(Request $request): JsonResponse
    {
        return $this->workspaceResponse(
            function (WorkspaceService $workspace) use ($request): JsonResponse {
                $workspace->deleteWorkspaceMember($request->json(), $request);

                return JsonResponse::ok();
            },
        );
    }

    private function workgroupList(Request $request): JsonResponse
    {
        return $this->workgroupResponse(
            fn (WorkgroupService $workgroup): JsonResponse => JsonResponse::ok([
                'workgroups' => $workgroup->workgroups($request),
            ]),
        );
    }

    private function workgroupCreate(Request $request): JsonResponse
    {
        return $this->workgroupResponse(
            fn (WorkgroupService $workgroup): JsonResponse => JsonResponse::ok([
                'workgroup' => $workgroup->createWorkgroup($request->json(), $request),
            ], 201),
        );
    }

    private function workgroupUpdate(Request $request): JsonResponse
    {
        return $this->workgroupResponse(
            fn (WorkgroupService $workgroup): JsonResponse => JsonResponse::ok([
                'workgroup' => $workgroup->updateWorkgroup($request->json(), $request),
            ]),
        );
    }

    private function workgroupDelete(Request $request): JsonResponse
    {
        return $this->workgroupResponse(
            function (WorkgroupService $workgroup) use ($request): JsonResponse {
                $workgroup->deleteWorkgroup($request->json(), $request);

                return JsonResponse::ok();
            },
        );
    }

    private function budgetList(Request $request): JsonResponse
    {
        return $this->budgetResponse(
            fn (BudgetService $budget): JsonResponse => JsonResponse::ok([
                'budgets' => $budget->budgets($request),
            ]),
        );
    }

    private function budgetCreate(Request $request): JsonResponse
    {
        return $this->budgetResponse(
            fn (BudgetService $budget): JsonResponse => JsonResponse::ok([
                'budget' => $budget->createBudget($request->json(), $request),
            ], 201),
        );
    }

    private function budgetUpdate(Request $request): JsonResponse
    {
        return $this->budgetResponse(
            fn (BudgetService $budget): JsonResponse => JsonResponse::ok([
                'budget' => $budget->updateBudget($request->json(), $request),
            ]),
        );
    }

    private function budgetDelete(Request $request): JsonResponse
    {
        return $this->budgetResponse(
            function (BudgetService $budget) use ($request): JsonResponse {
                $budget->deleteBudget($request->json(), $request);

                return JsonResponse::ok();
            },
        );
    }

    private function budgetDetail(Request $request): JsonResponse
    {
        return $this->budgetResponse(
            fn (BudgetService $budget): JsonResponse => JsonResponse::ok([
                'budget' => $budget->budget($request),
            ]),
        );
    }

    private function budgetItemCreate(Request $request): JsonResponse
    {
        return $this->budgetEntryResponse(
            fn (BudgetEntryService $entry): JsonResponse => JsonResponse::ok([
                'budget' => $entry->createItem($request->json(), $request),
            ], 201),
        );
    }

    private function budgetItemUpdate(Request $request): JsonResponse
    {
        return $this->budgetEntryResponse(
            fn (BudgetEntryService $entry): JsonResponse => JsonResponse::ok([
                'budget' => $entry->updateItem($request->json(), $request),
            ]),
        );
    }

    private function budgetItemDelete(Request $request): JsonResponse
    {
        return $this->budgetEntryResponse(
            fn (BudgetEntryService $entry): JsonResponse => JsonResponse::ok([
                'budget' => $entry->deleteItem($request->json(), $request),
            ]),
        );
    }

    private function budgetTransactionCreate(Request $request): JsonResponse
    {
        return $this->budgetEntryResponse(
            fn (BudgetEntryService $entry): JsonResponse => JsonResponse::ok([
                'budget' => $entry->createTransaction($request->json(), $request),
            ], 201),
        );
    }

    private function budgetTransactionUpdate(Request $request): JsonResponse
    {
        return $this->budgetEntryResponse(
            fn (BudgetEntryService $entry): JsonResponse => JsonResponse::ok([
                'budget' => $entry->updateTransaction($request->json(), $request),
            ]),
        );
    }

    private function budgetTransactionDelete(Request $request): JsonResponse
    {
        return $this->budgetEntryResponse(
            fn (BudgetEntryService $entry): JsonResponse => JsonResponse::ok([
                'budget' => $entry->deleteTransaction($request->json(), $request),
            ]),
        );
    }

    private function authResponse(callable $callback): JsonResponse
    {
        try {
            $pdo = ConnectionFactory::make();
            $sessionManager = new SessionManager();
            $authenticator = new SessionAuthenticator($pdo, $sessionManager);
            $auth = new AuthService($pdo, $sessionManager, $authenticator);

            return $callback($auth);
        } catch (InvalidJsonRequestException | AuthException | MissingSeedDataException | DatabaseConfigurationException | PDOException $exception) {
            return $this->apiExceptionResponse($exception);
        }
    }

    private function workspaceResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): WorkspaceService =>
                new WorkspaceService($pdo, $authenticator),
            $callback,
        );
    }

    private function workgroupResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): WorkgroupService =>
                new WorkgroupService($pdo, $authenticator),
            $callback,
        );
    }

    private function budgetResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): BudgetService =>
                new BudgetService($pdo, $authenticator),
            $callback,
        );
    }

    private function budgetEntryResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): BudgetEntryService =>
                new BudgetEntryService($pdo, $authenticator),
            $callback,
        );
    }

    private function serviceResponse(callable $factory, callable $callback): JsonResponse
    {
        try {
            $pdo = ConnectionFactory::make();
            $sessionManager = new SessionManager();
            $authenticator = new SessionAuthenticator($pdo, $sessionManager);
            $service = $factory($pdo, $authenticator);

            return $callback($service);
        } catch (InvalidJsonRequestException | AuthException | MissingSeedDataException | DatabaseConfigurationException | PDOException $exception) {
            return $this->apiExceptionResponse($exception);
        }
    }

    private function apiExceptionResponse(
        InvalidJsonRequestException | AuthException | MissingSeedDataException | DatabaseConfigurationException | PDOException $exception,
    ): JsonResponse {
        if ($exception instanceof InvalidJsonRequestException) {
            return JsonResponse::error('INVALID_JSON', $exception->getMessage(), 400);
        }

        if ($exception instanceof AuthException) {
            return JsonResponse::error(
                $exception->errorCode(),
                $exception->getMessage(),
                $exception->status(),
                $exception->meta(),
            );
        }

        if ($exception instanceof MissingSeedDataException) {
            return JsonResponse::error('MISSING_SEED_DATA', $exception->getMessage(), 500);
        }

        if ($exception instanceof DatabaseConfigurationException) {
            return JsonResponse::error('DATABASE_NOT_CONFIGURED', $exception->getMessage(), 503);
        }

        return JsonResponse::error(
            'DATABASE_UNAVAILABLE',
            'Database connection or query failed.',
            503,
            ['detail' => getenv('APP_ENV') === 'local' ? $exception->getMessage() : null],
        );
    }

    private function templateResponse(string $templateKey): JsonResponse
    {
        try {
            $template = (new BudgetTemplateRepository(ConnectionFactory::make()))->findByKey($templateKey);
        } catch (DatabaseConfigurationException $exception) {
            return JsonResponse::error(
                'DATABASE_NOT_CONFIGURED',
                $exception->getMessage(),
                503,
            );
        } catch (PDOException $exception) {
            return JsonResponse::error(
                'DATABASE_UNAVAILABLE',
                'Database connection or query failed.',
                503,
                ['detail' => getenv('APP_ENV') === 'local' ? $exception->getMessage() : null],
            );
        } catch (JsonException $exception) {
            return JsonResponse::error(
                'TEMPLATE_JSON_INVALID',
                'Template JSON in database is invalid.',
                500,
                ['detail' => getenv('APP_ENV') === 'local' ? $exception->getMessage() : null],
            );
        }

        if ($template === null) {
            return JsonResponse::error(
                'TEMPLATE_NOT_FOUND',
                'Template is missing. Run database/003_seed_template.sql.',
                404,
            );
        }

        return JsonResponse::ok(['template' => $template]);
    }
}
