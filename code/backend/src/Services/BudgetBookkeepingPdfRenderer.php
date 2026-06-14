<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Services\BudgetPdf\BudgetPdfConfigFactory;
use BudgetCentre\Services\BudgetPdf\BudgetPdfFormatter;
use Mpdf\Mpdf;

final readonly class BudgetBookkeepingPdfRenderer
{
    private const TABLE_TEXT = [
        'sc' => [
            'bookkeepingLedgerSubtitle' => '记账流水',
            'bookkeepingRecordsTitle' => '记账记录',
            'emptyBookkeepingRecords' => '暂无记账记录',
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
                'transfer' => '银行划转',
            ],
        ],
        'tc' => [
            'bookkeepingLedgerSubtitle' => '記帳流水',
            'bookkeepingRecordsTitle' => '記帳記錄',
            'emptyBookkeepingRecords' => '暫無記帳記錄',
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
                'transfer' => '銀行劃轉',
            ],
        ],
    ];

    public function __construct(
        private BudgetPdfConfigFactory $configFactory = new BudgetPdfConfigFactory(),
        private BudgetPdfFormatter $formatter = new BudgetPdfFormatter(),
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
        $config['format'] = 'A4-L';
        $mpdf = new Mpdf($config);
        $mpdf->WriteHTML($this->renderHtml($budget, $records, $options));
        $mpdf->Output($path, 'F');
    }

    public function renderHtml(array $budget, array $records, array $options = []): string
    {
        $context = $this->tableContext($options);
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
            . $this->baseCss()
            . $this->bookkeepingTableCss()
            . '</style></head><body>'
            . '<htmlpagefooter name="budgetPageFooter"><div class="page-footer">Page {PAGENO} of {nbpg}</div></htmlpagefooter>'
            . '<div class="title">' . $titleHtml . '</div>'
            . $subtitleHtml
            . $this->renderBookkeepingTable(
                $this->bookkeepingSection($context),
                $periodText,
                $this->bookkeepingRows($budget, $records, $context),
                $this->tableText(
                    'No bookkeeping records',
                    $context['labels']['emptyBookkeepingRecords'],
                    $context,
                ),
                $this->datePrefix($context),
            )
            . '</body></html>';
    }

    private function baseCss(): string
    {
        return '@page{margin:18mm 14mm 15mm;footer:html_budgetPageFooter;}'
            . 'body{font-family:"SF-Mono",TCSongti,monospace;color:#000;font-size:6.8pt;}'
            . '.title{font-family:TimesNewRoman,TCSongti,serif;font-size:13pt;font-weight:400;text-align:center;margin:0 0 3mm;}'
            . '.title-line{display:block;line-height:1.25;}'
            . '.title sup{font-size:7pt;line-height:0;vertical-align:super;}'
            . '.subtitle{font-family:TimesNewRoman,TCSongti,serif;font-size:13pt;font-weight:400;text-align:center;margin:0 0 6mm;}'
            . '.subtitle-line{display:block;line-height:1.25;}'
            . '.page-footer{font-family:"SF-Mono",TCSongti,monospace;font-size:7pt;color:#666;text-align:center;}';
    }

    private function bookkeepingTableCss(): string
    {
        return '.bookkeeping-section{width:100%;margin-top:5mm;}'
            . '.bookkeeping-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.bookkeeping-table th,.bookkeeping-table td{border:0;padding:0.12mm 1.15mm;vertical-align:top;}'
            . '.bookkeeping-section-row td{background:#a4a4a4;border:0.2mm solid #7e7e7e;font-family:"SF-Mono",TCSongti,monospace;font-size:9pt;font-weight:400;line-height:1.12;padding-top:0.35mm;padding-bottom:0.35mm;}'
            . '.bookkeeping-date-row td{border-top:0.2mm solid #7e7e7e;text-decoration:underline;line-height:1.2;font-family:"SF-Mono-Light",TCSongti,monospace;font-size:6.4pt;}'
            . '.bookkeeping-header-row th{background:#d7d7d7;font-family:"SF-Mono",TCSongti,monospace;font-size:6.1pt;font-weight:400;line-height:1.14;text-align:left;}'
            . '.bookkeeping-header-row th + th{border-left:0.2mm solid #7e7e7e;}'
            . '.bookkeeping-body-row td{font-size:6.4pt;line-height:1.24;}'
            . '.bookkeeping-empty-row td{text-align:center;color:#595959;font-size:6.4pt;}'
            . '.bookkeeping-align-right{text-align:right;}'
            . '.bookkeeping-align-center{text-align:center;}'
            . '.bookkeeping-text-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-word;}'
            . '.bookkeeping-code-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-all;}'
            . '.bookkeeping-money-cell{white-space:normal;}'
            . '.bookkeeping-cell-line{display:block;margin:0;padding:0;line-height:1.22;}'
            . '.bookkeeping-money-line{white-space:nowrap;}'
            . '.bookkeeping-money-line-secondary{font-size:5.8pt;color:#595959;}';
    }

    private function renderBookkeepingTable(
        array $section,
        string $periodText,
        array $rows,
        string $emptyText,
        string $datePrefix,
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
            'transfer' => 'Bank transfer',
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
            return 'Date: ' . $context['labels']['datePrefix'];
        }

        return $context['mode'] === 'zh' ? $context['labels']['datePrefix'] : 'Date: ';
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
