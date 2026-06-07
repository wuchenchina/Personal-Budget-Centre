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
use BudgetCentre\Support\Env;
use BudgetCentre\Support\Input;
use Mpdf\Mpdf;
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

        $fileName = $this->fileName($budget, $format);
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

        $repository = new BudgetExportRepository($this->pdo);
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

        $mpdf = new Mpdf([
            'mode' => 'utf-8',
            'format' => 'A4',
            'tempDir' => $tempDir,
            'default_font' => 'sun-exta',
            'autoScriptToLang' => true,
            'autoLangToFont' => true,
            'useSubstitutions' => true,
        ]);
        $mpdf->WriteHTML($this->pdfHtml($budget));
        $mpdf->Output($path, 'F');
    }

    private function pdfHtml(array $budget): string
    {
        $items = array_map(
            fn (array $item): array => [
                $item['label'],
                $item['category'] ?? '',
                $this->money((string) $item['budget']['currency'], (float) $item['budget']['amountOriginal']),
                $this->money((string) $item['estimatedActuals']['currency'], (float) $item['estimatedActuals']['amountOriginal']),
                number_format((float) $item['varianceBase'], 2),
            ],
            $budget['items'],
        );
        $transactions = array_map(
            fn (array $transaction): array => [
                $transaction['transactionDate'] ?? '',
                $transaction['details'],
                $transaction['category'] ?? '',
                $this->money((string) $transaction['currency'], (float) $transaction['amountOriginal']),
                $transaction['remark'] ?? '',
            ],
            $budget['transactions'],
        );

        return '<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">'
            . '<style>'
            . 'body{font-family:sun-exta,dejavusanscondensed,sans-serif;color:#1f1f1f;font-size:10pt;}'
            . 'h1{font-size:18pt;text-align:center;margin:0 0 8mm;}'
            . 'h2{font-size:12pt;margin:9mm 0 3mm;}'
            . '.meta{width:100%;border-collapse:collapse;margin-bottom:6mm;}'
            . '.meta th{width:28mm;color:#595959;text-align:left;font-weight:700;padding:1.5mm 2mm;}'
            . '.meta td{padding:1.5mm 2mm;}'
            . '.data-table{width:100%;border-collapse:collapse;table-layout:fixed;}'
            . '.data-table th{background:#f5f5f5;font-weight:700;}'
            . '.data-table th,.data-table td{border:0.2mm solid #d9d9d9;padding:2mm;vertical-align:top;}'
            . '.number{text-align:right;white-space:nowrap;}'
            . '.empty{color:#8c8c8c;text-align:center;}'
            . '</style></head><body>'
            . '<h1>' . $this->escapeHtml((string) $budget['title']) . '</h1>'
            . '<table class="meta"><tr><th>Owner</th><td>' . $this->escapeHtml((string) $budget['ownerName']) . '</td></tr>'
            . '<tr><th>Period</th><td>' . $this->escapeHtml((string) $budget['startDate']) . ' to ' . $this->escapeHtml((string) $budget['endDate']) . '</td></tr>'
            . '<tr><th>Base currency</th><td>' . $this->escapeHtml((string) $budget['baseCurrency']) . '</td></tr></table>'
            . '<h2>Budget Highlights</h2>'
            . $this->htmlTable(['Label', 'Category', 'Budget', 'Estimated', 'Variance'], $items, [2, 3, 4], '暂无预算项')
            . '<h2>Transaction Breakdown</h2>'
            . $this->htmlTable(['Date', 'Details', 'Category', 'Amount', 'Remark'], $transactions, [3], '暂无交易')
            . '</body></html>';
    }

    private function htmlTable(array $headers, array $rows, array $numberColumns, string $emptyText): string
    {
        $html = '<table class="data-table"><thead><tr>';
        foreach ($headers as $header) {
            $html .= '<th>' . $this->escapeHtml((string) $header) . '</th>';
        }
        $html .= '</tr></thead><tbody>';

        if ($rows === []) {
            return $html . '<tr><td class="empty" colspan="' . count($headers) . '">' . $this->escapeHtml($emptyText) . '</td></tr></tbody></table>';
        }

        foreach ($rows as $row) {
            $html .= '<tr>';
            foreach ($row as $index => $cell) {
                $class = in_array($index, $numberColumns, true) ? ' class="number"' : '';
                $html .= '<td' . $class . '>' . $this->escapeHtml((string) $cell) . '</td>';
            }
            $html .= '</tr>';
        }

        return $html . '</tbody></table>';
    }

    private function permissions(): PermissionGuard
    {
        return new PermissionGuard($this->pdo, $this->authenticator);
    }

    private function fileName(array $budget, string $format): string
    {
        $slug = preg_replace('/[^a-z0-9]+/i', '-', strtolower((string) $budget['title'])) ?: 'budget';

        return trim($slug, '-') . '-' . date('Ymd-His') . '.' . $format;
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

    private function escapeHtml(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private function money(string $currency, float $amount): string
    {
        return $currency . ' ' . number_format($amount, 2);
    }
}
