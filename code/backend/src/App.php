<?php

declare(strict_types=1);

namespace BudgetCentre;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\AuthService;
use BudgetCentre\Auth\CsrfGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Auth\SessionManager;
use BudgetCentre\Database\ConnectionFactory;
use BudgetCentre\Database\DatabaseConfigurationException;
use BudgetCentre\Http\FileResponse;
use BudgetCentre\Http\InvalidJsonRequestException;
use BudgetCentre\Http\JsonResponse;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BudgetTemplateRepository;
use BudgetCentre\Repositories\MissingSeedDataException;
use BudgetCentre\Services\BudgetCategoryService;
use BudgetCentre\Services\BudgetEntryService;
use BudgetCentre\Services\BudgetExportService;
use BudgetCentre\Services\BookkeepingService;
use BudgetCentre\Services\BudgetReconciliationService;
use BudgetCentre\Services\BudgetService;
use BudgetCentre\Services\BudgetShareService;
use BudgetCentre\Services\AdminUserService;
use BudgetCentre\Services\ExchangeRateService;
use BudgetCentre\Services\PasskeyService;
use BudgetCentre\Services\ReferenceDataService;
use BudgetCentre\Services\SystemCheckService;
use BudgetCentre\Services\WorkspaceService;
use BudgetCentre\Services\WorkgroupService;
use BudgetCentre\Support\Env;
use BudgetCentre\Support\AppLog;
use JsonException;
use PDO;
use PDOException;
use RuntimeException;

final class App
{
    private ?Request $currentRequest = null;

    public function handle(Request $request): JsonResponse|FileResponse
    {
        $this->currentRequest = $request;
        $this->applyCorsHeaders();

        if ($request->method === 'OPTIONS') {
            return JsonResponse::ok();
        }

        try {
            (new CsrfGuard(new SessionManager()))->validate($request);
        } catch (AuthException $exception) {
            return $this->apiExceptionResponse($exception);
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
            ['PATCH', '/api/auth/profile'] => $this->authProfileUpdate($request),
            ['PATCH', '/api/auth/password'] => $this->authPasswordUpdate($request),
            ['GET', '/api/auth/sso-binding'] => $this->authSsoBinding($request),
            ['DELETE', '/api/auth/sso-binding'] => $this->authSsoUnlink($request),
            ['GET', '/api/auth/email/verify'] => $this->authEmailVerify($request),
            ['POST', '/api/auth/email/resend'] => $this->authEmailResend($request),
            ['POST', '/api/Callback'] => $this->authCasdoorCallback($request),
            ['GET', '/api/workspaces'] => $this->workspaceList($request),
            ['POST', '/api/workspaces'] => $this->workspaceCreate($request),
            ['PATCH', '/api/workspaces'] => $this->workspaceUpdate($request),
            ['DELETE', '/api/workspaces'] => $this->workspaceDelete($request),
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
            ['PATCH', '/api/budget-installment-plan'] => $this->budgetInstallmentPlanUpdate($request),
            ['POST', '/api/budget-transactions'] => $this->budgetTransactionCreate($request),
            ['PATCH', '/api/budget-transactions'] => $this->budgetTransactionUpdate($request),
            ['DELETE', '/api/budget-transactions'] => $this->budgetTransactionDelete($request),
            ['GET', '/api/bookkeeping-records'] => $this->bookkeepingRecordList($request),
            ['POST', '/api/bookkeeping-records'] => $this->bookkeepingRecordCreate($request),
            ['PATCH', '/api/bookkeeping-records'] => $this->bookkeepingRecordUpdate($request),
            ['DELETE', '/api/bookkeeping-records'] => $this->bookkeepingRecordDelete($request),
            ['GET', '/api/budget-shares'] => $this->budgetShareList($request),
            ['POST', '/api/budget-shares'] => $this->budgetShareCreate($request),
            ['PATCH', '/api/budget-shares'] => $this->budgetShareUpdate($request),
            ['DELETE', '/api/budget-shares'] => $this->budgetShareDelete($request),
            ['GET', '/api/currencies'] => $this->currencyList($request),
            ['GET', '/api/exchange-rates'] => $this->exchangeRateList($request),
            ['POST', '/api/exchange-rates'] => $this->exchangeRateCreate($request),
            ['POST', '/api/exchange-rates/convert'] => $this->exchangeRateConvert($request),
            ['POST', '/api/exchange-rates/bochk/refresh'] => $this->exchangeRateBochkRefresh($request),
            ['GET', '/api/budget-categories'] => $this->categoryList($request),
            ['POST', '/api/budget-categories'] => $this->categoryCreate($request),
            ['PATCH', '/api/budget-categories'] => $this->categoryUpdate($request),
            ['DELETE', '/api/budget-categories'] => $this->categoryDelete($request),
            ['POST', '/api/budget-category-aliases'] => $this->categoryAliasCreate($request),
            ['DELETE', '/api/budget-category-aliases'] => $this->categoryAliasDelete($request),
            ['GET', '/api/budget-reconciliation'] => $this->reconciliation($request),
            ['GET', '/api/exports'] => $this->exportList($request),
            ['POST', '/api/exports'] => $this->exportCreate($request),
            ['GET', '/api/exports/download'] => $this->exportDownload($request),
            ['GET', '/api/admin/users'] => $this->adminUserList($request),
            ['POST', '/api/admin/users'] => $this->adminUserCreate($request),
            ['PATCH', '/api/admin/users'] => $this->adminUserUpdate($request),
            ['POST', '/api/admin/users/email-verification'] => $this->adminUserEmailVerification($request),
            ['GET', '/api/admin/environment'] => $this->adminEnvironment($request),
            ['GET', '/api/admin/logs'] => $this->adminLogs($request),
            ['POST', '/api/admin/export-cache/cleanup'] => $this->adminExportCacheCleanup($request),
            ['GET', '/api/templates/personal-living-budget'] => $this->templateResponse('personal_living_budget'),
            ['GET', '/api/auth/passkey/register/options'] => $this->passkeyRegistrationOptions($request),
            ['POST', '/api/auth/passkey/register/verify'] => $this->passkeyRegistrationVerify($request),
            ['GET', '/api/auth/passkey/login/options'] => $this->passkeyLoginOptions($request),
            ['POST', '/api/auth/passkey/login/verify'] => $this->passkeyLoginVerify($request),
            ['GET', '/api/auth/passkey/credentials'] => $this->passkeyCredentials($request),
            ['PATCH', '/api/auth/passkey/credentials'] => $this->passkeyCredentialUpdate($request),
            ['DELETE', '/api/auth/passkey/credentials'] => $this->passkeyCredentialDelete($request),
            default => JsonResponse::error('NOT_FOUND', 'API route not found.', 404),
        };
    }

