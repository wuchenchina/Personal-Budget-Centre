<?php

declare(strict_types=1);

namespace BudgetCentre\Services;

use BudgetCentre\Services\BudgetPdf\BudgetPdfConfigFactory;
use BudgetCentre\Services\BudgetPdf\BudgetPdfFormatter;
use BudgetCentre\Services\BudgetPdf\BudgetPdfTableRenderer;
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
        private BudgetPdfTableRenderer $tableRenderer = new BudgetPdfTableRenderer(),
    ) {
    }

    public function write(
        array $budget,
        array $records,
        string $path,
        string $tempDir,
        array $options = [],
    ): void {
        $mpdf = new Mpdf($this->configFactory->config($tempDir));
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
        $periodText = $this->formatter->periodText($budget);

        return '<!doctype html><html lang="' . $this->documentLanguage($context) . '"><head><meta charset="utf-8">'
            . '<style>'
            . $this->baseCss()
            . $this->tableRenderer->css()
            . '</style></head><body>'
            . '<htmlpagefooter name="budgetPageFooter"><div class="page-footer">Page {PAGENO} of {nbpg}</div></htmlpagefooter>'
            . '<div class="title">' . $titleHtml . '</div>'
            . '<div class="subtitle">' . $this->formatter->escapeHtml($subtitle) . '</div>'
            . $this->tableRenderer->render(
                $this->bookkeepingSection($context),
                $periodText,
                $this->bookkeepingRows($budget, $records, $context),
                null,
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
        return '@page{margin:29mm 29mm 22mm;footer:html_budgetPageFooter;}'
            . 'body{font-family:"SF-Mono",TCSongti,monospace;color:#000;font-size:7.5pt;}'
            . '.title{font-family:TimesNewRoman,TCSongti,serif;font-size:14pt;font-weight:400;text-align:center;margin:0 0 4mm;}'
            . '.title-line{display:block;line-height:1.25;}'
            . '.subtitle{font-family:TimesNewRoman,TCSongti,serif;font-size:12pt;font-weight:400;text-align:center;margin:0 0 7mm;}'
            . '.page-footer{font-family:"SF-Mono",TCSongti,monospace;font-size:7pt;color:#666;text-align:center;}';
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
                ['key' => 'date', 'label' => $this->columnLabel('date', 'Date', $context), 'align' => 'left', 'widthPercent' => 10, 'dataType' => 'date'],
                ['key' => 'order', 'label' => $this->columnLabel('order', 'Order No.', $context), 'align' => 'left', 'widthPercent' => 10, 'dataType' => 'text'],
                ['key' => 'details', 'label' => $this->columnLabel('details', 'Details', $context), 'align' => 'left', 'widthPercent' => 22, 'dataType' => 'text'],
                ['key' => 'accounts', 'label' => $this->columnLabel('accounts', 'Funds / Accounts', $context), 'align' => 'left', 'widthPercent' => 16, 'dataType' => 'text'],
                ['key' => 'amount', 'label' => $this->columnLabel('amount', 'Amount', $context), 'align' => 'right', 'widthPercent' => 14, 'dataType' => 'money'],
                ['key' => 'destination', 'label' => $this->columnLabel('destination', 'Destination', $context), 'align' => 'right', 'widthPercent' => 10, 'dataType' => 'money'],
                ['key' => 'remark', 'label' => $this->columnLabel('remark', 'Remark', $context), 'align' => 'left', 'widthPercent' => 8, 'dataType' => 'text'],
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
                $this->detailsText($record),
                $this->accountsText($record),
                $this->amountText($record, $baseCurrency),
                $this->destinationAmountText($record),
                (string) ($record['remark'] ?? ''),
            ],
            array_filter($records, 'is_array'),
        );
    }

    private function detailsText(array $record): string
    {
        $details = trim((string) ($record['details'] ?? ''));
        $category = trim((string) ($record['categoryLabel'] ?? ''));

        return $category === '' ? $details : $details . "\n" . $category;
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

        return $this->tableText($english, $chinese, $context);
    }

    private function columnLabel(string $key, string $english, array $context): string
    {
        return $this->tableText($english, $context['labels']['columns'][$key] ?? $english, $context);
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
