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
use BudgetCentre\Support\Input;
use Mpdf\Mpdf;
use PDO;
use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\PhpWord;
use PhpOffice\PhpWord\SimpleType\JcTable;
use RuntimeException;

final readonly class BudgetExportService
{
    private const FORMATS = ['markdown', 'docx', 'pdf'];

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

        match ($format) {
            'markdown' => file_put_contents($path, $this->markdown($budget)),
            'docx' => $this->writeDocx($budget, $path),
            'pdf' => $this->writePdf($budget, $path),
        };

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

    private function markdown(array $budget): string
    {
        $lines = [
            "# {$budget['title']}",
            '',
            "Owner: {$budget['ownerName']}",
            "Period: {$budget['startDate']} to {$budget['endDate']}",
            "Base currency: {$budget['baseCurrency']}",
            '',
            '## Budget Highlights',
            '',
            '| Label | Category | Budget | Estimated | Variance |',
            '| --- | --- | ---: | ---: | ---: |',
        ];

        foreach ($budget['items'] as $item) {
            $lines[] = sprintf(
                '| %s | %s | %s %.2f | %s %.2f | %.2f |',
                $this->escapeMarkdown((string) $item['label']),
                $this->escapeMarkdown((string) ($item['category'] ?? '')),
                $item['budget']['currency'],
                $item['budget']['amountOriginal'],
                $item['estimatedActuals']['currency'],
                $item['estimatedActuals']['amountOriginal'],
                $item['varianceBase'],
            );
        }

        $lines[] = '';
        $lines[] = '## Transaction Breakdown';
        $lines[] = '';
        $lines[] = '| Date | Details | Category | Amount | Remark |';
        $lines[] = '| --- | --- | --- | ---: | --- |';

        foreach ($budget['transactions'] as $transaction) {
            $lines[] = sprintf(
                '| %s | %s | %s | %s %.2f | %s |',
                $transaction['transactionDate'] ?? '',
                $this->escapeMarkdown((string) $transaction['details']),
                $this->escapeMarkdown((string) ($transaction['category'] ?? '')),
                $transaction['currency'],
                $transaction['amountOriginal'],
                $this->escapeMarkdown((string) ($transaction['remark'] ?? '')),
            );
        }

        return implode("\n", $lines) . "\n";
    }

    private function writeDocx(array $budget, string $path): void
    {
        $phpWord = new PhpWord();
        $phpWord->setDefaultFontName('Times New Roman');
        $phpWord->setDefaultFontSize(10);
        $section = $phpWord->addSection();
        $section->addText($budget['title'], ['name' => 'Times New Roman', 'size' => 14], ['alignment' => 'center']);
        $section->addText(
            "{$budget['startDate']} to {$budget['endDate']} / {$budget['baseCurrency']}",
            ['name' => 'Times New Roman', 'size' => 10],
            ['alignment' => 'center'],
        );
        $section->addTextBreak();

        $this->addDocxTable($section, 'Budget Highlights', ['Label', 'Category', 'Budget', 'Estimated', 'Variance'], array_map(
            static fn (array $item): array => [
                $item['label'],
                $item['category'] ?? '',
                "{$item['budget']['currency']} " . number_format((float) $item['budget']['amountOriginal'], 2),
                "{$item['estimatedActuals']['currency']} " . number_format((float) $item['estimatedActuals']['amountOriginal'], 2),
                number_format((float) $item['varianceBase'], 2),
            ],
            $budget['items'],
        ));

        $section->addTextBreak();
        $this->addDocxTable($section, 'Transaction Breakdown', ['Date', 'Details', 'Category', 'Amount', 'Remark'], array_map(
            static fn (array $transaction): array => [
                $transaction['transactionDate'] ?? '',
                $transaction['details'],
                $transaction['category'] ?? '',
                "{$transaction['currency']} " . number_format((float) $transaction['amountOriginal'], 2),
                $transaction['remark'] ?? '',
            ],
            $budget['transactions'],
        ));

        IOFactory::createWriter($phpWord, 'Word2007')->save($path);
    }

    private function writePdf(array $budget, string $path): void
    {
        $tempDir = $this->storagePath('tmp');
        $this->ensureStorageDirectory($tempDir);

        $mpdf = new Mpdf(['tempDir' => $tempDir]);
        $html = nl2br(htmlspecialchars($this->markdown($budget), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
        $mpdf->WriteHTML('<html><body style="font-family: serif; font-size: 10pt;">' . $html . '</body></html>');
        $mpdf->Output($path, 'F');
    }

    private function addDocxTable(mixed $section, string $title, array $headers, array $rows): void
    {
        $section->addText($title, ['bold' => true]);
        $table = $section->addTable(['borderSize' => 4, 'borderColor' => '111111', 'alignment' => JcTable::CENTER]);
        $table->addRow();
        foreach ($headers as $header) {
            $table->addCell(2000)->addText((string) $header, ['bold' => true, 'size' => 8]);
        }
        foreach ($rows as $row) {
            $table->addRow();
            foreach ($row as $cell) {
                $table->addCell(2000)->addText((string) $cell, ['size' => 8]);
            }
        }
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
        return dirname(__DIR__, 2) . '/storage/exports/' . $fileName;
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
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to create export storage directory.');
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

    private function escapeMarkdown(string $value): string
    {
        return str_replace('|', '\\|', $value);
    }
}
