<?php

declare(strict_types=1);

namespace BudgetCentre\Services\BudgetPdf\Themes;

use BudgetCentre\Services\BudgetPdf\BudgetPdfFormatter;
use BudgetCentre\Services\BudgetPdf\BudgetPdfTheme;

final readonly class StatementRedPdfTheme implements BudgetPdfThemeDefinition
{
    public function __construct(private ClassicPdfTheme $classic = new ClassicPdfTheme())
    {
    }

    public function key(): string
    {
        return BudgetPdfTheme::STATEMENT_RED;
    }

    public function budgetDocumentCss(): string
    {
        return '@page{margin:16mm 16mm 17mm;footer:html_budgetPageFooter;}'
            . 'body{font-family:Arial,TCSongti,sans-serif;color:#111;font-size:7.2pt;}'
            . '.statement-red-header{margin:0 0 10mm;}'
            . '.statement-red-header-table{width:100%;border-collapse:collapse;margin:0 0 8mm;}'
            . '.statement-red-title-cell{vertical-align:bottom;padding:0 8mm 0 0;}'
            . '.statement-red-meta-cell{width:64mm;text-align:right;vertical-align:top;padding:0;}'
            . '.statement-red-meta-table{width:100%;border-collapse:collapse;font-size:7.1pt;line-height:1.28;}'
            . '.statement-red-meta-table td{padding:0.55mm 0;border-bottom:0.2mm solid #d9d9d9;vertical-align:top;}'
            . '.statement-red-meta-label{width:27mm;text-align:left;color:#555;white-space:nowrap;}'
            . '.statement-red-meta-value{text-align:right;color:#111;}'
            . '.statement-red-title{color:#db0011;font-family:Arial,TCSongti,sans-serif;font-size:20pt;font-weight:400;line-height:1.12;margin:0;}'
            . '.statement-red-subtitle{font-size:8.2pt;line-height:1.35;color:#111;}'
            . '.title,.subtitle{display:none;}'
            . '.title-line,.subtitle-line{display:block;line-height:1.22;}'
            . '.page-footer{font-family:Arial,TCSongti,sans-serif;font-size:7pt;color:#111;}';
    }

    public function budgetTableCss(): string
    {
        return '.template-section{width:100%;margin-top:5.5mm;}'
            . '.template-section + .template-section{margin-top:6mm;}'
            . '.template-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.template-table th,.template-table td{border:0;padding:0.25mm 1.35mm;vertical-align:top;}'
            . '.section-band td{background:#9d9d9d;border:0.2mm solid #111;font-family:Arial,TCSongti,sans-serif;font-size:10.4pt;font-weight:400;line-height:1.12;padding-top:0.6mm;padding-bottom:0.55mm;}'
            . '.date-line{padding:1.6mm 1.35mm 0.8mm;text-decoration:underline;line-height:1.22;font-family:Arial,TCSongti,sans-serif;font-size:7.2pt;}'
            . '.column-table th{background:#d9d9d9;font-family:Arial,TCSongti,sans-serif;font-size:7pt;font-weight:400;line-height:1.16;text-align:left;}'
            . '.column-table .header-left{border-right:0.2mm solid #111;}'
            . '.column-table .header-middle{border-left:0.2mm solid #111;border-right:0.2mm solid #111;}'
            . '.column-table .header-last{border-left:0.2mm solid #111;}'
            . '.body-table td,.summary-table td{font-size:7pt;line-height:1.24;}'
            . '.summary-table td{background:#fff;border-top:0.2mm solid #111;font-weight:700;}'
            . '.align-right{text-align:right;}'
            . '.align-center{text-align:center;}'
            . '.money-cell{white-space:normal;}'
            . '.cell-line{display:block;margin:0;padding:0;line-height:1.2;}'
            . '.money-line{white-space:nowrap;}'
            . '.money-line-secondary{font-size:6.2pt;color:#333;}'
            . '.empty{text-align:center;color:#595959;}';
    }

    public function bookkeepingDocumentCss(): string
    {
        return str_replace(
            '@page{margin:16mm 16mm 17mm;footer:html_budgetPageFooter;}',
            '@page{margin:14mm 12mm 15mm;footer:html_budgetPageFooter;}',
            $this->budgetDocumentCss(),
        ) . 'body{font-size:6.5pt;}';
    }

    public function bookkeepingTableCss(): string
    {
        return '.bookkeeping-section{width:100%;margin-top:4.2mm;}'
            . '.bookkeeping-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;}'
            . '.bookkeeping-table th,.bookkeeping-table td{border:0;padding:0.18mm 1mm;vertical-align:top;}'
            . '.bookkeeping-section-row td{background:#9d9d9d;border:0.2mm solid #111;font-family:Arial,TCSongti,sans-serif;font-size:9pt;font-weight:400;line-height:1.12;padding-top:0.42mm;padding-bottom:0.42mm;}'
            . '.bookkeeping-date-row td{text-decoration:underline;line-height:1.2;font-family:Arial,TCSongti,sans-serif;font-size:6.2pt;}'
            . '.bookkeeping-header-row th{background:#d9d9d9;font-family:Arial,TCSongti,sans-serif;font-size:6.1pt;font-weight:400;line-height:1.14;text-align:left;}'
            . '.bookkeeping-header-row th + th{border-left:0.2mm solid #111;}'
            . '.bookkeeping-body-row td{font-size:6.25pt;line-height:1.2;}'
            . '.bookkeeping-empty-row td{text-align:center;color:#595959;font-size:6.2pt;}'
            . '.bookkeeping-total-row td{background:#fff;border-top:0.2mm solid #111;font-size:6.25pt;font-weight:700;line-height:1.22;}'
            . '.bookkeeping-total-label{text-align:right;}'
            . '.bookkeeping-align-right{text-align:right;}'
            . '.bookkeeping-align-center{text-align:center;}'
            . '.bookkeeping-text-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-word;}'
            . '.bookkeeping-code-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-all;}'
            . '.bookkeeping-money-cell{white-space:normal;}'
            . '.bookkeeping-cell-line{display:block;margin:0;padding:0;line-height:1.2;}'
            . '.bookkeeping-money-line{white-space:nowrap;}'
            . '.bookkeeping-money-line-secondary{font-size:5.7pt;color:#333;}';
    }

    public function signatureCss(): string
    {
        return $this->classic->signatureCss()
            . '.signature-section{margin-top:5.5mm;}';
    }

    public function signatureFullWidthMm(): float
    {
        return 178.0;
    }

    public function footerHtml(string $scope): string
    {
        return '<htmlpagefooter name="budgetPageFooter"></htmlpagefooter>';
    }

    public function headerHtml(
        array $budget,
        string $titleHtml,
        string $subtitleHtml,
        BudgetPdfFormatter $formatter,
        string $scope,
        array $options = [],
    ): string {
        $date = date('j F Y');
        $documentTitle = $titleHtml;
        $subtitle = trim(strip_tags(str_replace(['</div>', '<br>'], "\n", $subtitleHtml)));
        $subtitleContent = $scope === 'bookkeeping' ? $titleHtml : '';
        if ($subtitle !== '') {
            $subtitleContent .= ($subtitleContent === '' ? '' : '<br>') . $formatter->escapeHtml($subtitle);
        }
        $metaRows = [
            ['Page', '頁', 'Page {PAGENO} of {nbpg}'],
            ['Date', '日期', $date],
        ];
        $workspaceName = trim((string) ($budget['workspaceName'] ?? $budget['workspace_name'] ?? ''));
        if (($options['showWorkspace'] ?? $options['show_workspace'] ?? false) === true && $workspaceName !== '') {
            $metaRows[] = ['Workspace', '工作區', $workspaceName];
        }

        return '<div class="statement-red-header">'
            . '<table class="statement-red-header-table"><tr><td class="statement-red-title-cell">'
            . '<div class="statement-red-title">' . $documentTitle . '</div>'
            . '</td><td class="statement-red-meta-cell">'
            . $this->metaTableHtml($metaRows, $formatter)
            . '</td></tr></table>'
            . ($subtitleContent === '' ? '' : '<div class="statement-red-subtitle">' . $subtitleContent . '</div>')
            . '</div>';
    }

    private function metaTableHtml(array $rows, BudgetPdfFormatter $formatter): string
    {
        $html = '<table class="statement-red-meta-table">';
        foreach ($rows as [$english, $chinese, $value]) {
            $html .= '<tr><td class="statement-red-meta-label">'
                . $formatter->escapeHtml($english . ' / ' . $chinese)
                . '</td><td class="statement-red-meta-value">'
                . $formatter->escapeHtml((string) $value)
                . '</td></tr>';
        }

        return $html . '</table>';
    }
}