    private function applyCorsHeaders(): void
    {
        $origin = Env::string('APP_URL', 'http://localhost:5173');

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

    private function authEmailVerify(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok(
                $auth->verifyEmail((string) ($request->query['token'] ?? '')),
            ),
        );
    }

    private function authEmailResend(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok(
                $auth->resendEmailVerification($request->json()),
            ),
        );
    }

    private function authMe(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok([
                'session' => $auth->me($request),
            ]),
        );
    }

    private function authProfileUpdate(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok(
                $auth->updateProfile($request->json(), $request),
            ),
        );
    }

    private function authPasswordUpdate(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok(
                $auth->updatePassword($request->json(), $request),
            ),
        );
    }

    private function authSsoBinding(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok(
                $auth->ssoBinding($request),
            ),
        );
    }

    private function authSsoUnlink(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok(
                $auth->unlinkSso($request),
            ),
        );
    }

    private function authCasdoorCallback(Request $request): JsonResponse
    {
        return $this->authResponse(
            fn (AuthService $auth): JsonResponse => JsonResponse::ok(
                $auth->casdoorCallback($request->json(), $request),
            ),
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

    private function workspaceUpdate(Request $request): JsonResponse
    {
        return $this->workspaceResponse(
            fn (WorkspaceService $workspace): JsonResponse => JsonResponse::ok([
                'workspace' => $workspace->updateWorkspace($request->json(), $request),
            ]),
        );
    }

    private function workspaceDelete(Request $request): JsonResponse
    {
        return $this->workspaceResponse(
            fn (WorkspaceService $workspace): JsonResponse => JsonResponse::ok([
                'workspace' => $workspace->deleteWorkspace($request->json(), $request),
            ]),
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

    private function budgetInstallmentPlanUpdate(Request $request): JsonResponse
    {
        return $this->budgetEntryResponse(
            fn (BudgetEntryService $entry): JsonResponse => JsonResponse::ok([
                'budget' => $entry->updateOverallInstallmentPlan($request->json(), $request),
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

    private function budgetShareList(Request $request): JsonResponse
    {
        return $this->budgetShareResponse(
            fn (BudgetShareService $share): JsonResponse => JsonResponse::ok([
                'shares' => $share->shares($request),
            ]),
        );
    }

    private function budgetShareCreate(Request $request): JsonResponse
    {
        return $this->budgetShareResponse(
            fn (BudgetShareService $share): JsonResponse => JsonResponse::ok(
                $share->createShare($request->json(), $request),
                201,
            ),
        );
    }

    private function bookkeepingRecordList(Request $request): JsonResponse
    {
        return $this->bookkeepingResponse(
            fn (BookkeepingService $bookkeeping): JsonResponse => JsonResponse::ok([
                'records' => $bookkeeping->records($request),
            ]),
        );
    }

    private function bookkeepingRecordCreate(Request $request): JsonResponse
    {
        return $this->bookkeepingResponse(
            fn (BookkeepingService $bookkeeping): JsonResponse => JsonResponse::ok([
                'records' => $bookkeeping->create($request->json(), $request),
            ], 201),
        );
    }

    private function bookkeepingRecordUpdate(Request $request): JsonResponse
    {
        return $this->bookkeepingResponse(
            fn (BookkeepingService $bookkeeping): JsonResponse => JsonResponse::ok([
                'records' => $bookkeeping->update($request->json(), $request),
            ]),
        );
    }

    private function bookkeepingRecordDelete(Request $request): JsonResponse
    {
        return $this->bookkeepingResponse(
            fn (BookkeepingService $bookkeeping): JsonResponse => JsonResponse::ok([
                'records' => $bookkeeping->delete($request->json(), $request),
            ]),
        );
    }

    private function budgetShareUpdate(Request $request): JsonResponse
    {
        return $this->budgetShareResponse(
            fn (BudgetShareService $share): JsonResponse => JsonResponse::ok(
                $share->updateShare($request->json(), $request),
            ),
        );
    }

    private function budgetShareDelete(Request $request): JsonResponse
    {
        return $this->budgetShareResponse(
            fn (BudgetShareService $share): JsonResponse => JsonResponse::ok(
                $share->deleteShare($request->json(), $request),
            ),
        );
    }

    private function currencyList(Request $request): JsonResponse
    {
        return $this->referenceResponse(
            fn (ReferenceDataService $reference): JsonResponse => JsonResponse::ok([
                'currencies' => $reference->currencies($request),
            ]),
        );
    }

    private function exchangeRateList(Request $request): JsonResponse
    {
        return $this->exchangeRateResponse(
            fn (ExchangeRateService $exchangeRate): JsonResponse => JsonResponse::ok([
                'rates' => $exchangeRate->rates($request),
            ]),
        );
    }

    private function exchangeRateCreate(Request $request): JsonResponse
    {
        return $this->exchangeRateResponse(
            fn (ExchangeRateService $exchangeRate): JsonResponse => JsonResponse::ok([
                'rate' => $exchangeRate->createManualRate($request->json(), $request),
            ], 201),
        );
    }

    private function exchangeRateConvert(Request $request): JsonResponse
    {
        return $this->exchangeRateResponse(
            fn (ExchangeRateService $exchangeRate): JsonResponse => JsonResponse::ok([
                'conversion' => $exchangeRate->convert($request->json(), $request),
            ]),
        );
    }

    private function exchangeRateBochkRefresh(Request $request): JsonResponse
    {
        return $this->exchangeRateResponse(
            fn (ExchangeRateService $exchangeRate): JsonResponse => JsonResponse::ok([
                'provider' => $exchangeRate->refreshBochk($request->json(), $request),
            ]),
        );
    }

    private function categoryList(Request $request): JsonResponse
    {
        return $this->categoryResponse(
            fn (BudgetCategoryService $category): JsonResponse => JsonResponse::ok([
                'categories' => $category->categories($request),
            ]),
        );
    }

    private function categoryCreate(Request $request): JsonResponse
    {
        return $this->categoryResponse(
            fn (BudgetCategoryService $category): JsonResponse => JsonResponse::ok([
                'categories' => $category->createCategory($request->json(), $request),
            ], 201),
        );
    }

    private function categoryUpdate(Request $request): JsonResponse
    {
        return $this->categoryResponse(
            fn (BudgetCategoryService $category): JsonResponse => JsonResponse::ok([
                'categories' => $category->updateCategory($request->json(), $request),
            ]),
        );
    }

    private function categoryDelete(Request $request): JsonResponse
    {
        return $this->categoryResponse(
            fn (BudgetCategoryService $category): JsonResponse => JsonResponse::ok([
                'categories' => $category->deleteCategory($request->json(), $request),
            ]),
        );
    }

    private function categoryAliasCreate(Request $request): JsonResponse
    {
        return $this->categoryResponse(
            fn (BudgetCategoryService $category): JsonResponse => JsonResponse::ok([
                'categories' => $category->createAlias($request->json(), $request),
            ], 201),
        );
    }

    private function categoryAliasDelete(Request $request): JsonResponse
    {
        return $this->categoryResponse(
            fn (BudgetCategoryService $category): JsonResponse => JsonResponse::ok([
                'categories' => $category->deleteAlias($request->json(), $request),
            ]),
        );
    }

    private function reconciliation(Request $request): JsonResponse
    {
        return $this->reconciliationResponse(
            fn (BudgetReconciliationService $reconciliation): JsonResponse => JsonResponse::ok([
                'reconciliation' => $reconciliation->reconciliation($request),
            ]),
        );
    }

    private function exportList(Request $request): JsonResponse
    {
        return $this->exportResponse(
            fn (BudgetExportService $export): JsonResponse => JsonResponse::ok([
                'exports' => $export->exports($request),
            ]),
        );
    }

    private function exportCreate(Request $request): JsonResponse
    {
        return $this->exportResponse(
            fn (BudgetExportService $export): JsonResponse => JsonResponse::ok([
                'export' => $export->createExport($request->json(), $request),
            ], 201),
        );
    }

    private function exportDownload(Request $request): JsonResponse|FileResponse
    {
        return $this->exportResponse(
            fn (BudgetExportService $export): FileResponse => $export->download($request),
        );
    }

    private function passkeyRegistrationOptions(Request $request): JsonResponse
    {
        return $this->passkeyResponse(
            fn (PasskeyService $passkey): JsonResponse => JsonResponse::ok(
                $passkey->registrationOptions($request),
            ),
        );
    }

    private function passkeyRegistrationVerify(Request $request): JsonResponse
    {
        return $this->passkeyResponse(
            fn (PasskeyService $passkey): JsonResponse => JsonResponse::ok(
                $passkey->verifyRegistration($request->json(), $request),
            ),
        );
    }

    private function passkeyLoginOptions(Request $request): JsonResponse
    {
        return $this->passkeyResponse(
            fn (PasskeyService $passkey): JsonResponse => JsonResponse::ok(
                $passkey->loginOptions($request),
            ),
        );
    }

    private function passkeyLoginVerify(Request $request): JsonResponse
    {
        return $this->passkeyResponse(
            fn (PasskeyService $passkey): JsonResponse => JsonResponse::ok(
                $passkey->verifyLogin($request->json(), $request),
            ),
        );
    }

    private function passkeyCredentials(Request $request): JsonResponse
    {
        return $this->passkeyResponse(
            fn (PasskeyService $passkey): JsonResponse => JsonResponse::ok([
                'credentials' => $passkey->credentials($request),
            ]),
        );
    }

    private function passkeyCredentialUpdate(Request $request): JsonResponse
    {
        return $this->passkeyResponse(
            fn (PasskeyService $passkey): JsonResponse => JsonResponse::ok(
                $passkey->updateCredential($request->json(), $request),
            ),
        );
    }

    private function passkeyCredentialDelete(Request $request): JsonResponse
    {
        return $this->passkeyResponse(
            fn (PasskeyService $passkey): JsonResponse => JsonResponse::ok(
                $passkey->deleteCredential($request->json(), $request),
            ),
        );
    }

    private function adminUserList(Request $request): JsonResponse
    {
        return $this->adminResponse(
            fn (AdminUserService $admin): JsonResponse => JsonResponse::ok(
                $admin->users($request),
            ),
        );
    }

    private function adminUserUpdate(Request $request): JsonResponse
    {
        return $this->adminResponse(
            fn (AdminUserService $admin): JsonResponse => JsonResponse::ok(
                $admin->updateUser($request->json(), $request),
            ),
        );
    }

    private function adminUserCreate(Request $request): JsonResponse
    {
        return $this->adminResponse(
            fn (AdminUserService $admin): JsonResponse => JsonResponse::ok(
                $admin->createUser($request->json(), $request),
                201,
            ),
        );
    }

    private function adminUserEmailVerification(Request $request): JsonResponse
    {
        return $this->adminResponse(
            fn (AdminUserService $admin): JsonResponse => JsonResponse::ok(
                $admin->resendVerification($request->json(), $request),
            ),
        );
    }

    private function adminEnvironment(Request $request): JsonResponse
    {
        return $this->adminResponse(
            fn (AdminUserService $admin): JsonResponse => JsonResponse::ok([
                'environment' => $admin->environment($request),
            ]),
        );
    }

    private function adminLogs(Request $request): JsonResponse
    {
        return $this->adminResponse(
            fn (AdminUserService $admin): JsonResponse => JsonResponse::ok([
                'logs' => $admin->logs($request),
            ]),
        );
    }

    private function adminExportCacheCleanup(Request $request): JsonResponse
    {
        return $this->adminResponse(
            fn (AdminUserService $admin): JsonResponse => JsonResponse::ok([
                'cleanup' => $admin->cleanupExportCache($request),
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
        } catch (InvalidJsonRequestException | AuthException | MissingSeedDataException | DatabaseConfigurationException | PDOException | RuntimeException $exception) {
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

    private function bookkeepingResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): BookkeepingService =>
                new BookkeepingService($pdo, $authenticator),
            $callback,
        );
    }

    private function budgetShareResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): BudgetShareService =>
                new BudgetShareService($pdo, $authenticator),
            $callback,
        );
    }

    private function referenceResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): ReferenceDataService =>
                new ReferenceDataService($pdo, $authenticator),
            $callback,
        );
    }

    private function exchangeRateResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): ExchangeRateService =>
                new ExchangeRateService($pdo, $authenticator),
            $callback,
        );
    }

    private function categoryResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): BudgetCategoryService =>
                new BudgetCategoryService($pdo, $authenticator),
            $callback,
        );
    }

    private function reconciliationResponse(callable $callback): JsonResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): BudgetReconciliationService =>
                new BudgetReconciliationService($pdo, $authenticator),
            $callback,
        );
    }

    private function exportResponse(callable $callback): JsonResponse|FileResponse
    {
        return $this->serviceResponse(
            fn (PDO $pdo, SessionAuthenticator $authenticator): BudgetExportService =>
                new BudgetExportService($pdo, $authenticator),
            $callback,
        );
    }

    private function passkeyResponse(callable $callback): JsonResponse
    {
        try {
            $pdo = ConnectionFactory::make();
            $sessionManager = new SessionManager();
            $authenticator = new SessionAuthenticator($pdo, $sessionManager);
            $service = new PasskeyService($pdo, $sessionManager, $authenticator);

            return $callback($service);
        } catch (InvalidJsonRequestException | AuthException | MissingSeedDataException | DatabaseConfigurationException | PDOException | RuntimeException $exception) {
            return $this->apiExceptionResponse($exception);
        }
    }

    private function adminResponse(callable $callback): JsonResponse
    {
        try {
            $pdo = ConnectionFactory::make();
            $sessionManager = new SessionManager();
            $authenticator = new SessionAuthenticator($pdo, $sessionManager);
            $service = new AdminUserService($pdo, $authenticator, $sessionManager);

            return $callback($service);
        } catch (InvalidJsonRequestException | AuthException | MissingSeedDataException | DatabaseConfigurationException | PDOException | RuntimeException $exception) {
            return $this->apiExceptionResponse($exception);
        }
    }

    private function serviceResponse(callable $factory, callable $callback): JsonResponse|FileResponse
    {
        try {
            $pdo = ConnectionFactory::make();
            $sessionManager = new SessionManager();
            $authenticator = new SessionAuthenticator($pdo, $sessionManager);
            $service = $factory($pdo, $authenticator);

            return $callback($service);
        } catch (InvalidJsonRequestException | AuthException | MissingSeedDataException | DatabaseConfigurationException | PDOException | RuntimeException $exception) {
            return $this->apiExceptionResponse($exception);
        }
    }

    private function apiExceptionResponse(
        InvalidJsonRequestException | AuthException | MissingSeedDataException | DatabaseConfigurationException | PDOException | RuntimeException $exception,
    ): JsonResponse {
        if (!($exception instanceof AuthException && $exception->status() < 500)) {
            AppLog::error($exception, $this->currentRequest);
        }

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

        if ($exception instanceof RuntimeException) {
            return JsonResponse::error(
                'SERVER_ERROR',
                'The server could not complete the request. Please try again later.',
                503,
                ['detail' => Env::string('APP_ENV') === 'local' ? $exception->getMessage() : null],
            );
        }

        return JsonResponse::error(
            'DATABASE_UNAVAILABLE',
            'Database connection or query failed.',
            503,
            ['detail' => Env::string('APP_ENV') === 'local' ? $exception->getMessage() : null],
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
                ['detail' => Env::string('APP_ENV') === 'local' ? $exception->getMessage() : null],
            );
        } catch (JsonException $exception) {
            return JsonResponse::error(
                'TEMPLATE_JSON_INVALID',
                'Template JSON in database is invalid.',
                500,
                ['detail' => Env::string('APP_ENV') === 'local' ? $exception->getMessage() : null],
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
