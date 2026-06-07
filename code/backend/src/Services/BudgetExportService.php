<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Auth\AuthException;
use BudgetCentre\Auth\PermissionGuard;
use BudgetCentre\Auth\SessionAuthenticator;
use BudgetCentre\Http\FileResponse;
use BudgetCentre\Http\Request;
use BudgetCentre\Repositories\BudgetExportRepository;
use BudgetCentre\Repositories\BudgetRepository;
use BudgetCentre\Repositories\BudgetTemplateRepository;
use BudgetCentre\Support\Env;
use BudgetCentre\Support\Input;
use PDO;
use Throwable;

final readonly class BudgetExportService
{
    private const FORMATS = ['pdf'];

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
        $fileName = $this->fileName($budget, $format, $this->nextExportVersion($budgetId, $repository));
        $path = $this->storagePath($fileName);
        $this->ensureStorageDirectory(dirname($path));

        try {
            match ($format) {
                'pdf' => $this->writePdf($budget, $path),
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

        return $repository->find($exportId)
            ?? throw new AuthException('EXPORT_FAILED', 'Export record could not be created.', 500);
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

        return new FileResponse(
            $this->absolutePath((string) $export['filePath']),
            (string) $export['fileName'],
            $this->contentType((string) $export['format']),
        );
    }

    private function writePdf(array $budget, string $path): void
    {
        $tempDir = $this->storagePath('tmp');
        $this->ensureStorageDirectory($tempDir);

        (new BudgetPdfRenderer())->write($budget, $this->templateForBudget($budget), $path, $tempDir);
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

    private function fileName(array $budget, string $format, int $version): string
    {
        $slug = preg_replace('/[^a-z0-9]+/i', '-', strtolower((string) $budget['title'])) ?: 'budget';

        return 'v' . $version . '-' . trim($slug, '-') . '-' . date('Ymd-His') . '.' . $format;
    }

    private function nextExportVersion(int $budgetId, BudgetExportRepository $repository): int
    {
        $maxVersion = 0;
        foreach ($repository->listForBudget($budgetId) as $export) {
            $fileName = (string) ($export['fileName'] ?? '');
            if (preg_match('/^v(\d+)-/i', $fileName, $matches) === 1) {
                $maxVersion = max($maxVersion, (int) $matches[1]);
            }
        }

        return $maxVersion + 1;
    }

    private function storagePath(string $fileName): string
    {
        return $this->storageRoot() . '/' . ltrim($fileName, '/');
    }

    private function storageRoot(): string
    {
        return rtrim(
            Env::string('EXPORT_STORAGE_DIR', dirname(__DIR__, 2) . '/storage/exports')
                ?? dirname(__DIR__, 2) . '/storage/exports',
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
