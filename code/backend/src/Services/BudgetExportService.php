<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\FileResponse;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BookkeepingRepository;
use BudgetCentre\Repositories\BudgetExportRepository;
use BudgetCentre\Repositories\BudgetRepository;
use BudgetCentre\Repositories\BudgetTemplateRepository;
use BudgetCentre\Services\BudgetPdf\BudgetPdfTheme;
use BudgetCentre\Support\Env;
use BudgetCentre\Support\Input;
use PDO;
use Throwable;

final readonly class BudgetExportService
{
    private const FORMATS = ['pdf'];
    private const DEFAULT_EXPORT_RETENTION = 3;

    public function __construct(
        private PDO $pdo,
        private SessionAuthenticator $authenticator,
    ) {
    }

    public function exports(Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($request->query['budgetId'] ?? $request->query['budget_id'] ?? null);
        if ($budgetId === null) {
            throw new AuthException('VALIDATION_ERROR', 'budgetId query parameter is required.', 422);
        }

        $this->permissions()->requireBudgetExport($budgetId, (int) $session['user_id']);

        return (new BudgetExportRepository($this->pdo))->listForBudget($budgetId);
    }

    public function createExport(array $input, Request $request): array
    {
        $session = $this->authenticator->authenticatedSession($request);
        $budgetId = Input::positiveInt($input['budgetId'] ?? $input['budget_id'] ?? null);
        $format = Input::string($input['format'] ?? null);
        if ($budgetId === null || $format === null || !in_array($format, self::FORMATS, true)) {
            throw new AuthException('VALIDATION_ERROR', 'Budget id and export format are required.', 422);
        }

        $this->permissions()->requireBudgetExport($budgetId, (int) $session['user_id']);
        $budget = (new BudgetRepository($this->pdo))->findForUser($budgetId, (int) $session['user_id'], true)
            ?? throw new AuthException('BUDGET_NOT_FOUND', 'Budget was not found.', 404);

        $repository = new BudgetExportRepository($this->pdo);
        $pdfOptions = $this->pdfOptions($input, $session);
        $exportScope = $this->exportScope($input);
        $fileName = $this->fileName($budget, $format, $exportScope);
        $path = $this->storagePath($fileName);
        $this->ensureStorageDirectory(dirname($path));

        try {
            match ($format) {
                'pdf' => $this->writePdf($budget, $path, $pdfOptions, $exportScope),
            };
        } catch (AuthException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            throw new AuthException(
                'EXPORT_FAILED',
                'Export file could not be created. Check PHP extensions and export storage permissions.',
                500,
                ['detail' => Env::string('APP_ENV') === 'local' ? $exception->getMessage() : null],
            );
        }

        if (!is_file($path)) {
            throw new AuthException('EXPORT_FAILED', 'Export file could not be created.', 500);
        }

        $exportId = $repository->create(
            $budgetId,
            (int) $session['user_id'],
            $format,
            $fileName,
            $this->relativePath($path),
        );

        $export = $repository->find($exportId)
            ?? throw new AuthException('EXPORT_FAILED', 'Export record could not be created.', 500);
        $this->pruneOldExports($budgetId, $format, $repository, $exportId);

        return $export;
    }

    public function download(Request $request): FileResponse
    {
        $session = $this->authenticator->authenticatedSession($request);
        $id = Input::positiveInt($request->query['id'] ?? null);
        if ($id === null) {
            throw new AuthException('VALIDATION_ERROR', 'Export id query parameter is required.', 422);
        }

        $export = (new BudgetExportRepository($this->pdo))->find($id)
            ?? throw new AuthException('EXPORT_NOT_FOUND', 'Export was not found.', 404);
        $this->permissions()->requireBudgetExport((int) $export['budgetId'], (int) $session['user_id']);
        $path = $this->absolutePath((string) $export['filePath']);
        if (!is_file($path)) {
            throw new AuthException('EXPORT_FILE_NOT_FOUND', 'Export file has been removed.', 404);
        }

        return new FileResponse(
            $path,
            (string) $export['fileName'],
            $this->contentType((string) $export['format']),
        );
    }

    private function writePdf(array $budget, string $path, array $options, string $exportScope): void
    {
        $tempDir = $this->mpdfTempRoot();
        $this->ensureStorageDirectory($tempDir);

        if ($exportScope === 'bookkeeping') {
            $records = (new BookkeepingRepository($this->pdo))->recordsForBudget((int) $budget['id']);
            (new BudgetBookkeepingPdfRenderer())->write($budget, $records, $path, $tempDir, $options);

            return;
        }

        (new BudgetPdfRenderer())->write($budget, $this->templateForBudget($budget), $path, $tempDir, $options);
    }

    private function exportScope(array $input): string
    {
        $scope = Input::string(
            $input['exportScope']
            ?? $input['export_scope']
            ?? $input['scope']
            ?? null,
        ) ?? 'budget';

        return in_array($scope, ['budget', 'bookkeeping'], true) ? $scope : 'budget';
    }

    private function pdfOptions(array $input, array $session): array
    {
        $tableLanguageMode = Input::string(
            $input['tableLanguageMode'] ?? $input['table_language_mode'] ?? null,
        ) ?? 'en';
        $tableChineseLanguage = Input::string(
            $input['tableChineseLanguage'] ?? $input['table_chinese_language'] ?? null,
        ) ?? 'tc';
        $pdfTheme = BudgetPdfTheme::normalize(
            $input['pdfTheme']
            ?? $input['pdf_theme']
            ?? $session['default_pdf_theme']
            ?? BudgetPdfTheme::DEFAULT,
        );
        $showWorkspace = $this->showWorkspacePreference($input, $session);
        $bookkeepingLayout = $this->bookkeepingLayoutPreference($input, $session);

        return [
            'tableLanguageMode' => in_array($tableLanguageMode, ['en', 'zh', 'bilingual'], true)
                ? $tableLanguageMode
                : 'en',
            'tableChineseLanguage' => in_array($tableChineseLanguage, ['sc', 'tc'], true)
                ? $tableChineseLanguage
                : 'tc',
            'pdfTheme' => $pdfTheme,
            'bookkeepingLayout' => in_array($bookkeepingLayout, ['landscape_table', 'statement_vertical'], true)
                ? $bookkeepingLayout
                : 'landscape_table',
            'showWorkspace' => $showWorkspace,
        ];
    }

    private function showWorkspacePreference(array $input, array $session): bool
    {
        if (array_key_exists('showWorkspace', $input) || array_key_exists('show_workspace', $input)) {
            return filter_var(
                $input['showWorkspace'] ?? $input['show_workspace'],
                FILTER_VALIDATE_BOOLEAN,
                FILTER_NULL_ON_FAILURE,
            ) ?? false;
        }

        $raw = $session['pdf_export_settings'] ?? null;
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($raw)) {
            return false;
        }

        return (bool) ($raw['showWorkspace'] ?? $raw['show_workspace'] ?? false);
    }

    private function bookkeepingLayoutPreference(array $input, array $session): string
    {
        $bookkeepingLayout = Input::string(
            $input['bookkeepingLayout'] ?? $input['bookkeeping_layout'] ?? null,
        );
        if ($bookkeepingLayout !== null) {
            return $bookkeepingLayout;
        }

        $raw = $session['pdf_export_settings'] ?? null;
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($raw)) {
            return 'landscape_table';
        }

        return Input::string($raw['bookkeepingLayout'] ?? $raw['bookkeeping_layout'] ?? null)
            ?? 'landscape_table';
    }

    private function templateForBudget(array $budget): array
    {
        $templateKey = $budget['template']['key'] ?? 'personal_living_budget';
        $template = is_string($templateKey) && $templateKey !== ''
            ? (new BudgetTemplateRepository($this->pdo))->findByKey($templateKey)
            : null;

        return $template ?? [
            'titleTemplate' => '{{budget_title}}',
            'subtitleTemplate' => '{{owner_name}}',
            'sections' => [],
        ];
    }

    private function permissions(): PermissionGuard
    {
        return new PermissionGuard($this->pdo, $this->authenticator);
    }

    private function fileName(array $budget, string $format, string $exportScope = 'budget'): string
    {
        $slug = preg_replace('/[^a-z0-9]+/i', '-', strtolower((string) $budget['title'])) ?: 'budget';
        $slug = trim((string) $slug, '-');
        $suffix = $exportScope === 'bookkeeping' ? '-bookkeeping-ledger' : '';

        return date('Ymd-His') . '-' . ($slug === '' ? 'budget' : $slug) . $suffix . '.' . $format;
    }

    private function pruneOldExports(
        int $budgetId,
        string $format,
        BudgetExportRepository $repository,
        int $currentExportId,
    ): void
    {
        foreach ($repository->staleForBudgetFormat($budgetId, $format, $this->exportRetention()) as $export) {
            $exportId = (int) ($export['id'] ?? 0);
            if ($exportId === $currentExportId) {
                continue;
            }

            $path = $this->absolutePath((string) ($export['filePath'] ?? ''));
            if ($path !== '' && is_file($path)) {
                @unlink($path);
            }
            $repository->delete($exportId);
        }
    }

    private function exportRetention(): int
    {
        return max(1, Env::int('EXPORT_RETENTION_PER_BUDGET', self::DEFAULT_EXPORT_RETENTION));
    }

    private function storagePath(string $fileName): string
    {
        return $this->exportStorageRoot() . '/' . ltrim($fileName, '/');
    }

    private function exportStorageRoot(): string
    {
        return rtrim(
            Env::string('EXPORT_STORAGE_DIR', dirname(__DIR__, 2) . '/storage/exports')
                ?? dirname(__DIR__, 2) . '/storage/exports',
            '/',
        );
    }

    private function mpdfTempRoot(): string
    {
        return rtrim(
            Env::string('MPDF_TEMP_DIR', dirname(__DIR__, 2) . '/storage/tmp/mpdf')
                ?? dirname(__DIR__, 2) . '/storage/tmp/mpdf',
            '/',
        );
    }

    private function relativePath(string $path): string
    {
        $root = dirname(__DIR__, 2) . '/';

        return str_starts_with($path, $root) ? substr($path, strlen($root)) : $path;
    }

    private function absolutePath(string $path): string
    {
        return str_starts_with($path, '/') ? $path : dirname(__DIR__, 2) . '/' . $path;
    }

    private function ensureStorageDirectory(string $directory): void
    {
        if (!is_dir($directory) && !@mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new AuthException(
                'EXPORT_STORAGE_UNWRITABLE',
                'Export storage directory could not be created. Set EXPORT_STORAGE_DIR or grant write permission.',
                500,
                ['directory' => $directory],
            );
        }

        if (!is_writable($directory)) {
            throw new AuthException(
                'EXPORT_STORAGE_UNWRITABLE',
                'Export storage directory is not writable. Set EXPORT_STORAGE_DIR or grant write permission.',
                500,
                ['directory' => $directory],
            );
        }
    }

    private function contentType(string $format): string
    {
        return match ($format) {
            'markdown' => 'text/markdown; charset=utf-8',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'pdf' => 'application/pdf',
            default => 'application/octet-stream',
        };
    }

}
