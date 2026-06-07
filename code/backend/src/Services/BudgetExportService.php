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
use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;
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

        $mpdf = new Mpdf($this->pdfConfig($tempDir));
        $mpdf->WriteHTML($this->pdfHtml($budget, $this->templateForBudget($budget)));
        $mpdf->Output($path, 'F');
    }

    private function pdfConfig(string $tempDir): array
    {
        $configDefaults = (new ConfigVariables())->getDefaults();
        $fontDefaults = (new FontVariables())->getDefaults();
        $fontDir = dirname(__DIR__, 3) . '/font';

        return [
            'mode' => 'utf-8',
            'format' => 'A4',
            'tempDir' => $tempDir,
            'fontDir' => array_merge($configDefaults['fontDir'], [$fontDir]),
            'fontdata' => array_merge($fontDefaults['fontdata'], [
                'timesnewroman' => [
                    'R' => 'Times New Roman.ttf',
                    'B' => 'Times New Roman Bold.ttf',
                    'I' => 'Times New Roman Italic.ttf',
                    'BI' => 'Times New Roman Bold Italic.ttf',
                ],
                'sf-mono' => [
                    'R' => 'SF-Mono-Regular.ttf',
                    'B' => 'SF-Mono-Bold.ttf',
                    'I' => 'SF-Mono-RegularItalic.ttf',
                    'BI' => 'SF-Mono-BoldItalic.ttf',
                ],
                'sf-mono-light' => [
                    'R' => 'SF-Mono-Light.ttf',
                    'I' => 'SF-Mono-LightItalic.ttf',
                ],
                'tcsongti' => [
                    'R' => 'Songti-TC-Regular.ttf',
                    'B' => 'Songti-TC-Bold.ttf',
                ],
            ]),
            'backupSubsFont' => ['tcsongti'],
            'default_font' => 'sf-mono',
            'autoScriptToLang' => false,
            'autoLangToFont' => false,
            'useSubstitutions' => true,
        ];
    }

    private function pdfHtml(array $budget, array $template): string
    {
        $title = $this->escapeHtml((string) $budget['title']);
        $subtitle = trim((string) $budget['ownerName']);
        $subtitleHtml = $subtitle === ''
            ? ''
            : '<div class="subtitle">' . $this->escapeHtml($subtitle) . '</div>';
        $periodText = $this->periodText($budget);
        $sections = $this->sectionsByKey($template);
        $budgetSection = $sections['budget_highlights'] ?? [
            'title' => 'Budget Highlights',
            'columns' => [
                ['key' => 'category', 'label' => 'Category', 'align' => 'left', 'dataType' => 'text'],
                ['key' => 'budget', 'label' => 'Budget', 'align' => 'right', 'dataType' => 'money'],
                ['key' => 'estimated_actuals', 'label' => 'Estimated Actuals', 'align' => 'right', 'dataType' => 'money'],
                ['key' => 'variance', 'label' => 'Variance', 'align' => 'right', 'dataType' => 'money'],
            ],
        ];
        $transactionSection = $sections['transaction_breakdown'] ?? [
            'title' => 'Transaction Breakdown',
            'columns' => [
                ['key' => 'transaction_details', 'label' => 'Transaction Details', 'align' => 'left', 'dataType' => 'text'],
                ['key' => 'category', 'label' => 'Category', 'align' => 'right', 'dataType' => 'text'],
                ['key' => 'amount', 'label' => 'Amount', 'align' => 'right', 'dataType' => 'money'],
                ['key' => 'remark', 'label' => 'Remark', 'align' => 'right', 'dataType' => 'text'],
            ],
        ];
        $items = array_map(
            fn (array $item): array => [
                $item['category'] ?? $item['label'],
                $this->templateMoney((string) $item['budget']['currency'], (float) $item['budget']['amountOriginal']),
                $this->templateMoney((string) $item['estimatedActuals']['currency'], (float) $item['estimatedActuals']['amountOriginal']),
                $this->templateMoney((string) $budget['baseCurrency'], (float) $item['varianceBase']),
            ],
            $budget['items'],
        );
        $transactions = array_map(
            fn (array $transaction): array => [
                $transaction['details'],
                $transaction['category'] ?? '',
                $this->templateMoney((string) $transaction['currency'], (float) $transaction['amountOriginal']),
                $transaction['remark'] ?? '',
            ],
            $budget['transactions'],
        );
        $summaryRow = [
            'Total',
            $this->templateMoney((string) $budget['baseCurrency'], (float) $budget['totals']['totalBudgetBase'], true),
            $this->templateMoney((string) $budget['baseCurrency'], (float) $budget['totals']['totalEstimatedBase'], true),
            $this->templateMoney((string) $budget['baseCurrency'], (float) $budget['totals']['totalVarianceBase'], true),
        ];

        return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
            . '<style>'
            . '@page{margin:29mm 29mm 22mm;}'
            . 'body{font-family:"SF-Mono",TCSongti,monospace;color:#000;font-size:7.5pt;}'
            . '.title{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 4mm;}'
            . '.title sup{font-size:7pt;line-height:0;vertical-align:super;}'
            . '.subtitle{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 7mm;}'
            . '.template-section{width:100%;margin-top:5mm;}'
            . '.template-section + .template-section{margin-top:7mm;}'
            . '.template-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.template-table th,.template-table td{border:0;padding:0.15mm 1.9mm;vertical-align:top;}'
            . '.section-band td{background:#a4a4a4;border:0.2mm solid #7e7e7e;font-family:"SF-Mono",TCSongti,monospace;font-size:10.5pt;font-weight:400;line-height:1.15;padding-top:0.45mm;padding-bottom:0.45mm;}'
            . '.date-line{border-top:0.2mm solid #7e7e7e;padding:0.15mm 1.9mm;text-decoration:underline;line-height:1.25;font-family:"SF-Mono-Light",TCSongti,monospace;}'
            . '.column-table th{background:#d7d7d7;font-family:"SF-Mono",TCSongti,monospace;font-size:7.5pt;font-weight:400;line-height:1.25;text-align:left;}'
            . '.column-table .header-left{border-right:0.2mm solid #7e7e7e;}'
            . '.column-table .header-middle{border-left:0.2mm solid #7e7e7e;border-right:0.2mm solid #7e7e7e;}'
            . '.column-table .header-last{border-left:0.2mm solid #7e7e7e;}'
            . '.body-table td,.summary-table td{line-height:1.6;}'
            . '.summary-table td{background:#d7d7d7;}'
            . '.align-right{text-align:right;}'
            . '.align-center{text-align:center;}'
            . '.nowrap{white-space:nowrap;}'
            . '.empty{text-align:center;color:#595959;}'
            . '</style></head><body>'
            . '<div class="title">' . $title . '</div>'
            . $subtitleHtml
            . $this->templateTable($budgetSection, $periodText, $items, $summaryRow, 'No budget items')
            . $this->templateTable($transactionSection, $periodText, $transactions, null, 'No transactions')
            . '</body></html>';
    }

    private function templateTable(
        array $section,
        string $periodText,
        array $rows,
        ?array $summaryRow,
        string $emptyText,
    ): string {
        $columns = $section['columns'] ?? [];
        $colspan = max(1, count($columns));
        $colgroup = $this->colgroupHtml($columns);
        $dateLine = $periodText === ''
            ? ''
            : '<div class="date-line">Date: ' . $this->escapeHtml($periodText) . '</div>';
        $html = '<div class="template-section">'
            . '<table class="template-table section-band"><tbody><tr><td>'
            . $this->escapeHtml((string) ($section['title'] ?? ''))
            . '</td></tr></tbody></table>'
            . $dateLine
            . '<table class="template-table column-table">' . $colgroup . '<tbody><tr>';

        foreach ($columns as $index => $column) {
            $html .= '<th class="' . trim($this->headerBorderClass($index, count($columns)) . ' ' . $this->columnClass($column)) . '"'
                . $this->cellWidthStyle($column)
                . '>'
                . $this->escapeHtml((string) $column['label'])
                . '</th>';
        }
        $html .= '</tr></tbody></table>'
            . '<table class="template-table body-table">' . $colgroup . '<tbody>';

        if ($rows === []) {
            $html .= '<tr><td class="empty" colspan="' . $colspan . '">' . $this->escapeHtml($emptyText) . '</td></tr>';
        }

        foreach ($rows as $row) {
            $html .= '<tr>';
            foreach ($row as $index => $cell) {
                $column = $columns[$index] ?? [];
                $html .= '<td class="' . $this->columnClass($column) . '"'
                    . $this->cellWidthStyle($column)
                    . '>'
                    . $this->escapeHtml((string) $cell)
                    . '</td>';
            }
            $html .= '</tr>';
        }
        $html .= '</tbody></table>';

        if ($summaryRow !== null) {
            $html .= '<table class="template-table summary-table">' . $colgroup . '<tbody><tr>';
            foreach ($summaryRow as $index => $cell) {
                $column = $columns[$index] ?? [];
                $html .= '<td class="' . $this->columnClass($column) . '"'
                    . $this->cellWidthStyle($column)
                    . '>'
                    . $this->escapeHtml((string) $cell)
                    . '</td>';
            }
            $html .= '</tr></tbody></table>';
        }

        return $html . '</div>';
    }

    private function colgroupHtml(array $columns): string
    {
        $html = '<colgroup>';
        foreach ($columns as $column) {
            $html .= '<col' . $this->cellWidthStyle($column) . '>';
        }

        return $html . '</colgroup>';
    }

    private function cellWidthStyle(array $column): string
    {
        $width = max(1, min(100, (float) ($column['widthPercent'] ?? 25)));

        return ' style="width:' . $width . '%"';
    }

    private function headerBorderClass(int $index, int $total): string
    {
        if ($index === 0) {
            return $total === 1 ? '' : 'header-left';
        }

        return $index === $total - 1 ? 'header-last' : 'header-middle';
    }

    private function columnClass(array $column): string
    {
        $classes = match ((string) ($column['align'] ?? 'left')) {
            'right' => ['align-right'],
            'center' => ['align-center'],
            default => [],
        };
        if (($column['dataType'] ?? null) === 'money') {
            $classes[] = 'nowrap';
        }

        return implode(' ', $classes);
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

    private function sectionsByKey(array $template): array
    {
        $sections = [];
        foreach (($template['sections'] ?? []) as $section) {
            if (isset($section['key']) && is_string($section['key'])) {
                $sections[$section['key']] = $section;
            }
        }

        return $sections;
    }

    private function renderTemplateText(string $templateText, array $budget): string
    {
        $start = $this->parseDate((string) $budget['startDate']);
        $end = $this->parseDate((string) $budget['endDate']);
        $replacements = [
            '{{budget_title}}' => (string) $budget['title'],
            '{{owner_name}}' => (string) $budget['ownerName'],
            '{{period_start}}' => (string) $budget['startDate'],
            '{{period_end}}' => (string) $budget['endDate'],
            '{{period_start_title}}' => $start === null
                ? (string) $budget['startDate']
                : $this->titleDate($start),
            '{{period_end_title}}' => $end === null
                ? (string) $budget['endDate']
                : $this->titleDate($end),
            '{{year}}' => $start === null ? '' : $start->format('Y'),
        ];

        return str_replace(array_keys($replacements), array_values($replacements), $templateText);
    }

    private function renderTitleTemplateHtml(string $templateText, array $budget): string
    {
        $start = $this->parseDate((string) $budget['startDate']);
        $end = $this->parseDate((string) $budget['endDate']);
        $replacements = [
            '{{budget_title}}' => $this->escapeHtml((string) $budget['title']),
            '{{owner_name}}' => $this->escapeHtml((string) $budget['ownerName']),
            '{{period_start}}' => $this->escapeHtml((string) $budget['startDate']),
            '{{period_end}}' => $this->escapeHtml((string) $budget['endDate']),
            '{{period_start_title}}' => $start === null
                ? $this->escapeHtml((string) $budget['startDate'])
                : $this->titleDateHtml($start),
            '{{period_end_title}}' => $end === null
                ? $this->escapeHtml((string) $budget['endDate'])
                : $this->titleDateHtml($end),
            '{{year}}' => $start === null ? '' : $start->format('Y'),
        ];

        return str_replace(
            array_keys($replacements),
            array_values($replacements),
            $this->escapeHtml($templateText),
        );
    }

    private function periodText(array $budget): string
    {
        $start = $this->parseDate((string) $budget['startDate']);
        $end = $this->parseDate((string) $budget['endDate']);
        if ($start === null && $end === null) {
            return '';
        }

        return ($start === null ? (string) $budget['startDate'] : $this->periodDate($start))
            . ' to '
            . ($end === null ? (string) $budget['endDate'] : $this->periodDate($end));
    }

    private function titleDate(\DateTimeImmutable $date): string
    {
        $day = (int) $date->format('j');

        return $day . $this->ordinalSuffix($day) . ' ' . $date->format('F');
    }

    private function titleDateHtml(\DateTimeImmutable $date): string
    {
        $day = (int) $date->format('j');

        return $day . '<sup>' . $this->ordinalSuffix($day) . '</sup> ' . $this->escapeHtml($date->format('F'));
    }

    private function periodDate(\DateTimeImmutable $date): string
    {
        return $date->format('j F, Y');
    }

    private function ordinalSuffix(int $day): string
    {
        if ($day % 100 >= 11 && $day % 100 <= 13) {
            return 'th';
        }

        return match ($day % 10) {
            1 => 'st',
            2 => 'nd',
            3 => 'rd',
            default => 'th',
        };
    }

    private function parseDate(string $date): ?\DateTimeImmutable
    {
        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);

        return $parsed === false ? null : $parsed;
    }

    private function templateMoney(string $currency, float $amount, bool $trimWhole = false): string
    {
        if (abs($amount) < 0.005) {
            return $currency . '0';
        }

        if ($trimWhole && abs($amount - round($amount)) < 0.005) {
            return $currency . (string) (int) round($amount);
        }

        return $currency . number_format($amount, 2, '.', '');
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

}
