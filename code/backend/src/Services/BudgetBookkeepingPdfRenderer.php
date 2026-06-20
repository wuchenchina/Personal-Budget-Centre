<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Services\BudgetPdf\BudgetPdfConfigFactory;
use BudgetCentre\Services\BudgetPdf\BudgetPdfFormatter;
use BudgetCentre\Services\BudgetPdf\BudgetPdfTheme;
use BudgetCentre\Services\BudgetPdf\BudgetPdfThemeRegistry;
use Mpdf\Mpdf;

final readonly class BudgetBookkeepingPdfRenderer
{
    private const TABLE_TEXT = [
        'sc' => [
            'bookkeepingLedgerSubtitle' => '记账流水',
            'bookkeepingRecordsTitle' => '记账记录',
            'emptyBookkeepingRecords' => '暂无记账记录',
            'bookkeepingExpenseTotal' => '支出总计',
            'bookkeepingIncomeTotal' => '收入总计',
            'datePrefix' => '日期：',
            'columns' => [
                'type' => '交易类型',
                'date' => '日期',
                'order' => '订单号',
                'details' => '交易详情',
                'category' => '分类',
                'accounts' => '资金/账户',
                'amount' => '金额',
                'destination' => '目的金额',
                'remark' => '备注',
            ],
            'transactionTypes' => [
                'cross_border_remittance' => '跨境汇款',
                'expense' => '订单 / 支出',
                'fx_exchange' => '货币兑换',
                'income' => '收入',
                'sof' => '资金来源',
                'transfer' => '资金划转',
            ],
        ],
        'tc' => [
            'bookkeepingLedgerSubtitle' => '記帳流水',
            'bookkeepingRecordsTitle' => '記帳記錄',
            'emptyBookkeepingRecords' => '暫無記帳記錄',
            'bookkeepingExpenseTotal' => '支出總計',
            'bookkeepingIncomeTotal' => '收入總計',
            'datePrefix' => '日期：',
            'columns' => [
                'type' => '交易類型',
                'date' => '日期',
                'order' => '訂單號',
                'details' => '交易詳情',
                'category' => '分類',
                'accounts' => '資金/帳戶',
                'amount' => '金額',
                'destination' => '目的金額',
                'remark' => '備註',
            ],
            'transactionTypes' => [
                'cross_border_remittance' => '跨境匯款',
                'expense' => '訂單 / 支出',
                'fx_exchange' => '貨幣兌換',
                'income' => '收入',
                'sof' => '資金來源',
                'transfer' => '資金劃轉',
            ],
        ],
    ];

    public function __construct(
        private BudgetPdfConfigFactory $configFactory = new BudgetPdfConfigFactory(),
        private BudgetPdfFormatter $formatter = new BudgetPdfFormatter(),
        private BudgetPdfThemeRegistry $themeRegistry = new BudgetPdfThemeRegistry(),
    ) {
    }

    public function write(
        array $budget,
        array $records,
        string $path,
        string $tempDir,
        array $options = [],
    ): void {
        $config = $this->configFactory->config($tempDir);
        $config['format'] = $this->isStatementVertical($options) ? 'A4' : 'A4-L';
        $mpdf = new Mpdf($config);
        $html = $this->renderHtml($budget, $records, $options);
        $mpdf->WriteHTML($html);
        if ($mpdf->page <= 1) {
            $mpdf = new Mpdf($config);
            $mpdf->WriteHTML($this->renderHtml($budget, $records, [
                ...$options,
                'suppressPageFooter' => true,
            ]));
        }
        $mpdf->Output($path, 'F');
    }

    public function renderHtml(array $budget, array $records, array $options = []): string
    {
        $context = $this->tableContext($options);
        $theme = $this->themeRegistry->theme($options['pdfTheme'] ?? $options['pdf_theme'] ?? null);
        $isStatementVertical = $this->isStatementVertical($options);
        $title = trim((string) ($budget['title'] ?? ''));
        $titleHtml = $title === '' ? '' : $this->multilineBlockHtml($title, 'title-line');
        $subtitle = $this->tableText(
            'Bookkeeping Ledger',
            $context['labels']['bookkeepingLedgerSubtitle'],
            $context,
        );
        $subtitleHtml = '<div class="subtitle">' . $this->multilineBlockHtml($subtitle, 'subtitle-line') . '</div>';
        $periodText = $this->formatter->periodText($budget);

        return '<!doctype html><html lang="' . $this->documentLanguage($context) . '"><head><meta charset="utf-8">'
            . '<style>'
            . $theme->bookkeepingDocumentCss()
            . $theme->bookkeepingTableCss()
            . ($isStatementVertical ? $this->statementVerticalCss() : '')
            . '</style></head><body>'
            . (($options['suppressPageFooter'] ?? false) === true ? $this->emptyFooterHtml() : $theme->footerHtml('bookkeeping'))
            . $theme->headerHtml($budget, $titleHtml, $subtitleHtml, $this->formatter, 'bookkeeping', $options)
            . ($isStatementVertical
                ? $this->renderStatementVerticalLedger($budget, $records, $context, $periodText)
                : $this->renderBookkeepingTable(
                    $this->bookkeepingSection($context),
                    $periodText,
                    $this->bookkeepingRows($budget, $records, $context),
                    $this->tableText(
                        'No bookkeeping records',
                        $context['labels']['emptyBookkeepingRecords'],
                        $context,
                    ),
                    $this->datePrefix($context),
                    $this->bookkeepingTotalRows($budget, $records, $context),
                ))
            . '</body></html>';
    }

    private function isStatementVertical(array $options): bool
    {
        $theme = BudgetPdfTheme::normalize($options['pdfTheme'] ?? $options['pdf_theme'] ?? null);

        return $theme === BudgetPdfTheme::HSBC
            && ($options['bookkeepingLayout'] ?? $options['bookkeeping_layout'] ?? null) === 'statement_vertical';
    }

    private function emptyFooterHtml(): string
    {
        return '<htmlpagefooter name="budgetPageFooter"></htmlpagefooter>';
    }

    private function renderBookkeepingTable(
        array $section,
        string $periodText,
        array $rows,
        string $emptyText,
        string $datePrefix,
        array $totalRows,
    ): string {
        $columns = array_values(array_filter($section['columns'] ?? [], 'is_array'));
        $colspan = max(1, count($columns));
        $dateLine = $periodText === ''
            ? ''
            : '<tr class="bookkeeping-date-row"><td colspan="' . $colspan . '">'
                . $this->formatter->escapeHtml($datePrefix)
                . $this->formatter->escapeHtml($periodText)
                . '</td></tr>';

        $html = '<div class="bookkeeping-section"><table class="bookkeeping-table">'
            . $this->bookkeepingColgroupHtml($columns)
            . '<thead>'
            . '<tr class="bookkeeping-section-row"><td colspan="' . $colspan . '">'
            . $this->templateCellText((string) ($section['title'] ?? ''), false)
            . '</td></tr>'
            . $dateLine
            . '<tr class="bookkeeping-header-row">';

        foreach ($columns as $column) {
            $html .= '<th class="' . $this->bookkeepingColumnClass($column) . '"'
                . $this->bookkeepingCellWidthStyle($column)
                . '>'
                . $this->templateCellText((string) ($column['label'] ?? ''), false)
                . '</th>';
        }

        $html .= '</tr></thead><tbody>';
        if ($rows === []) {
            $html .= '<tr class="bookkeeping-empty-row"><td colspan="' . $colspan . '">'
                . $this->formatter->escapeHtml($emptyText)
                . '</td></tr>';
        }

        foreach ($rows as $row) {
            $html .= '<tr class="bookkeeping-body-row">';
            foreach ($columns as $index => $column) {
                $html .= '<td class="' . $this->bookkeepingColumnClass($column) . '"'
                    . $this->bookkeepingCellWidthStyle($column)
                    . '>'
                    . $this->bookkeepingCellText($row[$index] ?? '', $column)
                    . '</td>';
            }
            $html .= '</tr>';
        }

        foreach ($totalRows as $index => $totalRow) {
            $html .= $this->bookkeepingTotalRowHtml(
                $columns,
                (string) ($totalRow['label'] ?? ''),
                (string) ($totalRow['amountText'] ?? ''),
                $index === 0,
            );
        }

        return $html . '</tbody></table></div>';
    }

    private function bookkeepingSection(array $context): array
    {
        return [
            'key' => 'bookkeeping_records',
            'title' => $this->tableText(
                'Bookkeeping Records',
                $context['labels']['bookkeepingRecordsTitle'],
                $context,
            ),
            'columns' => [
                ['key' => 'type', 'label' => $this->columnLabel('type', 'Type', $context), 'align' => 'left', 'widthPercent' => 10, 'dataType' => 'text'],
                ['key' => 'date', 'label' => $this->columnLabel('date', 'Date', $context), 'align' => 'left', 'widthPercent' => 8, 'dataType' => 'date'],
                ['key' => 'order', 'label' => $this->columnLabel('order', 'Order No.', $context), 'align' => 'left', 'widthPercent' => 14, 'dataType' => 'code'],
                ['key' => 'details', 'label' => $this->columnLabel('details', 'Details', $context), 'align' => 'left', 'widthPercent' => 18, 'dataType' => 'text'],
                ['key' => 'category', 'label' => $this->columnLabel('category', 'Category', $context), 'align' => 'left', 'widthPercent' => 12, 'dataType' => 'text'],
                ['key' => 'accounts', 'label' => $this->columnLabel('accounts', 'Funds / Accounts', $context), 'align' => 'left', 'widthPercent' => 13, 'dataType' => 'text'],
                ['key' => 'amount', 'label' => $this->columnLabel('amount', 'Amount', $context), 'align' => 'right', 'widthPercent' => 11, 'dataType' => 'money'],
                ['key' => 'destination', 'label' => $this->columnLabel('destination', 'Destination', $context), 'align' => 'right', 'widthPercent' => 9, 'dataType' => 'money'],
                ['key' => 'remark', 'label' => $this->columnLabel('remark', 'Remark', $context), 'align' => 'left', 'widthPercent' => 5, 'dataType' => 'text'],
            ],
        ];
    }

    private function renderStatementVerticalLedger(
        array $budget,
        array $records,
        array $context,
        string $periodText,
    ): string {
        $baseCurrency = (string) ($budget['baseCurrency'] ?? '');
        $validRecords = array_values(array_filter($records, 'is_array'));
        $dateLine = $periodText === ''
            ? ''
            : '<div class="bookkeeping-date-row statement-ledger-date">'
                . $this->formatter->escapeHtml($this->datePrefix($context))
                . $this->formatter->escapeHtml($periodText)
                . '</div>';
        $html = '<div class="bookkeeping-section statement-ledger">'
            . '<table class="bookkeeping-table statement-ledger-title"><tbody><tr class="bookkeeping-section-row"><td>'
            . $this->templateCellText($this->tableText(
                'Bookkeeping Records',
                $context['labels']['bookkeepingRecordsTitle'],
                $context,
            ), false)
            . '</td></tr></tbody></table>'
            . $dateLine;

        if ($validRecords === []) {
            $html .= '<div class="statement-ledger-empty">'
                . $this->formatter->escapeHtml($this->tableText(
                    'No bookkeeping records',
                    $context['labels']['emptyBookkeepingRecords'],
                    $context,
                ))
                . '</div>';
        }

        foreach ($validRecords as $record) {
            $html .= $this->statementRecordHtml($record, $baseCurrency, $context);
        }

        $html .= '<table class="bookkeeping-table statement-ledger-totals"><tbody>';
        foreach ($this->bookkeepingTotalRows($budget, $records, $context) as $index => $totalRow) {
            $html .= '<tr class="bookkeeping-total-row' . ($index === 0 ? ' bookkeeping-total-row-first' : '') . '">'
                . '<td class="bookkeeping-total-label">' . $this->templateCellText((string) ($totalRow['label'] ?? '')) . '</td>'
                . '<td class="bookkeeping-align-right bookkeeping-money-cell">' . $this->templateMoneyCellText((string) ($totalRow['amountText'] ?? '')) . '</td>'
                . '</tr>';
        }

        return $html . '</tbody></table></div>';
    }

    private function statementRecordHtml(array $record, string $baseCurrency, array $context): string
    {
        $type = $this->transactionTypeText((string) ($record['transactionType'] ?? ''), $context);
        $date = trim((string) ($record['recordDate'] ?? ''));
        $details = trim((string) ($record['details'] ?? ''));
        $order = trim((string) ($record['orderReference'] ?? ''));
        $category = trim((string) ($record['categoryLabel'] ?? ''));
        $accounts = trim($this->accountsText($record));
        $remark = trim((string) ($record['remark'] ?? ''));
        $destinationAmount = trim($this->destinationAmountText($record));
        $metaParts = [];
        foreach ([
            $order === '' ? '' : $this->columnLabel('order', 'Order No.', $context) . ': ' . $order,
            $category === '' ? '' : $this->columnLabel('category', 'Category', $context) . ': ' . $category,
            $accounts === '' ? '' : $this->columnLabel('accounts', 'Funds / Accounts', $context) . ': ' . str_replace("\n", ' ', $accounts),
            $destinationAmount === '' ? '' : $this->columnLabel('destination', 'Destination', $context) . ': ' . $destinationAmount,
            $remark === '' ? '' : $this->columnLabel('remark', 'Remark', $context) . ': ' . $remark,
        ] as $part) {
            if ($part !== '') {
                $metaParts[] = $part;
            }
        }

        return '<table class="statement-record"><tbody><tr>'
            . '<td class="statement-record-date">' . $this->templateCellText($date) . '</td>'
            . '<td class="statement-record-main">'
            . '<div class="statement-record-type">' . $this->templateCellText($type) . '</div>'
            . '<div class="statement-record-detail">' . $this->templateCellText($details === '' ? '-' : $details) . '</div>'
            . ($metaParts === [] ? '' : '<div class="statement-record-meta">' . $this->templateCellText(implode("\n", $metaParts)) . '</div>')
            . '</td>'
            . '<td class="statement-record-amount">' . $this->templateMoneyCellText($this->amountText($record, $baseCurrency)) . '</td>'
            . '</tr></tbody></table>';
    }

    private function statementVerticalCss(): string
    {
        return '@page{margin:16mm 16mm 17mm;footer:html_budgetPageFooter;}'
            . '.statement-ledger{margin-top:6mm;}'
            . '.statement-ledger-date{padding:1.4mm 0 2.4mm;text-decoration:underline;font-size:7.2pt;}'
            . '.statement-ledger-empty{text-align:center;color:#595959;padding:6mm 0;font-size:7pt;}'
            . '.statement-record{width:100%;border-collapse:collapse;border-top:0.2mm solid #d0d0d0;table-layout:fixed;}'
            . '.statement-record td{padding:1.5mm 0;vertical-align:top;}'
            . '.statement-record-date{width:24mm;color:#555;font-size:6.8pt;}'
            . '.statement-record-main{padding-right:4mm;}'
            . '.statement-record-type{font-size:6.5pt;color:#555;margin-bottom:0.4mm;}'
            . '.statement-record-detail{font-size:7.3pt;color:#111;font-weight:700;line-height:1.25;}'
            . '.statement-record-meta{font-size:6.3pt;color:#555;line-height:1.22;margin-top:0.6mm;}'
            . '.statement-record-amount{width:36mm;text-align:right;font-size:7pt;white-space:normal;}'
            . '.statement-ledger-totals{margin-top:2.8mm;border-top:0.35mm solid #111;}'
            . '.statement-ledger-totals td{padding:0.8mm 0;}';
    }

    private function bookkeepingRows(array $budget, array $records, array $context): array
    {
        $baseCurrency = (string) ($budget['baseCurrency'] ?? '');

        return array_map(
            fn (array $record): array => [
                $this->transactionTypeText((string) ($record['transactionType'] ?? ''), $context),
                (string) ($record['recordDate'] ?? ''),
                (string) ($record['orderReference'] ?? ''),
                (string) ($record['details'] ?? ''),
                (string) ($record['categoryLabel'] ?? ''),
                $this->accountsText($record),
                $this->amountText($record, $baseCurrency),
                $this->destinationAmountText($record),
                (string) ($record['remark'] ?? ''),
            ],
            array_filter($records, 'is_array'),
        );
    }

    private function accountsText(array $record): string
    {
        $source = trim((string) ($record['sourceAccountName'] ?? ''));
        $destination = trim((string) ($record['destinationAccountName'] ?? ''));
        if ($source !== '' && $destination !== '') {
            return $source . "\n-> " . $destination;
        }

        return $source !== '' ? $source : $destination;
    }

    private function amountText(array $record, string $baseCurrency): string
    {
        $currency = trim((string) ($record['currency'] ?? $baseCurrency));
        $amount = (float) ($record['amountOriginal'] ?? 0);
        $baseAmount = (float) ($record['amountBase'] ?? $amount);
        $text = $this->formatter->templateMoney($currency, $amount);

        return $currency === $baseCurrency
            ? $text
            : $text . "\n" . $this->formatter->templateMoney($baseCurrency, $baseAmount);
    }

    private function destinationAmountText(array $record): string
    {
        $currency = trim((string) ($record['destinationCurrency'] ?? ''));
        if ($currency === '' || ($record['destinationAmountOriginal'] ?? null) === null) {
            return '';
        }

        return $this->formatter->templateMoney($currency, (float) $record['destinationAmountOriginal']);
    }

    private function bookkeepingOrderTotals(array $budget, array $records): array
    {
        $baseCurrency = (string) ($budget['baseCurrency'] ?? '');
        return array_reduce(
            array_filter($records, 'is_array'),
            function (array $totals, array $record) use ($baseCurrency): array {
                $type = (string) ($record['transactionType'] ?? '');
                if (!in_array($type, ['expense', 'income'], true)) {
                    return $totals;
                }

                $currency = (string) ($record['currency'] ?? $baseCurrency);
                $amount = $currency === $baseCurrency
                    ? (float) ($record['amountOriginal'] ?? 0.0)
                    : (float) ($record['amountBase'] ?? 0.0);

                $totals[$type] = (float) $totals[$type] + $amount;

                return $totals;
            },
            ['expense' => 0.0, 'income' => 0.0],
        );
    }

    private function bookkeepingTotalRows(array $budget, array $records, array $context): array
    {
        $baseCurrency = (string) ($budget['baseCurrency'] ?? '');
        $totals = $this->bookkeepingOrderTotals($budget, $records);

        return [
            [
                'label' => $this->tableText(
                    'Income total',
                    $context['labels']['bookkeepingIncomeTotal'],
                    $context,
                ),
                'amountText' => $this->formatter->templateMoney($baseCurrency, (float) $totals['income']),
            ],
            [
                'label' => $this->tableText(
                    'Expense total',
                    $context['labels']['bookkeepingExpenseTotal'],
                    $context,
                ),
                'amountText' => $this->formatter->templateMoney($baseCurrency, (float) $totals['expense']),
            ],
        ];
    }

    private function bookkeepingTotalRowHtml(array $columns, string $label, string $amountText, bool $isFirstTotal): string
    {
        $amountIndex = 0;
        foreach ($columns as $index => $column) {
            if (($column['key'] ?? null) === 'amount') {
                $amountIndex = $index;
                break;
            }
        }

        $html = '<tr class="bookkeeping-total-row' . ($isFirstTotal ? ' bookkeeping-total-row-first' : '') . '">';
        if ($amountIndex > 0) {
            $html .= '<td class="bookkeeping-total-label" colspan="' . $amountIndex . '">'
                . $this->templateCellText($label)
                . '</td>';
        }

        $amountColumn = $columns[$amountIndex] ?? ['align' => 'right', 'dataType' => 'money'];
        $html .= '<td class="' . $this->bookkeepingColumnClass($amountColumn) . '"'
            . $this->bookkeepingCellWidthStyle($amountColumn)
            . '>'
            . $this->templateMoneyCellText($amountText)
            . '</td>';

        for ($index = $amountIndex + 1, $count = count($columns); $index < $count; $index += 1) {
            $column = $columns[$index];
            $html .= '<td class="' . $this->bookkeepingColumnClass($column) . '"'
                . $this->bookkeepingCellWidthStyle($column)
                . '></td>';
        }

        return $html . '</tr>';
    }

    private function bookkeepingColgroupHtml(array $columns): string
    {
        $html = '<colgroup>';
        foreach ($columns as $column) {
            $html .= '<col' . $this->bookkeepingCellWidthStyle($column) . '>';
        }

        return $html . '</colgroup>';
    }

    private function bookkeepingCellWidthStyle(array $column): string
    {
        $width = max(1, min(100, (float) ($column['widthPercent'] ?? 25)));

        return ' style="width:' . $width . '%"';
    }

    private function bookkeepingColumnClass(array $column): string
    {
        $classes = match ((string) ($column['align'] ?? 'left')) {
            'right' => ['bookkeeping-align-right'],
            'center' => ['bookkeeping-align-center'],
            default => [],
        };
        $classes[] = match ((string) ($column['dataType'] ?? 'text')) {
            'money' => 'bookkeeping-money-cell',
            'code' => 'bookkeeping-code-cell',
            default => 'bookkeeping-text-cell',
        };

        return implode(' ', $classes);
    }

    private function bookkeepingCellText(mixed $cell, array $column): string
    {
        $value = (string) $cell;
        if (($column['dataType'] ?? null) === 'money') {
            return $this->templateMoneyCellText($value);
        }
        if (($column['dataType'] ?? null) === 'code') {
            return $this->templateCellText($this->wrapLongReference($value));
        }

        return $this->templateCellText($value);
    }

    private function templateCellText(string $value, bool $trimLines = true): string
    {
        $lines = preg_split('/\R/u', $value);
        if ($lines === false || count($lines) <= 1) {
            return $this->formatter->escapeHtml($trimLines ? trim($value) : $value);
        }

        return implode('', array_map(
            fn (string $line): string => '<div class="bookkeeping-cell-line">'
                . $this->formatter->escapeHtml($trimLines ? trim($line) : $line)
                . '</div>',
            $lines,
        ));
    }

    private function templateMoneyCellText(string $value): string
    {
        $lines = preg_split('/\R/u', $value);
        if ($lines === false) {
            return $this->formatter->escapeHtml($value);
        }

        return implode('', array_map(
            fn (string $line, int $index): string => '<div class="bookkeeping-cell-line bookkeeping-money-line'
                . ($index > 0 ? ' bookkeeping-money-line-secondary' : '')
                . '">' . $this->formatter->escapeHtml(trim($line)) . '</div>',
            $lines,
            array_keys($lines),
        ));
    }

    private function wrapLongReference(string $value): string
    {
        $lines = preg_split('/\R/u', trim($value));
        if ($lines === false) {
            return $value;
        }

        return implode("\n", array_map(static function (string $line): string {
            if (strlen($line) <= 18 || preg_match('/\s/u', $line) === 1) {
                return $line;
            }

            return implode("\n", str_split($line, 18));
        }, $lines));
    }

    private function transactionTypeText(string $type, array $context): string
    {
        $english = [
            'cross_border_remittance' => 'Cross-border remittance',
            'expense' => 'Order / expense',
            'fx_exchange' => 'Currency exchange',
            'income' => 'Income',
            'sof' => 'Source of funds',
            'transfer' => 'Transfer',
        ][$type] ?? $type;
        $chinese = $context['labels']['transactionTypes'][$type] ?? $english;

        if ($context['mode'] === 'bilingual') {
            return $english . "\n" . $chinese;
        }

        return $this->tableText($english, $chinese, $context);
    }

    private function columnLabel(string $key, string $english, array $context): string
    {
        if ($context['mode'] === 'en') {
            return $english;
        }

        $chinese = $context['labels']['columns'][$key] ?? $english;

        return $context['mode'] === 'bilingual' ? $english . "\n" . $chinese : $chinese;
    }

    private function tableContext(array $options): array
    {
        $mode = $options['tableLanguageMode'] ?? 'en';
        $chineseLanguage = $options['tableChineseLanguage'] ?? 'tc';
        $mode = in_array($mode, ['en', 'zh', 'bilingual'], true) ? (string) $mode : 'en';
        $chineseLanguage = in_array($chineseLanguage, ['sc', 'tc'], true)
            ? (string) $chineseLanguage
            : 'tc';

        return [
            'mode' => $mode,
            'chineseLanguage' => $chineseLanguage,
            'labels' => self::TABLE_TEXT[$chineseLanguage],
        ];
    }

    private function tableText(string $english, string $chinese, array $context): string
    {
        if ($context['mode'] === 'bilingual') {
            return $english . ' ' . $chinese;
        }

        return $context['mode'] === 'zh' ? $chinese : $english;
    }

    private function datePrefix(array $context): string
    {
        if ($context['mode'] === 'bilingual') {
            return 'Date / ' . $this->chineseDateLabel($context) . ': ';
        }

        return $context['mode'] === 'zh' ? $context['labels']['datePrefix'] : 'Date: ';
    }

    private function chineseDateLabel(array $context): string
    {
        return rtrim((string) $context['labels']['datePrefix'], ":\xEF\xBC\x9A ");
    }

    private function documentLanguage(array $context): string
    {
        if ($context['mode'] === 'en') {
            return 'en';
        }

        return $context['chineseLanguage'] === 'sc' ? 'zh-Hans' : 'zh-Hant';
    }

    private function multilineBlockHtml(string $value, string $lineClass): string
    {
        $lines = preg_split('/\R/u', $value);
        if ($lines === false) {
            return $this->formatter->escapeHtml($value);
        }

        return implode('', array_map(
            fn (string $line): string => '<div class="' . $lineClass . '">' . $this->formatter->escapeHtml($line) . '</div>',
            array_values(array_filter(
                array_map(static fn (string $line): string => trim($line), $lines),
                static fn (string $line): bool => $line !== '',
            )),
        ));
    }
}
